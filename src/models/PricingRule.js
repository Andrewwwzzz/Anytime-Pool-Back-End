const mongoose = require("mongoose");

const pricingRuleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },

    start_time: {
      type: String,  // "HH:MM" format
      required: true
    },

    end_time: {
      type: String,  // "HH:MM" format
      required: true
    },

    hourly_rate: {
      type: Number,
      required: true
    },

    applies_to_weekdays: {
      type: [String],  // ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      default: []
    },

    specific_date: {
      type: String,  // "YYYY-MM-DD" or null
      default: null
    },

    applies_to_table_id: {
      type: String,  // hardware_id or null for all tables
      default: null
    },

    priority: {
      type: Number,
      default: 0
    },

    is_active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PricingRule", pricingRuleSchema);