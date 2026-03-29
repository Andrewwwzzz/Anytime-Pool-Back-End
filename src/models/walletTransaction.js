const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },

  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },

  amount: {
    type: Number,
    required: true
  },

  type: {
    type: String,
    enum: ["debit", "credit"],
    required: true
  },

  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "completed"
  }

}, { timestamps: true });

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);