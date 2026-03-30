const express = require("express");
const router = express.Router();

const User = require("../models/user");
const Transaction = require("../models/Transaction");
const AdminLog = require("../models/AdminLog");

const auth = require("../middleware/auth.middleware");

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
    adminId: req.user.id,
    action: "delete_user",
    targetUserId: req.params.id
  });

  io.emit("users_updated");

  res.json({ message: "User deleted" });
});

/*
🔥 UPDATE WALLET + POINTS (NEW FLEXIBLE SYSTEM)
*/
router.patch("/:id/wallet", auth, requireAdmin, async (req, res) => {
  const io = req.app.get("io");

  try {
    const {
      walletBalance,
      walletDelta,
      points,
      pointsDelta
    } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let walletChange = 0;
    let pointsChange = 0;

    // 💰 Wallet logic
    if (walletBalance !== undefined) {
      walletChange = walletBalance - user.walletBalance;
      user.walletBalance = walletBalance;
    }

    if (walletDelta !== undefined) {
      walletChange = walletDelta;
      user.walletBalance += walletDelta;
    }

    // ⭐ Points logic
    if (points !== undefined) {
      pointsChange = points - user.points;
      user.points = points;
    }

    if (pointsDelta !== undefined) {
      pointsChange = pointsDelta;
      user.points += pointsDelta;
    }

    await user.save();

    // 💰 Create transaction ONLY for wallet changes
    if (walletChange !== 0) {
      await Transaction.create({
        userId: user._id,
        amount: walletChange,
        type: "topup",
        method: "wallet",
        status: "success"
      });
    }

    // 🧾 Admin log
    await AdminLog.create({
      adminId: req.user.id,
      action: "update_wallet_points",
      targetUserId: user._id,
      details: {
        walletChange,
        pointsChange
      }
    });

    // ⚡ Realtime updates
    io.emit("users_updated");
    io.emit("walletUpdated", {
      userId: user._id,
      walletBalance: user.walletBalance,
      points: user.points
    });
    io.emit("transaction_updated");

    res.json({
      walletBalance: user.walletBalance,
      points: user.points
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;