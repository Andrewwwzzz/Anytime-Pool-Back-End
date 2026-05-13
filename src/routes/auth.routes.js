const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/user");
const auth = require("../middleware/auth.middleware");

/*
========================================
REGISTER
Creates a new user account.
isVerified starts as false — admin must verify before booking.
========================================
*/
router.post("/register", async (req, res) => {
  try {
    let { name, email, password, phone, kycVerified, kycData } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Missing name, email or password"
      });
    }

    email = email.toLowerCase();

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({
        error: "Email already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate unique 6-digit short ID
    let shortId;
    let isUnique = false;
    while (!isUnique) {
      shortId = String(Math.floor(100000 + Math.random() * 900000));
      const existing = await User.findOne({ shortId });
      if (!existing) isUnique = true;
    }

    // Build kyc subdocument if Singpass-verified signup
    let kyc = null;
    if (kycVerified && kycData) {
      kyc = {
        verified:    true,
        verifiedAt:  new Date(),
        source:      "singpass",
        name:        kycData.name        || null,
        dob:         kycData.dob         || null,
        sex:         kycData.sex         || null,
        nationality: kycData.nationality || null,
        email:       kycData.email       || null,
        mobile:      kycData.mobile      || null,
        uinfin:      kycData.uinfin      || null,
        address:     kycData.address     || null,
      };
    }

    await User.create({
      name,
      email,
      password: hashedPassword,
      shortId,
      phone: phone || null,
      // Pre-fill dateOfBirth from KYC if available
      dateOfBirth: (kyc && kyc.dob) ? kyc.dob : (req.body.dateOfBirth || null),
      ...(kyc && { kyc }),
    });

    res.json({
      message: "Account created. Await admin verification."
    });

  } catch (error) {
    console.error("REGISTER ERROR:", error);
    res.status(500).json({ error: "Register failed" });
  }
});

/*
========================================
LOGIN
Returns a JWT token and user info.
========================================
*/
router.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;

    email = email.toLowerCase();

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        walletBalance: user.walletBalance,
        rewardPoints: user.rewardPoints || 0,
        phone: user.phone || null,
        dateOfBirth: user.dateOfBirth || null,
        kyc: user.kyc || null
      }
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

/*
========================================
GET CURRENT USER
Frontend calls this on every page load to
check who is logged in and get latest data.
========================================
*/
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        walletBalance: user.walletBalance,
        totalSpent: user.totalSpent,
        rewardPoints: user.rewardPoints || 0,
        phone: user.phone || null,
        dateOfBirth: user.dateOfBirth || null,
        shortId: user.shortId || null,
        createdAt: user.createdAt,
        kyc: user.kyc || null
      }
    });

  } catch (error) {
    console.error("ME ERROR:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

/*
========================================
MIGRATE — assign shortId to existing users
Call once: GET /api/auth/migrate-short-ids
========================================
*/
router.get("/migrate-short-ids", async (req, res) => {
  try {
    const users = await User.find({ shortId: { $exists: false } });
    let count = 0;

    for (const user of users) {
      let shortId;
      let isUnique = false;
      while (!isUnique) {
        shortId = String(Math.floor(100000 + Math.random() * 900000));
        const existing = await User.findOne({ shortId });
        if (!existing) isUnique = true;
      }
      await User.updateOne({ _id: user._id }, { $set: { shortId } });
      count++;
    }

    res.json({ message: `Assigned shortId to ${count} users` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
UPDATE PROFILE
Frontend calls: POST /api/auth/update-profile
Lets users update their name, phone, date of birth.
========================================
*/
router.post("/update-profile", auth, async (req, res) => {
  try {
    const { name, phone, dateOfBirth } = req.body;

    // Fetch current user to check KYC status
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) return res.status(404).json({ error: "User not found" });

    const isKyc = currentUser.kyc && currentUser.kyc.verified;

    // Build update object — only include fields that were sent
    const updates = {};
    if (phone !== undefined) updates.phone = phone;

    // KYC users cannot change their name or date of birth
    if (name !== undefined) {
      if (isKyc) return res.status(403).json({ error: "Name cannot be changed for Singpass-verified accounts" });
      updates.name = name;
    }
    if (dateOfBirth !== undefined) {
      if (isKyc) return res.status(403).json({ error: "Date of birth cannot be changed for Singpass-verified accounts" });
      updates.dateOfBirth = dateOfBirth;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: "Profile updated successfully",
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        walletBalance: user.walletBalance,
        totalSpent: user.totalSpent,
        rewardPoints: user.rewardPoints || 0,
        phone: user.phone || null,
        dateOfBirth: user.dateOfBirth || null,
        kyc: user.kyc || null
      }
    });

  } catch (error) {
    console.error("UPDATE PROFILE ERROR:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

module.exports = router;