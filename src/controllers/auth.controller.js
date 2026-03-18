const axios = require("axios");
const qs = require("qs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

/* ===============================
   ENV
================================ */

const clientId = process.env.SINGPASS_CLIENT_ID;
const redirectUri = process.env.SINGPASS_REDIRECT_URI;

const ISSUER = "https://stg-id.singpass.gov.sg/fapi";

const SIGNING_PRIVATE_KEY = process.env.SIGNING_PRIVATE_KEY
  ? process.env.SIGNING_PRIVATE_KEY.replace(/\\n/g, "\n")
  : null;

const SIGNING_KID = process.env.SIGNING_KID;

const DPOP_PRIVATE_KEY = process.env.DPOP_PRIVATE_KEY
  ? process.env.DPOP_PRIVATE_KEY.replace(/\\n/g, "\n")
  : null;

/* ===============================
   ENDPOINTS
================================ */

const BASE = "https://stg-id.singpass.gov.sg/fapi";

const PAR_ENDPOINT = `${BASE}/par`;
const TOKEN_ENDPOINT = `${BASE}/token`;
const AUTH_ENDPOINT = "https://stg-id.singpass.gov.sg/authorize";

/* ===============================
   HELPERS
================================ */

function randomString() {
  return crypto.randomBytes(32).toString("hex");
}

function generateCodeChallenge(verifier) {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

/* ===============================
   CLIENT ASSERTION (ES256)
================================ */

function generateClientAssertion() {
  if (!SIGNING_PRIVATE_KEY) {
    throw new Error("Missing SIGNING_PRIVATE_KEY");
  }

  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iss: clientId,
      sub: clientId,
      aud: ISSUER,
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 120
    },
    SIGNING_PRIVATE_KEY,
    {
      algorithm: "ES256",
      keyid: SIGNING_KID
    }
  );
}

/* ===============================
   DPoP PROOF
================================ */

function generateDpop(url, method) {
  if (!DPOP_PRIVATE_KEY) {
    throw new Error("Missing DPOP_PRIVATE_KEY");
  }

  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      htm: method,
      htu: url,
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 120
    },
    DPOP_PRIVATE_KEY,
    {
      algorithm: "ES256",
      header: {
        typ: "dpop+jwt",
        jwk: {
          kty: "EC",
          crv: "P-256",
          x: process.env.DPOP_PUBLIC_X,
          y: process.env.DPOP_PUBLIC_Y
        }
      }
    }
  );
}

/* ===============================
   STEP 1: PAR
================================ */

exports.redirectToSingpass = async (req, res) => {
  try {
    const state = randomString();
    const nonce = randomString();
    const codeVerifier = randomString();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    req.session.state = state;
    req.session.nonce = nonce;
    req.session.codeVerifier = codeVerifier;

    const clientAssertion = generateClientAssertion();
    const dpop = generateDpop(PAR_ENDPOINT, "POST");

    const response = await axios.post(
      PAR_ENDPOINT,
      qs.stringify({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "openid name dob",

        state,
        nonce,

        code_challenge: codeChallenge,
        code_challenge_method: "S256",

        client_assertion_type:
          "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",

        client_assertion: clientAssertion,

        // ✅ ONLY REQUIRED Singpass param
        authentication_context_type: "APP_AUTHENTICATION_QR"
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          DPoP: dpop
        }
      }
    );

    const requestUri = response.data.request_uri;

    const authUrl =
      `${AUTH_ENDPOINT}?client_id=${clientId}&request_uri=${requestUri}`;

    return res.redirect(authUrl);

  } catch (err) {
    console.error("PAR ERROR:", err.response?.data || err.message);
    return res.status(500).json(err.response?.data || { error: "PAR failed" });
  }
};

/* ===============================
   STEP 2: CALLBACK
================================ */

exports.singpassCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (state !== req.session.state) {
      return res.status(400).send("Invalid state");
    }

    const clientAssertion = generateClientAssertion();
    const dpop = generateDpop(TOKEN_ENDPOINT, "POST");

    const tokenRes = await axios.post(
      TOKEN_ENDPOINT,
      qs.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: req.session.codeVerifier,

        client_assertion_type:
          "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",

        client_assertion: clientAssertion
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          DPoP: dpop
        }
      }
    );

    const decoded = jwt.decode(tokenRes.data.id_token);

    if (!decoded || decoded.nonce !== req.session.nonce) {
      return res.status(400).send("Invalid nonce");
    }

    return res.json({
      message: "Login success",
      user: decoded
    });

  } catch (err) {
    console.error("TOKEN ERROR:", err.response?.data || err.message);
    return res.status(500).json(err.response?.data || { error: "Token failed" });
  }
};