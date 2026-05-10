const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");

/*
========================================
VALIDATE PROMO CODE
Frontend calls: POST /api/promo/validate
Body: { code, originalPrice, tableId }

Promo codes are currently managed in the frontend (localStorage).
This endpoint validates the code and returns discount info.

When you want to move promo codes to the database in future,
you only need to update this one file.
========================================
*/
router.post("/validate", auth, async (req, res) => {
  try {
    const { code, originalPrice, tableId } = req.body;

    if (!code || !originalPrice) {
      return res.status(400).json({
        valid: false,
        error: "Code and originalPrice are required"
      });
    }

    // For now — promo codes are stored in frontend localStorage
    // This returns a "not found" response so frontend falls back
    // to its own local promo validation
    return res.json({
      valid: false,
      error: "Promo code not found"
    });

    // ─────────────────────────────────────────────────────
    // FUTURE: When you add a PromoCode model to the database,
    // replace the above with something like:
    //
    // const PromoCode = require("../models/PromoCode");
    // const promo = await PromoCode.findOne({
    //   code: code.toUpperCase(),
    //   is_active: true,
    //   $or: [
    //     { expiry_date: null },
    //     { expiry_date: { $gte: new Date() } }
    //   ]
    // });
    //
    // if (!promo) return res.json({ valid: false, error: "Invalid or expired promo code" });
    //
    // if (promo.minimum_spend && originalPrice < promo.minimum_spend) {
    //   return res.json({ valid: false, error: `Minimum spend of $${promo.minimum_spend} required` });
    // }
    //
    // return res.json({ valid: true, promo });
    // ─────────────────────────────────────────────────────

  } catch (err) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

module.exports = router;