const express = require("express");
const router = express.Router();
const Table = require("../models/table");
const Booking = require("../models/Booking");
const MaintenanceWindow = require("../models/MaintenanceWindow");

router.get("/", async (req, res) => {
  try {
    const { startTime, endTime } = req.query;

    if (!startTime || !endTime) {
      return res.status(400).json({
        error: "startTime and endTime are required"
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      return res.status(400).json({
        error: "Invalid time range"
      });
    }

    // Find confirmed bookings that overlap with requested time
    const overlappingBookings = await Booking.find({
      status: { $in: ["confirmed", "pending_payment"] },
      startTime: { $lt: end },
      endTime: { $gt: start }
    }).select("tableId");

    const bookedTableIds = overlappingBookings.map(
      (booking) => booking.tableId?.toString()
    );

    // Find maintenance windows that overlap with requested time
    const overlappingMaintenance = await MaintenanceWindow.find({
      startTime: { $lt: end },
      endTime: { $gt: start }
    }).select("tableId reason");

    const maintenanceTableIds = overlappingMaintenance.map(
      (m) => m.tableId?.toString()
    );

    const tables = await Table.find({ isActive: true });

    const availability = tables.map((table) => {
      const tableIdStr = table._id.toString();
      const isBooked = bookedTableIds.includes(table.hardware_id);
      const maintenanceEntry = overlappingMaintenance.find(
        (m) => m.tableId?.toString() === tableIdStr
      );
      const isUnderMaintenance = !!maintenanceEntry;
      // Also respect the permanent maintenance status flag
      const isPermanentMaintenance = table.status === "maintenance";

      return {
        tableId: table._id,
        tableNumber: table.tableNumber,
        name: table.name,
        basePrice: table.basePrice,
        hardware_id: table.hardware_id,
        available: !isBooked && !isUnderMaintenance && !isPermanentMaintenance,
        maintenanceReason: isUnderMaintenance
          ? (maintenanceEntry.reason || "Maintenance")
          : isPermanentMaintenance ? "Maintenance" : null
      };
    });

    res.json({
      startTime,
      endTime,
      availability
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;