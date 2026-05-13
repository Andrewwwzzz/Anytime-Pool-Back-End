const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const mongoose = require("mongoose");
const {
  SignJWT,
  importPKCS8,
  calculateJwkThumbprint,
  compactDecrypt,
  createRemoteJWKSet,
  jwtVerify,
} = require("jose");
const protect = require("../middleware/auth");
const User = require("../models/user");

/*
========================================
MONGODB SESSION STORE
========================================
*/
const myinfoSessionSchema = new mongoose.Schema({
  state:               { type: String, required: true, unique: true },
  codeVerifier:        { type: String, required: true },
  nonce:               { type: String, required: true },
  userId:              { type: String, default: null },
  isSignup:            { type: Boolean, default: false },
  ephemeralPublicJwk:  { type: String, required: true },
  ephemeralPrivateJwk: { type: String, required: true },
  createdAt:           { type: Date, default: Date.now, expires: 600 },
});

const MyInfoSession = mongoose.models.MyInfoSession ||
  mongoose.model("MyInfoSession", myinfoSessionSchema);

const saveSession   = async (state, data) =>
  MyInfoSession.findOneAndUpdate({ state }, { ...data, state }, { upsert: true, new: true });
const loadSession   = async (state) => MyInfoSession.findOne({ state });
const deleteSession = async (state) => MyInfoSession.deleteOne({ state });

/*
========================================
HELPERS
========================================
*/
const parsePem = (raw) => {
  if (!raw) throw new Error("Missing PEM key");
  if (raw.startsWith('"') && raw.endsWith('"')) return JSON.parse(raw);
  if (raw.includes("\\n")) return raw.replace(/\\n/g, "\n");
  return raw;
};

const generatePKCE = () => {
  const codeVerifier  = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
};

const generateEphemeralKeyPair = async () => {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]
  );
  const publicJwk  = await crypto.subtle.exportKey("jwk", publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
  const thumbprint = await calculateJwkThumbprint(publicJwk);
  return { publicJwk, privateJwk, thumbprint };
};

const restoreEphemeralKeyPair = async (publicJwkStr, privateJwkStr) => {
  const publicJwk  = JSON.parse(publicJwkStr);
  const privateJwk = JSON.parse(privateJwkStr);
  const privateKey = await crypto.subtle.importKey(
    "jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  return { privateKey, publicJwk };
};

/*
DPoP Proof JWT generator.
IMPORTANT: htu must exactly match the URL (no trailing slash, no query string).
ath is required only for userinfo — it's the base64url SHA-256 of the raw access token.
*/
const generateDpopProof = async (privateKey, publicJwk, method, htu, accessToken = null) => {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    jti: crypto.randomUUID(),
    htm: method,
    htu: htu,
    iat: now,
    exp: now + 120, // max 2 minutes per Singpass spec
  };

  if (accessToken) {
    // ath = base64url(SHA256(ASCII(access_token)))
    payload.ath = crypto.createHash("sha256").update(accessToken).digest("base64url");
  }

  const header = {
    alg: "ES256",
    typ: "dpop+jwt",
    jwk: {
      kty: publicJwk.kty,
      crv: publicJwk.crv,
      x:   publicJwk.x,
      y:   publicJwk.y,
    },
  };

  const encodedHeader  = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput   = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    Buffer.from(signingInput)
  );

  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
};

const generateClientAssertion = async (clientId, audience) => {
  const privateKey = await importPKCS8(parsePem(process.env.MYINFO_PRIVATE_SIGNING_KEY), "ES256");
  return new SignJWT({
    sub: clientId,
    aud: audience,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    jti: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: "ES256" })
    .setIssuer(clientId)
    .sign(privateKey);
};

const decryptAndVerifyUserinfo = async (encryptedData) => {
  const privateKey = await importPKCS8(parsePem(process.env.MYINFO_PRIVATE_ENCRYPTION_KEY), "ECDH-ES+A128KW");
  const { plaintext } = await compactDecrypt(encryptedData, privateKey);
  const jws  = new TextDecoder().decode(plaintext);
  const JWKS = createRemoteJWKSet(new URL(getSingpassJwksUrl()));
  const { payload } = await jwtVerify(jws, JWKS, { issuer: getSingpassIssuer() });
  return payload;
};

