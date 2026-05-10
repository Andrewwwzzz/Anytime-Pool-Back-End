const express = require("express");
const router = express.Router();

const Booking = require("../models/Booking");
const BookingLog = require("../models/BookingLog");
const User = require("../models/user");

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
    const { tableId, startTime, endTime, amount } = req.body;

    // Fetch the full user to check verification status
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: "Account not verified. Please wait for admin approval." });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    if (!tableId || !startTime || !endTime) {
      return res.status(400).json({ error: "tableId, startTime and endTime are required" });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      return res.status(400).json({ error: "End time must be after start time" });
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
      status: "pending_payment",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

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

    const bookings = await Booking.find().sort({ createdAt: -1 });

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