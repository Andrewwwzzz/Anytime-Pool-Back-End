// convert.js
const { exportJWK } = require('jose');
const fs = require('fs');
const crypto = require('crypto');

(async () => {
  const pub = fs.readFileSync('signing_public.pem');
  const key = crypto.createPublicKey(pub);
  const jwk = await exportJWK(key);
  console.log(jwk);
})();