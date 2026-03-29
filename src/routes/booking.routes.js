const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const Booking = require("../models/Booking");
const Table = require("../models/table");
const User = require("../models/user");
const WalletTransaction = require("../models/walletTransaction");

/*
COMMON BOOKING VALIDATION
*/
async function validateBooking({ tableId, startTime, duration }) {

  const start = new Date(startTime);
  if (isNaN(start.getTime())) {
    throw new Error("Invalid time format");
  }

  const end = new Date(start.getTime() + duration * 60 * 1000);

  const table = await Table.findOne({ hardware_id: tableId });
  if (!table) throw new Error("Table not found");

  const conflict = await Booking.findOne({
    tableId: table._id,
    status: { $in: ["pending_payment", "confirmed"] },
    $or: [
      { startTime: { $lt: end, $gte: start } },
      { endTime: { $gt: start, $lte: end } },
      { startTime: { $lte: start }, endTime: { $gte: end } }
    ]
  });

  if (conflict) throw new Error("Time slot already booked");

  const totalPrice = table.basePrice * (duration / 60);

  return { table, start, end, totalPrice };
}

/*
🔥 WALLET FLOW (TRANSACTION SAFE)
*/
router.post("/create-with-wallet", async (req, res) => {

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, tableId, startTime, duration } = req.body;

    const { table, start, end, totalPrice } =
      await validateBooking({ tableId, startTime, duration });

    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    if (user.walletBalance < totalPrice) {
      throw new Error("Insufficient wallet balance");
    }

    /*
    🔒 DEDUCT BALANCE
    */
    user.walletBalance -= totalPrice;
    await user.save({ session });

    /*
    🔒 CREATE BOOKING
    */
    const booking = await Booking.create([{
      userId,
      tableId: table._id,
      startTime: start,
      endTime: end,
      duration,
      status: "confirmed",
      paymentStatus: "paid",
      paymentLock: false
    }], { session });

    /*
    🧾 CREATE LEDGER RECORD
    */
    await WalletTransaction.create([{
      userId,
      bookingId: booking[0]._id,
      amount: totalPrice,
      type: "debit",
      status: "completed"
    }], { session });

    /*
    ✅ COMMIT EVERYTHING
    */
    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Booking confirmed via wallet",
      bookingId: booking[0]._id
    });

  } catch (error) {

    await session.abortTransaction();
    session.endSession();

    res.status(400).json({
      error: error.message
    });
  }
});

/*
STRIPE FLOW (UNCHANGED SAFE)
*/
router.post("/create-with-payment", async (req, res) => {
  try {
    const { userId, tableId, startTime, duration } = req.body;

    const { table, start, end, totalPrice } =
      await validateBooking({ tableId, startTime, duration });

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const booking = new Booking({
      userId,
      tableId: table._id,
      startTime: start,
      endTime: end,
      duration,
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
            unit_amount: Math.round(totalPrice * 100)
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
      checkoutUrl: session.url,
      bookingId: booking._id
    });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;