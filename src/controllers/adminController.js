const Booking = require("../models/Booking");
const Transaction = require("../models/Transaction");
const User = require("../models/user");

exports.getDashboardStats = async (req, res) => {
  try {
    const [totalUsers, totalBookings, totalRevenue, totalTransactions] =
      await Promise.all([
        User.countDocuments(),
        Booking.countDocuments({ status: "confirmed" }),
        Booking.aggregate([
          { $match: { status: "confirmed" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Transaction.countDocuments(),
      ]);

    res.json({
      totalUsers,
      totalBookings,
      totalRevenue: totalRevenue[0]?.total || 0,
      totalTransactions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};