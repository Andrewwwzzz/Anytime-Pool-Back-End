const mongoose = require("mongoose");

const tableSchema = new mongoose.Schema({
  tableNumber: {
    type: Number,
    required: true
  },

  name: {
    type: String,
    required: true
  },

  basePrice: {
    type: Number,
    required: true
  },

  isActive: {
    type: Boolean,
    default: true
  },

  hardware_id: {
    type: String,
    required: true,
    unique: true
  },

  // 🔥 ADD THIS
  manualOverride: {
    type: String,
    enum: ["ON", "OFF", null],
    default: null
  }

}, { timestamps: true });

module.exports = mongoose.model("Table", tableSchema);