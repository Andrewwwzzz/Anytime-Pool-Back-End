const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    /* Manual DOB Login */
    dateOfBirth: {
      type: String,
      required: false,
      sparse: true
    },
    age: {
      type: Number,
      required: false
    },

    /* Singpass Login */
    singpassId: {
      type: String,
      unique: true,
      sparse: true
    },

    /* Common */
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);