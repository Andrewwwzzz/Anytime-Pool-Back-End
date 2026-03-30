const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/user");
const auth = require("../middleware/auth.middleware");

/*
========================================
REGISTER
========================================
*/
router.post("/register", async (req, res) => {
  try {
    let { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Missing name, email or password"
      });
    }

    email = email.toLowerCase(); // 🔥 normalize

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({
        error: "Email already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email,
      password: hashedPassword
    });

    res.json({
      message: "Account created. Await admin verification."
    });

  } catch (error) {
    console.error("REGISTER ERROR:", error);

    res.status(500).json({
      error: "Register failed"
    });
  }
});

/*
========================================
LOGIN
========================================
*/
router.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;

    email = email.toLowerCase(); // 🔥 normalize

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        error: "Invalid credentials"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        error: "Invalid credentials"
      });
    }

    // 🔥 include role in token
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        walletBalance: user.walletBalance
      }
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);

    res.status(500).json({
      error: "Login failed"
    });
  }
});

/*
========================================
GET CURRENT USER
========================================
*/
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    res.json({
      user
    });

  } catch (error) {
    console.error("ME ERROR:", error);

    res.status(500).json({
      error: "Failed to fetch user"
    });
  }
});

module.exports = router;