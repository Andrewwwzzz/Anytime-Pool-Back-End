const express = require("express");
const router = express.Router();

const Booking = require("../models/Booking");
const BookingLog = require("../models/BookingLog");
const User = require("../models/user");
const Transaction = require("../models/Transaction");

const auth = require("../middleware/auth.middleware");

/*
========================================
CREATE BOOKING
Frontend calls: POST /api/bookings
Body: { tableId, startTime, endTime, amount }

This only creates the booking as "pending_payment".
Payment is handled separately via /api/payments/wallet
or /api/payments/checkout
========================================
*/
router.post("/", auth, async (req, res) => {
  try {
    const { tableId, startTime, endTime, amount, promoCode, promoDiscount, originalAmount, rewardCode } = req.body;

    // Fetch the full user to check verification status
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: "Account not verified. Please wait for admin approval." });
    }

    // Allow $0 only when a valid reward code is attached
    const isFreeReward = rewardCode && amount === 0;

    if (!isFreeReward && (!amount || amount <= 0)) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // Validate reward code if provided
    let reward = null;
    if (rewardCode) {
      const Reward = require("../models/Reward");
      reward = await Reward.findOne({
        code: rewardCode.toUpperCase(),
        userId: req.user.id,
        isRedeemed: false
      });
      if (!reward) {
        return res.status(400).json({ error: "Invalid or already used reward code" });
      }
      if (reward.expiresAt && reward.expiresAt < new Date()) {
        return res.status(400).json({ error: "Reward code has expired" });
      }
    }

    if (!tableId || !startTime || !endTime) {
      return res.status(400).json({ error: "tableId, startTime and endTime are required" });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      return res.status(400).json({ error: "End time must be after start time" });
    }

    // ✅ Check maintenance FIRST before anything else
    const Table = require("../models/table");
    const table = await Table.findOne({ hardware_id: tableId });

    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }

    if (table.status === "maintenance" || table.isActive === false) {
      return res.status(403).json({ error: "This table is currently under maintenance and cannot be booked" });
    }

    // Check for overlapping bookings on the same table
    const conflict = await Booking.findOne({
      tableId,
      status: { $in: ["pending_payment", "confirmed"] },
      startTime: { $lt: end },
      endTime: { $gt: start }
    });

    if (conflict) {
      return res.status(409).json({ error: "This time slot is already booked. Please choose another." });
    }

    // Create the booking — expires in 10 minutes if unpaid
    const booking = await Booking.create({
      userId: user._id,
      tableId,
      startTime: start,
      endTime: end,
      amount,
      status: isFreeReward ? "confirmed" : "pending_payment",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      promoCode: promoCode || null,
      promoDiscount: promoDiscount || 0,
      originalAmount: originalAmount || amount,
      rewardCode: rewardCode || null,
      paymentMethod: isFreeReward ? "reward" : null,
      paidAt: isFreeReward ? new Date() : null
    });

    // If free reward — mark it redeemed immediately
    if (isFreeReward && reward) {
      reward.isRedeemed = true;
      reward.redeemedAt = new Date();
      reward.redeemedOnBookingId = booking._id;
      await reward.save();

      // Create $0 transaction for record keeping
      await Transaction.create({
        userId: user._id,
        bookingId: booking._id,
        amount: 0,
        type: "payment",
        method: "reward",
        status: "success"
      });
    }

    // Log the booking creation
    await BookingLog.create({
      bookingId: booking._id,
      action: "created",
      performedBy: user._id,
      note: "Booking created — awaiting payment"
    });

    // Notify frontend in real time
    const io = req.app.get("io");
    io.emit("bookingUpdated", {
      bookingId: booking._id,
      status: "pending_payment"
    });

    res.json(booking);

  } catch (err) {
    console.error("Create booking error:", err);
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
GET ALL BOOKINGS
Frontend calls: GET /api/bookings
Returns all bookings sorted by newest first.
Expired pending bookings are cleaned up here too.
========================================
*/
router.get("/", async (req, res) => {
  try {
    // Clean up any expired pending bookings that the worker missed
    await Booking.updateMany(
      {
        status: "pending_payment",
        expiresAt: { $lt: new Date() }
      },
      {
        $set: {
          status: "expired",
          paymentLock: false
        }
      }
    );

    const { showDeleted } = req.query;

    // By default hide soft-deleted bookings
    const query = showDeleted === "true" ? {} : { isDeleted: { $ne: true } };

    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .populate("userId", "name email shortId")
      .populate("deletedBy", "name")
      .populate("cancelledBy", "name");

    res.json(bookings);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
CANCEL BOOKING
Frontend calls: PATCH /api/bookings/:id/cancel

Users can only cancel their own pending_payment bookings.
Confirmed bookings cannot be self-cancelled —
only admins can cancel confirmed bookings.
========================================
*/
router.patch("/:id/cancel", auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Users can only cancel their own bookings
    if (booking.userId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: "You can only cancel your own bookings" });
    }

    // Only pending_payment bookings can be self-cancelled
    if (booking.status !== "pending_payment") {
      return res.status(400).json({
        error: "Only unpaid bookings can be cancelled. Contact admin to cancel a confirmed booking."
      });
    }

    booking.status = "cancelled";
    booking.paymentLock = false;
    await booking.save();

    // Log the cancellation
    await BookingLog.create({
      bookingId: booking._id,
      action: "cancelled",
      performedBy: req.user.id,
      note: "Cancelled by user"
    });

    // Notify frontend in real time
    const io = req.app.get("io");
    io.emit("bookingUpdated", {
      bookingId: booking._id,
      status: "cancelled"
    });

    res.json({ success: true, message: "Booking cancelled successfully" });

  } catch (err) {
    console.error("Cancel booking error:", err);
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
GET BOOKINGS NAME VISIBILITY
Frontend calls: GET /api/bookings/name-visibility
Controls whether user names are shown on the booking grid
========================================
*/
router.get("/name-visibility", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ showName: user?.showName ?? true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
TOGGLE NAME VISIBILITY
Frontend calls: POST /api/bookings/toggle-name-visibility
========================================
*/
router.post("/toggle-name-visibility", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.showName = !user.showName;
    await user.save();

    res.json({ showName: user.showName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;