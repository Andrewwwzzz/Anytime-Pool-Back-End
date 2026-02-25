const express = require("express");
const Stripe = require("stripe");
const router = express.Router();
const Booking = require("../models/booking");

// ===============================
// STRIPE INITIALIZATION
// ===============================
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY missing in .env");
  process.exit(1);
}

if (!process.env.STRIPE_WEBHOOK_SECRET) {
  console.error("❌ STRIPE_WEBHOOK_SECRET missing in .env");
  process.exit(1);
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ===============================
// CREATE CHECKOUT SESSION
// ===============================
router.post("/create/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (booking.status !== "pending") {
      return res.status(400).json({
        error: "Booking is not in pending state"
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "sgd",
            product_data: {
              name: "Pool Table Booking"
            },
            unit_amount: Math.round(booking.totalPrice * 100)
          },
          quantity: 1
        }
      ],
      success_url: process.env.STRIPE_SUCCESS_URL,
      cancel_url: process.env.STRIPE_CANCEL_URL,
      metadata: {
        bookingId: booking._id.toString()
      }
    });

    booking.paymentSessionId = session.id;
    await booking.save();

    console.log("🧾 Stripe session created:", session.id);

    return res.json({
      checkoutUrl: session.url
    });

  } catch (error) {
    console.error("❌ Stripe Create Error:", error);
    return res.status(500).json({
      error: error.message
    });
  }
});

// ===============================
// STRIPE WEBHOOK (IDEMPOTENT)
// ===============================
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {

    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("🔔 Webhook event:", event.type);

    if (event.type === "checkout.session.completed") {

      const session = event.data.object;
      const bookingId = session.metadata?.bookingId;

      if (!bookingId) return res.json({ received: true });

      const booking = await Booking.findById(bookingId);
      if (!booking) return res.json({ received: true });

      if (booking.status === "confirmed") {
        console.log("⚠️ Duplicate webhook ignored.");
        return res.json({ received: true });
      }

      booking.status = "confirmed";
      booking.paymentIntentId = session.payment_intent;
      await booking.save();

      console.log("✅ Booking confirmed:", bookingId);
    }

    res.json({ received: true });
  }
);

// ===============================
// REFUND ENDPOINT (ADMIN USE)
// ===============================
router.post("/refund/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (booking.status !== "confirmed") {
      return res.status(400).json({
        error: "Only confirmed bookings can be refunded"
      });
    }

    if (!booking.paymentIntentId) {
      return res.status(400).json({
        error: "No paymentIntentId found"
      });
    }

    // Prevent double refund
    if (booking.status === "refunded") {
      return res.status(400).json({
        error: "Booking already refunded"
      });
    }
    const refund = await stripe.refunds.create({
      payment_intent: booking.paymentIntentId
    });

    booking.status = "refunded";
    await booking.save();

    console.log("💰 Booking refunded:", bookingId);

    return res.json({
      message: "Refund successful",
      refundId: refund.id
    });

  } catch (error) {
    console.error("❌ Refund error:", error);
    return res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;