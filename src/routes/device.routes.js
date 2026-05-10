const express = require("express");
const router = express.Router();

const Table = require("../models/table");
const Booking = require("../models/Booking");

/*
========================================
GET DEVICE STATE
The ESP32 calls this every few seconds to know
whether to turn the light ON or OFF.

Frontend also polls this to show light status in admin panel.

Logic order:
1. Manual override ON → always ON
2. Manual override OFF → always OFF
3. Active confirmed booking right now → ON
4. Otherwise → OFF
========================================
*/
router.get("/:hardwareId", async (req, res) => {
  try {
    const { hardwareId } = req.params;
    const now = new Date();

    const table = await Table.findOne({ hardware_id: hardwareId });

    if (!table) {
      return res.json({ state: "OFF" });
    }

    // Manual override takes priority over everything
    if (table.manualOverride === "ON") {
      return res.json({ state: "ON" });
    }
    if (table.manualOverride === "OFF") {
      return res.json({ state: "OFF" });
    }

    // Check if there is a confirmed booking active RIGHT NOW
    // tableId in Booking stores the hardware_id string
    const activeBooking = await Booking.findOne({
      tableId: hardwareId,      // ✅ matches hardware_id stored in booking
      status: "confirmed",      // ✅ only confirmed bookings turn lights on
      startTime: { $lte: now }, // booking has started
      endTime: { $gte: now }    // booking has not ended yet
    });

    if (activeBooking) {
      return res.json({ state: "ON" });
    }

    return res.json({ state: "OFF" });

  } catch (error) {
    console.error("Device state error:", error.message);
    // Default to OFF on any error — safer for an unmanned venue
    res.json({ state: "OFF" });
  }
});

/*
========================================
MANUAL OVERRIDE — SET STATE
Admin calls this to manually force a light ON or OFF.
Frontend calls: POST /api/device-control/control/:hardwareId
Body: { state: "ON" } or { state: "OFF" }
========================================
*/
router.post("/control/:hardwareId", async (req, res) => {
  try {
    const { hardwareId } = req.params;
    const { state } = req.body;

    if (!["ON", "OFF"].includes(state)) {
      return res.status(400).json({ error: "State must be ON or OFF" });
    }

    const table = await Table.findOne({ hardware_id: hardwareId });

    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }

    table.manualOverride = state;
    await table.save();

    res.json({
      message: `Table ${hardwareId} manually set to ${state}`,
      state
    });

  } catch (error) {
    console.error("Manual control error:", error.message);
    res.status(500).json({ error: "Failed to control device" });
  }
});

/*
========================================
CLEAR MANUAL OVERRIDE
Returns light control back to booking schedule.
Frontend calls: POST /api/device-control/clear/:hardwareId
========================================
*/
router.post("/clear/:hardwareId", async (req, res) => {
  try {
    const { hardwareId } = req.params;

    const table = await Table.findOne({ hardware_id: hardwareId });

    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }

    table.manualOverride = null;
    await table.save();

    res.json({
      message: `Manual override cleared for ${hardwareId} — now following booking schedule`
    });

  } catch (error) {
    console.error("Clear override error:", error.message);
    res.status(500).json({ error: "Failed to clear override" });
  }
});

module.exports = router;