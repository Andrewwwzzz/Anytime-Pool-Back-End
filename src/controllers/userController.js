const User = require("../models/user");

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      walletBalance: user.walletBalance,
      totalSpent: user.totalSpent,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};