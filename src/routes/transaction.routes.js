const express = require("express");
const router = express.Router();

const Transaction = require("../models/Transaction");
const auth = require("../middleware/auth");

router.get("/", auth, async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .populate("userId", "name email");

    res.json(transactions);

  } catch (error) {
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

module.exports = router;