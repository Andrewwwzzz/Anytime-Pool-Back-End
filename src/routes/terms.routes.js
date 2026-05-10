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
    lastUpdated: "2026-05-11",
    sections: [
      {
        heading: "1. Acceptance of Terms",
        content: "By registering for an account or using any services provided by Envo Pool, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our services. These terms apply to all users including walk-in customers, registered members, and tournament participants."
      },
      {
        heading: "2. Account Registration & Verification",
        content: "To make bookings on our platform, you must register for an account and await verification by our staff. Accounts are verified manually and you will be notified once approved. You are responsible for maintaining the confidentiality of your account credentials. Envo Pool reserves the right to suspend or terminate any account that violates these terms or is found to be fraudulent."
      },
      {
        heading: "3. Booking Policy",
        content: "All bookings must be paid in full at the time of reservation. A booking is only confirmed upon successful payment — either via wallet balance or PayNow. Unpaid bookings will automatically expire after 10 minutes and the time slot will be released for other customers. Bookings are non-transferable and can only be used by the registered account holder."
      },
      {
        heading: "4. Payment & Pricing",
        content: "All prices are in Singapore Dollars (SGD) and are inclusive of GST where applicable. Pricing is based on an hourly rate per table as displayed on the booking page. Envo Pool reserves the right to adjust pricing at any time. Promotional pricing and promo codes are subject to their respective terms and cannot be combined unless otherwise stated."
      },
      {
        heading: "5. Wallet",
        content: "Wallet top-ups are processed manually by our staff upon verification of your PayNow transfer. Please use your 6-digit Short ID as the payment reference when making a transfer so we can identify your payment. Wallet balances are non-refundable, non-transferable, and can only be used for bookings at Envo Pool. Envo Pool is not liable for top-up requests made with incorrect references."
      },
      {
        heading: "6. Cancellation & Refund Policy",
        content: "Bookings with pending payment status may be cancelled by the user before the session starts. Confirmed bookings are non-refundable unless cancelled by Envo Pool due to unforeseen circumstances such as equipment failure or venue closure. If a PayNow payment is made for a booking that has already expired, an automatic refund will be initiated within 5 to 10 business days. Refunds, where applicable, will be credited to your Envo Pool wallet."
      },
      {
        heading: "7. Conduct & Behaviour",
        content: "All players are expected to behave in a respectful and responsible manner at all times. The following are strictly prohibited: aggressive or abusive behaviour towards staff or other players, use of alcohol or illegal substances on the premises, deliberate damage to pool tables, cues, or any equipment, smoking within the venue. Envo Pool reserves the right to remove any person from the premises without refund if they are found to be in violation of these conduct rules."
      },
      {
        heading: "8. Equipment & Damages",
        content: "Players are responsible for the proper use of all equipment including pool cues, balls, and tables. Any damage caused by negligence, misuse, or intentional acts will be charged to the responsible party. Damage assessments are at the sole discretion of Envo Pool management. Please report any pre-existing equipment damage to staff before commencing play."
      },
      {
        heading: "9. Tournament Sessions",
        content: "Tournament and walk-in sessions are charged based on actual time used as recorded by our timer system. The rate will be communicated by staff before the session begins. Session invoices are generated automatically upon closing of the table. Tournament fees are payable by cash or as agreed with staff and are non-refundable once the session has commenced."
      },
      {
        heading: "10. Promo Codes & Discounts",
        content: "Promo codes are issued at the discretion of Envo Pool and are subject to individual terms including expiry dates, minimum spend requirements, and usage limits. Promo codes cannot be exchanged for cash and are non-transferable. Envo Pool reserves the right to withdraw or modify any promotional offer at any time without prior notice. Misuse of promo codes may result in account suspension."
      },
      {
        heading: "11. Privacy & Data",
        content: "Envo Pool collects personal information including your name, email address, and payment records for the purpose of providing our services. Your data will not be sold or shared with third parties except as required by law or for payment processing purposes. By registering, you consent to receiving service-related communications from Envo Pool. You may request deletion of your account and personal data by contacting us directly."
      },
      {
        heading: "12. Limitation of Liability",
        content: "Envo Pool shall not be liable for any personal injury, loss, or damage to personal property sustained on the premises. Players participate at their own risk. Envo Pool shall not be liable for any indirect, incidental, or consequential damages arising from the use of our services or the inability to access our platform. Our total liability to any user shall not exceed the amount paid for the relevant booking."
      },
      {
        heading: "13. Intellectual Property",
        content: "All content on the Envo Pool platform including but not limited to the website design, logo, text, and software is the property of Envo Pool and is protected by applicable intellectual property laws. You may not reproduce, distribute, or create derivative works from our content without written permission."
      },
      {
        heading: "14. Governing Law",
        content: "These Terms and Conditions are governed by and construed in accordance with the laws of Singapore. Any disputes arising from the use of Envo Pool services shall be subject to the exclusive jurisdiction of the courts of Singapore."
      },
      {
        heading: "15. Changes to Terms",
        content: "Envo Pool reserves the right to update or modify these Terms and Conditions at any time without prior notice. The latest version will always be available on our platform. Continued use of our services after any changes constitutes your acceptance of the updated terms. We encourage you to review these terms periodically."
      },
      {
        heading: "16. Contact Us",
        content: "If you have any questions about these Terms and Conditions or our services, please contact us through the platform or reach out to our staff directly at the venue."
      }
    ]
  });
});

module.exports = router;