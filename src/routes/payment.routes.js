const express = require("express")
const router = express.Router()

const Stripe = require("stripe")
const stripe = Stripe(process.env.STRIPE_SECRET_KEY)

const Booking = require("../models/Booking")



/*
CREATE STRIPE CHECKOUT
Locks payment but does NOT confirm booking
*/
router.post("/create-checkout", async (req, res) => {

  try {

    const { bookingId, amount } = req.body

    const booking = await Booking.findOneAndUpdate(

      {
        _id: bookingId,
        paymentLock: false,
        status: "pending_payment"
      },

      {
        paymentLock: true
      },

      { new: true }

    )

    if (!booking) {
      return res.status(409).json({
        error: "Another user is currently completing payment"
      })
    }

    if (booking.expiresAt < new Date()) {
      return res.status(400).json({
        error: "Booking expired"
      })
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
        "https://anytimepoolsg.com/booking-success?session_id={CHECKOUT_SESSION_ID}",

      cancel_url:
        "https://anytimepoolsg.com/booking-cancelled"

    })

    res.json({
      url: session.url
    })

  } catch (err) {

    console.log("Stripe checkout error:", err)

    res.status(500).json({
      error: "Could not create checkout session"
    })

  }

})



/*
STRIPE WEBHOOK
Only here booking becomes CONFIRMED
*/
router.post("/webhook", async (req, res) => {

  let event

  try {

    const sig = req.headers["stripe-signature"]

    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )

  } catch (err) {

    console.log("Webhook verification failed:", err.message)

    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {

    if (event.type === "checkout.session.completed") {

      const session = event.data.object
      const bookingId = session.metadata.bookingId

      const booking = await Booking.findById(bookingId)

      if (!booking) {
        return res.json({ received: true })
      }

      if (booking.status === "confirmed") {
        return res.json({ received: true })
      }

      if (booking.expiresAt < new Date()) {

        await stripe.refunds.create({
          payment_intent: session.payment_intent
        })

        await Booking.updateOne(
          { _id: bookingId },
          { status: "expired", paymentLock: false }
        )

        return res.json({ received: true })
      }

      await Booking.updateOne(
        { _id: bookingId },
        {
          status: "confirmed",
          paymentStatus: "paid",
          paymentMethod: "stripe",
          paymentLock: false
        }
      )

      console.log("Booking confirmed:", bookingId)

    }

    res.json({ received: true })

  } catch (err) {

    console.log("Webhook processing error:", err)

    res.json({ received: true })

  }

})

module.exports = router