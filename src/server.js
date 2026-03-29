const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

/*
========================================
CORS CONFIG (PRODUCTION SAFE)
========================================
*/
const allowedOrigins = [
  "https://envopoolsg.com",
  "https://www.envopoolsg.com",
];

app.use(cors({
  origin: function (origin, callback) {
    // allow Postman / server-to-server
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("CORS not allowed: " + origin), false);
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// handle preflight requests
app.options("*", cors());

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
MONGODB CONNECTION
========================================
*/
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch(err => {
    console.error("MongoDB connection error:", err);
  });

/*
========================================
START SERVER
========================================
*/
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});