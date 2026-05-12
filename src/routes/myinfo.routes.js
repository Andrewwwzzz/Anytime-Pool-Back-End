const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { SignJWT, importPKCS8, calculateJwkThumbprint, compactDecrypt, createRemoteJWKSet, flattenedVerify } = require("jose");
const protect = require("../middleware/auth");
const User = require("../models/user");

/*
========================================
IN-MEMORY SESSION STORE
Stores PKCE + ephemeral keys between
the authorize redirect and callback.
Each session expires after 10 minutes.
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

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    Buffer.from(signingInput)
  );

  const encodedSig = Buffer.from(signature).toString("base64url");
  return `${signingInput}.${encodedSig}`;
};

const generateClientAssertion = async (clientId, tokenUrl, ephemeralThumbprint) => {
  const signingKeyPem = parsePem(process.env.MYINFO_PRIVATE_SIGNING_KEY);
  const privateKey = await importPKCS8(signingKeyPem, "ES256");

  return new SignJWT({
    sub: clientId,
    aud: tokenUrl,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    jti: crypto.randomUUID(),
    cnf: { jkt: ephemeralThumbprint },
  })
    .setProtectedHeader({ alg: "ES256" })
    .setIssuer(clientId)
    .sign(privateKey);
};

const decryptAndVerifyPersonData = async (encryptedData) => {
  const encryptionKeyPem = parsePem(process.env.MYINFO_PRIVATE_ENCRYPTION_KEY);
  const privateKey = await importPKCS8(encryptionKeyPem, "ECDH-ES+A128GCM");

  const { plaintext } = await compactDecrypt(encryptedData, privateKey);
  const jws = new TextDecoder().decode(plaintext);

  const MYINFO_JWKS_URL = process.env.MYINFO_ENV === "production"
    ? "https://id.singpass.gov.sg/.well-known/keys"
    : "https://test.id.singpass.gov.sg/.well-known/keys";

  const JWKS = createRemoteJWKSet(new URL(MYINFO_JWKS_URL));
  const { payload } = await flattenedVerify(jws, JWKS);

  return JSON.parse(new TextDecoder().decode(payload));
};

const getMyInfoUrls = () => {
  const isProduction = process.env.MYINFO_ENV === "production";
  return {
    authorize: isProduction
      ? "https://id.singpass.gov.sg/auth"
      : "https://test.id.singpass.gov.sg/auth",
    token: isProduction
      ? "https://id.singpass.gov.sg/token"
      : "https://test.id.singpass.gov.sg/token",
    userinfo: isProduction
      ? "https://id.singpass.gov.sg/userinfo"
      : "https://test.id.singpass.gov.sg/userinfo",
  };
};

/*
========================================
SHARED: Build authorize URL
Used by both public and protected endpoints
========================================
*/
const buildAuthorizeUrl = async (userId = null) => {
  const { authorize } = getMyInfoUrls();
  const clientId = process.env.MYINFO_CLIENT_ID;
  const redirectUri = process.env.MYINFO_REDIRECT_URL;
  const scope = process.env.MYINFO_SCOPE || "openid name";

  const state = crypto.randomBytes(16).toString("hex");
  const nonce = crypto.randomBytes(16).toString("hex");
  const { codeVerifier, codeChallenge } = generatePKCE();
  const ephemeralKeyPair = await generateEphemeralKeyPair();

  setSession(state, {
    codeVerifier,
    ephemeralKeyPair,
    nonce,
    userId,           // null for signup flow, populated for logged-in flow
    isSignup: !userId,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    response_type: "code",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });

  return `${authorize}?${params.toString()}`;
};

/*
========================================
ROUTE 1A: Public auth URL (signup flow)
POST /api/myinfo/auth-url-public
No login required — used on sign up page
========================================
*/
router.post("/auth-url-public", async (req, res) => {
  try {
    const authorizeUrl = await buildAuthorizeUrl(null);
    res.json({ authorizeUrl });
  } catch (err) {
    console.error("❌ MyInfo public auth-url error:", err.message);
    res.status(500).json({ message: "Failed to generate MyInfo auth URL" });
  }
});

