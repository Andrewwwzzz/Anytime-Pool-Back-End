const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

router.get("/singpass-test", (req, res) => {

  try {

    const clientId = process.env.SINGPASS_CLIENT_ID;

    const SIGNING_PRIVATE_KEY = process.env.SIGNING_PRIVATE_KEY
      ? process.env.SIGNING_PRIVATE_KEY.replace(/\\n/g, "\n")
      : null;

    const DPOP_PRIVATE_KEY = process.env.DPOP_PRIVATE_KEY
      ? process.env.DPOP_PRIVATE_KEY.replace(/\\n/g, "\n")
      : null;

    if (!SIGNING_PRIVATE_KEY) {
      return res.json({ error: "SIGNING_PRIVATE_KEY missing" });
    }

    if (!DPOP_PRIVATE_KEY) {
      return res.json({ error: "DPOP_PRIVATE_KEY missing" });
    }

    const now = Math.floor(Date.now() / 1000);

    /* TEST CLIENT ASSERTION */

    const clientAssertion = jwt.sign(
      {
        iss: clientId,
        sub: clientId,
        aud: "https://stg-id.singpass.gov.sg/fapi",
        jti: crypto.randomUUID(),
        iat: now,
        exp: now + 120
      },
      SIGNING_PRIVATE_KEY,
      {
        algorithm: "ES256",
        keyid: process.env.SIGNING_KID
      }
    );

    /* TEST DPOP */

    const dpop = jwt.sign(
      {
        htm: "POST",
        htu: "https://stg-id.singpass.gov.sg/par",
        jti: crypto.randomUUID(),
        iat: now
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

    return res.json({
      message: "Singpass crypto OK",
      clientAssertionPreview: clientAssertion.substring(0, 80) + "...",
      dpopPreview: dpop.substring(0, 80) + "...",
      issuer: "https://stg-id.singpass.gov.sg/fapi",
      clientId
    });

  } catch (err) {

    return res.json({
      error: err.message
    });

  }

});

module.exports = router;
