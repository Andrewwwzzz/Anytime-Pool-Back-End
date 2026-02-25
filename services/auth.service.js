const jwt = require("jsonwebtoken");
const axios = require("axios");
const jwksClient = require("jwks-rsa");
const qs = require("qs");
const fs = require("fs");
const crypto = require("crypto");
const User = require("../models/user");

/* ================================
   Singpass FAPI 2.0 Flow
================================ */

const privateKey = process.env.PRIVATE_KEY;

function makeClientAssertion() {
  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iss: process.env.SINGPASS_CLIENT_ID,
      sub: process.env.SINGPASS_CLIENT_ID,
      aud: process.env.SINGPASS_TOKEN_URL,
      jti: crypto.randomBytes(16).toString("hex"),
      iat: now,
      exp: now + 300,
    },
    privateKey,
    {
      algorithm: "RS256",
      keyid: process.env.PUBLIC_JWKS_KID,
    }
  );
}

exports.exchangeCodeForToken = async (code, codeVerifier) => {
  const response = await axios.post(
    process.env.SINGPASS_TOKEN_URL,
    qs.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.SINGPASS_REDIRECT_URI,
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: makeClientAssertion(),
      code_verifier: codeVerifier,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  return response.data;
};

exports.verifyIdToken = async (idToken, expectedNonce) => {
  const client = jwksClient({
    jwksUri:
      "https://sandbox.api.myinfo.gov.sg/com/v4/.well-known/keys",
  });

  const decoded = jwt.decode(idToken, { complete: true });
  const key = await client.getSigningKey(decoded.header.kid);
  const signingKey = key.getPublicKey();

  const verified = jwt.verify(idToken, signingKey, {
    audience: process.env.SINGPASS_CLIENT_ID,
    issuer: process.env.SINGPASS_ISSUER,
  });

  if (verified.nonce !== expectedNonce) {
    throw new Error("Invalid nonce");
  }

  return verified;
};

exports.handleSingpassUser = async (verifiedPayload) => {
  const singpassId = verifiedPayload.sub;

  let user = await User.findOne({ singpassId });

  if (!user) {
    user = await User.create({
      singpassId
    });
  }

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  return {
    message: "Authentication successful",
    token,
    user: {
      id: user._id,
      role: user.role
    }
  };
};