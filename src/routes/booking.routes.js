const express = require("express")
const router = express.Router()

const Booking = require("../models/Booking")
const Table = require("../models/table")

/*
CREATE BOOKING
*/
router.post("/create", async (req, res) => {

  try {

    const { userId, tableId, sessionId } = req.body

    console.log("BOOKING REQUEST:", req.body)

    if (!userId | !tableId | !sessionId) {
      return res.status(400).json({
        error: "Missing required fields"
      })
    }

    const table = await Table.findOne({ hardware_id: tableId })

    if (!table) {
      return res.status(404).json({
        error: "Table not found"
      })
    }

    const existing = await Booking.findOne({
      tableId: table._id,
      sessionId: sessionId,
      status: { $in: ["pending_payment", "confirmed"] }
    })

    if (existing) {
      return res.json({
        message: "Booking already exists",
        bookingId: existing._id
      })
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    const booking = new Booking({
      userId,
      tableId: table._id,
      sessionId,

      status: "pending_payment",
      paymentStatus: "unpaid",
      paymentLock: false,
      expiresAt
    })

    await booking.save()

    console.log("Booking created:", booking._id)

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



/*
GET AVAILABILITY
Returns booking status only
Frontend decides how to render
*/
router.get("/availability", async (req, res) => {

  try {

    const { sessionId } = req.query

    const bookings = await Booking.find({
      sessionId: sessionId
    })

    const result = bookings.map(b => ({
      tableId: b.tableId.toString(),
      status: b.status
    }))

    res.json(result)

  } catch (error) {

    console.log("Availability error:", error)

    res.status(500).json({
      error: "Failed to fetch availability"
    })

  }

})

module.exports = router