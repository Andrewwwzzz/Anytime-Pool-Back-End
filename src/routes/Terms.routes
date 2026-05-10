const express = require("express");
const router = express.Router();

/*
========================================
GET TERMS AND CONDITIONS
Frontend calls: GET /api/terms

Returns the terms and conditions text.
You can update the content below anytime
without touching any other file.
========================================
*/
router.get("/", (req, res) => {
  res.json({
    title: "Envo Pool — Terms & Conditions",
    lastUpdated: "2025-01-01",
    sections: [
      {
        heading: "1. Booking Policy",
        content: "All bookings must be paid in full at the time of reservation. Bookings are confirmed only upon successful payment. Unpaid bookings expire after 10 minutes and the slot is released."
      },
      {
        heading: "2. Cancellation Policy",
        content: "Cancellations made before the session starts may be eligible for a wallet refund at the admin's discretion. No refunds are given for no-shows or cancellations after the session has started."
      },
      {
        heading: "3. Wallet",
        content: "Wallet top-ups are non-refundable and non-transferable. Wallet balance can only be used for bookings at Envo Pool."
      },
      {
        heading: "4. Conduct",
        content: "Players are expected to behave responsibly and respect the equipment. Any damage to tables or equipment will be charged to the responsible party."
      },
      {
        heading: "5. Liability",
        content: "Envo Pool is not responsible for any personal injury or loss of property on the premises. Play at your own risk."
      },
      {
        heading: "6. Age Requirement",
        content: "Players must be 18 years or older to make a booking. Envo Pool reserves the right to refuse entry."
      },
      {
        heading: "7. Changes",
        content: "Envo Pool reserves the right to update these terms at any time. Continued use of the platform constitutes acceptance of the updated terms."
      }
    ]
  });
});

module.exports = router;