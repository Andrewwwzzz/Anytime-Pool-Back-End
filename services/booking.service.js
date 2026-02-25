const Booking = require("../models/booking");
const Table = require("../models/table");

exports.createBooking = async ({ userId, tableId, startTime, endTime }) => {

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (start >= end) {
    throw new Error("Invalid time range");
  }

  // Check table exists
  const table = await Table.findById(tableId);
  if (!table) {
    throw new Error("Table not found");
  }

  // Check overlapping confirmed bookings
  const overlapping = await Booking.findOne({
    table: tableId,
    status: "confirmed",
    startTime: { $lt: end },
    endTime: { $gt: start }
  });

  if (overlapping) {
    throw new Error("Table already booked for this time");
  }

  // Calculate hours
  const hours =
    (end - start) / (1000 * 60 * 60);

  const totalPrice = hours * table.basePrice;

  const booking = await Booking.create({
    user: userId,
    table: tableId,
    startTime: start,
    endTime: end,
    totalPrice,
    status: "pending"
  });

  return booking;
};