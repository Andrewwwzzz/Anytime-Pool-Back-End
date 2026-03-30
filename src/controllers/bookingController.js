const Booking = require("../models/Booking");
const { io } = require("../socket");

// 🧠 Helper to enrich booking response
function enrichBooking(booking) {
  const now = Date.now();
  const expiresAt = new Date(booking.expiresAt).getTime();

  const timeRemaining = Math.max(0, Math.floor((expiresAt - now) / 1000));

  return {
    ...booking.toObject(),
    isExpired: timeRemaining === 0 && booking.status === "pending_payment",
    timeRemaining,
  };
}

// ✅ CREATE BOOKING (ONLY THIS ROUTE CREATES BOOKINGS)
exports.createBooking = async (req, res) => {
  try {
    const { tableId, startTime, endTime, amount } = req.body;

    const booking = await Booking.create({
      userId: req.user.id,
      tableId,
      startTime,
      endTime,
      amount,
      status: "pending_payment",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    res.json(enrichBooking(booking));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ GET ALL BOOKINGS (ADMIN + USER SAFE)
exports.getBookings = async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });

    const enriched = bookings.map(enrichBooking);

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ CANCEL BOOKING (SAFE)
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) return res.status(404).json({ error: "Not found" });

    if (booking.status !== "pending_payment") {
      return res.status(400).json({ error: "Cannot cancel" });
    }

    booking.status = "cancelled";
    await booking.save();

    io.emit("bookingUpdated", {
      bookingId: booking._id,
      status: "cancelled",
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};