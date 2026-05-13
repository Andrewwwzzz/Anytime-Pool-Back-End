const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

require("dotenv").config();

const app = express();
const server = http.createServer(app);

/*
========================================
SOCKET.IO
========================================
*/
const io = new Server(server, {
  cors: { origin: "*" }
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

/*
========================================
CORS
========================================
*/
const allowedOrigins = [
  "https://envopoolsg.com",
  "https://www.envopoolsg.com"
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, ESP32)
    if (!origin) return callback(null, true);

    // Allow production domains
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Allow all Lovable preview URLs during development
    if (origin.endsWith(".lovableproject.com") || origin.includes("lovable.dev")) {
      return callback(null, true);
    }

    // Block everything else
    callback(new Error("Not allowed by CORS"));
  },
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  credentials: true
}));

/*
========================================
HEALTH ROUTE
Put this early — before any body parsers
========================================
*/
const healthRoutes = require("./routes/health.routes");
app.use("/health", healthRoutes);
app.use("/api/health", healthRoutes);

/*
========================================
STRIPE WEBHOOK
Must receive RAW body — define BEFORE express.json()
========================================
*/
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

/*
========================================
JSON BODY PARSER
Must come AFTER the webhook raw route
========================================
*/
app.use(express.json());

/*
========================================
ROUTES — existing
========================================
*/
const bookingRoutes      = require("./routes/booking.routes.new");
const paymentRoutes      = require("./routes/payment.routes.new");
const authRoutes         = require("./routes/auth.routes");
const adminRoutes        = require("./routes/admin.routes");
const adminBookingRoutes = require("./routes/admin.booking.routes");
const maintenanceRoutes  = require("./routes/maintenance.routes");
const tableRoutes        = require("./routes/table.routes");
const userRoutes         = require("./routes/user.routes");
const transactionRoutes  = require("./routes/transaction.routes");
const logRoutes          = require("./routes/log.routes");
const deviceRoutes       = require("./routes/device.routes");
const availabilityRoutes = require("./routes/availability.routes");
const setupRoutes        = require("./routes/setup.routes");
const promoRoutes        = require("./routes/promo.routes");
const termsRoutes        = require("./routes/terms.routes");

/*
========================================
EXPIRY JOB
========================================
*/
const { startBookingExpiryJob } = require("./jobs/expireBookings");

/*
========================================
REGISTER ROUTES
========================================
*/
app.use("/api/bookings",       bookingRoutes);
app.use("/api/payments",       paymentRoutes);
app.use("/api/auth",           authRoutes);
app.use("/api/admin/bookings", adminBookingRoutes);  // ✅ more specific — must come FIRST
app.use("/api/admin/maintenance", maintenanceRoutes); // ✅ more specific — must come before /api/admin
app.use("/api/admin",          adminRoutes);
app.use("/api/tables",         tableRoutes);
app.use("/api/users",          userRoutes);
app.use("/api/transactions",   transactionRoutes);
app.use("/api/logs",           logRoutes);
app.use("/api/device",         deviceRoutes);
app.use("/api/device-control", deviceRoutes);
app.use("/api/availability",   availabilityRoutes);
app.use("/api/setup",          setupRoutes);
app.use("/api/promo",          promoRoutes);
app.use("/api/terms",          termsRoutes);

/*
========================================
START EXPIRY WORKER
Marks unpaid bookings as expired every 60s
========================================
*/
startBookingExpiryJob();

/*
========================================
ROOT ROUTE (health check / sanity)
========================================
*/
app.get("/", (req, res) => {
  res.send("Envo Pool API is running ✅");
});

/*
========================================
MONGODB CONNECTION
========================================
*/
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

/*
========================================
START SERVER
========================================
*/
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});