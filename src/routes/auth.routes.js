const express = require("express");
const router = express.Router();

const authController = require("../controllers/auth.controller");

/*
  Step 1
  Trigger Singpass QR login
*/
router.get("/singpass", authController.redirectToSingpass);

/*
  Step 2
  Singpass callback after login
*/
router.get("/callback", authController.singpassCallback);

module.exports = router;
