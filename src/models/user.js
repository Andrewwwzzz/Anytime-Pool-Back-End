const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: String,

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true
    },

    password: {
      type: String,
      required: true
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },

    isVerified: {
      type: Boolean,
      default: false
    },

    walletBalance: {
      type: Number,
      default: 0
    },

    totalSpent: {
      type: Number,
      default: 0
    },

    // ✅ Added: reward points system
    rewardPoints: {
      type: Number,
      default: 0
    },

    // ✅ Added: profile fields the frontend Settings page uses
    phone: {
      type: String,
      default: null
    },

    dateOfBirth: {
      type: String,
      default: null
    },

    // ✅ Added: controls whether user name shows on booking grid
    showName: {
      type: Boolean,
      default: true
    },

    // ✅ Short numeric ID for PayNow reference (e.g. 123456)
    shortId: {
      type: String,
      unique: true,
      sparse: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);