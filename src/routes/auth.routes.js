const express = require("express")
const router = express.Router()

const authController = require("../controllers/auth.controller")

router.get("/singpass", authController.redirectToSingpass)

router.get("/callback", authController.singpassCallback)

module.exports = router
