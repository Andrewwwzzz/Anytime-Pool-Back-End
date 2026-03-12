const express = require("express")
const router = express.Router()

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

const Booking = require("../models/Booking")



/*
CREATE STRIPE PAYNOW CHECKOUT
*/

router.post("/create-checkout", async (req, res) => {

  try {

    const { bookingId, amount } = req.body

    const booking = await Booking.findById(bookingId)

    if (!booking) {
      return res.status(404).json({
        error: "Booking not found"
      })
    }

    if (booking.paymentStatus === "paid") {
      return res.status(400).json({
        error: "Booking already paid"
      })
    }

    if (booking.status !== "pending_payment") {
      return res.status(400).json({
        error: "Booking no longer valid"
      })
    }


    const session = await stripe.checkout.sessions.create({

      mode: "payment",

      payment_method_types: ["paynow"],

      line_items: [
        {
          price_data: {
            currency: "sgd",
            product_data: {
              name: "Pool Table Booking"
            },
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }
      ],

      success_url:
        "https://anytimepoolsg.com/booking-success?session_id={CHECKOUT_SESSION_ID}",

      cancel_url:
        "https://anytimepoolsg.com/booking-cancelled",

      metadata: {
        bookingId: booking._id.toString()
      },

      // expire stripe checkout after 4m50s
      expires_at: Math.floor(Date.now() / 1000) + 290

    })

    res.json({
      url: session.url
    })

  } catch (error) {

    console.log("Stripe checkout error:", error)

    res.status(500).json({
      error: "Could not create checkout session"
    })

  }

})



/*
STRIPE WEBHOOK
Handles PayNow payment confirmation
*/

router.post("/webhook/stripe", async (req, res) => {

  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

  const sig = req.headers["stripe-signature"]

  let event

  try {

    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )

  } catch (err) {

    console.log("Webhook signature verification failed")

    return res.status(400).send(`Webhook Error: ${err.message}`)

  }


  try {

    if (event.type === "checkout.session.completed") {

      const session = event.data.object
      const bookingId = session.metadata.bookingId

      const booking = await Booking.findById(bookingId)

      if (!booking) return res.json({ received: true })


      // prevent duplicate webhook execution
      if (booking.paymentStatus === "paid") {

        console.log("Webhook already processed")

        return res.json({ received: true })

      }


      // prevent confirming expired bookings
      if (booking.status !== "pending_payment") {

        console.log("Late payment received for expired booking")

        return res.json({ received: true })

      }


      booking.status = "confirmed"
      booking.paymentStatus = "paid"
      booking.stripeSessionId = session.id

      await booking.save()

      console.log("Booking confirmed:", booking._id)

    }

    res.json({ received: true })

  } catch (error) {

    console.log("Webhook processing error:", error)

    res.status(500).send("Webhook processing error")

  }

})



module.exports = router