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
SINGPASS MYINFO v5 — FAPI 2.0 Integration

Key facts from official docs:
- PAR → /fapi/par (with DPoP header)
- Auth → /fapi/auth?client_id=...&request_uri=...
- Token → /fapi/token (with DPoP header)
- Userinfo → /userinfo (Authorization: DPoP <token> + DPoP header)
- Same ephemeral key pair MUST be used across PAR, Token, Userinfo
- Sessions stored in MongoDB (not in-memory) to survive Render restarts
========================================
*/

/*
========================================
MONGODB SESSION STORE
Stores ephemeral key pair + PKCE between
PAR request and callback.
Uses mongoose directly on a simple collection.
========================================
*/
const myinfoSessionSchema = new mongoose.Schema({
  state:             { type: String, required: true, unique: true },
  codeVerifier:      { type: String, required: true },
  nonce:             { type: String, required: true },
  userId:            { type: String, default: null },
  isSignup:          { type: Boolean, default: false },
  // Store ephemeral key pair as JWK JSON strings
  ephemeralPublicJwk:  { type: String, required: true },
  ephemeralPrivateJwk: { type: String, required: true },
  createdAt:         { type: Date, default: Date.now, expires: 600 }, // auto-delete after 10 min
});

const MyInfoSession = mongoose.models.MyInfoSession ||
  mongoose.model("MyInfoSession", myinfoSessionSchema);

const saveSession = async (state, data) => {
  await MyInfoSession.findOneAndUpdate(
    { state },
    { ...data, state },
    { upsert: true, new: true }
  );
};

const loadSession = async (state) => {
  return await MyInfoSession.findOne({ state });
};

const deleteSession = async (state) => {
  await MyInfoSession.deleteOne({ state });
};

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
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
};

// Generate ephemeral key pair and export as JWK for storage in MongoDB
const generateEphemeralKeyPair = async () => {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,  // extractable = true so we can export to JWK
    ["sign", "verify"]
  );
  const publicJwk  = await crypto.subtle.exportKey("jwk", publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
  const thumbprint = await calculateJwkThumbprint(publicJwk);
  return { publicJwk, privateJwk, thumbprint };
};

// Restore ephemeral key pair from stored JWK strings
const restoreEphemeralKeyPair = async (publicJwkStr, privateJwkStr) => {
  const publicJwk  = JSON.parse(publicJwkStr);
  const privateJwk = JSON.parse(privateJwkStr);

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  return { privateKey, publicJwk };
};

