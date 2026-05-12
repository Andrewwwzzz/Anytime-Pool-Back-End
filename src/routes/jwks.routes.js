const express = require("express");
const router = express.Router();
const { createPublicKey } = require("crypto");

/*
========================================
JWKS ENDPOINT
Required by Singpass MyInfo for token-based authentication.
Serves your public keys in JWKS format so Singpass can verify your tokens.
URL: https://api.envopoolsg.com/.well-known/jwks.json
========================================
*/
router.get("/.well-known/jwks.json", (req, res) => {
  try {
    // Read public keys from environment variables
    const rawSigningKey    = process.env.MYINFO_PUBLIC_SIGNING_KEY;
    const rawEncryptionKey = process.env.MYINFO_PUBLIC_ENCRYPTION_KEY;

    if (!rawSigningKey || !rawEncryptionKey) {
      console.error("❌ JWKS: Missing public key environment variables");
      return res.status(500).json({ error: "Public keys not configured" });
    }

    // Keys stored as JSON.stringify'd PEM strings — parse them back to real PEM
    const signingPem    = JSON.parse(rawSigningKey);
    const encryptionPem = JSON.parse(rawEncryptionKey);

    // Convert PEM to JWK format
    const signingJwk    = createPublicKey(signingPem).export({ format: "jwk" });
    const encryptionJwk = createPublicKey(encryptionPem).export({ format: "jwk" });

    // Return JWKS response
    res.json({
      keys: [
        {
          ...signingJwk,
          use: "sig",
          alg: "ES256",
          kid: "envopool-sig-1",
        },
        {
          ...encryptionJwk,
          use: "enc",
          alg: "ECDH-ES+A128GCM",
          kid: "envopool-enc-1",
        },
      ],
    });
  } catch (err) {
    console.error("❌ JWKS generation error:", err);
    res.status(500).json({ error: "Failed to generate JWKS" });
  }
});

module.exports = router;