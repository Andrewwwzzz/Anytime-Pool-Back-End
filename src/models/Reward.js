const mongoose = require("mongoose");

const rewardSchema = new mongoose.Schema(
  {
    // Unique redemption code — e.g. "RWD-A3F9X2"
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true
    },

    // Locked to a specific user — cannot be used by anyone else
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // Type of reward
    type: {
      type: String,
      enum: ["free_session", "wallet_credit", "free_item", "booking_discount"],
      required: true
    },

    // free_session: hours (e.g. 1)
    // wallet_credit: dollar amount (e.g. 10)
    // booking_discount: % off (e.g. 50)
    // free_item: no value needed
    value: {
      type: Number,
      default: null
    },

    // Human-readable description shown to user
    description: {
      type: String,
      required: true
    },

    // Why it was issued
    reason: {
      type: String,
      enum: ["google_review", "social_follow", "birthday", "referral", "manual", "other"],
      required: true
    },

    // Staff who issued the reward
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // Optional expiry
    expiresAt: {
      type: Date,
      default: null
    },

    // Redemption tracking
    isRedeemed: {
      type: Boolean,
      default: false
    },

    redeemedAt: {
      type: Date,
      default: null
    },

    redeemedOnBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Reward", rewardSchema);