const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "Anytime Pool backend is working",
    timestamp: new Date()
  });
});

module.exports = router;
