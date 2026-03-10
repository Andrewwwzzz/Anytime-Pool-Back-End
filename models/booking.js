const mongoose = require("mongoose")

const BookingSchema = new mongoose.Schema({

    userId: mongoose.Schema.Types.ObjectId,
    tableId: mongoose.Schema.Types.ObjectId,

    startTime: Date,
    endTime: Date,

    status: {
        type: String,
        default: "pending_payment"
    },

    paymentStatus: {
        type: String,
        default: "unpaid"
    },

    stripeSessionId: String,
    expiresAt: Date

}, { timestamps: true })

module.exports = mongoose.model("Booking", BookingSchema)