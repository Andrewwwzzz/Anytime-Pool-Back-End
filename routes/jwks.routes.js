const express = require("express");
const router = express.Router();
const { exportJWK } = require("jose");
const crypto = require("crypto");

router.get("/.well-known/jwks.json", async (req, res) => {
  const publicKeyPem = process.env.SIGNING_PUBLIC_KEY.replace(/\\n/g, "\n");

  const keyObject = crypto.createPublicKey(publicKeyPem);
  const jwk = await exportJWK(keyObject);

  jwk.use = "sig";
  jwk.alg = "ES256";
  jwk.kid = process.env.SIGNING_KID;

  res.json({ keys: [jwk] });
});

module.exports = router;