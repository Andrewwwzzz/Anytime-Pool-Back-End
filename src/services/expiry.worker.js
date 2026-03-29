const Booking = require("../models/Booking");

let isRunning = false;

async function expireBookings() {
  if (isRunning) return;
  isRunning = true;

  try {
    const now = new Date(); // SG time

    const result = await Booking.updateMany(
      {
        status: { $in: ["pending", "confirmed"] },
        endTime: { $lt: now }
      },
      {
        $set: { status: "completed" }
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`Expired ${result.modifiedCount} bookings`);
    }

  } catch (error) {
    console.error("Expiry worker error:", error.message);
  } finally {
    isRunning = false;
  }
}

function startExpiryWorker() {
  console.log("Expiry worker started");
  setInterval(expireBookings, 60 * 1000);
}

module.exports = startExpiryWorker;