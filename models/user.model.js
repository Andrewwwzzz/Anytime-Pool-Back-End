// models/user.model.js

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  singpassId: {
    type: String,
    required: true,
    unique: true,
  },
  name: String,
  lastLogin: Date,
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);