const express = require("express");
const router = express.Router();

const Table = require("../models/table");

/*
GET ALL TABLES
*/
router.get("/", async (req, res) => {
  try {
    const tables = await Table.find();

    res.json(tables);

  } catch (error) {
    console.error("TABLE ERROR:", error);
    res.status(500).json({ error: "Failed to fetch tables" });
  }
});

module.exports = router;