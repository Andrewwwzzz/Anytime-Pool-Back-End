const express = require("express");
const router = express.Router();

const Table = require("../models/table");

/*
MANUAL CONTROL (ADMIN / FRONTEND)
*/
router.post("/control/:hardwareId", async (req, res) => {
  try {
    const { hardwareId } = req.params;
    const { state } = req.body; // "ON" or "OFF"

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

/*
CLEAR MANUAL OVERRIDE (return to automatic mode)
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
      message: `Manual override cleared for ${hardwareId}`
    });

  } catch (error) {
    console.log("Clear override error:", error);
    res.status(500).json({ error: "Failed to clear override" });
  }
});

module.exports = router;