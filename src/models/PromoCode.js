const mongoose = require("mongoose");

const promoCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },

    discount_type: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true
    },

    discount_value: {
      type: Number,
      required: true
    },

    minimum_spend: {
      type: Number,
      default: null
    },

    max_discount_amount: {
      type: Number,
      default: null
    },

    usage_limit: {
      type: Number,
      default: null
    },

    per_user_limit: {
      type: Number,
      default: null
    },

    applies_to_table_id: {
      type: String,
      default: null
    },

    expiry_date: {
      type: Date,
      default: null
    },

    is_active: {
      type: Boolean,
      default: true
    },

    // Track how many times this code has been used
    usage_count: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PromoCode", promoCodeSchema);