require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");

const bookingRoutes = require("./routes/booking.routes");
const paymentRoutes = require("./routes/payment.routes");
const jwksRoutes = require("./routes/jwks.routes");
const singpassRoutes = require("./routes/singpass.routes");
const authRoutes = require("./routes/auth.routes");

const app = express();

/* ================================
   JSON Parser
================================ */
app.use(express.json());

/* ================================
   Session (MUST BE BEFORE ROUTES)
================================ */
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

/* ================================
   Routes
================================ */
app.use("/auth", authRoutes);   // ← NOW session works
app.use("/", jwksRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/auth/singpass", singpassRoutes);

/* ================================
   Health Check
================================ */
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});