const express = require("express");
const router = express.Router();

const Transaction = require("../models/Transaction");
const auth = require("../middleware/auth");
const authMiddleware = require("../middleware/auth.middleware");

/*
========================================
GET TRANSACTIONS FOR LOGGED IN USER
Frontend calls: GET /api/transactions
Used by user dashboard Transaction History section
========================================
*/
router.get("/", authMiddleware, async (req, res) => {
  try {
    // Check if admin — admins get all transactions
    // Regular users only get their own
    const isAdmin = req.user.role === "admin";

    const query = isAdmin ? {} : { userId: req.user.id };

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .populate("userId", "name email")   // show user name instead of raw ID
      .populate("bookingId", "tableId startTime endTime amount");

    res.json(transactions);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
GET MY TRANSACTIONS ONLY
Frontend calls: GET /api/transactions/me
Explicitly returns only the logged in user's transactions
========================================
*/
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .populate("bookingId", "tableId startTime endTime amount");

    res.json(transactions);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;