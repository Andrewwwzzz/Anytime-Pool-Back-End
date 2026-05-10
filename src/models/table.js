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

  // isActive controls whether table appears to users
  isActive: {
    type: Boolean,
    default: true
  },

  // status field for maintenance mode
  // frontend checks this field
  status: {
    type: String,
    enum: ["available", "maintenance"],
    default: "available"
  },

  hardware_id: {
    type: String,
    required: true,
    unique: true
  },

  // Manual override for lights — set by admin
  manualOverride: {
    type: String,
    enum: ["ON", "OFF", null],
    default: null
  },

  // Timer fields for walk-in sessions
  timerStartedAt: {
    type: Date,
    default: null
  },

  timerHourlyRate: {
    type: Number,
    default: null
  }

}, { timestamps: true });

module.exports = mongoose.model("Table", tableSchema);