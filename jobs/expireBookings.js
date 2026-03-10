const cron = require("node-cron")

const Booking = require("../../models/Booking")

cron.schedule("* * * * *", async () => {

  try {

    const result = await Booking.updateMany(

      {
        status: "pending_payment",
        expiresAt: { $lt: new Date() }
      },

      {
        status: "expired"
      }

    )

    if (result.modifiedCount > 0) {

      console.log("Expired bookings:", result.modifiedCount)

    }

  } catch (error) {

    console.log("Expire booking error:", error)

  }

})