require("dotenv").config()

const express = require("express")
const mongoose = require("mongoose")

const bookingRoutes = require("./routes/booking.routes")
const paymentRoutes = require("./routes/payment.routes")

require("./jobs/expireBookings")

const app = express()

app.use("/webhook/stripe", express.raw({ type: "application/json" }))

app.use(express.json())

mongoose.connect(process.env.MONGO_URI)

mongoose.connection.on("connected", () => {
    console.log("MongoDB connected")
})

mongoose.connection.on("error", (err) => {
    console.log(err)
})

app.use("/api/bookings", bookingRoutes)
app.use("/api/payments", paymentRoutes)

app.get("/", (req, res) => {
    res.send("Anytime Pool API running")
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
    console.log("Server running on port " + PORT)
})