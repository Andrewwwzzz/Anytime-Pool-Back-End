const Booking = require("../models/Booking");

exports.startBookingExpiryJob = () => {
  setInterval(async () => {
    try {
      const now = new Date();

      await Booking.deleteMany({
        status: "pending_payment",
        expiresAt: { $lt: now }
      });

    } catch (err) {
      console.error(err);
    }
  }, 30000);
};