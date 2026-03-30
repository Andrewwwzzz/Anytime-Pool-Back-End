const express = require("express");
const router = express.Router();

const Booking = require("../models/Booking");
const User = require("../models/user");

const auth = require("../middleware/auth.middleware");

/*
CREATE BOOKING
*/
router.post("/", auth, async (req, res) => {
  try {
    const { tableId, startTime, endTime, amount } = req.body;

    const user = await User.findById(req.user.id);

    if (!user.isVerified) {
      return res.status(403).json({ error: "Account not verified" });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    // 🔒 prevent overlap
    const conflict = await Booking.findOne({
      tableId,
      status: { $in: ["pending_payment", "confirmed"] },
      startTime: { $lt: end },
      endTime: { $gt: start }
    });

    if (conflict) {
      return res.status(409).json({ error: "Slot already booked" });
    }

    const booking = await Booking.create({
      userId: user._id,
      tableId,
      startTime: start,
      endTime: end,
      amount,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    res.json(booking);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
GET BOOKINGS + AUTO CLEAN
*/
router.get("/", async (req, res) => {
  await Booking.deleteMany({
    status: "pending_payment",
    expiresAt: { $lt: new Date() }
  });

  const bookings = await Booking.find().sort({ createdAt: -1 });

  res.json(bookings);
});

module.exports = router;