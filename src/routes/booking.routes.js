const express = require("express")
const router = express.Router()

const Booking = require("../models/Booking")
const Table = require("../models/table")

/*
CREATE BOOKING
Frontend sends:
{
  "userId": "...",
  "tableId": "T2",
  "startTime": "...",
  "endTime": "..."
}
*/

router.post("/create", async (req, res) => {
  try {
    const { userId, tableId, startTime, endTime } = req.body

    if (!userId || !tableId || !startTime || !endTime) {
      return res.status(400).json({
        error: "Missing required fields"
      })
    }

    // Convert hardware_id (T1,T2...) to MongoDB table _id
    const table = await Table.findOne({ hardware_id: tableId })

    if (!table) {
      return res.status(404).json({
        error: "Table not found"
      })
    }

    // Prevent double booking
    const existingBooking = await Booking.findOne({
      tableId: table._id,
      startTime: { $lt: new Date(endTime) },
      endTime: { $gt: new Date(startTime) },
      status: { $in: ["pending", "confirmed"] }
    })

    if (existingBooking) {
      return res.status(409).json({
        error: "Time slot already booked"
      })
    }

    const booking = new Booking({
  userId: userId,
  tableId: table._id,
  startTime: new Date(startTime),
  endTime: new Date(endTime),
  status: "pending_payment",
  paymentStatus: "unpaid"
})

    await booking.save()

    res.json({
      message: "Booking created",
      bookingId: booking._id
    })

  } catch (error) {
    console.error("Booking creation error:", error)

    res.status(500).json({
      error: "Booking creation failed"
    })
  }
})

module.exports = router