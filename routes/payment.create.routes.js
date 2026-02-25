const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { createHitpayPayment } = require("../services/payment.service");

router.post("/:bookingId",
  authMiddleware,
  async (req, res) => {
    try {
      const { bookingId } = req.params;

      const result = await createHitpayPayment(bookingId);

      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

module.exports = router;