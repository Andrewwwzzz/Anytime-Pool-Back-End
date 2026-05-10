const express = require("express");
const router = express.Router();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Booking = require("../models/Booking");
const Table = require("../models/table");

const auth = require("../middleware/auth.middleware");
const {
  confirmBookingPayment,
  payWithWallet
} = require("../services/paymentService");

/*
========================================
HELPER — turn table light ON via device route
Called after every successful payment
========================================
*/
async function triggerLightOn(tableId) {
  try {
    // tableId here is the hardware_id string (e.g. "TABLE_1")
    // Find the table to get its hardware_id if we have a mongo _id
    let hardwareId = tableId;

    const table = await Table.findOne({
      $or: [
        { hardware_id: tableId },
        { _id: tableId }
      ]
    });

    if (table) {
      hardwareId = table.hardware_id;
      // Set manual override to ON so the ESP32 knows to turn on
      table.manualOverride = null; // clear any override — booking check handles it
      await table.save();
    }

    console.log(`💡 Light trigger: table ${hardwareId} should now turn ON via booking check`);

  } catch (err) {
    // Don't crash the payment if light fails — just log it
    console.error("Light trigger error:", err.message);
  }
}

/*
========================================
WALLET PAYMENT
Frontend calls: POST /api/payments/wallet
Body: { bookingId }
========================================
*/
router.post("/wallet", auth, async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: "bookingId is required" });
    }

    const booking = await payWithWallet({ bookingId });

    // ✅ Trigger light ON after successful wallet payment
    await triggerLightOn(booking.tableId);

    // Notify frontend in real time
    const io = req.app.get("io");
    io.emit("bookingUpdated", {
      bookingId: booking._id,
      status: "confirmed"
    });

    res.json({ success: true, booking });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/*
========================================
STRIPE CHECKOUT
Frontend calls: POST /api/payments/checkout
Body: { bookingId }
Creates a Stripe PayNow session and returns the checkout URL
========================================
*/
router.post("/checkout", auth, async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: "bookingId is required" });
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Prevent creating multiple Stripe sessions for the same booking
    if (booking.paymentLock) {
      return res.status(400).json({ error: "Payment already in progress" });
    }

    // Lock the booking so no duplicate Stripe sessions are created
    booking.paymentLock = true;
    await booking.save();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["paynow"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "sgd",
            product_data: { name: "Pool Table Booking - Envo Pool" },
            unit_amount: Math.round(booking.amount * 100) // Stripe uses cents
          },
          quantity: 1
        }
      ],
      metadata: {
        bookingId: booking._id.toString()
      },
      // Stripe session expires when the booking expires
      // Stripe requires expires_at to be at least 30 minutes from now
      expires_at: Math.floor((Date.now() + 31 * 60 * 1000) / 1000),
      success_url: `${process.env.FRONTEND_URL}/payment-verification`,
      cancel_url: `${process.env.FRONTEND_URL}/booking`
    });

    res.json({ checkoutUrl: session.url });

  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
STRIPE WEBHOOK
Stripe calls this automatically after payment is made.
Must receive raw body — handled in server.js before json parser.
========================================
*/
router.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  // Verify the webhook came from Stripe (not a fake request)
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const bookingId = session.metadata.bookingId;

      const booking = await Booking.findById(bookingId);

      // If booking was already processed, ignore this duplicate webhook
      if (booking?.paymentProcessed) {
        return res.json({ received: true });
      }

      // If booking expired or was deleted while waiting for payment → refund
      if (!booking || booking.expiresAt < new Date()) {
        console.log("Booking expired — issuing refund");

        await stripe.refunds.create({
          payment_intent: session.payment_intent
        });

        if (booking) {
          await Booking.deleteOne({ _id: booking._id });
        }

        return res.json({ received: true });
      }

      // Mark as processed to prevent duplicate webhook handling
      booking.paymentProcessed = true;
      booking.stripeSessionId = session.id;
      await booking.save();

      // Confirm the booking and update records
      const confirmedBooking = await confirmBookingPayment({
        bookingId: booking._id,
        paymentMethod: "paynow"
      });

      // ✅ Trigger light ON after successful Stripe payment
      await triggerLightOn(confirmedBooking.tableId);

      // Notify frontend in real time
      const io = req.app.get("io");
      io.emit("bookingUpdated", {
        bookingId: confirmedBooking._id,
        status: "confirmed"
      });
    }

    res.json({ received: true });

  } catch (err) {
    console.error("Webhook processing error:", err);
    res.status(500).send("Webhook processing failed");
  }
});

module.exports = router;