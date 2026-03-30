const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    tableId: {
      type: String, // hardware_id (NOT Mongo _id)
      required: true,
    },

    startTime: {
      type: Date,
      required: true,
    },

    endTime: {
      type: Date,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending_payment", "confirmed", "expired"],
      default: "pending_payment",
    },

    paymentMethod: {
      type: String,
      enum: ["wallet", "paynow", null],
      default: null,
    },

    paidAt: {
      type: Date,
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);