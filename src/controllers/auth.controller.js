const axios = require("axios")
const crypto = require("crypto")
const qs = require("qs")
const jwt = require("jsonwebtoken")

const clientId = process.env.SINGPASS_CLIENT_ID
const redirectUri = process.env.SINGPASS_REDIRECT_URI

const AUTH_ENDPOINT = "https://stg-id.singpass.gov.sg/auth"
const TOKEN_ENDPOINT = "https://stg-id.singpass.gov.sg/token"

/* =========================
HELPERS
========================= */

function randomString() {
  return crypto.randomBytes(32).toString("hex")
}

function codeChallenge(verifier) {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url")
}

/* =========================
STEP 1: Redirect to Singpass
========================= */

exports.redirectToSingpass = async (req, res) => {

  const state = randomString()
  const nonce = randomString()

  const verifier = randomString()
  const challenge = codeChallenge(verifier)

  req.session.state = state
  req.session.nonce = nonce
  req.session.codeVerifier = verifier

  const authUrl =
    `${AUTH_ENDPOINT}?` +
    `client_id=${clientId}` +
    `&response_type=code` +
    `&scope=openid%20name%20dob` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&nonce=${nonce}` +
    `&code_challenge=${challenge}` +
    `&code_challenge_method=S256`

  return res.redirect(authUrl)
}

/* =========================
STEP 2: Callback
========================= */

exports.singpassCallback = async (req, res) => {

  try {

    const { code, state } = req.query

    if (state !== req.session.state) {
      return res.status(400).send("Invalid state")
    }

    const tokenResponse = await axios.post(
      TOKEN_ENDPOINT,
      qs.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: req.session.codeVerifier
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    )

    const { id_token } = tokenResponse.data

    const decoded = jwt.decode(id_token)

    if (decoded.nonce !== req.session.nonce) {
      return res.status(400).send("Invalid nonce")
    }

    return res.json({
      message: "Singpass login successful",
      user: decoded
    })

  } catch (err) {

    console.error(err.response?.data || err.message)

    res.status(500).send("Singpass login failed")

  }
}
