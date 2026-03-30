const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { confirmBookingPayment } = require("../services/paymentService");

const processedEvents = new Set();

exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (processedEvents.has(event.id)) {
    return res.json({ received: true });
  }

  processedEvents.add(event.id);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const bookingId = session.metadata.bookingId;

      await confirmBookingPayment({
        bookingId,
        paymentMethod: "paynow",
      });
    }

    res.json({ received: true });

  } catch (err) {
    console.error(err);
    res.status(500).send("Webhook failed");
  }
};