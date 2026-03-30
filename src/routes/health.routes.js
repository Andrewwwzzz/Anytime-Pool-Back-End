const express = require("express");
const router = express.Router();

/*
HEALTH CHECK
*/
router.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "Envo Pool API",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;