const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

/*
========================================
🔥 SIMPLE + SAFE CORS (FIXED)
========================================
*/
app.use(cors({
  origin: true, // allow all dynamic origins
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

/*
🔥 CRITICAL: HANDLE PREFLIGHT BEFORE ROUTES
*/
app.options("*", (req, res) => {
  res.sendStatus(200);
});

/*
========================================
MIDDLEWARE
========================================
*/
app.use(express.json());

/*
========================================
ROUTES
========================================
*/
const bookingRoutes = require("./routes/booking.routes");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");

app.use("/api/bookings", bookingRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

/*
========================================
HEALTH CHECK
========================================
*/
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/*
========================================
MONGODB
========================================
*/
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err));

/*
========================================
START SERVER
========================================
*/
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});