/*
========================================
ROUTE 1B: Protected auth URL (logged-in flow)
POST /api/myinfo/auth-url
Requires login — used on profile/settings page
========================================
*/
router.post("/auth-url", protect, async (req, res) => {
  try {
    const authorizeUrl = await buildAuthorizeUrl(req.user._id.toString());
    res.json({ authorizeUrl });
  } catch (err) {
    console.error("❌ MyInfo auth-url error:", err.message);
    res.status(500).json({ message: "Failed to generate MyInfo auth URL" });
  }
});

/*
========================================
ROUTE 2: Callback
GET /api/myinfo/callback
Singpass redirects here after user logs in and consents.
Handles both signup flow and logged-in flow.
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
  const { token, userinfo } = getMyInfoUrls();
  const clientId = process.env.MYINFO_CLIENT_ID;
  const redirectUri = process.env.MYINFO_REDIRECT_URL;

  try {
    // ── Exchange auth code for access token ──
    const clientAssertion = await generateClientAssertion(
      clientId, token, ephemeralKeyPair.thumbprint
    );
    const dpopForToken = await generateDpopProof(ephemeralKeyPair, "POST", token);

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion,
    });

    const tokenResponse = await fetch(token, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "DPoP": dpopForToken,
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
    const { access_token, token_type } = tokenData;

    // ── Fetch person data ──
    const usesDpop = token_type?.toLowerCase() === "dpop";
    const authorizationHeader = usesDpop
      ? `DPoP ${access_token}`
      : `Bearer ${access_token}`;

    const userinfoHeaders = { Authorization: authorizationHeader };

    if (usesDpop) {
      const dpopForUserinfo = await generateDpopProof(
        ephemeralKeyPair, "GET", userinfo, access_token
      );
      userinfoHeaders["DPoP"] = dpopForUserinfo;
    }

    const userinfoResponse = await fetch(userinfo, { headers: userinfoHeaders });

    if (!userinfoResponse.ok) {
      const errText = await userinfoResponse.text();
      console.error("❌ Userinfo fetch failed:", errText);
      deleteSession(state);
      return res.redirect(`${frontendUrl}/kyc?error=userinfo_failed`);
    }

    const encryptedPersonData = await userinfoResponse.text();
    const personData = await decryptAndVerifyPersonData(encryptedPersonData);

    deleteSession(state);

    // ── Extract KYC fields ──
    const kyc = {
      verified: true,
      verifiedAt: new Date(),
      source: "singpass",
      name: personData?.name?.value || null,
      dob: personData?.dob?.value || null,
      sex: personData?.sex?.value || null,
      nationality: personData?.nationality?.value || null,
      email: personData?.email?.value || null,
      mobile: personData?.mobileno?.nbr?.value
        ? `${personData.mobileno.prefix?.value || "+65"}${personData.mobileno.nbr.value}`
        : null,
      uinfin: personData?.uinfin?.value || null,
      address: personData?.regadd
        ? [
            personData.regadd.block?.value,
            personData.regadd.street?.value,
            personData.regadd.floor?.value
              ? `#${personData.regadd.floor.value}-${personData.regadd.unit?.value}`
              : null,
            personData.regadd.postal?.value
              ? `Singapore ${personData.regadd.postal.value}`
              : null,
          ].filter(Boolean).join(", ")
        : null,
    };

    // ── SIGNUP FLOW: redirect to /kyc page with name so frontend can show sign up form ──
    if (isSignup) {
      const params = new URLSearchParams({
        status: "success",
        name: kyc.name || "",
        dob: kyc.dob || "",
        mobile: kyc.mobile || "",
      });
      return res.redirect(`${frontendUrl}/kyc?${params.toString()}`);
    }

    // ── LOGGED-IN FLOW: save KYC directly to user's account ──
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
      verified: user?.kyc?.verified || false,
      name: user?.kyc?.name || null,
      verifiedAt: user?.kyc?.verifiedAt || null,
    });
  } catch (err) {
    console.error("❌ KYC status error:", err.message);
    res.status(500).json({ message: "Failed to get KYC status" });
  }
});

module.exports = router;