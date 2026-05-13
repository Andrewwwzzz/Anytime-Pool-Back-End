const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const requireAdmin = require("../middleware/role.middleware");
const MaintenanceWindow = require("../models/MaintenanceWindow");

/*
========================================
GET all maintenance windows for a table
GET /api/admin/maintenance/:tableId
========================================
*/
router.get("/:tableId", auth, requireAdmin, async (req, res) => {
  try {
    const windows = await MaintenanceWindow.find({
      tableId: req.params.tableId,
      endTime: { $gte: new Date() } // only upcoming/active
    }).sort({ startTime: 1 });

    res.json(windows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
GET all upcoming maintenance windows (all tables)
GET /api/admin/maintenance
========================================
*/
router.get("/", auth, requireAdmin, async (req, res) => {
  try {
    const windows = await MaintenanceWindow.find({
      endTime: { $gte: new Date() }
    })
      .populate("tableId", "name tableNumber")
      .sort({ startTime: 1 });

    res.json(windows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
CREATE a maintenance window
POST /api/admin/maintenance
Body: { tableId, startTime, endTime, reason }
========================================
*/
router.post("/", auth, requireAdmin, async (req, res) => {
  try {
    const { tableId, startTime, endTime, reason } = req.body;

    if (!tableId || !startTime || !endTime) {
      return res.status(400).json({ error: "tableId, startTime and endTime are required" });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      return res.status(400).json({ error: "endTime must be after startTime" });
    }

    const window = await MaintenanceWindow.create({
      tableId,
      startTime: start,
      endTime: end,
      reason: reason || null,
      createdBy: req.user.id
    });

    // Emit socket update so frontend refreshes
    const io = req.app.get("io");
    if (io) io.emit("maintenanceUpdated", { tableId });

    res.json({ message: "Maintenance window created", window });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
DELETE a maintenance window
DELETE /api/admin/maintenance/:id
========================================
*/
router.delete("/:id", auth, requireAdmin, async (req, res) => {
  try {
    const window = await MaintenanceWindow.findByIdAndDelete(req.params.id);
    if (!window) return res.status(404).json({ error: "Maintenance window not found" });

    const io = req.app.get("io");
    if (io) io.emit("maintenanceUpdated", { tableId: window.tableId });

    res.json({ message: "Maintenance window removed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;