// Generate DPoP proof JWT
const generateDpopProof = async (privateKey, publicJwk, method, url, accessToken = null) => {
  const payload = {
    jti: crypto.randomUUID(),
    htm: method,
    htu: url,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60,
  };

  if (accessToken) {
    payload.ath = crypto
      .createHash("sha256")
      .update(accessToken)
      .digest("base64url");
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

// Generate client assertion JWT (no cnf.jkt for FAPI 2.0)
const generateClientAssertion = async (clientId, audience) => {
  const signingKeyPem = parsePem(process.env.MYINFO_PRIVATE_SIGNING_KEY);
  const privateKey    = await importPKCS8(signingKeyPem, "ES256");

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

// Decrypt JWE → verify JWS → return person payload
const decryptAndVerifyUserinfo = async (encryptedData) => {
  const encryptionKeyPem = parsePem(process.env.MYINFO_PRIVATE_ENCRYPTION_KEY);
  const privateKey       = await importPKCS8(encryptionKeyPem, "ECDH-ES+A128KW");

  // Decrypt JWE
  const { plaintext } = await compactDecrypt(encryptedData, privateKey);
  const jws = new TextDecoder().decode(plaintext);

  // Verify JWS signature using Singpass public keys
  const JWKS = createRemoteJWKSet(new URL(getSingpassJwksUrl()));
  const { payload } = await jwtVerify(jws, JWKS, {
    issuer: getSingpassIssuer(),
  });

  return payload;
};

/*
========================================
SINGPASS URLS
========================================
*/
const isProd        = () => process.env.MYINFO_ENV === "production";
const getSingpassIssuer  = () => isProd() ? "https://id.singpass.gov.sg" : "https://stg-id.singpass.gov.sg";
const getSingpassJwksUrl = () => `${getSingpassIssuer()}/.well-known/keys`;

const getSingpassUrls = () => {
  const base = getSingpassIssuer();
  return {
    par:      `${base}/fapi/par`,
    authorize:`${base}/fapi/auth`,
    token:    `${base}/fapi/token`,
    userinfo: `${base}/userinfo`,
  };
};

/*
========================================
SHARED: Full PAR flow
========================================
*/
const buildAuthorizeUrl = async (userId = null) => {
  const urls      = getSingpassUrls();
  const clientId  = process.env.MYINFO_CLIENT_ID;
  const redirectUri = process.env.MYINFO_REDIRECT_URL;
  const scope     = process.env.MYINFO_SCOPE || "openid name";

  const state = crypto.randomBytes(16).toString("hex");
  const nonce = crypto.randomBytes(16).toString("hex");
  const { codeVerifier, codeChallenge } = generatePKCE();

  // Generate ephemeral key pair — export to JWK for MongoDB storage
  const { publicJwk, privateJwk, thumbprint } = await generateEphemeralKeyPair();

  // Restore private key for signing DPoP proof
  const { privateKey } = await restoreEphemeralKeyPair(
    JSON.stringify(publicJwk),
    JSON.stringify(privateJwk)
  );

  // Generate client assertion + DPoP for PAR
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "DPoP":         dpopForPar,
    },
    body: parBody.toString(),
  });

  if (!parResponse.ok) {
    const errText = await parResponse.text();
    console.error("❌ PAR request failed:", errText);
    throw new Error(`PAR failed: ${parResponse.status} — ${errText}`);
  }

  const { request_uri } = await parResponse.json();
  if (!request_uri) throw new Error("No request_uri in PAR response");

  // Save session to MongoDB (survives Render restarts)
  await saveSession(state, {
    codeVerifier,
    nonce,
    userId,
    isSignup:            !userId,
    ephemeralPublicJwk:  JSON.stringify(publicJwk),
    ephemeralPrivateJwk: JSON.stringify(privateJwk),
  });

  return `${urls.authorize}?client_id=${clientId}&request_uri=${encodeURIComponent(request_uri)}`;
};

/*
========================================
ROUTE 1A: Public auth URL (signup flow)
POST /api/myinfo/auth-url-public
========================================
*/
router.post("/auth-url-public", async (req, res) => {
  try {
    const authorizeUrl = await buildAuthorizeUrl(null);
    res.json({ authorizeUrl });
  } catch (err) {
    console.error("❌ MyInfo public auth-url error:", err.message);
    res.status(500).json({ message: "Failed to generate MyInfo auth URL", detail: err.message });
  }
});

/*
========================================
ROUTE 1B: Protected auth URL (logged-in)
POST /api/myinfo/auth-url
========================================
*/
router.post("/auth-url", protect, async (req, res) => {
  try {
    const authorizeUrl = await buildAuthorizeUrl(req.user._id.toString());
    res.json({ authorizeUrl });
  } catch (err) {
    console.error("❌ MyInfo auth-url error:", err.message);
    res.status(500).json({ message: "Failed to generate MyInfo auth URL", detail: err.message });
  }
});

