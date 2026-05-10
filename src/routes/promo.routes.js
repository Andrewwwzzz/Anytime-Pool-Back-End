const express = require("express");
const router = express.Router();

const PromoCode = require("../models/PromoCode");
const auth = require("../middleware/auth.middleware");

/*
========================================
VALIDATE PROMO CODE
Frontend calls: POST /api/promo/validate
Body: { code, originalPrice, tableId }
Does NOT increment usage — that happens at booking confirmation
========================================
*/
router.post("/validate", auth, async (req, res) => {
  try {
    const { code, originalPrice, tableId } = req.body;

    if (!code || !originalPrice) {
      return res.status(400).json({ valid: false, error: "Code and originalPrice are required" });
    }

    const promo = await PromoCode.findOne({
      code: code.toUpperCase().trim(),
      is_active: true
    });

    if (!promo) {
      return res.json({ valid: false, error: "Invalid or expired promo code" });
    }

    if (promo.expiry_date && new Date(promo.expiry_date) < new Date()) {
      return res.json({ valid: false, error: "This promo code has expired" });
    }

    if (promo.usage_limit && promo.usage_count >= promo.usage_limit) {
      return res.json({ valid: false, error: "This promo code has reached its usage limit" });
    }

    if (promo.minimum_spend && originalPrice < promo.minimum_spend) {
      return res.json({ valid: false, error: `Minimum spend of $${promo.minimum_spend.toFixed(2)} required` });
    }

    if (promo.applies_to_table_id && promo.applies_to_table_id !== tableId) {
      return res.json({ valid: false, error: "This promo code is not valid for the selected table" });
    }

    return res.json({
      valid: true,
      promo: {
        id: promo._id,
        code: promo.code,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        max_discount_amount: promo.max_discount_amount,
        minimum_spend: promo.minimum_spend,
        applies_to_table_id: promo.applies_to_table_id
      }
    });

  } catch (err) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

/*
========================================
APPLY PROMO CODE (increment usage)
Frontend calls: POST /api/promo/apply
Called after booking is confirmed
Body: { promoId }
========================================
*/
router.post("/apply", auth, async (req, res) => {
  try {
    const { promoId } = req.body;

    const promo = await PromoCode.findByIdAndUpdate(
      promoId,
      { $inc: { usage_count: 1 } },
      { new: true }
    );

    if (!promo) {
      return res.status(404).json({ error: "Promo code not found" });
    }

    res.json({ success: true, usage_count: promo.usage_count });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;