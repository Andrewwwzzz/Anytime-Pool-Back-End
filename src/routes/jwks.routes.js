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
    const rawSigningKey    = process.env.MYINFO_PUBLIC_SIGNING_KEY;
    const rawEncryptionKey = process.env.MYINFO_PUBLIC_ENCRYPTION_KEY;

    if (!rawSigningKey || !rawEncryptionKey) {
      console.error("❌ JWKS: Missing public key environment variables");
      return res.status(500).json({ error: "Public keys not configured" });
    }

    // Log raw values to help debug (remove after fixing)
    console.log("RAW SIGNING KEY:", rawSigningKey.substring(0, 80));
    console.log("RAW ENCRYPTION KEY:", rawEncryptionKey.substring(0, 80));

    // Handle all possible formats the key could be stored in:
    // 1. Already a real PEM (starts with -----BEGIN)
    // 2. JSON.stringify'd PEM (starts with " or has \n as literal text)
    const parsePem = (raw) => {
      // If it's wrapped in quotes, it's a JSON string — parse it
      if (raw.startsWith('"') && raw.endsWith('"')) {
        return JSON.parse(raw);
      }
      // If it contains literal \n text (not real newlines), replace them
      if (raw.includes("\\n")) {
        return raw.replace(/\\n/g, "\n");
      }
      // Already a real PEM
      return raw;
    };

    const signingPem    = parsePem(rawSigningKey);
    const encryptionPem = parsePem(rawEncryptionKey);

    console.log("PARSED SIGNING KEY START:", signingPem.substring(0, 40));

    const signingJwk    = createPublicKey(signingPem).export({ format: "jwk" });
    const encryptionJwk = createPublicKey(encryptionPem).export({ format: "jwk" });

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
    console.error("❌ JWKS generation error:", err.message);
    res.status(500).json({ error: "Failed to generate JWKS", detail: err.message });
  }
});

module.exports = router;