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

/* ======================================================
   DEBUG ENV CHECK (Safe – does not expose secrets)
====================================================== */
console.log("ENV CHECK:", {
  MONGODB_URI: !!process.env.MONGODB_URI,
  SESSION_SECRET: !!process.env.SESSION_SECRET,
  SINGPASS_CLIENT_ID: !!process.env.SINGPASS_CLIENT_ID,
  SINGPASS_REDIRECT_URI: !!process.env.SINGPASS_REDIRECT_URI,
  SIGNING_PRIVATE_KEY: !!process.env.SIGNING_PRIVATE_KEY,
});

/* ======================================================
   JSON Parser
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
      secure: false, // Render uses HTTPS automatically
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
      // DO NOT exit — keep server alive for debugging
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