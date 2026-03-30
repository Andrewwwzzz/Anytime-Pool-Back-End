const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    tableId: {
      type: String,
      required: true
    },

    startTime: Date,
    endTime: Date,

    amount: {
      type: Number,
      required: true
    },

    status: {
      type: String,
      enum: ["pending_payment", "confirmed"],
      default: "pending_payment"
    },

    paymentMethod: {
      type: String,
      enum: ["wallet", "paynow", null],
      default: null
    },

    paidAt: Date,

    expiresAt: {
      type: Date,
      required: true
    },

    // 🔒 prevent multiple Stripe sessions
    paymentLock: {
      type: Boolean,
      default: false
    },

    // 🔒 idempotency (prevent double webhook)
    paymentProcessed: {
      type: Boolean,
      default: false
    },

    stripeSessionId: String
  },
  { timestamps: true }
);

// 🔒 prevent overlapping bookings
bookingSchema.index(
  { tableId: 1, startTime: 1, endTime: 1 },
  {
    partialFilterExpression: {
      status: { $in: ["pending_payment", "confirmed"] }
    }
  }
);

module.exports = mongoose.model("Booking", bookingSchema);