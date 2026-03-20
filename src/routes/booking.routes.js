const express = require("express");
const router = express.Router();

const Booking = require("../models/Booking");
const Table = require("../models/table");

/*
CREATE BOOKING
*/
router.post("/create", async (req, res) => {
  try {

    const { userId, tableId, startTime, duration } = req.body;

    if (!userId || !tableId || !startTime || !duration) {
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    const table = await Table.findOne({ hardware_id: tableId });

    if (!table) {
      return res.status(404).json({
        error: "Table not found"
      });
    }

    const start = new Date(startTime);
    const end = new Date(start.getTime() + duration * 60 * 1000);

    // 🔥 CHECK OVERLAP
    const conflict = await Booking.findOne({
      tableId: table._id,
      status: { $in: ["pending_payment", "confirmed"] },
      $or: [
        { startTime: { $lt: end, $gte: start } },
        { endTime: { $gt: start, $lte: end } },
        { startTime: { $lte: start }, endTime: { $gte: end } }
      ]
    });

    if (conflict) {
      return res.status(409).json({
        error: "Time slot already booked"
      });
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const booking = new Booking({
      userId,
      tableId: table._id,
      startTime: start,
      endTime: end,
      duration,
      status: "pending_payment",
      paymentStatus: "unpaid",
      paymentLock: false,
      expiresAt
    });

    await booking.save();

    res.json({
      message: "Booking created",
      bookingId: booking._id
    });

  } catch (error) {

    console.error("Booking creation error:", error);

    res.status(500).json({
      error: "Booking creation failed"
    });

  }
});

/*
AVAILABILITY CHECK
*/
router.get("/availability", async (req, res) => {
  try {

    const { startTime, endTime } = req.query;

    if (!startTime || !endTime) {
      return res.status(400).json({
        error: "Missing time range"
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    const bookings = await Booking.find({
      status: { $in: ["pending_payment", "confirmed"] },
      $or: [
        { startTime: { $lt: end, $gte: start } },
        { endTime: { $gt: start, $lte: end } },
        { startTime: { $lte: start }, endTime: { $gte: end } }
      ]
    }).populate("tableId");

    const result = bookings.map(b => ({
      tableId: b.tableId.hardware_id,
      startTime: b.startTime,
      endTime: b.endTime
    }));

    res.json(result);

  } catch (error) {

    console.log("Availability error:", error);

    res.status(500).json({
      error: "Failed to fetch availability"
    });

  }
});

module.exports = router;