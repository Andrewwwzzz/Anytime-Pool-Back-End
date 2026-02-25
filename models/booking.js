const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    table: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Table",
      required: true
    },

    startTime: {
      type: Date,
      required: true
    },

    endTime: {
      type: Date,
      required: true
    },

    totalPrice: {
      type: Number,
      required: true
    },

    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "refunded"],
      default: "pending"
    },

    // Stripe session id (checkout session)
    paymentSessionId: {
      type: String
    },

    // Stripe payment intent id (used for refund)
    paymentIntentId: {
      type: String
    }

  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Booking", bookingSchema);