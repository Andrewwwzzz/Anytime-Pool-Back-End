const Booking = require("../models/Booking");

let isRunning = false;

async function expireBookings() {
  // Prevent overlapping runs if previous job is still going
  if (isRunning) return;
  isRunning = true;

  try {
    const now = new Date();

    // Mark expired bookings as "expired" instead of deleting them
    // This keeps the audit trail so admins can see what happened
    const result = await Booking.updateMany(
      {
        status: "pending_payment",
        expiresAt: { $lt: now }
      },
      {
        $set: {
          status: "expired",
          paymentLock: false  // release the lock so the slot is freed
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`⏰ Expired ${result.modifiedCount} unpaid booking(s)`);
    }

  } catch (error) {
    console.error("Expiry job error:", error.message);
  } finally {
    isRunning = false;
  }
}

// Run every 60 seconds
exports.startBookingExpiryJob = () => {
  console.log("✅ Booking expiry job started (runs every 60s)");
  setInterval(expireBookings, 60 * 1000);

  // Also run once immediately on startup
  expireBookings();
};