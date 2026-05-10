const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const User = require("../models/user");
const AdminLog = require("../models/AdminLog");

const auth = require("../middleware/auth");
const authMiddleware = require("../middleware/auth.middleware");

// TopUpRequest schema inline
const topUpRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: null },
  adminNotes: { type: String, default: null }
}, { timestamps: true });

const TopUpRequest = mongoose.models.TopUpRequest ||
  mongoose.model("TopUpRequest", topUpRequestSchema);

router.get("/", authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const query = isAdmin ? {} : { userId: req.user.id };
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .populate("userId", "name email")
      .populate("bookingId", "tableId startTime endTime amount");
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

router.post("/topup/request", authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
    if (amount < 10) return res.status(400).json({ error: "Minimum top up amount is $10" });

    const existing = await TopUpRequest.findOne({ userId: req.user.id, status: "pending" });
    if (existing) return res.status(400).json({ error: "You already have a pending top up request. Please wait for it to be processed." });

    const request = await TopUpRequest.create({ userId: req.user.id, amount });

    const io = req.app.get("io");
    io.emit("topup_request_new", { requestId: request._id, userId: req.user.id, amount });

    res.json({ success: true, message: "Top up request submitted. Staff will credit your wallet once payment is verified.", request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/topup/my-requests", authMiddleware, async (req, res) => {
  try {
    const requests = await TopUpRequest.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/topup/admin/requests", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
    const { status } = req.query;
    const query = status ? { status } : {};
    const requests = await TopUpRequest.find(query)
      .sort({ createdAt: -1 })
      .populate("userId", "name email walletBalance shortId")
      .populate("reviewedBy", "name");
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/topup/admin/requests/:id/approve", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });

    const { adminNotes } = req.body;
    const request = await TopUpRequest.findById(req.params.id).populate("userId");
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "pending") return res.status(400).json({ error: "Request already processed" });

    const user = await User.findById(request.userId._id || request.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.walletBalance += request.amount;
    await user.save();

    request.status = "approved";
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    request.adminNotes = adminNotes || null;
    await request.save();

    await Transaction.create({ userId: user._id, amount: request.amount, type: "topup", method: "paynow", status: "success" });
    await AdminLog.create({ adminId: req.user.id, action: "approve_topup", targetUserId: user._id, details: { amount: request.amount, requestId: request._id } });

    const io = req.app.get("io");
    io.emit("walletUpdated", { userId: user._id, walletBalance: user.walletBalance });
    io.emit("topup_request_updated", { requestId: request._id, status: "approved" });
    io.emit("users_updated");

    res.json({ success: true, message: `Wallet credited $${request.amount.toFixed(2)} for ${user.name}`, newBalance: user.walletBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/topup/admin/requests/:id/reject", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });

    const { rejectionReason } = req.body;
    const request = await TopUpRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "pending") return res.status(400).json({ error: "Request already processed" });

    request.status = "rejected";
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    request.rejectionReason = rejectionReason || "Payment not verified";
    await request.save();

    await AdminLog.create({ adminId: req.user.id, action: "reject_topup", targetUserId: request.userId, details: { amount: request.amount, reason: request.rejectionReason, requestId: request._id } });

    const io = req.app.get("io");
    io.emit("topup_request_updated", { requestId: request._id, status: "rejected" });

    res.json({ success: true, message: "Top up request rejected" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;