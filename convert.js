const { exportJWK } = require("jose");
const fs = require("fs");
const crypto = require("crypto");

async function convert(file) {
  const pem = fs.readFileSync(file);
  const key = crypto.createPublicKey(pem);
  const jwk = await exportJWK(key);
  console.log(file, jwk);
}

(async () => {
  await convert("signing_public.pem");
  await convert("dpop_public.pem");
})();