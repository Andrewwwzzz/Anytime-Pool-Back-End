const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const Booking = require("../models/Booking");
const Transaction = require("../models/Transaction");
const BookingLog = require("../models/BookingLog");
const User = require("../models/user");

const auth = require("../middleware/auth");

/*
VALIDATION
*/
async function validateBooking({ tableId, startTime, duration }) {
  const start = new Date(startTime);
  const end = new Date(start.getTime() + duration * 60000);

  const conflict = await Booking.findOne({
    tableId,
    status: { $in: ["pending_payment", "confirmed"] },
    startTime: { $lt: end },
    endTime: { $gt: start }
  });

  if (conflict) throw new Error("Time slot already booked");

  return { start, end };
}

/*
========================================
PAYNOW
========================================
*/
router.post("/create-with-payment", auth, async (req, res) => {
  try {
    const io = req.app.get("io");
    const user = req.user;

    const { tableId, startTime, duration, price } = req.body;

    const { start, end } = await validateBooking({ tableId, startTime, duration });

    const booking = await Booking.create({
      userId: user._id,
      userName: user.name,
      tableId,
      startTime: start,
      endTime: end,
      duration,
      price,
      status: "pending_payment",
      paymentStatus: "unpaid",
      paymentMethod: "paynow"
    });

    await BookingLog.create({
      bookingId: booking._id,
      action: "pending_payment",
      performedBy: user._id
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["paynow"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "sgd",
            product_data: { name: "Pool Booking" },
            unit_amount: Math.round(price * 100)
          },
          quantity: 1
        }
      ],
      metadata: {
        bookingId: booking._id.toString()
      },
      success_url: process.env.STRIPE_SUCCESSFUL_URL,
      cancel_url: process.env.STRIPE_CANCEL_URL
    });

    booking.stripeSessionId = session.id;
    await booking.save();

    io.emit("booking_updated");

    res.json({ checkoutUrl: session.url });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/*
========================================
WALLET
========================================
*/
router.post("/create-with-wallet", auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const io = req.app.get("io");

    const user = await User.findById(req.user._id);

    const { tableId, startTime, duration, price } = req.body;

    const { start, end } = await validateBooking({ tableId, startTime, duration });

    if (user.walletBalance < price) {
      throw new Error("Insufficient balance");
    }

    user.walletBalance -= price;
    user.totalSpent = (user.totalSpent || 0) + price;

    await user.save({ session });

    const booking = await Booking.create([{
      userId: user._id,
      userName: user.name,
      tableId,
      startTime: start,
      endTime: end,
      duration,
      price,
      status: "confirmed",
      paymentStatus: "paid",
      paymentMethod: "wallet"
    }], { session });

    await Transaction.create([{
      userId: user._id,
      type: "wallet_deduct",
      amount: -price,
      balanceAfter: user.walletBalance,
      reference: booking[0]._id
    }], { session });

    await BookingLog.create([{
      bookingId: booking[0]._id,
      action: "confirmed"
    }], { session });

    await session.commitTransaction();

    io.emit("booking_updated");
    io.emit("transaction_updated");
    io.emit("users_updated");

    res.json({ message: "Booking confirmed" });

  } catch (err) {
    await session.abortTransaction();
    res.status(400).json({ error: err.message });
  }
});

/*
GET BOOKINGS
*/
router.get("/", async (req, res) => {
  const bookings = await Booking.find().lean();
  res.json(bookings);
});

module.exports = router;