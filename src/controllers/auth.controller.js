const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const qs = require("qs");

const AUTH_ENDPOINT = process.env.SINGPASS_AUTHORIZE_URL;
const PAR_ENDPOINT = process.env.SINGPASS_PAR_URL;
const TOKEN_ENDPOINT = process.env.SINGPASS_TOKEN_URL;

const CLIENT_ID = process.env.SINGPASS_CLIENT_ID;
const REDIRECT_URI = process.env.SINGPASS_REDIRECT_URI;

const SIGNING_PRIVATE_KEY = process.env.SIGNING_PRIVATE_KEY.replace(/\\n/g, "\n");
const SIGNING_KID = process.env.SIGNING_KID;

const DPOP_PRIVATE_KEY = process.env.DPOP_PRIVATE_KEY.replace(/\\n/g, "\n");
const DPOP_PUBLIC_X = process.env.DPOP_PUBLIC_X;
const DPOP_PUBLIC_Y = process.env.DPOP_PUBLIC_Y;

/* =========================
   HELPERS
========================= */

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function generateCodeVerifier() {
  return base64url(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  return base64url(crypto.createHash("sha256").update(verifier).digest());
}

/* =========================
   CLIENT ASSERTION
========================= */

function generateClientAssertion() {
  return jwt.sign(
    {
      iss: CLIENT_ID,
      sub: CLIENT_ID,
      aud: "https://stg-id.singpass.gov.sg/fapi",
      jti: crypto.randomUUID(),
      exp: Math.floor(Date.now() / 1000) + 300
    },
    SIGNING_PRIVATE_KEY,
    {
      algorithm: "ES256",
      keyid: SIGNING_KID
    }
  );
}

/* =========================
   🔥 FIXED DPoP (IMPORTANT)
========================= */

function generateDPoP(url, method) {
  return jwt.sign(
    {
      htu: url,
      htm: method,
      jti: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000)
    },
    DPOP_PRIVATE_KEY,
    {
      algorithm: "ES256",
      header: {
        typ: "dpop+jwt",
        alg: "ES256",
        jwk: {
          kty: "EC",
          crv: "P-256",
          x: DPOP_PUBLIC_X,
          y: DPOP_PUBLIC_Y
        }
      }
    }
  );
}

/* =========================
   LOGIN (PAR)
========================= */

exports.redirectToSingpass = async (req, res) => {
  try {
    const state = crypto.randomBytes(16).toString("hex");
    const nonce = crypto.randomBytes(16).toString("hex");

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    req.session.state = state;
    req.session.nonce = nonce;
    req.session.codeVerifier = codeVerifier;

    const clientAssertion = generateClientAssertion();

    const payload = qs.stringify({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: "openid name dob",
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion,
      authentication_context_class_reference:
        "urn:spe:authentication:singpass:qr"
    });

    const dpop = generateDPoP(PAR_ENDPOINT, "POST");

    console.log("DPoP HEADER:", jwt.decode(dpop, { complete: true }));
    console.log("CLIENT ASSERTION:", jwt.decode(clientAssertion));

    const parRes = await axios.post(PAR_ENDPOINT, payload, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        DPoP: dpop
      }
    });

    const authUrl = `${AUTH_ENDPOINT}?client_id=${CLIENT_ID}&request_uri=${encodeURIComponent(
      parRes.data.request_uri
    )}`;

    res.redirect(authUrl);

  } catch (err) {
    console.error("PAR ERROR FULL:", err.response?.data || err);
    res.status(500).json({ error: "Singpass login failed" });
  }
};

/* =========================
   CALLBACK
========================= */

exports.singpassCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (state !== req.session.state) {
      return res.status(400).json({ error: "Invalid state" });
    }

    const clientAssertion = generateClientAssertion();

    const payload = qs.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion,
      code_verifier: req.session.codeVerifier
    });

    const dpop = generateDPoP(TOKEN_ENDPOINT, "POST");

    const tokenRes = await axios.post(TOKEN_ENDPOINT, payload, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        DPoP: dpop
      }
    });

    const decoded = jwt.decode(tokenRes.data.id_token);

    res.json({
      message: "Login success",
      singpassId: decoded.sub
    });

  } catch (err) {
    console.error("CALLBACK ERROR:", err.response?.data || err);
    res.status(500).json({ error: "Callback failed" });
  }
};