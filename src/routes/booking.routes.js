const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const Booking = require("../models/Booking");
const Table = require("../models/table");
const Transaction = require("../models/Transaction");
const BookingLog = require("../models/BookingLog");

const auth = require("../middleware/auth");

/*
========================================
VALIDATION
========================================
*/
async function validateBooking({ userId, tableId, startTime, duration }) {
  const start = new Date(startTime);
  const end = new Date(start.getTime() + duration * 60000);

  const table = await Table.findOne({ hardware_id: tableId });
  if (!table) throw new Error("Table not found");

  const conflict = await Booking.findOne({
    tableId: table._id,
    status: { $in: ["pending_payment", "confirmed"] },
    startTime: { $lt: end },
    endTime: { $gt: start }
  });

  if (conflict) throw new Error("Time slot already booked");

  return { table, start, end };
}

/*
========================================
STRIPE BOOKING (PENDING)
========================================
*/
router.post("/create-with-payment", auth, async (req, res) => {
  try {
    const io = req.app.get("io");

    const user = req.user;
    const userId = req.userId;

    if (!user.isVerified) {
      return res.status(403).json({ error: "Account not verified" });
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
      expiresAt
    });

    await booking.save();

    // 🔥 LOG
    await BookingLog.create({
      bookingId: booking._id,
      action: "pending_payment",
      performedBy: userId
    });

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

    io.emit("booking_updated");

    res.json({
      checkoutUrl: session.url
    });

  } catch (error) {
    console.error("STRIPE ERROR:", error);
    res.status(400).json({ error: error.message });
  }
});

/*
========================================
WALLET BOOKING (CONFIRMED)
========================================
*/
router.post("/create-with-wallet", auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const io = req.app.get("io");

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

    // deduct wallet
    user.walletBalance -= price;
    await user.save({ session });

    // create booking
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

    // 🔥 TRANSACTION LOG
    await Transaction.create([{
      userId: user._id,
      type: "wallet_deduct",
      amount: -price,
      balanceAfter: user.walletBalance,
      reference: booking[0]._id,
      performedBy: user._id,
      note: "Booking payment via wallet"
    }], { session });

    // 🔥 BOOKING LOG
    await BookingLog.create([{
      bookingId: booking[0]._id,
      action: "confirmed",
      performedBy: userId
    }], { session });

    await session.commitTransaction();
    session.endSession();

    // 🔥 REALTIME
    io.emit("booking_updated");
    io.emit("wallet_updated", { userId });
    io.emit("transaction_updated");

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

/*
========================================
GET BOOKINGS (FOR UI)
========================================
*/
router.get("/", async (req, res) => {
  try {
    const bookings = await Booking.find();

    res.json(bookings);

  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

module.exports = router;