/*
========================================
SINGPASS URLS
========================================
*/
const isProd             = () => process.env.MYINFO_ENV === "production";
const getSingpassIssuer  = () => isProd() ? "https://id.singpass.gov.sg" : "https://stg-id.singpass.gov.sg";
const getSingpassJwksUrl = () => `${getSingpassIssuer()}/.well-known/keys`;
const getSingpassUrls    = () => {
  const base = getSingpassIssuer();
  return {
    par:      `${base}/fapi/par`,
    authorize:`${base}/fapi/auth`,
    token:    `${base}/fapi/token`,
    userinfo: `${base}/userinfo`,  // NOTE: no trailing slash
  };
};

/*
========================================
PAR FLOW
========================================
*/
const buildAuthorizeUrl = async (userId = null) => {
  const urls        = getSingpassUrls();
  const clientId    = process.env.MYINFO_CLIENT_ID;
  const redirectUri = process.env.MYINFO_REDIRECT_URL;
  const scope       = process.env.MYINFO_SCOPE || "openid name";

  const state = crypto.randomBytes(16).toString("hex");
  const nonce = crypto.randomBytes(16).toString("hex");
  const { codeVerifier, codeChallenge } = generatePKCE();
  const { publicJwk, privateJwk } = await generateEphemeralKeyPair();
  const { privateKey } = await restoreEphemeralKeyPair(JSON.stringify(publicJwk), JSON.stringify(privateJwk));

  const clientAssertion = await generateClientAssertion(clientId, urls.par);
  const dpopForPar      = await generateDpopProof(privateKey, publicJwk, "POST", urls.par);

  const parBody = new URLSearchParams({
    client_id:             clientId,
    scope,
    redirect_uri:          redirectUri,
    response_type:         "code",
    code_challenge:        codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion:      clientAssertion,
  });

  const parResponse = await fetch(urls.par, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "DPoP": dpopForPar },
    body: parBody.toString(),
  });

  if (!parResponse.ok) {
    const err = await parResponse.text();
    console.error("PAR failed:", err);
    throw new Error(`PAR failed: ${err}`);
  }

  const { request_uri } = await parResponse.json();
  if (!request_uri) throw new Error("No request_uri in PAR response");

  await saveSession(state, {
    codeVerifier, nonce, userId, isSignup: !userId,
    ephemeralPublicJwk:  JSON.stringify(publicJwk),
    ephemeralPrivateJwk: JSON.stringify(privateJwk),
  });

  return `${urls.authorize}?client_id=${clientId}&request_uri=${encodeURIComponent(request_uri)}`;
};

/*
========================================
ROUTES
========================================
*/
router.post("/auth-url-public", async (req, res) => {
  try {
    res.json({ authorizeUrl: await buildAuthorizeUrl(null) });
  } catch (err) {
    console.error("auth-url-public error:", err.message);
    res.status(500).json({ message: "Failed to generate MyInfo auth URL", detail: err.message });
  }
});

router.post("/auth-url", protect, async (req, res) => {
  try {
    res.json({ authorizeUrl: await buildAuthorizeUrl(req.user._id.toString()) });
  } catch (err) {
    console.error("auth-url error:", err.message);
    res.status(500).json({ message: "Failed to generate MyInfo auth URL", detail: err.message });
  }
});

