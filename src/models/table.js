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

    hardware_id: {
      type: String
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Table", tableSchema);