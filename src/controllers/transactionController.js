const Transaction = require("../models/Transaction");

exports.getTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .populate("userId", "name email");

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};