const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/user");
const auth = require("../middleware/auth");

/*
========================================
REGISTER
========================================
*/
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Missing name, email or password"
      });
    }

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
      message: "Account created. Await verification."
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
LOGIN (SEND FULL USER DATA)
========================================
*/
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

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

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    /*
    🔥 SEND FULL USER DATA
    */
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        showName: user.showName,
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
GET CURRENT USER (ALWAYS FRESH)
========================================
*/
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        showName: user.showName,
        walletBalance: user.walletBalance
      }
    });

  } catch (error) {
    console.error("ME ERROR:", error);

    res.status(500).json({
      error: "Failed to fetch user"
    });
  }
});

module.exports = router;