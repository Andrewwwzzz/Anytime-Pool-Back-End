const express = require("express");
const router = express.Router();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Booking = require("../models/Booking");

const authMiddleware = require("../middleware/auth.middleware");
const {
  confirmBookingPayment,
  payWithWallet
} = require("../services/paymentService");

/*
💳 WALLET PAYMENT
*/
router.post("/wallet", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.body;

    await payWithWallet({ bookingId });

    res.json({ success: true });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/*
💳 CREATE STRIPE SESSION (PAYNOW)
*/
router.post("/checkout", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["paynow"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "sgd",
            product_data: { name: "Pool Booking" },
            unit_amount: booking.amount * 100,
          },
          quantity: 1,
        },
      ],
      metadata: {
        bookingId: booking._id.toString(),
      },
      success_url: `${process.env.FRONTEND_URL}/payment-success`,
      cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`,
    });

    res.json({ checkoutUrl: session.url });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
🔥 STRIPE WEBHOOK (ONLY SOURCE OF TRUTH)
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
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      await confirmBookingPayment({
        bookingId: session.metadata.bookingId,
        paymentMethod: "paynow",
      });
    }

    res.json({ received: true });

  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("Webhook failed");
  }
});

module.exports = router;