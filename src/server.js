require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");

const bookingRoutes = require("./routes/booking.routes");
const paymentRoutes = require("./routes/payment.routes");
const authRoutes = require("./routes/auth.routes");
const jwksRoutes = require("./routes/jwks.routes");

/* NEW TEST ROUTE */
const singpassTestRoutes = require("./routes/singpass.test.routes");

/* 🔥 NEW ROUTE */
const deviceRoutes = require("./routes/device.routes");

/* 🔥 MODELS */
const Booking = require("./models/Booking");
const Table = require("./models/table");

const app = express();

/*
Stripe webhook must receive raw body
*/
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(cors());

/*
Session middleware
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
);

/*
JWKS endpoint
*/
app.use("/", jwksRoutes);

/*
Singpass test endpoint
*/
app.use("/api", singpassTestRoutes);

/*
Application routes
*/
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/auth", authRoutes);

/*
🔥 NEW: MANUAL CONTROL ROUTES
*/
app.use("/api/device-control", deviceRoutes);

/* =====================================================
   🔐 DEVICE CONTROL ENDPOINT (WITH MANUAL OVERRIDE)
===================================================== */
app.get("/api/device/:hardwareId", async (req, res) => {
  try {
    const { hardwareId } = req.params;
    const now = new Date();

    // 🔐 Optional: API key check (keep if using security)
    const apiKey = req.headers["x-api-key"];
    if (process.env.DEVICE_API_KEY && apiKey !== process.env.DEVICE_API_KEY) {
      return res.status(401).json({ error: "Unauthorized device" });
    }

    // 🔥 Find table
    const table = await Table.findOne({ hardware_id: hardwareId });

    if (!table) {
      return res.json({ state: "OFF" });
    }

    // 🔥 MANUAL OVERRIDE TAKES PRIORITY
    if (table.manualOverride === "ON") {
      return res.json({ state: "ON" });
    }

    if (table.manualOverride === "OFF") {
      return res.json({ state: "OFF" });
    }

    // 🔥 AUTO MODE (booking-based)
    const booking = await Booking.findOne({
      tableId: table._id,
      status: "confirmed",
      startTime: { $lte: now },
      endTime: { $gte: now }
    });

    if (!booking) {
      return res.json({ state: "OFF" });
    }

    return res.json({ state: "ON" });

  } catch (error) {
    console.log("Device API error:", error);
    res.json({ state: "OFF" });
  }
});

/*
Health check
*/
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/*
Start server ONLY after MongoDB connects
*/
async function startServer() {
  try {

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });

    console.log("MongoDB connected");

    require("./jobs/expireBookings");

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {

    console.error("MongoDB connection failed:", error);
    process.exit(1);

  }
}

startServer();