const mongoose = require("mongoose")

const BookingSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },

    tableId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },

    startTime: {
        type: Date,
        required: true
    },

    endTime: {
        type: Date,
        required: true
    },

    status: {
        type: String,
        enum: ["pending_payment", "confirmed", "cancelled", "expired"],
        default: "pending_payment"
    },

    paymentStatus: {
        type: String,
        enum: ["unpaid", "paid"],
        default: "unpaid"
    },

    stripeSessionId: String,

    expiresAt: Date

}, { timestamps: true })

module.exports = mongoose.model("Booking", BookingSchema)