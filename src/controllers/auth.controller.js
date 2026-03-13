const express = require("express");
const router = express.Router();

const authController = require("../controllers/auth.controller");

// start singpass login
router.get("/singpass", authController.redirectToSingpass);

// callback from singpass
router.get("/callback", authController.singpassCallback);

module.exports = router;
