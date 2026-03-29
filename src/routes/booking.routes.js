const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const Booking = require("../models/Booking");
const Table = require("../models/table");

const auth = require("../middleware/auth");

/*
VALIDATION
*/
async function validateBooking({ userId, tableId, startTime, duration }) {

  const start = new Date(startTime);
  const end = new Date(start.getTime() + duration * 60 * 1000);

  const table = await Table.findOne({ hardware_id: tableId });
  if (!table) throw new Error("Table not found");

  const conflict = await Booking.findOne({
    tableId: table._id,
    status: { $in: ["pending_payment", "confirmed"] },
    startTime: { $lt: end },
    endTime: { $gt: start }
  });

  if (conflict) throw new Error("Time slot already booked");

  const existingPending = await Booking.findOne({
    userId,
    status: "pending_payment"
  });

  if (existingPending) {
    throw new Error("You already have a pending booking");
  }

  return { table, start, end };
}

/*
STRIPE BOOKING
*/
router.post("/create-with-payment", auth, async (req, res) => {
  try {
    const user = req.user;
    const userId = req.userId;

    // 🔴 BLOCK HERE (NOT IN AUTH)
    if (!user.isVerified) {
      return res.status(403).json({
        error: "Account not verified"
      });
    }

    const { tableId, startTime, duration, price } = req.body;

    const { table, start, end } =
      await validateBooking({ userId, tableId, startTime, duration });

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const booking = new Booking({
      userId,
      userName: user.name,
      tableId: table._id,
      startTime: start,
      endTime: end,
      duration,
      price,
      status: "pending_payment",
      paymentStatus: "unpaid",
      paymentLock: true,
      expiresAt
    });

    await booking.save();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["paynow"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "sgd",
            product_data: {
              name: `Pool Booking - ${table.name}`
            },
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

    res.json({
      checkoutUrl: session.url
    });

  } catch (error) {
    console.error("BOOKING ERROR:", error);
    res.status(400).json({ error: error.message });
  }
});

/*
WALLET BOOKING
*/
router.post("/create-with-wallet", auth, async (req, res) => {

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = req.user;
    const userId = req.userId;

    if (!user.isVerified) {
      throw new Error("Account not verified");
    }

    const { tableId, startTime, duration, price } = req.body;

    const { table, start, end } =
      await validateBooking({ userId, tableId, startTime, duration });

    if (user.walletBalance < price) {
      throw new Error("Insufficient wallet balance");
    }

    user.walletBalance -= price;
    await user.save({ session });

    const booking = await Booking.create([{
      userId,
      userName: user.name,
      tableId: table._id,
      startTime: start,
      endTime: end,
      duration,
      price,
      status: "confirmed",
      paymentStatus: "paid"
    }], { session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Booking confirmed"
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("WALLET ERROR:", error);

    res.status(400).json({ error: error.message });
  }
});

module.exports = router;