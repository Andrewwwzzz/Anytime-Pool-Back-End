const express = require("express");
const router = express.Router();
const Table = require("../models/table");
const Booking = require("../models/booking");

router.get("/", async (req, res) => {
  try {
    const { startTime, endTime } = req.query;

    if (!startTime || !endTime) {
      return res.status(400).json({
        error: "startTime and endTime are required"
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      return res.status(400).json({
        error: "Invalid time range"
      });
    }

    // Find confirmed bookings that overlap with requested time
    const overlappingBookings = await Booking.find({
      status: "confirmed",
      $or: [
        {
          startTime: { $lt: end },
          endTime: { $gt: start }
        }
      ]
    }).select("table");

    const bookedTableIds = overlappingBookings.map(
      booking => booking.table.toString()
    );

    const tables = await Table.find({});

    const availability = tables.map(table => ({
      tableId: table._id,
      tableNumber: table.tableNumber,
      name: table.name,
      basePrice: table.basePrice,
      available: !bookedTableIds.includes(table._id.toString())
    }));

    res.json({
      startTime,
      endTime,
      availability
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;