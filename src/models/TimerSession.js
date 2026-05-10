const mongoose = require("mongoose");

const timerSessionSchema = new mongoose.Schema(
  {
    tableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Table",
      required: true
    },

    tableName: {
      type: String,
      required: true
    },

    startedAt: {
      type: Date,
      required: true
    },

    endedAt: {
      type: Date,
      required: true
    },

    durationSeconds: {
      type: Number,
      required: true
    },

    hourlyRate: {
      type: Number,
      required: true
    },

    amountCharged: {
      type: Number,
      required: true
    },

    // Who started the session (admin/staff)
    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    // Optional — link to a customer if known
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    notes: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("TimerSession", timerSessionSchema);