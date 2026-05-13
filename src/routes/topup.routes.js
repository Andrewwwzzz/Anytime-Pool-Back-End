const express = require("express");
const router = express.Router();

const TopUpRequest = require("../models/TopUpRequest");
const Transaction = require("../models/Transaction");
const User = require("../models/user");
const AdminLog = require("../models/AdminLog");

const auth = require("../middleware/auth.middleware");

/*
========================================
USER — SUBMIT TOP UP REQUEST
Frontend calls: POST /api/topup/request
Body: { amount }
Customer has already made the PayNow transfer
and puts their User ID in the payment reference
========================================
*/
router.post("/request", auth, async (req, res) => {
  try {
    const { amount, method, paymentMethod, payment_method } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // Minimum top up $10
    if (amount < 10) {
      return res.status(400).json({ error: "Minimum top up amount is $10" });
    }

    // Accept method from any field name the frontend might send
    const rawMethod = method || paymentMethod || payment_method || "paynow";
    const paymentMethod2 = rawMethod === "cash" ? "cash" : "paynow";

    // Check if user already has a pending request
    const existing = await TopUpRequest.findOne({
      userId: req.user.id,
      status: "pending"
    });

    if (existing) {
      return res.status(400).json({
        error: "You already have a pending top up request. Please wait for it to be processed."
      });
    }

    const request = await TopUpRequest.create({
      userId: req.user.id,
      amount,
      method: paymentMethod2
    });

    // Notify admin via socket
    const io = req.app.get("io");
    io.emit("topup_request_new", {
      requestId: request._id,
      userId: req.user.id,
      amount,
      method: paymentMethod2
    });

    const message = paymentMethod2 === "cash"
      ? "Cash top up request submitted. Please head to the counter to pay."
      : "PayNow top up request submitted. Staff will credit your wallet once payment is verified.";

    res.json({
      success: true,
      message,
      request
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
USER — GET MY TOP UP REQUESTS
Frontend calls: GET /api/topup/my-requests
========================================
*/
router.get("/my-requests", auth, async (req, res) => {
  try {
    const requests = await TopUpRequest.find({ userId: req.user.id })
      .sort({ createdAt: -1 });

    res.json(requests);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
ADMIN — GET ALL PENDING TOP UP REQUESTS
Frontend calls: GET /api/topup/admin/requests
========================================
*/
router.get("/admin/requests", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }

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

/*
========================================
ADMIN — APPROVE TOP UP REQUEST
Frontend calls: POST /api/topup/admin/requests/:id/approve
Credits the user's wallet automatically
========================================
*/
router.post("/admin/requests/:id/approve", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }

    const { adminNotes } = req.body;

    const request = await TopUpRequest.findById(req.params.id)
      .populate("userId");

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ error: "Request already processed" });
    }

    // Credit the user's wallet
    const user = await User.findById(request.userId._id || request.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.walletBalance += request.amount;
    await user.save();

    // Update request status
    request.status = "approved";
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    request.adminNotes = adminNotes || null;
    await request.save();

    // Create transaction record using actual payment method
    await Transaction.create({
      userId: user._id,
      amount: request.amount,
      type: "topup",
      method: request.method || "paynow",
      status: "success"
    });

    // Log admin action
    await AdminLog.create({
      adminId: req.user.id,
      action: "approve_topup",
      targetUserId: user._id,
      details: {
        amount: request.amount,
        requestId: request._id
      }
    });

    // Notify user via socket
    const io = req.app.get("io");
    io.emit("walletUpdated", {
      userId: user._id,
      walletBalance: user.walletBalance
    });
    io.emit("topup_request_updated", {
      requestId: request._id,
      status: "approved"
    });
    io.emit("users_updated");

    res.json({
      success: true,
      message: `Wallet credited $${request.amount.toFixed(2)} for ${user.name}`,
      newBalance: user.walletBalance
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
ADMIN — REJECT TOP UP REQUEST
Frontend calls: POST /api/topup/admin/requests/:id/reject
Body: { rejectionReason }
========================================
*/
router.post("/admin/requests/:id/reject", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }

    const { rejectionReason } = req.body;

    const request = await TopUpRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ error: "Request already processed" });
    }

    request.status = "rejected";
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    request.rejectionReason = rejectionReason || "Payment not verified";
    await request.save();

    await AdminLog.create({
      adminId: req.user.id,
      action: "reject_topup",
      targetUserId: request.userId,
      details: {
        amount: request.amount,
        reason: request.rejectionReason,
        requestId: request._id
      }
    });

    const io = req.app.get("io");
    io.emit("topup_request_updated", {
      requestId: request._id,
      status: "rejected"
    });

    res.json({
      success: true,
      message: "Top up request rejected"
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;