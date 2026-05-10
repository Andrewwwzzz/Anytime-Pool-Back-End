const express = require("express");
const router = express.Router();

const Booking = require("../models/Booking");
const Transaction = require("../models/Transaction");
const BookingLog = require("../models/BookingLog");
const AdminLog = require("../models/AdminLog");
const User = require("../models/user");

const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");

// Every route in this file requires:
// 1. A valid login token (authMiddleware)
// 2. The user must be an admin (roleMiddleware)
router.use(authMiddleware);
router.use(roleMiddleware("admin"));

/*
========================================
DELETE A BOOKING
Frontend calls: DELETE /api/admin/bookings/:id
========================================
*/
router.delete("/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    await Booking.deleteOne({ _id: booking._id });

    // Log the admin action
    await AdminLog.create({
      adminId: req.user.id,
      action: "delete_booking",
      targetUserId: booking.userId,
      details: {
        bookingId: booking._id,
        tableId: booking.tableId,
        startTime: booking.startTime,
        endTime: booking.endTime,
        amount: booking.amount
      }
    });

    // Notify all connected clients in real time
    const io = req.app.get("io");
    io.emit("bookingUpdated", { bookingId: booking._id, status: "deleted" });

    res.json({ message: "Booking deleted successfully" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
UPDATE BOOKING STATUS
Frontend calls: POST /api/admin/bookings/:id/status
Example body: { "status": "confirmed" }
========================================
*/
router.post("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    const allowed = ["confirmed", "cancelled", "completed", "expired"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be: confirmed, cancelled, completed, or expired" });
    }

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // If confirming, make sure no other confirmed booking overlaps
    if (status === "confirmed") {
      const overlapping = await Booking.findOne({
        _id: { $ne: booking._id },
        tableId: booking.tableId,
        status: "confirmed",
        startTime: { $lt: booking.endTime },
        endTime: { $gt: booking.startTime }
      });

      if (overlapping) {
        return res.status(409).json({
          error: "Another confirmed booking already exists for this time slot"
        });
      }
    }

    booking.status = status;
    await booking.save();

    // Write to booking log for audit trail
    await BookingLog.create({
      bookingId: booking._id,
      action: status,
      performedBy: req.user.id,
      note: `Status changed to ${status} by admin`
    });

    // Notify all connected clients in real time
    const io = req.app.get("io");
    io.emit("bookingUpdated", { bookingId: booking._id, status });

    res.json({ message: `Booking updated to ${status}`, booking });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
GET A CUSTOMER'S BOOKINGS
Frontend calls: GET /api/admin/customers/:id/bookings
========================================
*/
router.get("/customers/:userId/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.params.userId })
      .sort({ createdAt: -1 });

    res.json(bookings);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
GET A CUSTOMER'S WALLET HISTORY
Frontend calls: GET /api/admin/customers/:id/wallet
========================================
*/
router.get("/customers/:userId/wallet", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const transactions = await Transaction.find({ userId: req.params.userId })
      .sort({ createdAt: -1 });

    res.json({
      walletBalance: user.walletBalance,
      totalSpent: user.totalSpent,
      transactions
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
GET A CUSTOMER'S REWARD HISTORY
Frontend calls: GET /api/admin/customers/:id/rewards
========================================
*/
router.get("/customers/:userId/rewards", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return reward points — full reward history system can be added later
    res.json({
      rewardPoints: user.rewardPoints || 0,
      history: []
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;