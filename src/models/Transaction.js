const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },

    amount: {
      type: Number,
      required: true,
    },

    type: {
      type: String,
      enum: ["payment", "refund", "topup"],
      required: true,
    },

    method: {
      type: String,
      // ✅ Added "cash" for timer sessions / walk-in payments
      // cash = collected manually by staff, no wallet deduction
      enum: ["wallet", "paynow", "cash"],
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "success",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);