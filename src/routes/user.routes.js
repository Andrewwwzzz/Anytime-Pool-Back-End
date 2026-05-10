const express = require("express");
const router = express.Router();

const User = require("../models/user");
const Transaction = require("../models/Transaction");
const AdminLog = require("../models/AdminLog");

const auth = require("../middleware/auth.middleware");

/*
========================================
ADMIN MIDDLEWARE
========================================
*/
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

/*
========================================
GET ALL USERS
Frontend calls: GET /api/users
Supports: GET /api/users?search=john
========================================
*/
router.get("/", auth, requireAdmin, async (req, res) => {
  try {
    const { search } = req.query;

    let query = {};

    // Search by name, email OR shortId
    if (search && search.trim()) {
      query = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { shortId: { $regex: search, $options: "i" } }
        ]
      };
    }

    const users = await User.find(query).select("-password"); // shortId included by default

    res.json(users);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
DELETE USER
Frontend calls: DELETE /api/users/:id
========================================
*/
router.delete("/:id", auth, requireAdmin, async (req, res) => {
  try {
    const io = req.app.get("io");

    await User.findByIdAndDelete(req.params.id);

    await AdminLog.create({
      adminId: req.user.id,
      action: "delete_user",
      targetUserId: req.params.id
    });

    io.emit("users_updated");

    res.json({ message: "User deleted" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
UPDATE WALLET AND/OR REWARD POINTS
Frontend calls: PATCH /api/users/:id/wallet
Body can include:
  walletBalance  — set wallet to exact amount
  walletDelta    — add/subtract from wallet
  points         — set points to exact amount
  pointsDelta    — add/subtract from points
========================================
*/
router.patch("/:id/wallet", auth, requireAdmin, async (req, res) => {
  try {
    const io = req.app.get("io");

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

    // Wallet logic — set to exact value OR add/subtract delta
    if (walletBalance !== undefined) {
      walletChange = walletBalance - user.walletBalance;
      user.walletBalance = walletBalance;
    }
    if (walletDelta !== undefined) {
      walletChange = walletDelta;
      user.walletBalance += walletDelta;
    }

    // Points logic — uses rewardPoints field (not points)
    if (points !== undefined) {
      pointsChange = points - (user.rewardPoints || 0);
      user.rewardPoints = points;
    }
    if (pointsDelta !== undefined) {
      pointsChange = pointsDelta;
      user.rewardPoints = (user.rewardPoints || 0) + pointsDelta;
    }

    await user.save();

    // Only create a transaction record if the wallet actually changed
    if (walletChange !== 0) {
      await Transaction.create({
        userId: user._id,
        amount: walletChange,
        type: "topup",
        method: "wallet",
        status: "success"
      });
    }

    // Log the admin action
    await AdminLog.create({
      adminId: req.user.id,
      action: "update_wallet_points",
      targetUserId: user._id,
      details: { walletChange, pointsChange }
    });

    // Notify frontend in real time
    io.emit("users_updated");
    io.emit("walletUpdated", {
      userId: user._id,
      walletBalance: user.walletBalance,
      rewardPoints: user.rewardPoints
    });
    io.emit("transaction_updated");

    res.json({
      walletBalance: user.walletBalance,
      rewardPoints: user.rewardPoints
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;