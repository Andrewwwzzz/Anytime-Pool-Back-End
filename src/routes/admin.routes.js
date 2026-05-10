const express = require("express");
const router = express.Router();

const User = require("../models/user");
const Booking = require("../models/Booking");
const Transaction = require("../models/Transaction");
const AdminLog = require("../models/AdminLog");
const Table = require("../models/table");

const auth = require("../middleware/auth");

/*
========================================
ADMIN MIDDLEWARE
Only allow admin users
========================================
*/
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access only" });
  }
  next();
}

/*
========================================
GET ALL UNVERIFIED USERS
Frontend calls: GET /api/admin/unverified-users
========================================
*/
router.get("/unverified-users", auth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ isVerified: false }).select("-password");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

/*
========================================
VERIFY USER
Frontend calls: POST /api/admin/verify-user
Body: { userId }
========================================
*/
router.post("/verify-user", auth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { isVerified: true },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Log the admin action
    await AdminLog.create({
      adminId: req.user.id,
      action: "verify_user",
      targetUserId: userId,
      details: { userName: user.name, email: user.email }
    });

    const io = req.app.get("io");
    io.emit("users_updated");

    res.json({ message: "User verified successfully", user });

  } catch (error) {
    res.status(500).json({ error: "Failed to verify user" });
  }
});

/*
========================================
GET DASHBOARD STATS
Frontend calls: GET /api/admin/stats
========================================
*/
router.get("/stats", auth, requireAdmin, async (req, res) => {
  try {
    const [totalUsers, totalBookings, revenueData, totalTransactions] =
      await Promise.all([
        User.countDocuments(),
        Booking.countDocuments({ status: "confirmed" }),
        Booking.aggregate([
          { $match: { status: "confirmed" } },
          { $group: { _id: null, total: { $sum: "$amount" } } }
        ]),
        Transaction.countDocuments()
      ]);

    res.json({
      totalUsers,
      totalBookings,
      totalRevenue: revenueData[0]?.total || 0,
      totalTransactions
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
UPDATE TABLE STATUS (maintenance / available)
Frontend calls: POST /api/admin/tables/:id/status
Body: { status: "maintenance" } or { status: "available" }
========================================
*/
router.post("/tables/:id/status", auth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;

    const allowed = ["available", "maintenance"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Status must be: available or maintenance" });
    }

    const table = await Table.findByIdAndUpdate(
      req.params.id,
      { isActive: status === "available" },
      { new: true }
    );

    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }

    const io = req.app.get("io");
    io.emit("bookingUpdated", { tableId: table._id, status });

    res.json({ message: `Table set to ${status}`, table });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
START TIMER (walk-in session)
Frontend calls: POST /api/admin/tables/:id/start-timer
Body: { hourlyRate }
========================================
*/
router.post("/tables/:id/start-timer", auth, requireAdmin, async (req, res) => {
  try {
    const { hourlyRate } = req.body;

    const table = await Table.findByIdAndUpdate(
      req.params.id,
      {
        timerStartedAt: new Date(),
        timerHourlyRate: hourlyRate || table.basePrice
      },
      { new: true }
    );

    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }

    // Turn the light on via manual override
    table.manualOverride = "ON";
    await table.save();

    const io = req.app.get("io");
    io.emit("bookingUpdated", { tableId: table._id, status: "timer_started" });

    res.json({ message: "Timer started", table });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
STOP TIMER (end walk-in session)
Frontend calls: POST /api/admin/tables/:id/stop-timer
Body: { durationSeconds, hourlyRate, startedAt }
========================================
*/
router.post("/tables/:id/stop-timer", auth, requireAdmin, async (req, res) => {
  try {
    const { durationSeconds, hourlyRate, startedAt } = req.body;

    const table = await Table.findById(req.params.id);

    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }

    // Calculate the amount owed
    const hours = durationSeconds / 3600;
    const amountCharged = parseFloat((hours * hourlyRate).toFixed(2));

    // Clear the timer and override
    table.timerStartedAt = null;
    table.timerHourlyRate = null;
    table.manualOverride = null;
    await table.save();

    // Save session record as a transaction
    await Transaction.create({
      userId: req.user.id,
      amount: amountCharged,
      type: "payment",
      method: "wallet",
      status: "success"
    });

    const io = req.app.get("io");
    io.emit("bookingUpdated", { tableId: table._id, status: "timer_stopped" });

    res.json({
      message: "Timer stopped",
      durationSeconds,
      amountCharged,
      table
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
GET TIMER SESSIONS
Frontend calls: GET /api/admin/timer-sessions
========================================
*/
router.get("/timer-sessions", auth, requireAdmin, async (req, res) => {
  try {
    // Return all tables that currently have an active timer
    const tables = await Table.find({ timerStartedAt: { $ne: null } });

    res.json(tables);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
GET ALL PROMO CODES
Frontend calls: GET /api/admin/promo-codes
========================================
*/
router.get("/promo-codes", auth, requireAdmin, async (req, res) => {
  // Promo codes are stored in frontend localStorage for now
  // This endpoint returns empty array as placeholder
  res.json([]);
});

/*
========================================
CREATE PROMO CODE
Frontend calls: POST /api/admin/promo-codes
========================================
*/
router.post("/promo-codes", auth, requireAdmin, async (req, res) => {
  // Placeholder — promo codes handled in frontend for now
  res.json({ message: "Promo code created", promo: req.body });
});

/*
========================================
UPDATE PROMO CODE
Frontend calls: PATCH /api/admin/promo-codes/:id
========================================
*/
router.patch("/promo-codes/:id", auth, requireAdmin, async (req, res) => {
  res.json({ message: "Promo code updated" });
});

/*
========================================
DELETE PROMO CODE
Frontend calls: DELETE /api/admin/promo-codes/:id
========================================
*/
router.delete("/promo-codes/:id", auth, requireAdmin, async (req, res) => {
  res.json({ message: "Promo code deleted" });
});

module.exports = router;