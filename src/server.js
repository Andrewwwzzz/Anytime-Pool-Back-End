require("dotenv").config()

const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")

const app = express()

/*
Stripe webhook MUST receive raw body
*/
app.use("/api/payments/webhook", express.raw({ type: "application/json" }))

/*
Normal JSON parsing
*/
app.use(express.json())

app.use(cors())

/*
Routes
*/
const bookingRoutes = require("./routes/booking.routes")
const paymentRoutes = require("./routes/payment.routes")

app.use("/api/bookings", bookingRoutes)
app.use("/api/payments", paymentRoutes)

/*
Background worker
*/
require("./jobs/expireBookings")

/*
Health check
*/
app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

/*
MongoDB
*/
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
  console.log("MongoDB connected")
})
.catch(err => {
  console.log("MongoDB error:", err)
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Server running on port", PORT)
})