const mongoose = require("mongoose");

const BookingSchema = new mongoose.Schema({

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },

  tableId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Table"
  },

  // 🔥 TIME-BASED SYSTEM
  startTime: {
    type: Date,
    required: true
  },

  endTime: {
    type: Date,
    required: true
  },

  duration: {
    type: Number, // minutes
    required: true
  },

  status: {
    type: String,
    enum: ["pending_payment", "confirmed", "expired", "cancelled"],
    default: "pending_payment"
  },

  paymentStatus: {
    type: String,
    enum: ["unpaid", "paid"],
    default: "unpaid"
  },

  paymentLock: {
    type: Boolean,
    default: false
  },

  stripeSessionId: String,

  expiresAt: Date

}, { timestamps: true });

/*
Prevent overlapping bookings
*/
BookingSchema.index(
  { tableId: 1, startTime: 1, endTime: 1 }
);

module.exports = mongoose.model("Booking", BookingSchema);