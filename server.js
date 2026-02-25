require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");

const bookingRoutes = require("./routes/booking.routes");
const paymentRoutes = require("./routes/payment.routes");
const jwksRoutes = require("./routes/jwks.routes");
const singpassRoutes = require("./routes/singpass.routes");

const app = express();

/* ================================
   Health Check
================================ */
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

app.get("/test-jwks", (req, res) => {
  res.send("JWKS route mounted");
});

/* ================================
   Stripe Webhook (RAW BODY FIRST)
================================ */
app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" })
);

/* ================================
   JSON Parser
================================ */
app.use(express.json());

app.get("/test-singpass", (req, res) => {
  res.send("Singpass route mounted");
});
/* ================================
   Session (For PKCE + Nonce)
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
app.use("/", jwksRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);

/* Singpass */
app.use("/api/auth/singpass", singpassRoutes);

/* ================================
   MongoDB
================================ */
if (!process.env.MONGODB_URI) {
  console.error("❌ MONGODB_URI missing");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Error:", err);
    process.exit(1);
  });

/* ================================
   Start Server
================================ */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});