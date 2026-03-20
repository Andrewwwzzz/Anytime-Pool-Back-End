const express = require("express");
const router = express.Router();

const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const Booking = require("../models/Booking");

/*
CREATE STRIPE CHECKOUT
*/
router.post("/create-checkout", async (req, res) => {
  try {
    const { bookingId, amount } = req.body;

    const booking = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
        status: "pending_payment",
        paymentLock: false
      },
      {
        paymentLock: true
      },
      { new: true }
    );

    if (!booking) {
      return res.status(409).json({
        error: "This session has just been reserved by another user."
      });
    }

    if (booking.expiresAt < new Date()) {
      await Booking.updateOne(
        { _id: bookingId },
        { paymentLock: false }
      );

      return res.status(409).json({
        error: "This session has just been reserved by another user."
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["paynow"],
      mode: "payment",

      line_items: [
        {
          price_data: {
            currency: "sgd",
            product_data: {
              name: "Pool Table Reservation"
            },
            unit_amount: amount
          },
          quantity: 1
        }
      ],

      metadata: {
        bookingId: bookingId
      },

      success_url:
        "https://anytimepoolsg.com/payment-verification?session_id={CHECKOUT_SESSION_ID}",

      cancel_url:
        "https://anytimepoolsg.com/booking-cancelled"
    });

    await Booking.updateOne(
      { _id: bookingId },
      { stripeSessionId: session.id }
    );

    res.json({
      url: session.url
    });

  } catch (err) {
    console.log("Stripe checkout error:", err);

    if (req.body.bookingId) {
      await Booking.updateOne(
        { _id: req.body.bookingId },
        { paymentLock: false }
      );
    }

    res.status(500).json({
      error: "Could not create checkout session"
    });
  }
});

/*
VERIFY STRIPE SESSION
*/
router.get("/verify-session", async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({
        error: "Missing session_id"
      });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    const bookingId = session.metadata.bookingId;
    const booking = await Booking.findById(bookingId);

    if (!booking) return res.json({ status: "not_found" });

    if (booking.status === "expired") return res.json({ status: "expired" });

    if (booking.paymentStatus === "paid") return res.json({ status: "confirmed" });

    if (session.payment_status === "paid") {
      if (booking.expiresAt < new Date()) {
        return res.json({ status: "expired" });
      }
      return res.json({ status: "processing" });
    }

    return res.json({ status: booking.status });

  } catch (error) {
    console.log("Verify session error:", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

/*
STRIPE WEBHOOK
*/
router.post("/webhook", async (req, res) => {

  let event;

  try {
    const sig = req.headers["stripe-signature"];

    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

  } catch (err) {
    console.log("Webhook verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {

    if (event.type === "checkout.session.completed") {

      const session = event.data.object;
      const bookingId = session.metadata.bookingId;

      const booking = await Booking.findById(bookingId);

      if (!booking) return res.json({ received: true });

      if (booking.paymentStatus === "paid") {
        return res.json({ received: true });
      }

      if (booking.expiresAt < new Date()) {

        await stripe.refunds.create({
          payment_intent: session.payment_intent
        });

        await Booking.updateOne(
          { _id: bookingId },
          {
            status: "expired",
            paymentLock: false
          }
        );

        return res.json({ received: true });
      }

      // 🔥 SET SESSION TIME HERE
      const now = new Date();

      // Example: 1 hour session
      const durationMs = 60 * 60 * 1000;

      await Booking.updateOne(
        { _id: bookingId },
        {
          status: "confirmed",
          paymentStatus: "paid",
          paymentLock: false,
          startTime: now,
          endTime: new Date(now.getTime() + durationMs)
        }
      );

      console.log("Booking confirmed & session started:", bookingId);
    }

    res.json({ received: true });

  } catch (err) {
    console.log("Webhook processing error:", err);
    res.json({ received: true });
  }
});

module.exports = router;