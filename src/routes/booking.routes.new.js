const express = require("express");
const router = express.Router();

const Booking = require("../models/Booking");
const User = require("../models/user");

const authMiddleware = require("../middleware/auth.middleware");

/*
🔒 CREATE BOOKING WITH:
- verification check
- table locking
*/
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { tableId, startTime, endTime, amount } = req.body;

    const user = await User.findById(req.user.id);

    // 🔥 BLOCK unverified users
    if (!user.isVerified) {
      return res.status(403).json({
        error: "Account not verified"
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      return res.status(400).json({
        error: "Invalid time range"
      });
    }

    // 🔒 LOCK overlapping bookings
    const conflict = await Booking.findOne({
      tableId,
      status: { $in: ["pending_payment", "confirmed"] },
      startTime: { $lt: end },
      endTime: { $gt: start }
    });

    if (conflict) {
      return res.status(409).json({
        error: "Time slot already booked or reserved"
      });
    }

    const booking = await Booking.create({
      userId: user._id,
      tableId,
      startTime: start,
      endTime: end,
      amount,
      status: "pending_payment",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    res.json(booking);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
GET BOOKINGS
*/
router.get("/", async (req, res) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  res.json(bookings);
});

module.exports = router;