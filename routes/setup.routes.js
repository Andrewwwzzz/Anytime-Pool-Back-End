const express = require("express");
const router = express.Router();
const Table = require("../models/table");

// Seed tables route
router.post("/seed-tables", async (req, res) => {
  try {
    // Remove existing tables
    await Table.deleteMany({});

    const tables = [];

    for (let i = 1; i <= 10; i++) {
      tables.push({
        tableNumber: i,
        name: `Table ${i}`,   // ✅ FIXED
        basePrice: 12,
        isActive: true
      });
    }

    await Table.insertMany(tables);

    return res.status(200).json({
      message: "Tables seeded successfully",
      count: tables.length
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;