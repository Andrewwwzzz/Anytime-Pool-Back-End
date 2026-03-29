const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    walletBalance: {
      type: Number,
      default: 0
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);