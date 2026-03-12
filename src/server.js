require("dotenv").config()

const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")

const app = express()



/*
IMPORTANT
Stripe webhook must use RAW body
*/
app.use("/api/payments/webhook", express.raw({ type: "application/json" }))


/*
Normal JSON body parser
*/
app.use(express.json())



app.use(cors())



/*
ROUTES
*/
const bookingRoutes = require("./routes/booking.routes")
const paymentRoutes = require("./routes/payment.routes")

app.use("/api/bookings", bookingRoutes)
app.use("/api/payments", paymentRoutes)



/*
BACKGROUND WORKERS
*/
require("./jobs/expireBookings")



/*
HEALTH CHECK
*/
app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})



/*
DATABASE CONNECTION
*/
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected")
  })
  .catch((err) => {
    console.log("MongoDB connection error:", err)
  })



/*
START SERVER
*/
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})