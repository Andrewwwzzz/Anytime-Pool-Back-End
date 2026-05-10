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
app.use(cors({
  origin: true,
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"]
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
const tableRoutes        = require("./routes/table.routes");
const userRoutes         = require("./routes/user.routes");
const transactionRoutes  = require("./routes/transaction.routes");
const logRoutes          = require("./routes/log.routes");

/*
========================================
ROUTES — newly mounted (were missing)
========================================
*/
const deviceRoutes       = require("./routes/device.routes");
const adminBookingRoutes = require("./routes/admin.booking.routes");
const availabilityRoutes = require("./routes/availability.routes");
const setupRoutes        = require("./routes/setup.routes");

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
app.use("/api/bookings",          bookingRoutes);
app.use("/api/payments",          paymentRoutes);
app.use("/api/auth",              authRoutes);
app.use("/api/admin",             adminRoutes);
app.use("/api/admin/bookings",    adminBookingRoutes);   // admin booking management
app.use("/api/tables",            tableRoutes);
app.use("/api/users",             userRoutes);
app.use("/api/transactions",      transactionRoutes);
app.use("/api/logs",              logRoutes);
app.use("/api/device",            deviceRoutes);         // ESP32 light control (GET state)
app.use("/api/device-control",    deviceRoutes);         // ESP32 manual ON/OFF (POST control/clear)
app.use("/api/availability",      availabilityRoutes);   // table availability check
app.use("/api/setup",             setupRoutes);          // seed tables (dev/admin use)

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