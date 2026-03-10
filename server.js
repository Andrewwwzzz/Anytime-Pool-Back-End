require("dotenv").config()

const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")

const bookingRoutes = require("./routes/booking.routes")
const paymentRoutes = require("./routes/payment.routes")

require("./jobs/expireBookings")

const app = express()

app.use(cors())

// Stripe webhook MUST use raw body
app.post(
  "/api/payments/webhook/stripe",
  express.raw({ type: "application/json" }),
  paymentRoutes.stripeWebhook
)

// Normal JSON middleware
app.use(express.json())

mongoose.connect(process.env.MONGO_URI)

mongoose.connection.on("connected", () => {
  console.log("MongoDB connected")
})

mongoose.connection.on("error", (err) => {
  console.log(err)
})

app.use("/api/bookings", bookingRoutes)
app.use("/api/payments", paymentRoutes.router)

app.get("/", (req, res) => {
  res.send("Anytime Pool API running")
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Server running on port " + PORT)
})