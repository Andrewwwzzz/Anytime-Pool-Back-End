const express = require("express")
const Stripe = require("stripe")

const router = express.Router()

const Booking = require("../models/Booking")

const stripe = Stripe(process.env.STRIPE_SECRET_KEY)

router.post("/create-checkout", async (req, res) => {

  try {

    const { bookingId, amount } = req.body

    const booking = await Booking.findById(bookingId)

    if (!booking) {
      return res.status(404).json({
        error: "Booking not found"
      })
    }

    const session = await stripe.checkout.sessions.create({

      payment_method_types: ["paynow", "card"],

      line_items: [
        {
          price_data: {
            currency: "sgd",
            product_data: {
              name: "Pool Table Booking"
            },
            unit_amount: amount
          },
          quantity: 1
        }
      ],

      mode: "payment",

      success_url:
        "https://anytimepoolsg.com/booking-success?session_id={CHECKOUT_SESSION_ID}",

      cancel_url:
        "https://anytimepoolsg.com/payment-cancel",

      metadata: {
        bookingId: booking._id.toString()
      }

    })

    booking.stripeSessionId = session.id

    await booking.save()

    res.json({
      url: session.url
    })

  } catch (error) {

    console.log(error)

    res.status(500).json({
      error: "Stripe error"
    })

  }

})

exports.stripeWebhook = async (req, res) => {

  const sig = req.headers["stripe-signature"]

  let event

  try {

    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )

  } catch (err) {

    console.log("Webhook verification failed:", err.message)

    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  if (event.type === "checkout.session.completed") {

    const session = event.data.object

    const bookingId = session.metadata.bookingId

    try {

      const booking = await Booking.findById(bookingId)

      if (!booking) {
        return res.json({ received: true })
      }

      if (booking.paymentStatus === "paid") {
        return res.json({ received: true })
      }

      booking.status = "confirmed"
      booking.paymentStatus = "paid"
      booking.stripeSessionId = session.id

      await booking.save()

      console.log("Booking confirmed:", bookingId)

    } catch (error) {

      console.log(error)

    }

  }

  res.json({ received: true })
}

exports.router = router