require("dotenv").config()

const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const session = require("express-session")

const bookingRoutes = require("./routes/booking.routes")
const paymentRoutes = require("./routes/payment.routes")
const authRoutes = require("./routes/auth.routes")
const jwksRoutes = require("./routes/jwks.routes")

const app = express()

/*
Stripe webhook must receive raw body
*/
app.use("/api/payments/webhook", express.raw({ type: "application/json" }))

app.use(express.json())
app.use(cors())

/*
Session middleware (REQUIRED for Singpass)
*/
app.use(
  session({
    secret: process.env.SESSION_SECRET || "singpass-secret",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
      httpOnly: true
    }
  })
)

/*
JWKS endpoint
*/
app.use("/", jwksRoutes)

/*
Routes
*/
app.use("/api/bookings", bookingRoutes)
app.use("/api/payments", paymentRoutes)
app.use("/api/auth", authRoutes)

/*
Health check
*/
app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

/*
Start server ONLY after MongoDB connects
*/
async function startServer() {
  try {

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    })

    console.log("MongoDB connected")

    require("./jobs/expireBookings")

    const PORT = process.env.PORT || 3000

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })

  } catch (error) {

    console.error("MongoDB connection failed:", error)
    process.exit(1)

  }
}

startServer()