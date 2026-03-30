const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const User = require("../models/user");
const Transaction = require("../models/Transaction");

exports.confirmBookingPayment = async ({ bookingId, paymentMethod }) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) throw new Error("Booking not found");

    if (booking.status === "confirmed") {
      await session.commitTransaction();
      return booking;
    }

    const user = await User.findById(booking.userId).session(session);

    booking.status = "confirmed";
    booking.paymentMethod = paymentMethod;
    booking.paidAt = new Date();

    await booking.save({ session });

    await Transaction.create([{
      userId: user._id,
      bookingId: booking._id,
      amount: booking.amount,
      type: "payment",
      method: paymentMethod,
      status: "success"
    }], { session });

    user.totalSpent += booking.amount;
    await user.save({ session });

    await session.commitTransaction();

    return booking;

  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
};

exports.payWithWallet = async ({ bookingId }) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) throw new Error("Booking not found");

    if (booking.status !== "pending_payment") {
      throw new Error("Invalid booking state");
    }

    const user = await User.findById(booking.userId).session(session);

    if (user.walletBalance < booking.amount) {
      throw new Error("Insufficient balance");
    }

    user.walletBalance -= booking.amount;
    await user.save({ session });

    await session.commitTransaction();

    return await exports.confirmBookingPayment({
      bookingId,
      paymentMethod: "wallet"
    });

  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
};