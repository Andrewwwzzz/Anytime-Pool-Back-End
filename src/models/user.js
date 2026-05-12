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

    // ✅ reward points system
    rewardPoints: {
      type: Number,
      default: 0
    },

    // ✅ profile fields
    phone: {
      type: String,
      default: null
    },

    dateOfBirth: {
      type: String,
      default: null
    },

    // ✅ controls whether user name shows on booking grid
    showName: {
      type: Boolean,
      default: true
    },

    // ✅ Short numeric ID for PayNow reference
    shortId: {
      type: String,
      unique: true,
      sparse: true
    },

    // ✅ Singpass MyInfo KYC verification
    kyc: {
      verified: {
        type: Boolean,
        default: false
      },
      verifiedAt: {
        type: Date,
        default: null
      },
      source: {
        type: String,
        default: null   // "singpass"
      },
      name: {
        type: String,
        default: null
      },
      dob: {
        type: String,
        default: null
      },
      sex: {
        type: String,
        default: null
      },
      nationality: {
        type: String,
        default: null
      },
      email: {
        type: String,
        default: null
      },
      mobile: {
        type: String,
        default: null
      },
      uinfin: {
        type: String,
        default: null   // Masked NRIC e.g. "S****123A"
      },
      address: {
        type: String,
        default: null
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);