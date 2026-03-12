router.get("/availability", async (req, res) => {

  try {

    const { sessionId } = req.query

    const bookings = await Booking.find({
      sessionId: sessionId
    }).populate("tableId")

    const result = bookings.map(b => ({
      tableId: b.tableId.hardware_id,
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