const express = require("express");
const router = express.Router();

const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const Booking = require("../models/Booking");

/*
CREATE CHECKOUT
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
      { paymentLock: true },
      { new: true }
    );

    if (!booking) {
      return res.status(409).json({
        error: "Booking locked or invalid"
      });
    }

    if (booking.expiresAt < new Date()) {
      await Booking.updateOne({ _id: bookingId }, { paymentLock: false });

      return res.status(409).json({
        error: "Booking expired"
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["paynow"],
      mode: "payment",

      line_items: [
        {
          price_data: {
            currency: "sgd",
            product_data: { name: "Pool Table Booking" },
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

    res.json({ url: session.url });

  } catch (err) {
    console.log(err);

    if (req.body.bookingId) {
      await Booking.updateOne(
        { _id: req.body.bookingId },
        { paymentLock: false }
      );
    }

    res.status(500).json({ error: "Checkout failed" });
  }
});

/*
WEBHOOK
*/
router.post("/webhook", async (req, res) => {

  try {
    const event = req.body;

    if (event.type === "checkout.session.completed") {

      const session = event.data.object;
      const bookingId = session.metadata.bookingId;

      const booking = await Booking.findById(bookingId);

      if (!booking) return res.json({ received: true });

      if (booking.paymentStatus === "paid") {
        return res.json({ received: true });
      }

      if (booking.expiresAt < new Date()) {

        await Booking.updateOne(
          { _id: bookingId },
          { status: "expired", paymentLock: false }
        );

        return res.json({ received: true });
      }

      // 🔥 ONLY CONFIRM (NO TIME OVERRIDE)
      await Booking.updateOne(
        { _id: bookingId },
        {
          status: "confirmed",
          paymentStatus: "paid",
          paymentLock: false
        }
      );

      console.log("Booking confirmed:", bookingId);
    }

    res.json({ received: true });

  } catch (err) {
    console.log(err);
    res.json({ received: true });
  }
});

module.exports = router;