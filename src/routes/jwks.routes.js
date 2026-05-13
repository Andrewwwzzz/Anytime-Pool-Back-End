const express = require("express");
const router = express.Router();
const { createPublicKey } = require("crypto");

/*
========================================
JWKS ENDPOINT
Required by Singpass MyInfo FAPI 2.0.
- Signing key:    EC P-256 / ES256
- Encryption key: EC P-256 / ECDH-ES+A128KW  ← required by Singpass for new RPs
URL: https://api.envopoolsg.com/.well-known/jwks.json
========================================
*/
router.get("/.well-known/jwks.json", (req, res) => {
  try {
    const rawSigningKey    = process.env.MYINFO_PUBLIC_SIGNING_KEY;
    const rawEncryptionKey = process.env.MYINFO_PUBLIC_ENCRYPTION_KEY;

    if (!rawSigningKey || !rawEncryptionKey) {
      console.error("❌ JWKS: Missing public key environment variables");
      return res.status(500).json({ error: "Public keys not configured" });
    }

    // Parse PEM — handles JSON-stringified or raw PEM
    const parsePem = (raw) => {
      if (raw.startsWith('"') && raw.endsWith('"')) return JSON.parse(raw);
      if (raw.includes("\\n")) return raw.replace(/\\n/g, "\n");
      return raw;
    };

    const signingJwk    = createPublicKey(parsePem(rawSigningKey)).export({ format: "jwk" });
    const encryptionJwk = createPublicKey(parsePem(rawEncryptionKey)).export({ format: "jwk" });

    // Never expose private key — remove 'd' if somehow present
    delete signingJwk.d;
    delete encryptionJwk.d;

    res.json({
      keys: [
        {
          ...signingJwk,
          use: "sig",
          alg: "ES256",
          kid: "envopool-sig-2",
        },
        {
          ...encryptionJwk,
          use: "enc",
          alg: "ECDH-ES+A128KW",
          kid: "envopool-enc-3",
        },
      ],
    });
  } catch (err) {
    console.error("❌ JWKS generation error:", err.message);
    res.status(500).json({ error: "Failed to generate JWKS", detail: err.message });
  }
});

module.exports = router;