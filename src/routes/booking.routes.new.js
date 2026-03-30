const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const authMiddleware = require("../middleware/auth.middleware");

/*
CREATE BOOKING (ONLY CREATION HERE)
*/
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { tableId, startTime, endTime, amount } = req.body;

    const booking = await Booking.create({
      userId: req.user.id,
      tableId, // MUST be hardware_id
      startTime,
      endTime,
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