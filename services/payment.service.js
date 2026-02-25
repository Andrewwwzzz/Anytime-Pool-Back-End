const axios = require("axios");
const Booking = require("../models/booking");

const createHitpayPayment = async (bookingId) => {
  const booking = await Booking.findById(bookingId).populate("table");

  if (!booking) {
    throw new Error("Booking not found");
  }

  if (booking.status !== "pending") {
    throw new Error("Booking already processed");
  }

  const amount = booking.totalPrice;

  const response = await axios.post(
    "https://api.sandbox.hit-pay.com/v1/payment-requests",
    {
      amount: amount,
      currency: "SGD",
      email: "customer@email.com",
      reference_number: booking._id.toString(),
      redirect_url: `${process.env.FRONTEND_URL}/payment-success`,
      webhook: `${process.env.BACKEND_URL}/api/payments/webhook`,
      metadata: {
        bookingId: booking._id.toString()
      }
    },
    {
      headers: {
        "X-BUSINESS-API-KEY": process.env.HITPAY_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );

  booking.paymentId = response.data.id;
  await booking.save();

  return {
    paymentUrl: response.data.url
  };
};

module.exports = {
  createHitpayPayment
};