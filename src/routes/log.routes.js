const express = require("express");
const router = express.Router();

const BookingLog = require("../models/BookingLog");
const AdminLog = require("../models/AdminLog");
const auth = require("../middleware/auth");

router.get("/booking", auth, async (req, res) => {
  const logs = await BookingLog.find().sort({ createdAt: -1 });
  res.json(logs);
});

router.get("/admin", auth, async (req, res) => {
  const logs = await AdminLog.find().sort({ createdAt: -1 });
  res.json(logs);
});

module.exports = router;