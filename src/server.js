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
MIDDLEWARE
*/
app.use(cors({
  origin: true,
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// 🔥 IMPORTANT for Stripe webhook
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json());

/*
ROUTES (CLEAN ARCHITECTURE)
*/
const bookingRoutes = require("./routes/booking.routes.new");
const paymentRoutes = require("./routes/payment.routes.new");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const tableRoutes = require("./routes/table.routes");
const userRoutes = require("./routes/user.routes");
const transactionRoutes = require("./routes/transaction.routes");
const logRoutes = require("./routes/log.routes");

app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/users", userRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/logs", logRoutes);

/*
MONGO
*/
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

/*
START
*/
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});