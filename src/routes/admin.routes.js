const express = require("express");
const router = express.Router();

const authMiddleware = require("../src/middleware/auth.middleware");
const roleMiddleware = require("../src/middleware/role.middleware");

router.get(
  "/dashboard",
  authMiddleware,
  roleMiddleware("admin"),
  (req, res) => {
    res.json({ message: "Admin dashboard access granted" });
  }
);

module.exports = router;