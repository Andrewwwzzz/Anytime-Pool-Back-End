const express = require("express");
const router = express.Router();

const User = require("../models/user");
const Transaction = require("../models/Transaction");
const AdminLog = require("../models/AdminLog");

const auth = require("../middleware/auth");

/*
ADMIN CHECK
*/
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

/*
GET USERS
*/
router.get("/", auth, requireAdmin, async (req, res) => {
  const users = await User.find().select("-password");
  res.json(users);
});

/*
DELETE USER
*/
router.delete("/:id", auth, requireAdmin, async (req, res) => {
  const io = req.app.get("io");

  await User.findByIdAndDelete(req.params.id);

  await AdminLog.create({
    adminId: req.userId,
    action: "delete_user",
    targetUserId: req.params.id
  });

  io.emit("users_updated");

  res.json({ message: "User deleted" });
});

/*
UPDATE WALLET
*/
router.patch("/:id/wallet", auth, requireAdmin, async (req, res) => {
  const io = req.app.get("io");

  const { amount } = req.body;

  const user = await User.findById(req.params.id);

  user.walletBalance += amount;
  await user.save();

  await Transaction.create({
    userId: user._id,
    type: "admin_adjustment",
    amount,
    balanceAfter: user.walletBalance,
    performedBy: req.userId,
    note: "Admin wallet update"
  });

  await AdminLog.create({
    adminId: req.userId,
    action: "update_wallet",
    targetUserId: user._id,
    details: { amount }
  });

  // 🔥 REALTIME EVENTS
  io.emit("users_updated");
  io.emit("wallet_updated", { userId: user._id });
  io.emit("transaction_updated");

  res.json({
    walletBalance: user.walletBalance
  });
});

module.exports = router;