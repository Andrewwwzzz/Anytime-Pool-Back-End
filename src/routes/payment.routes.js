router.post("/create-checkout", async (req, res) => {

  try {

    const { bookingId, amount } = req.body

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

    )

    if (!booking) {

      return res.status(409).json({
        error: "Booking already processed"
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

    res.json({ url: session.url })

  } catch (err) {

    console.log("Checkout error:", err)

    res.status(500).json({
      error: "Checkout session failed"
    })

  }

})