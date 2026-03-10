const cron = require("node-cron")

const Booking = require("../models/Booking")

cron.schedule("* * * * *", async () => {

    try {

        const expired = await Booking.updateMany(
            {
                status: "pending_payment",
                expiresAt: { $lt: new Date() }
            },
            {
                status: "expired"
            }
        )

        if (expired.modifiedCount > 0) {
            console.log("Expired bookings:", expired.modifiedCount)
        }

    } catch (error) {

        console.log(error)

    }

})