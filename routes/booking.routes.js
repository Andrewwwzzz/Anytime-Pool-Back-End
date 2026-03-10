const express = require("express")
const router = express.Router()

const Booking = require("../../models/Booking")

router.post("/create", async (req, res) => {

  try {

    const { userId, tableId, startTime, endTime } = req.body

    if (!userId || !tableId || !startTime || !endTime) {
      return res.status(400).json({
        error: "Missing booking fields"
      })
    }

    const conflict = await Booking.findOne({

      tableId,

      status: { $in: ["pending_payment", "confirmed"] },

      startTime: { $lt: new Date(endTime) },

      endTime: { $gt: new Date(startTime) }

    })

    if (conflict) {
      return res.status(400).json({
        error: "Table already booked"
      })
    }

    const expiry = new Date(Date.now() + 10 * 60 * 1000)

    const booking = await Booking.create({

      userId,
      tableId,
      startTime,
      endTime,
      expiresAt: expiry

    })

    res.json({
      message: "Booking created",
      booking
    })

  } catch (error) {

    console.log(error)

    res.status(500).json({
      error: "Server error"
    })

  }

})

module.exports = router