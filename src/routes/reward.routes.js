const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const Reward = require("../models/Reward");
const User = require("../models/user");
const Transaction = require("../models/Transaction");
const auth = require("../middleware/auth.middleware");

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access only" });
  }
  next();
}

async function generateCode() {
  let code;
  let exists = true;
  while (exists) {
    code = "RWD-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    exists = await Reward.findOne({ code });
  }
  return code;
}

// ADMIN — Issue reward to a specific user
router.post("/issue", auth, requireAdmin, async (req, res) => {
  try {
    const { userId, type, value, description, reason, expiresAt } = req.body;
    if (!userId || !type || !description || !reason) {
      return res.status(400).json({ error: "userId, type, description and reason are required" });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const code = await generateCode();
    const reward = await Reward.create({
      code, userId, type,
      value: value || null,
      description, reason,
      issuedBy: req.user.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null
    });

    const io = req.app.get("io");
    if (io) io.emit("rewardIssued", { userId, code });

    res.json({ message: "Reward issued successfully", reward });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN — Get all rewards
router.get("/admin", auth, requireAdmin, async (req, res) => {
  try {
    const query = {};
    if (req.query.userId) query.userId = req.query.userId;
    if (req.query.isRedeemed !== undefined) query.isRedeemed = req.query.isRedeemed === "true";

    const rewards = await Reward.find(query)
      .populate("userId", "name email shortId")
      .populate("issuedBy", "name")
      .populate("redeemedOnBookingId", "startTime endTime tableId")
      .sort({ createdAt: -1 });

    res.json(rewards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// USER — Get my rewards
router.get("/my", auth, async (req, res) => {
  try {
    const rewards = await Reward.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(rewards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// USER — Validate a reward code
router.get("/validate/:code", auth, async (req, res) => {
  try {
    const reward = await Reward.findOne({
      code: req.params.code.toUpperCase(),
      userId: req.user.id
    });
    if (!reward) return res.status(404).json({ error: "Invalid reward code or not assigned to your account" });
    if (reward.isRedeemed) return res.status(400).json({ error: "This reward has already been redeemed" });
    if (reward.expiresAt && reward.expiresAt < new Date()) return res.status(400).json({ error: "This reward has expired" });
    res.json({ valid: true, reward });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// USER — Redeem wallet_credit reward directly from profile
router.post("/redeem-credit", auth, async (req, res) => {
  try {
    const { code } = req.body;
    const reward = await Reward.findOne({
      code: code.toUpperCase(),
      userId: req.user.id,
      type: "wallet_credit"
    });
    if (!reward) return res.status(404).json({ error: "Invalid reward code" });
    if (reward.isRedeemed) return res.status(400).json({ error: "Already redeemed" });
    if (reward.expiresAt && reward.expiresAt < new Date()) return res.status(400).json({ error: "Reward has expired" });

    const user = await User.findById(req.user.id);
    user.walletBalance += reward.value;
    await user.save();

    reward.isRedeemed = true;
    reward.redeemedAt = new Date();
    await reward.save();

    await Transaction.create({
      userId: user._id,
      amount: reward.value,
      type: "topup",
      method: "reward",
      status: "success"
    });

    res.json({ message: `$${reward.value.toFixed(2)} credited to your wallet`, newBalance: user.walletBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// INTERNAL — Mark reward as redeemed on a booking
router.post("/redeem-on-booking", auth, async (req, res) => {
  try {
    const { code, bookingId } = req.body;
    const reward = await Reward.findOne({ code: code.toUpperCase(), userId: req.user.id });
    if (!reward) return res.status(404).json({ error: "Invalid reward code" });
    if (reward.isRedeemed) return res.status(400).json({ error: "Already redeemed" });
    if (reward.expiresAt && reward.expiresAt < new Date()) return res.status(400).json({ error: "Reward has expired" });

    reward.isRedeemed = true;
    reward.redeemedAt = new Date();
    reward.redeemedOnBookingId = bookingId;
    await reward.save();

    res.json({ success: true, reward });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;