/*
========================================
ROUTE 2: Callback
GET /api/myinfo/callback
========================================
*/
router.get("/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "https://envopoolsg.com";

  if (error) {
    console.error("❌ Singpass error:", error, error_description);
    return res.redirect(`${frontendUrl}/kyc?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${frontendUrl}/kyc?error=missing_params`);
  }

  // Load session from MongoDB
  const session = await loadSession(state);
  if (!session) {
    console.error("❌ Session not found for state:", state);
    return res.redirect(`${frontendUrl}/kyc?error=session_expired`);
  }

  const { codeVerifier, ephemeralPublicJwk, ephemeralPrivateJwk, userId, isSignup } = session;
  const urls        = getSingpassUrls();
  const clientId    = process.env.MYINFO_CLIENT_ID;
  const redirectUri = process.env.MYINFO_REDIRECT_URL;

  try {
    // Restore the SAME ephemeral key pair used during PAR
    const { privateKey, publicJwk } = await restoreEphemeralKeyPair(
      ephemeralPublicJwk,
      ephemeralPrivateJwk
    );

    // ── Step 1: Exchange auth code for access token ──
    const clientAssertion = await generateClientAssertion(clientId, urls.token);
    const dpopForToken    = await generateDpopProof(privateKey, publicJwk, "POST", urls.token);

    const tokenBody = new URLSearchParams({
      grant_type:            "authorization_code",
      code,
      redirect_uri:          redirectUri,
      client_id:             clientId,
      code_verifier:         codeVerifier,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion:      clientAssertion,
    });

    const tokenResponse = await fetch(urls.token, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "DPoP":         dpopForToken,
      },
      body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error("❌ Token exchange failed:", errText);
      await deleteSession(state);
      return res.redirect(`${frontendUrl}/kyc?error=token_failed`);
    }

    const tokenData      = await tokenResponse.json();
    const { access_token } = tokenData;
    console.log("✅ Token exchange success");

    // ── Step 2: Fetch userinfo ──
    // Must use SAME ephemeral key pair, DPoP prefix, and ath (access token hash)
    const dpopForUserinfo = await generateDpopProof(
      privateKey,
      publicJwk,
      "GET",
      urls.userinfo,
      access_token   // ath claim = SHA256 hash of access token
    );

    const userinfoResponse = await fetch(urls.userinfo, {
      method: "GET",
      headers: {
        "Authorization": `DPoP ${access_token}`,
        "DPoP":          dpopForUserinfo,
      },
    });

    if (!userinfoResponse.ok) {
      const errText = await userinfoResponse.text();
      console.error("❌ Userinfo fetch failed:", errText);
      await deleteSession(state);
      return res.redirect(`${frontendUrl}/kyc?error=userinfo_failed`);
    }

    const encryptedUserinfo = await userinfoResponse.text();
    console.log("✅ Userinfo received, decrypting...");

    // ── Step 3: Decrypt + verify ──
    const personPayload = await decryptAndVerifyUserinfo(encryptedUserinfo);
    const person        = personPayload?.person_info || personPayload;

    console.log("✅ Person data decrypted for:", userId || "signup flow");
    await deleteSession(state);

    // ── Step 4: Extract KYC fields ──
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
            person.regadd.floor?.value
              ? `#${person.regadd.floor.value}-${person.regadd.unit?.value}`
              : null,
            person.regadd.postal?.value
              ? `Singapore ${person.regadd.postal.value}`
              : null,
          ].filter(Boolean).join(", ")
        : null,
    };

    // ── SIGNUP FLOW: pass data to /kyc page ──
    if (isSignup) {
      const params = new URLSearchParams({
        status: "success",
        name:   kyc.name   || "",
        dob:    kyc.dob    || "",
        mobile: kyc.mobile || "",
      });
      return res.redirect(`${frontendUrl}/kyc?${params.toString()}`);
    }

    // ── LOGGED-IN FLOW: save KYC to MongoDB ──
    await User.findByIdAndUpdate(userId, { kyc }, { new: true });
    console.log("✅ KYC saved for user:", userId);
    return res.redirect(`${frontendUrl}/kyc?status=success`);

  } catch (err) {
    console.error("❌ MyInfo callback error:", err.message);
    await deleteSession(state);
    return res.redirect(`${frontendUrl}/kyc?error=processing_failed`);
  }
});

/*
========================================
ROUTE 3: KYC status
GET /api/myinfo/status
========================================
*/
router.get("/status", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("kyc");
    res.json({
      verified:   user?.kyc?.verified   || false,
      name:       user?.kyc?.name       || null,
      verifiedAt: user?.kyc?.verifiedAt || null,
    });
  } catch (err) {
    console.error("❌ KYC status error:", err.message);
    res.status(500).json({ message: "Failed to get KYC status" });
  }
});

module.exports = router;