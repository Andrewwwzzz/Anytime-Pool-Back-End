const express = require("express");
const router = express.Router();

const Table = require("../models/table");
const Booking = require("../models/Booking");

router.post("/control/:hardwareId", async (req, res) => {
  try {
    const { hardwareId } = req.params;
    const { state } = req.body;

    if (!["ON", "OFF"].includes(state)) {
      return res.status(400).json({ error: "Invalid state" });
    }

    const table = await Table.findOne({ hardware_id: hardwareId });

    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }

    table.manualOverride = state;
    await table.save();

    res.json({
      message: `Table ${hardwareId} manually set to ${state}`
    });

  } catch (error) {
    console.log("Manual control error:", error);
    res.status(500).json({ error: "Failed to control device" });
  }
});

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
      message: `Manual override cleared for ${hardwareId}`
    });

  } catch (error) {
    console.log("Clear override error:", error);
    res.status(500).json({ error: "Failed to clear override" });
  }
});

router.get("/:hardwareId", async (req, res) => {
  try {
    const { hardwareId } = req.params;

    const now = new Date(); // SG time (via TZ)

    const table = await Table.findOne({ hardware_id: hardwareId });

    if (!table) {
      return res.json({ state: "OFF" });
    }

    // Manual override
    if (table.manualOverride === "ON") return res.json({ state: "ON" });
    if (table.manualOverride === "OFF") return res.json({ state: "OFF" });

    // Booking check
    const booking = await Booking.findOne({
      tableId: table._id,
      status: "confirmed",
      paymentStatus: "paid"
    }).sort({ createdAt: -1 });

    if (!booking) return res.json({ state: "OFF" });

    if (now >= booking.startTime && now <= booking.endTime) {
      return res.json({ state: "ON" });
    }

    return res.json({ state: "OFF" });

  } catch (error) {
    console.log("Device API error:", error);
    res.json({ state: "OFF" });
  }
});

module.exports = router;