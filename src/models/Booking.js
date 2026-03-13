const mongoose = require("mongoose")

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

  sessionId: {
    type: String,
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

}, { timestamps: true })


/*
Only enforce uniqueness for active bookings
Expired bookings will not block the table
*/
BookingSchema.index(
  { tableId: 1, sessionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["pending_payment", "confirmed"] }
    }
  }
)

module.exports = mongoose.model("Booking", BookingSchema)