const mongoose = require("mongoose");

const tableSchema = new mongoose.Schema(
  {
    tableNumber: {
      type: Number,
      required: true,
      unique: true
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
    hardwareId: {
      type: String // For future light/lock API mapping
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Table", tableSchema);