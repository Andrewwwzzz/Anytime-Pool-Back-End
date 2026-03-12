const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
require("dotenv").config()

const app = express()



/*
Stripe webhook requires RAW body
This MUST come before express.json()
*/
app.use("/api/payments/webhook/stripe", express.raw({ type: "application/json" }))



/*
Normal middleware
*/
app.use(express.json())
app.use(cors())



/*
Import routes
*/
const bookingRoutes = require("./routes/booking.routes")
const paymentRoutes = require("./routes/payment.routes")



/*
Register routes
*/
app.use("/api/bookings", bookingRoutes)
app.use("/api/payments", paymentRoutes)



/*
MongoDB connection
*/
mongoose.connect(process.env.MONGO_URI)

mongoose.connection.on("connected", () => {
  console.log("MongoDB connected")
})

mongoose.connection.on("error", (err) => {
  console.log("MongoDB connection error:", err)
})



/*
Health check endpoint
*/
app.get("/health", (req, res) => {
  res.send("Server running")
})



/*
Start server
*/
const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log("Server running on port", PORT)
})