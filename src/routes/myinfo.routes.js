const express = require("express");
const router = express.Router();
const crypto = require("crypto");
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
Flow:
  1. Backend POSTs auth params to /fapi/par → gets request_uri
  2. Backend redirects browser to /fapi/auth?client_id=...&request_uri=...
  3. User logs in on Singpass
  4. Singpass redirects to /api/myinfo/callback?code=...&state=...
  5. Backend POSTs to /fapi/token to exchange code for access_token
  6. Backend GETs /userinfo with DPoP-bound access token
  7. Backend decrypts + verifies userinfo JWE/JWS
  8. Backend saves KYC to MongoDB or passes data to frontend signup
========================================
*/

/*
========================================
IN-MEMORY SESSION STORE
========================================
*/
const sessions = new Map();

const setSession = (state, data) => {
  sessions.set(state, { ...data, createdAt: Date.now() });
};

const getSession = (state) => {
  const session = sessions.get(state);
  if (!session) return null;
  if (Date.now() - session.createdAt > 10 * 60 * 1000) {
    sessions.delete(state);
    return null;
  }
  return session;
};

const deleteSession = (state) => sessions.delete(state);

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

const generateEphemeralKeyPair = async () => {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", publicKey);
  const thumbprint = await calculateJwkThumbprint(publicJwk);
  return { privateKey, publicKey, publicJwk, thumbprint };
};

