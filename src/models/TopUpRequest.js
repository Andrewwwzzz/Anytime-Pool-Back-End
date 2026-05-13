const mongoose = require("mongoose");

const topUpRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    amount: {
      type: Number,
      required: true
    },

    // Payment method chosen by user
    method: {
      type: String,
      enum: ["paynow", "cash"],
      default: "paynow"
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },

    // Admin who approved/rejected
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    reviewedAt: {
      type: Date,
      default: null
    },

    // Reason if rejected
    rejectionReason: {
      type: String,
      default: null
    },

    // Notes from admin
    adminNotes: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("TopUpRequest", topUpRequestSchema);