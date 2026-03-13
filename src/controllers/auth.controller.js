import axios from "axios";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const AUTH_ENDPOINT = process.env.SINGPASS_AUTHORIZE_URL;
const PAR_ENDPOINT = process.env.SINGPASS_PAR_URL || "https://stg-id.singpass.gov.sg/par";

const CLIENT_ID = process.env.SINGPASS_CLIENT_ID;
const REDIRECT_URI = process.env.SINGPASS_REDIRECT_URI;

const SIGNING_PRIVATE_KEY = process.env.SIGNING_PRIVATE_KEY.replace(/\\n/g, "\n");
const SIGNING_KID = process.env.SIGNING_KID;

const DPOP_PRIVATE_KEY = process.env.DPOP_PRIVATE_KEY.replace(/\\n/g, "\n");

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function generateCodeVerifier() {
  return base64url(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  return base64url(crypto.createHash("sha256").update(verifier).digest());
}

function generateDPoP(url, method) {
  const htu = url;
  const htm = method;
  const jti = crypto.randomUUID();
  const iat = Math.floor(Date.now() / 1000);

  const payload = { htu, htm, jti, iat };

  return jwt.sign(payload, DPOP_PRIVATE_KEY, {
    algorithm: "ES256",
    header: {
      typ: "dpop+jwt",
      alg: "ES256"
    }
  });
}

export const singpassLogin = async (req, res) => {
  try {
    const state = crypto.randomBytes(32).toString("hex");
    const nonce = crypto.randomBytes(32).toString("hex");

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    req.session.codeVerifier = codeVerifier;
    req.session.state = state;
    req.session.nonce = nonce;

    const clientAssertion = jwt.sign(
      {
        iss: CLIENT_ID,
        sub: CLIENT_ID,
        aud: PAR_ENDPOINT,
        jti: crypto.randomUUID(),
        exp: Math.floor(Date.now() / 1000) + 300
      },
      SIGNING_PRIVATE_KEY,
      {
        algorithm: "ES256",
        keyid: SIGNING_KID
      }
    );

    const parPayload = {
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: "openid user.identity name dob",
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion,
      authentication_context_class_reference:
        "urn:spe:authentication:singpass:qr"
    };

    console.log("PAR REQUEST PAYLOAD:", parPayload);

    const dpop = generateDPoP(PAR_ENDPOINT, "POST");

    const parResponse = await axios.post(PAR_ENDPOINT, parPayload, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        DPoP: dpop
      }
    });

    console.log("PAR RESPONSE:", parResponse.data);

    const requestUri = parResponse.data.request_uri;

    const authUrl =
      `${AUTH_ENDPOINT}?client_id=${CLIENT_ID}&request_uri=${encodeURIComponent(
        requestUri
      )}`;

    console.log("AUTH URL:", authUrl);

    res.redirect(authUrl);
  } catch (error) {
    console.error("PAR ERROR FULL RESPONSE:", error.response?.data || error);
    res.status(500).json({ error: "Singpass PAR failed" });
  }
};
