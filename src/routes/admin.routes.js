const express = require("express");
const router = express.Router();

const User = require("../models/user");
const Booking = require("../models/Booking");
const Transaction = require("../models/Transaction");
const AdminLog = require("../models/AdminLog");
const Table = require("../models/table");

const auth = require("../middleware/auth");

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access only" });
  }
  next();
}

router.get("/unverified-users", auth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ isVerified: false }).select("-password");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/verify-user", auth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findByIdAndUpdate(userId, { isVerified: true }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    await AdminLog.create({ adminId: req.user.id, action: "verify_user", targetUserId: userId, details: { userName: user.name, email: user.email } });
    const io = req.app.get("io");
    io.emit("users_updated");
    res.json({ message: "User verified successfully", user });
  } catch (error) {
    res.status(500).json({ error: "Failed to verify user" });
  }
});

router.get("/stats", auth, requireAdmin, async (req, res) => {
  try {
    const [totalUsers, totalBookings, revenueData, totalTransactions] = await Promise.all([
      User.countDocuments(),
      Booking.countDocuments({ status: "confirmed" }),
      Booking.aggregate([{ $match: { status: "confirmed" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Transaction.countDocuments()
    ]);
    res.json({ totalUsers, totalBookings, totalRevenue: revenueData[0]?.total || 0, totalTransactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ FIXED: updates both status AND isActive
router.post("/tables/:id/status", auth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["available", "maintenance"].includes(status)) {
      return res.status(400).json({ error: "Status must be: available or maintenance" });
    }
    const table = await Table.findByIdAndUpdate(
      req.params.id,
      { status: status, isActive: status === "available" },
      { new: true }
    );
    if (!table) return res.status(404).json({ error: "Table not found" });
    const io = req.app.get("io");
    io.emit("bookingUpdated", { tableId: table._id, status });
    res.json({ message: `Table set to ${status}`, table });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/tables/:id/start-timer", auth, requireAdmin, async (req, res) => {
  try {
    const { hourlyRate } = req.body;
    const table = await Table.findById(req.params.id);
    if (!table) return res.status(404).json({ error: "Table not found" });
    table.timerStartedAt = new Date();
    table.timerHourlyRate = hourlyRate || table.basePrice;
    table.manualOverride = "ON";
    await table.save();
    const io = req.app.get("io");
    io.emit("bookingUpdated", { tableId: table._id, status: "timer_started" });
    res.json({ message: "Timer started", table });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/tables/:id/stop-timer", auth, requireAdmin, async (req, res) => {
  try {
    const { durationSeconds, hourlyRate } = req.body;
    const table = await Table.findById(req.params.id);
    if (!table) return res.status(404).json({ error: "Table not found" });
    const hours = durationSeconds / 3600;
    const amountCharged = parseFloat((hours * hourlyRate).toFixed(2));
    table.timerStartedAt = null;
    table.timerHourlyRate = null;
    table.manualOverride = null;
    await table.save();
    await Transaction.create({ userId: req.user.id, amount: amountCharged, type: "payment", method: "wallet", status: "success" });
    const io = req.app.get("io");
    io.emit("bookingUpdated", { tableId: table._id, status: "timer_stopped" });
    res.json({ message: "Timer stopped", durationSeconds, amountCharged, table });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/timer-sessions", auth, requireAdmin, async (req, res) => {
  try {
    const tables = await Table.find({ timerStartedAt: { $ne: null } });
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/promo-codes", auth, requireAdmin, async (req, res) => { res.json([]); });
router.post("/promo-codes", auth, requireAdmin, async (req, res) => { res.json({ message: "Promo code created", promo: req.body }); });
router.patch("/promo-codes/:id", auth, requireAdmin, async (req, res) => { res.json({ message: "Promo code updated" }); });
router.delete("/promo-codes/:id", auth, requireAdmin, async (req, res) => { res.json({ message: "Promo code deleted" }); });

module.exports = router;