router.get("/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "https://envopoolsg.com";

  if (error) {
    console.error("Singpass error:", error, error_description);
    return res.redirect(`${frontendUrl}/kyc?error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) return res.redirect(`${frontendUrl}/kyc?error=missing_params`);

  const session = await loadSession(state);
  if (!session) {
    console.error("Session not found for state:", state);
    return res.redirect(`${frontendUrl}/kyc?error=session_expired`);
  }

  const { codeVerifier, ephemeralPublicJwk, ephemeralPrivateJwk, userId, isSignup } = session;
  const urls        = getSingpassUrls();
  const clientId    = process.env.MYINFO_CLIENT_ID;
  const redirectUri = process.env.MYINFO_REDIRECT_URL;

  try {
    const { privateKey, publicJwk } = await restoreEphemeralKeyPair(ephemeralPublicJwk, ephemeralPrivateJwk);

    // ── Token exchange ──
    const clientAssertion = await generateClientAssertion(clientId, urls.token);
    const dpopForToken    = await generateDpopProof(privateKey, publicJwk, "POST", urls.token);

    const tokenResponse = await fetch(urls.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "DPoP": dpopForToken },
      body: new URLSearchParams({
        grant_type:            "authorization_code",
        code,
        redirect_uri:          redirectUri,
        client_id:             clientId,
        code_verifier:         codeVerifier,
        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion:      clientAssertion,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      console.error("Token exchange failed:", err);
      await deleteSession(state);
      return res.redirect(`${frontendUrl}/kyc?error=token_failed`);
    }

    const tokenData    = await tokenResponse.json();
    const accessToken  = tokenData.access_token;
    console.log("✅ Token OK. token_type:", tokenData.token_type, "access_token length:", accessToken?.length);

    // ── Userinfo ──
    // htu must EXACTLY match the URL Singpass sees — no trailing slash
    const userinfoUrl     = urls.userinfo;
    const dpopForUserinfo = await generateDpopProof(privateKey, publicJwk, "GET", userinfoUrl, accessToken);

    // Debug: decode and log DPoP proof
    const parts = dpopForUserinfo.split(".");
    const dpopHdr = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const dpopPld = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    console.log("DPoP header:", JSON.stringify(dpopHdr));
    console.log("DPoP payload:", JSON.stringify(dpopPld));
    console.log("Userinfo URL:", userinfoUrl);
    console.log("Auth header prefix:", "DPoP");

    const userinfoResponse = await fetch(userinfoUrl, {
      method: "GET",
      headers: {
        "Authorization": `DPoP ${accessToken}`,
        "DPoP":          dpopForUserinfo,
      },
    });

    if (!userinfoResponse.ok) {
      const err = await userinfoResponse.text();
      console.error("Userinfo failed:", err);
      // Also log WWW-Authenticate header for more detail
      console.error("WWW-Authenticate:", userinfoResponse.headers.get("WWW-Authenticate"));
      await deleteSession(state);
      return res.redirect(`${frontendUrl}/kyc?error=userinfo_failed`);
    }

    const encryptedUserinfo = await userinfoResponse.text();
    console.log("✅ Userinfo received, decrypting...");

    const personPayload = await decryptAndVerifyUserinfo(encryptedUserinfo);
    const person        = personPayload?.person_info || personPayload;

    console.log("✅ Person decrypted:", userId || "signup");
    await deleteSession(state);

    const kyc = {
      verified:    true,
      verifiedAt:  new Date(),
      source:      "singpass",
      name:        person?.name?.value        || null,
      dob:         person?.dob?.value         || null,
      sex:         person?.sex?.value         || null,
      nationality: person?.nationality?.value || null,
      email:       person?.email?.value       || null,
      mobile:      person?.mobileno?.nbr?.value
        ? `${person.mobileno.prefix?.value || "+65"}${person.mobileno.nbr.value}`
        : null,
      uinfin:  person?.uinfin?.value || null,
      address: person?.regadd
        ? [
            person.regadd.block?.value,
            person.regadd.street?.value,
            person.regadd.floor?.value ? `#${person.regadd.floor.value}-${person.regadd.unit?.value}` : null,
            person.regadd.postal?.value ? `Singapore ${person.regadd.postal.value}` : null,
          ].filter(Boolean).join(", ")
        : null,
    };

    if (isSignup) {
      return res.redirect(`${frontendUrl}/kyc?${new URLSearchParams({
        status: "success", name: kyc.name || "", dob: kyc.dob || "", mobile: kyc.mobile || "",
      }).toString()}`);
    }

    await User.findByIdAndUpdate(userId, { kyc }, { new: true });
    console.log("✅ KYC saved for user:", userId);
    return res.redirect(`${frontendUrl}/kyc?status=success`);

  } catch (err) {
    console.error("MyInfo callback error:", err.message);
    await deleteSession(state);
    return res.redirect(`${frontendUrl}/kyc?error=processing_failed`);
  }
});

router.get("/status", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("kyc");
    res.json({ verified: user?.kyc?.verified || false, name: user?.kyc?.name || null, verifiedAt: user?.kyc?.verifiedAt || null });
  } catch (err) {
    res.status(500).json({ message: "Failed to get KYC status" });
  }
});

module.exports = router;