const fs = require("fs");
const { importSPKI, exportJWK } = require("jose");

(async () => {
  const publicKey = fs.readFileSync("public.key", "utf8");
  const key = await importSPKI(publicKey, "RS256");
  const jwk = await exportJWK(key);

  jwk.alg = "RS256";
  jwk.use = "sig";
  jwk.kid = "singpass-key-1";

  console.log(JSON.stringify({ keys: [jwk] }, null, 2));
})();