require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const cors = require("cors");

const bookingRoutes = require("./routes/booking.routes");
const paymentRoutes = require("./routes/payment.routes");
const jwksRoutes = require("./routes/jwks.routes");
const singpassRoutes = require("./routes/singpass.routes");
const authRoutes = require("./routes/auth.routes");

const app = express();

/* ======================================================
   DEBUG ENV CHECK (Safe – does not expose secrets)
====================================================== */
console.log("ENV CHECK:", {
  MONGODB_URI: !!process.env.MONGODB_URI,
  SESSION_SECRET: !!process.env.SESSION_SECRET,
  STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
});

/* ======================================================
   CORS (REQUIRED FOR FRONTEND CONNECTION)
====================================================== */
app.use(
  cors({
    origin: "https://anytimepoolsg.com",
    credentials: true,
  })
);

/* ======================================================
   Stripe Webhook RAW BODY (MUST BE BEFORE express.json)
====================================================== */
app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" })
);

/* ======================================================
   JSON Parser (AFTER webhook raw)
====================================================== */
app.use(express.json());

/* ======================================================
   Session (MUST BE BEFORE ROUTES)
====================================================== */
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback-secret-dev",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

/* ======================================================
   Health Check
====================================================== */
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

/* ======================================================
   Routes
====================================================== */
app.use("/auth", authRoutes);
app.use("/api/auth/singpass", singpassRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/", jwksRoutes);

/* ======================================================
   MongoDB Connection
====================================================== */
if (!process.env.MONGODB_URI) {
  console.error("❌ MONGODB_URI missing");
} else {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => {
      console.error("❌ MongoDB Connection Error:", err.message);
    });
}

/* ======================================================
   Graceful Error Handling
====================================================== */
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

/* ======================================================
   Start Server
====================================================== */
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});