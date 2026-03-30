const Booking = require("../models/Booking");
const { io } = require("../socket");

exports.startBookingExpiryJob = () => {
  setInterval(async () => {
    const now = new Date();

    const bookings = await Booking.find({
      status: "pending_payment",
      expiresAt: { $lt: now },
    });

    for (const booking of bookings) {
      booking.status = "expired";
      await booking.save();

      io.emit("bookingUpdated", {
        bookingId: booking._id,
        status: "expired",
      });
    }
  }, 30000);
};const Booking = require("../models/Booking");
const { io } = require("../socket");

exports.startBookingExpiryJob = () => {
  setInterval(async () => {
    const now = new Date();

    const bookings = await Booking.find({
      status: "pending_payment",
      expiresAt: { $lt: now },
    });

    for (const booking of bookings) {
      booking.status = "expired";
      await booking.save();

      io.emit("bookingUpdated", {
        bookingId: booking._id,
        status: "expired",
      });
    }
  }, 30000);
};