const generateDpopProof = async (ephemeralKeyPair, method, url, accessToken = null) => {
  const { privateKey, publicJwk } = ephemeralKeyPair;

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
      x: publicJwk.x,
      y: publicJwk.y,
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

// For FAPI 2.0: do NOT include cnf.jkt in client assertion
const generateClientAssertion = async (clientId, audience) => {
  const signingKeyPem = parsePem(process.env.MYINFO_PRIVATE_SIGNING_KEY);
  const privateKey = await importPKCS8(signingKeyPem, "ES256");

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
  const encryptionKeyPem = parsePem(process.env.MYINFO_PRIVATE_ENCRYPTION_KEY);

  // Import EC private key for ECDH-ES+A128KW decryption
  const privateKey = await importPKCS8(encryptionKeyPem, "ECDH-ES+A128KW");

  // Step 1: Decrypt JWE
  const { plaintext } = await compactDecrypt(encryptedData, privateKey);
  const jws = new TextDecoder().decode(plaintext);

  // Step 2: Verify JWS with Singpass public keys
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
const isProd = () => process.env.MYINFO_ENV === "production";

const getSingpassIssuer = () =>
  isProd() ? "https://id.singpass.gov.sg" : "https://stg-id.singpass.gov.sg";

const getSingpassJwksUrl = () =>
  isProd()
    ? "https://id.singpass.gov.sg/.well-known/keys"
    : "https://stg-id.singpass.gov.sg/.well-known/keys";

const getSingpassUrls = () => {
  const base = getSingpassIssuer();
  return {
    par:       `${base}/fapi/par`,
    authorize: `${base}/fapi/auth`,
    token:     `${base}/fapi/token`,
    userinfo:  `${base}/userinfo`,
  };
};

/*
========================================
SHARED: PAR flow — build authorize URL
========================================
*/
const buildAuthorizeUrl = async (userId = null) => {
  const urls      = getSingpassUrls();
  const clientId  = process.env.MYINFO_CLIENT_ID;
  const redirectUri = process.env.MYINFO_REDIRECT_URL;
  const scope     = process.env.MYINFO_SCOPE || "openid name";

  const state    = crypto.randomBytes(16).toString("hex");
  const nonce    = crypto.randomBytes(16).toString("hex");
  const { codeVerifier, codeChallenge } = generatePKCE();
  const ephemeralKeyPair = await generateEphemeralKeyPair();

  const clientAssertion = await generateClientAssertion(clientId, urls.par);
  const dpopForPar      = await generateDpopProof(ephemeralKeyPair, "POST", urls.par);

  const parBody = new URLSearchParams({
    client_id:              clientId,
    scope,
    redirect_uri:           redirectUri,
    response_type:          "code",
    code_challenge:         codeChallenge,
    code_challenge_method:  "S256",
    state,
    nonce,
    client_assertion_type:  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion:       clientAssertion,
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
    throw new Error(`PAR request failed: ${parResponse.status}`);
  }

  const { request_uri } = await parResponse.json();
  if (!request_uri) throw new Error("No request_uri in PAR response");

  setSession(state, {
    codeVerifier,
    ephemeralKeyPair,
    nonce,
    userId,
    isSignup: !userId,
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
ROUTE 1B: Protected auth URL (logged-in flow)
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
    console.error("❌ MyInfo callback error:", error, error_description);
    return res.redirect(`${frontendUrl}/kyc?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${frontendUrl}/kyc?error=missing_params`);
  }

  const session = getSession(state);
  if (!session) {
    return res.redirect(`${frontendUrl}/kyc?error=session_expired`);
  }

  const { codeVerifier, ephemeralKeyPair, userId, isSignup } = session;
  const urls        = getSingpassUrls();
  const clientId    = process.env.MYINFO_CLIENT_ID;
  const redirectUri = process.env.MYINFO_REDIRECT_URL;

  try {
    // ── Step 1: Exchange auth code for access token ──
    const clientAssertion = await generateClientAssertion(clientId, urls.token);
    const dpopForToken    = await generateDpopProof(ephemeralKeyPair, "POST", urls.token);

    const tokenBody = new URLSearchParams({
      grant_type:             "authorization_code",
      code,
      redirect_uri:           redirectUri,
      client_id:              clientId,
      code_verifier:          codeVerifier,
      client_assertion_type:  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion:       clientAssertion,
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
      deleteSession(state);
      return res.redirect(`${frontendUrl}/kyc?error=token_failed`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;

    console.log("✅ Token exchange success");

    // ── Step 2: Fetch userinfo — uses Bearer token (no DPoP for userinfo) ──
    const userinfoResponse = await fetch(urls.userinfo, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${access_token}`,
      },
    });

    if (!userinfoResponse.ok) {
      const errText = await userinfoResponse.text();
      console.error("❌ Userinfo fetch failed:", errText);
      deleteSession(state);
      return res.redirect(`${frontendUrl}/kyc?error=userinfo_failed`);
    }

    const encryptedUserinfo = await userinfoResponse.text();
    console.log("✅ Userinfo received, decrypting...");

    // ── Step 3: Decrypt + verify userinfo ──
    const personPayload = await decryptAndVerifyUserinfo(encryptedUserinfo);

    // FAPI 2.0: person data is nested under person_info
    const person = personPayload?.person_info || personPayload;

    console.log("✅ MyInfo person data decrypted for user:", userId || "signup");
    deleteSession(state);

    // ── Step 4: Extract KYC fields ──
    const kyc = {
      verified:    true,
      verifiedAt:  new Date(),
      source:      "singpass",
      name:        person?.name?.value || null,
      dob:         person?.dob?.value || null,
      sex:         person?.sex?.value || null,
      nationality: person?.nationality?.value || null,
      email:       person?.email?.value || null,
      mobile:      person?.mobileno?.nbr?.value
        ? `${person.mobileno.prefix?.value || "+65"}${person.mobileno.nbr.value}`
        : null,
      uinfin:      person?.uinfin?.value || null,
      address:     person?.regadd
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

    // ── SIGNUP FLOW: redirect to /kyc with name so frontend shows sign up form ──
    if (isSignup) {
      const params = new URLSearchParams({
        status: "success",
        name:   kyc.name   || "",
        dob:    kyc.dob    || "",
        mobile: kyc.mobile || "",
      });
      return res.redirect(`${frontendUrl}/kyc?${params.toString()}`);
    }

    // ── LOGGED-IN FLOW: save KYC directly to MongoDB ──
    await User.findByIdAndUpdate(userId, { kyc }, { new: true });
    console.log("✅ KYC saved for user:", userId);
    return res.redirect(`${frontendUrl}/kyc?status=success`);

  } catch (err) {
    console.error("❌ MyInfo callback error:", err.message);
    deleteSession(state);
    return res.redirect(`${frontendUrl}/kyc?error=processing_failed`);
  }
});

/*
========================================
ROUTE 3: Get KYC status (logged-in users)
GET /api/myinfo/status
========================================
*/
router.get("/status", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("kyc");
    res.json({
      verified:    user?.kyc?.verified   || false,
      name:        user?.kyc?.name       || null,
      verifiedAt:  user?.kyc?.verifiedAt || null,
    });
  } catch (err) {
    console.error("❌ KYC status error:", err.message);
    res.status(500).json({ message: "Failed to get KYC status" });
  }
});

module.exports = router;