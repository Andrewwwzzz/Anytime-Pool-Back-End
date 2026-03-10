const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");

router.patch(
  "/:id/status",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const { status } = req.body;

      if (!["confirmed", "cancelled", "completed"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const booking = await Booking.findById(req.params.id);

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // 🔒 If confirming, enforce final overlap protection
      if (status === "confirmed") {
        const overlapping = await Booking.findOne({
          _id: { $ne: booking._id },
          table: booking.table,
          status: "confirmed",
          startTime: { $lt: booking.endTime },
          endTime: { $gt: booking.startTime }
        });

        if (overlapping) {
          return res.status(409).json({
            error: "Another confirmed booking already exists for this time"
          });
        }
      }

      booking.status = status;
      await booking.save();

      res.json({
        message: "Booking updated",
        booking
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;