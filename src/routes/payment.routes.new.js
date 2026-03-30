const express = require("express");
const router = express.Router();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Booking = require("../models/Booking");

const auth = require("../middleware/auth.middleware");
const {
  confirmBookingPayment,
  payWithWallet
} = require("../services/paymentService");

/*
💰 WALLET PAYMENT
*/
router.post("/wallet", auth, async (req, res) => {
  try {
    const { bookingId } = req.body;

    await payWithWallet({ bookingId });

    res.json({ success: true });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/*
💳 STRIPE CHECKOUT
*/
router.post("/checkout", auth, async (req, res) => {
  const { bookingId } = req.body;

  const booking = await Booking.findById(bookingId);

  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  if (booking.paymentLock) {
    return res.status(400).json({
      error: "Payment already in progress"
    });
  }

  booking.paymentLock = true;
  await booking.save();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["paynow"],
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "sgd",
        product_data: { name: "Pool Booking" },
        unit_amount: booking.amount * 100
      },
      quantity: 1
    }],
    metadata: {
      bookingId: booking._id.toString()
    },
    expires_at: Math.floor(new Date(booking.expiresAt).getTime() / 1000),
    success_url: `${process.env.FRONTEND_URL}/payment-success`,
    cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`
  });

  res.json({ checkoutUrl: session.url });
});

/*
🔥 STRIPE WEBHOOK
*/
router.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(err.message);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const booking = await Booking.findById(
        session.metadata.bookingId
      );

      // prevent duplicate processing
      if (booking?.paymentProcessed) {
        return res.json({ received: true });
      }

      // expired or deleted → refund
      if (!booking || booking.expiresAt < new Date()) {
        await stripe.refunds.create({
          payment_intent: session.payment_intent
        });

        if (booking) {
          await Booking.deleteOne({ _id: booking._id });
        }

        return res.json({ received: true });
      }

      booking.paymentProcessed = true;
      booking.stripeSessionId = session.id;
      await booking.save();

      await confirmBookingPayment({
        bookingId: booking._id,
        paymentMethod: "paynow"
      });
    }

    res.json({ received: true });

  } catch (err) {
    res.status(500).send("Webhook error");
  }
});

module.exports = router;