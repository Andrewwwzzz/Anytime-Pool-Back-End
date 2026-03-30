const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

require("dotenv").config();

const app = express();
const server = http.createServer(app);

/*
SOCKET.IO
*/
const io = new Server(server, {
  cors: { origin: "*" }
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
});

/*
CORS
*/
app.use(cors({
  origin: true,
  allowedHeaders: ["Content-Type", "Authorization"]
}));

/*
🔥 HEALTH ROUTE (PUT EARLY — NO BODY PARSER ISSUES)
*/
const healthRoutes = require("./routes/health.routes");
app.use("/health", healthRoutes);
app.use("/api/health", healthRoutes);

/*
🔥 STRIPE WEBHOOK (RAW BODY ONLY FOR THIS ROUTE)
*/
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

/*
JSON PARSER (AFTER webhook)
*/
app.use(express.json());

/*
ROUTES
*/
const bookingRoutes = require("./routes/booking.routes.new");
const paymentRoutes = require("./routes/payment.routes.new");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const tableRoutes = require("./routes/table.routes");
const userRoutes = require("./routes/user.routes");
const transactionRoutes = require("./routes/transaction.routes");
const logRoutes = require("./routes/log.routes");
const { startBookingExpiryJob } = require("./jobs/expireBookings");

app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/users", userRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/logs", logRoutes);
startBookingExpiryJob();

/*
DEBUG ROUTE (VERY IMPORTANT)
*/
app.get("/", (req, res) => {
  res.send("API is running");
});

/*
MONGO
*/
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

/*
START SERVER
*/
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});