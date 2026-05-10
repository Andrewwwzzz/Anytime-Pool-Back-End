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

    // ✅ Full status enum — includes all possible states
    status: {
      type: String,
      enum: [
        "pending_payment",  // created, waiting for payment
        "confirmed",        // paid and confirmed
        "cancelled",        // cancelled by user or admin
        "expired",          // payment window passed
        "completed",        // session finished
        "refunded"          // payment refunded
      ],
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

    stripeSessionId: String,

    // Cancellation reason
    cancellationReason: {
      type: String,
      default: null
    },

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    // Promo code tracking
    promoCode: {
      type: String,
      default: null
    },

    promoDiscount: {
      type: Number,
      default: 0
    },

    originalAmount: {
      type: Number,
      default: null
    }
  },
  { timestamps: true }
);

// 🔒 prevent overlapping bookings for active statuses only
bookingSchema.index(
  { tableId: 1, startTime: 1, endTime: 1 },
  {
    partialFilterExpression: {
      status: { $in: ["pending_payment", "confirmed"] }
    }
  }
);

module.exports = mongoose.model("Booking", bookingSchema);