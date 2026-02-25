const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const bookingService = require("../services/booking.service");

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { tableId, startTime, endTime } = req.body;

    if (!tableId || !startTime || !endTime) {
      return res.status(400).json({
        error: "Missing fields"
      });
    }

    const booking = await bookingService.createBooking({
      userId: req.user.id,
      tableId,
      startTime,
      endTime
    });

    res.status(201).json({
      message: "Booking created",
      booking
    });

  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
});

module.exports = router;