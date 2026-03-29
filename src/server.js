require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");

const bookingRoutes = require("../routes/booking.routes");
const paymentRoutes = require("../routes/payment.routes");

/* 🔥 DEVICE ROUTES */
const deviceRoutes = require("../routes/device.routes");

/* 🔥 MODELS */
const Booking = require("../models/Booking");
const Table = require("../models/table");

const app = express();

/*
Stripe webhook must receive raw body
*/
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(cors());

/*
Session middleware (kept if you want sessions later)
*/
app.use(
  session({
    secret: process.env.SESSION_SECRET || "default-secret",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
      httpOnly: true
    }
  })
);

/*
Application routes
*/
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);

/*
🔥 DEVICE CONTROL ROUTES
*/
app.use("/api/device-control", deviceRoutes);

/* =====================================================
   🔐 DEVICE CONTROL ENDPOINT (WITH MANUAL OVERRIDE)
===================================================== */
app.get("/api/device/:hardwareId", async (req, res) => {
  try {
    const { hardwareId } = req.params;
    const now = new Date();

    const apiKey = req.headers["x-api-key"];
    if (process.env.DEVICE_API_KEY && apiKey !== process.env.DEVICE_API_KEY) {
      return res.status(401).json({ error: "Unauthorized device" });
    }

    const table = await Table.findOne({ hardware_id: hardwareId });

    if (!table) {
      return res.json({ state: "OFF" });
    }

    if (table.manualOverride === "ON") {
      return res.json({ state: "ON" });
    }

    if (table.manualOverride === "OFF") {
      return res.json({ state: "OFF" });
    }

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

    require("../jobs/expireBookings");

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