const axios = require("axios");
const qs = require("qs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

/* ===============================
   ENV
================================ */

const clientId = process.env.SINGPASS_CLIENT_ID;
const redirectUri = process.env.SINGPASS_REDIRECT_URI;

const ISSUER = "https://stg-id.singpass.gov.sg";

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

const AUTH_BASE = "https://stg-id.singpass.gov.sg";
const PAR_ENDPOINT = `${AUTH_BASE}/par`;
const TOKEN_ENDPOINT = `${AUTH_BASE}/token`;
const AUTH_ENDPOINT = `${AUTH_BASE}/auth`;

/* ===============================
   Helpers
================================ */

function generateRandomString() {
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
    throw new Error("SIGNING_PRIVATE_KEY not configured");
  }

  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iss: clientId,
      sub: clientId,
      aud: ISSUER, // MUST be issuer
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 120 // <= 2 minutes
    },
    SIGNING_PRIVATE_KEY,
    {
      algorithm: "ES256",
      keyid: SIGNING_KID,
      header: {
        typ: "JWT"
      }
    }
  );
}

/* ===============================
   DPoP (TEMP STATIC KEY)
================================ */

function generateDpopProof(url, method) {
  if (!DPOP_PRIVATE_KEY) {
    throw new Error("DPOP_PRIVATE_KEY not configured");
  }

  const now = Math.floor(Date.now() / 1000);

  const publicJwk = {
    kty: "EC",
    crv: "P-256",
    x: process.env.DPOP_PUBLIC_X,
    y: process.env.DPOP_PUBLIC_Y
  };

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
        jwk: publicJwk
      }
    }
  );
}

/* ===============================
   1️⃣ PAR
================================ */

exports.redirectToSingpass = async (req, res) => {
  try {
    const state = generateRandomString();
    const nonce = generateRandomString();
    const codeVerifier = generateRandomString();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    req.session.state = state;
    req.session.nonce = nonce;
    req.session.codeVerifier = codeVerifier;

    const clientAssertion = generateClientAssertion();
    const dpopProof = generateDpopProof(PAR_ENDPOINT, "POST");

    const parResponse = await axios.post(
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

  authentication_context_class_reference: "urn:singpass:loa:2"
}),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          DPoP: dpopProof
        }
      }
    );

    const requestUri = parResponse.data.request_uri;

    const authUrl = `${AUTH_ENDPOINT}?client_id=${clientId}&request_uri=${requestUri}`;

    res.redirect(authUrl);
  } catch (err) {
    console.error("PAR Error:", err.response?.data || err.message);
    res.status(500).send("Singpass PAR failed");
  }
};

/* ===============================
   2️⃣ TOKEN EXCHANGE
================================ */

exports.singpassCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (state !== req.session.state) {
      return res.status(400).send("Invalid state");
    }

    const clientAssertion = generateClientAssertion();
    const dpopProof = generateDpopProof(TOKEN_ENDPOINT, "POST");

    const tokenResponse = await axios.post(
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
          DPoP: dpopProof
        }
      }
    );

    const { id_token } = tokenResponse.data;

    // ⚠️ TEMP ONLY — will fail once encryption enforced
    const decoded = jwt.decode(id_token);

    if (!decoded || decoded.nonce !== req.session.nonce) {
      return res.status(400).send("Invalid nonce");
    }

    res.json({
      message: "Login successful (temporary decoding)",
      user: decoded
    });
  } catch (err) {
    console.error("Token Exchange Error:", err.response?.data || err.message);
    res.status(500).send("Token exchange failed");
  }
};