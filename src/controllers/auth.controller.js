const axios = require("axios")
const qs = require("qs")
const crypto = require("crypto")
const jwt = require("jsonwebtoken")
const { SignJWT, importPKCS8 } = require("jose")

const clientId = process.env.SINGPASS_CLIENT_ID
const redirectUri = process.env.SINGPASS_REDIRECT_URI

const PAR_ENDPOINT = "https://stg-id.singpass.gov.sg/fapi/par"
const TOKEN_ENDPOINT = "https://stg-id.singpass.gov.sg/fapi/token"
const AUTH_ENDPOINT = "https://stg-id.singpass.gov.sg/auth"

const ISSUER = "https://stg-id.singpass.gov.sg/fapi"

const SIGNING_PRIVATE_KEY = process.env.SIGNING_PRIVATE_KEY.replace(/\\n/g,"\n")
const SIGNING_KID = process.env.SIGNING_KID

const DPOP_PRIVATE_KEY = process.env.DPOP_PRIVATE_KEY.replace(/\\n/g,"\n")

function randomString() {
  return crypto.randomBytes(32).toString("hex")
}

function codeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url")
}

function generateClientAssertion() {

  const now = Math.floor(Date.now()/1000)

  return jwt.sign(
    {
      iss: clientId,
      sub: clientId,
      aud: ISSUER,
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 120
    },
    SIGNING_PRIVATE_KEY,
    {
      algorithm: "ES256",
      keyid: SIGNING_KID
    }
  )
}

async function generateDpop(url, method) {

  const key = await importPKCS8(DPOP_PRIVATE_KEY,"ES256")

  const now = Math.floor(Date.now()/1000)

  const jwtToken = await new SignJWT({
    htu: url,
    htm: method,
    jti: crypto.randomUUID(),
    iat: now
  })
  .setProtectedHeader({
    alg: "ES256",
    typ: "dpop+jwt",
    jwk: {
      kty:"EC",
      crv:"P-256",
      x: process.env.DPOP_PUBLIC_X,
      y: process.env.DPOP_PUBLIC_Y
    }
  })
  .sign(key)

  return jwtToken
}

exports.redirectToSingpass = async (req,res)=>{

  try{

    const state = randomString()
    const nonce = randomString()

    const verifier = randomString()
    const challenge = codeChallenge(verifier)

    req.session.state = state
    req.session.nonce = nonce
    req.session.codeVerifier = verifier

    const clientAssertion = generateClientAssertion()
    const dpop = await generateDpop(PAR_ENDPOINT,"POST")

    const parResponse = await axios.post(
      PAR_ENDPOINT,
      qs.stringify({
        response_type:"code",
        client_id:clientId,
        redirect_uri:redirectUri,
        scope:"openid name dob user.identity",
        state,
        nonce,
        code_challenge:challenge,
        code_challenge_method:"S256",
        client_assertion_type:"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion:clientAssertion,
        authentication_context_class_reference:"urn:spe:authentication:singpass:qr"
      }),
      {
        headers:{
          "Content-Type":"application/x-www-form-urlencoded",
          DPoP:dpop
        }
      }
    )

    const requestUri = parResponse.data.request_uri

    const authUrl =
      `${AUTH_ENDPOINT}?client_id=${clientId}&request_uri=${requestUri}`

    return res.redirect(authUrl)

  }catch(err){

    console.error("PAR Error:",err.response?.data||err.message)

    res.status(500).send("Singpass PAR failed")

  }
}

exports.singpassCallback = async (req,res)=>{

  try{

    const {code,state}=req.query

    if(state!==req.session.state){
      return res.status(400).send("Invalid state")
    }

    const clientAssertion = generateClientAssertion()
    const dpop = await generateDpop(TOKEN_ENDPOINT,"POST")

    const tokenResponse = await axios.post(
      TOKEN_ENDPOINT,
      qs.stringify({
        grant_type:"authorization_code",
        code,
        redirect_uri:redirectUri,
        client_id:clientId,
        code_verifier:req.session.codeVerifier,
        client_assertion_type:"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion:clientAssertion
      }),
      {
        headers:{
          "Content-Type":"application/x-www-form-urlencoded",
          DPoP:dpop
        }
      }
    )

    const decoded = jwt.decode(tokenResponse.data.id_token)

    if(decoded.nonce!==req.session.nonce){
      return res.status(400).send("Invalid nonce")
    }

    res.json({
      message:"Singpass login successful",
      user:decoded
    })

  }catch(err){

    console.error("Token Error:",err.response?.data||err.message)

    res.status(500).send("Token exchange failed")

  }
}
