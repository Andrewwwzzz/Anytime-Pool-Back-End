const express = require("express");
const router = express.Router();

const User = require("../models/user");
const Booking = require("../models/Booking");
const Transaction = require("../models/Transaction");
const AdminLog = require("../models/AdminLog");
const Table = require("../models/table");
// TimerSession schema defined inline — no separate model file needed
const timerSessionSchema = new (require("mongoose").Schema)({
  tableId: { type: require("mongoose").Schema.Types.ObjectId, ref: "Table", required: true },
  tableName: { type: String, required: true },
  startedAt: { type: Date, required: true },
  endedAt: { type: Date, required: true },
  durationSeconds: { type: Number, required: true },
  hourlyRate: { type: Number, required: true },
  amountCharged: { type: Number, required: true },
  startedBy: { type: require("mongoose").Schema.Types.ObjectId, ref: "User" },
  customerId: { type: require("mongoose").Schema.Types.ObjectId, ref: "User", default: null },
  notes: { type: String, default: null },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedReason: { type: String, default: null },
  deletedBy: { type: require("mongoose").Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

const TimerSession = require("mongoose").models.TimerSession ||
  require("mongoose").model("TimerSession", timerSessionSchema);

const auth = require("../middleware/auth");

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access only" });
  }
  next();
}

router.get("/unverified-users", auth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ isVerified: false })
      .select("-password")
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/verify-user", auth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findByIdAndUpdate(userId, { isVerified: true }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    await AdminLog.create({ adminId: req.user.id, action: "verify_user", targetUserId: userId, details: { userName: user.name, email: user.email } });
    const io = req.app.get("io");
    io.emit("users_updated");
    res.json({ message: "User verified successfully", user });
  } catch (error) {
    res.status(500).json({ error: "Failed to verify user" });
  }
});

router.get("/stats", auth, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const fromDate = req.query.from ? new Date(req.query.from) : defaultFrom;
    const toDate = req.query.to ? new Date(new Date(req.query.to).setHours(23, 59, 59)) : defaultTo;

    const dateFilter = { createdAt: { $gte: fromDate, $lte: toDate } };

    const [
      totalUsers,
      totalBookings,
      revenueData,
      totalTransactions,
      topupData,
      cancelledBookings,
      pendingBookings
    ] = await Promise.all([
      User.countDocuments(),
      Booking.countDocuments({ status: "confirmed", ...dateFilter }),
      Booking.aggregate([
        { $match: { status: "confirmed", ...dateFilter } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      Transaction.countDocuments(dateFilter),
      Transaction.aggregate([
        { $match: { type: "topup", ...dateFilter } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      Booking.countDocuments({ status: "cancelled", ...dateFilter }),
      Booking.countDocuments({ status: "pending_payment", ...dateFilter })
    ]);

    const totalRevenue = revenueData[0]?.total || 0;
    const totalTopups = topupData[0]?.total || 0;
    const avgBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

    res.json({
      totalUsers,
      totalBookings,
      totalRevenue,
      totalTransactions,
      totalTopups,
      cancelledBookings,
      pendingBookings,
      avgBookingValue: parseFloat(avgBookingValue.toFixed(2)),
      period: { from: fromDate, to: toDate }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ FIXED: updates both status AND isActive
router.post("/tables/:id/status", auth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["available", "maintenance"].includes(status)) {
      return res.status(400).json({ error: "Status must be: available or maintenance" });
    }
    const table = await Table.findByIdAndUpdate(
      req.params.id,
      { status: status, isActive: status === "available" },
      { new: true }
    );
    if (!table) return res.status(404).json({ error: "Table not found" });
    const io = req.app.get("io");
    io.emit("bookingUpdated", { tableId: table._id, status });
    res.json({ message: `Table set to ${status}`, table });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/tables/:id/start-timer", auth, requireAdmin, async (req, res) => {
  try {
    const { hourlyRate } = req.body;
    const table = await Table.findById(req.params.id);
    if (!table) return res.status(404).json({ error: "Table not found" });
    table.timerStartedAt = new Date();
    table.timerHourlyRate = hourlyRate || table.basePrice;
    table.manualOverride = "ON";
    await table.save();
    const io = req.app.get("io");
    io.emit("bookingUpdated", { tableId: table._id, status: "timer_started" });
    res.json({ message: "Timer started", table });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/tables/:id/stop-timer", auth, requireAdmin, async (req, res) => {
  try {
    const { durationSeconds, hourlyRate, startedAt } = req.body;
    const table = await Table.findById(req.params.id);
    if (!table) return res.status(404).json({ error: "Table not found" });

    const hours = durationSeconds / 3600;
    const amountCharged = parseFloat((hours * hourlyRate).toFixed(2));
    const sessionStartedAt = startedAt ? new Date(startedAt) : (table.timerStartedAt || new Date(Date.now() - durationSeconds * 1000));
    const sessionEndedAt = new Date();

    // ✅ Save timer session invoice to database
    const timerSession = await TimerSession.create({
      tableId: table._id,
      tableName: table.name,
      startedAt: sessionStartedAt,
      endedAt: sessionEndedAt,
      durationSeconds,
      hourlyRate,
      amountCharged,
      startedBy: req.user.id
    });

    table.timerStartedAt = null;
    table.timerHourlyRate = null;
    table.manualOverride = null;
    await table.save();

    // Record as cash payment — does not affect any wallet balance
    await Transaction.create({ userId: req.user.id, amount: amountCharged, type: "payment", method: "cash", status: "success" });

    const io = req.app.get("io");
    io.emit("bookingUpdated", { tableId: table._id, status: "timer_stopped" });

    res.json({ message: "Timer stopped", durationSeconds, amountCharged, timerSession, table });
  } catch (err) {
    console.error("Stop timer error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/timer-sessions", auth, requireAdmin, async (req, res) => {
  try {
    const { showDeleted } = req.query;

    // By default hide deleted, show all if showDeleted=true
    const query = showDeleted === "true" ? {} : { isDeleted: { $ne: true } };

    const sessions = await TimerSession.find(query)
      .sort({ createdAt: -1 })
      .populate("startedBy", "name email")
      .populate("customerId", "name email")
      .populate("deletedBy", "name");

    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
========================================
DELETE TIMER SESSION INVOICE
Frontend calls: DELETE /api/admin/timer-sessions/:id
========================================
*/
router.delete("/timer-sessions/:id", auth, requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: "A reason is required to delete an invoice (minimum 5 characters)" });
    }

    const session = await TimerSession.findById(req.params.id);

    if (!session) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // ✅ Soft delete — mark as deleted, never actually remove
    session.isDeleted = true;
    session.deletedAt = new Date();
    session.deletedReason = reason.trim();
    session.deletedBy = req.user.id;
    await session.save();

    await AdminLog.create({
      adminId: req.user.id,
      action: "delete_timer_session",
      details: {
        sessionId: session._id,
        tableName: session.tableName,
        amountCharged: session.amountCharged,
        reason: reason.trim()
      }
    });

    res.json({ message: "Invoice marked as deleted. Audit trail preserved." });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PromoCode = require("../models/PromoCode");
const PricingRule = require("../models/PricingRule");

/*
========================================
PRICING RULES — stored in MongoDB
========================================
*/
// Public endpoint — booking page needs pricing rules without admin auth
router.get("/pricing-rules/public", async (req, res) => {
  try {
    const rules = await PricingRule.find({ is_active: true }).sort({ priority: -1 });
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/pricing-rules", auth, requireAdmin, async (req, res) => {
  try {
    const rules = await PricingRule.find().sort({ priority: -1, createdAt: -1 });
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/pricing-rules", auth, requireAdmin, async (req, res) => {
  try {
    const rule = await PricingRule.create(req.body);
    res.json(rule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/pricing-rules/:id", auth, requireAdmin, async (req, res) => {
  try {
    const rule = await PricingRule.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    res.json(rule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/pricing-rules/:id", auth, requireAdmin, async (req, res) => {
  try {
    await PricingRule.findByIdAndDelete(req.params.id);
    res.json({ message: "Pricing rule deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/promo-codes", auth, requireAdmin, async (req, res) => {
  try {
    const promos = await PromoCode.find().sort({ createdAt: -1 });
    res.json(promos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/promo-codes", auth, requireAdmin, async (req, res) => {
  try {
    const promo = await PromoCode.create({ ...req.body, code: req.body.code.toUpperCase() });
    res.json(promo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/promo-codes/:id", auth, requireAdmin, async (req, res) => {
  try {
    const promo = await PromoCode.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(promo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/promo-codes/:id", auth, requireAdmin, async (req, res) => {
  try {
    await PromoCode.findByIdAndDelete(req.params.id);
    res.json({ message: "Promo code deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


/*
========================================
GENERATE PDF SALES REPORT
Admin calls: GET /api/admin/report/sales?from=2026-05-01&to=2026-05-31
Returns a downloadable PDF file
========================================
*/
router.get("/report/sales", auth, requireAdmin, async (req, res) => {
  try {
    const PDFDocument = require("pdfkit");

    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const fromDate = req.query.from ? new Date(req.query.from) : defaultFrom;
    const toDate = req.query.to ? new Date(new Date(req.query.to).setHours(23, 59, 59)) : defaultTo;

    const formatDate = (date) => new Date(date).toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Singapore" });
    const formatTime = (date) => new Date(date).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Singapore" });
    const formatMoney = (amount) => `$${(amount || 0).toFixed(2)}`;
    const drawLine = (doc, y, color) => { doc.moveTo(50, y).lineTo(545, y).strokeColor(color || "#CCCCCC").lineWidth(0.5).stroke(); };

    const [allBookings, allTransactions, totalUsers, tables] = await Promise.all([
      Booking.find({ createdAt: { $gte: fromDate, $lte: toDate } }).sort({ createdAt: -1 }),
      Transaction.find({ createdAt: { $gte: fromDate, $lte: toDate } }).populate("userId", "name email").sort({ createdAt: -1 }),
      User.countDocuments(),
      Table.find()
    ]);

    const confirmedBookings = allBookings.filter(b => b.status === "confirmed");
    const cancelledBookings = allBookings.filter(b => b.status === "cancelled");
    const expiredBookings   = allBookings.filter(b => b.status === "expired");
    const pendingBookings   = allBookings.filter(b => b.status === "pending_payment");
    const totalRevenue      = confirmedBookings.reduce((sum, b) => sum + (b.amount || 0), 0);
    const walletRevenue     = confirmedBookings.filter(b => b.paymentMethod === "wallet").reduce((sum, b) => sum + (b.amount || 0), 0);
    const paynowRevenue     = confirmedBookings.filter(b => b.paymentMethod === "paynow").reduce((sum, b) => sum + (b.amount || 0), 0);
    const walletTopups      = allTransactions.filter(t => t.type === "topup").reduce((sum, t) => sum + (t.amount || 0), 0);

    const revenueByTable = {};
    confirmedBookings.forEach(b => { const key = b.tableId || "Unknown"; revenueByTable[key] = (revenueByTable[key] || 0) + (b.amount || 0); });

    const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 50, left: 50, right: 50 }, bufferPages: true });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="EnvoPool-Report-${fromDate.toISOString().slice(0,10)}-to-${toDate.toISOString().slice(0,10)}.pdf"`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, 595, 140).fill("#1a472a");
    doc.font("Helvetica-Bold").fontSize(28).fillColor("#FFFFFF").text("ENVO POOL", 50, 45);
    doc.font("Helvetica").fontSize(13).fillColor("#90EE90").text("Sales & Performance Report", 50, 82);
    doc.fontSize(11).fillColor("#FFFFFF").text(`${formatDate(fromDate)} — ${formatDate(toDate)}`, 50, 105);
    doc.fontSize(9).fillColor("#90EE90").text(`Generated: ${formatDate(now)} ${formatTime(now)} SGT`, 350, 55, { align: "right", width: 195 });
    doc.fontSize(9).fillColor("#90EE90").text("CONFIDENTIAL", 350, 70, { align: "right", width: 195 });

    // Stats boxes
    const boxY = 165;
    const boxes = [
      { label: "Total Revenue",     value: formatMoney(totalRevenue),          color: "#1a472a" },
      { label: "Confirmed Bookings",value: String(confirmedBookings.length),   color: "#1a472a" },
      { label: "Total Users",       value: String(totalUsers),                 color: "#1a472a" },
      { label: "Cancellations",     value: String(cancelledBookings.length),   color: "#8B0000" }
    ];
    boxes.forEach((box, i) => {
      const x = 50 + i * 125;
      doc.rect(x, boxY, 115, 70).fill(box.color);
      doc.font("Helvetica-Bold").fontSize(18).fillColor("#FFFFFF").text(box.value, x, boxY + 16, { width: 115, align: "center" });
      doc.font("Helvetica").fontSize(8).fillColor("#CCCCCC").text(box.label, x, boxY + 44, { width: 115, align: "center" });
    });

    // Revenue Breakdown
    let y = 265;
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#1a472a").text("Revenue Breakdown", 50, y);
    y += 20; drawLine(doc, y, "#1a472a"); y += 15;
    const revenueRows = [
      ["PayNow Revenue", formatMoney(paynowRevenue), `${totalRevenue > 0 ? ((paynowRevenue/totalRevenue)*100).toFixed(1) : 0}%`],
      ["Wallet Revenue", formatMoney(walletRevenue),  `${totalRevenue > 0 ? ((walletRevenue/totalRevenue)*100).toFixed(1) : 0}%`],
      ["Wallet Top-ups", formatMoney(walletTopups),   "—"],
      ["Gross Revenue",  formatMoney(totalRevenue),   "100%"]
    ];
    revenueRows.forEach((row, i) => {
      doc.rect(50, y, 495, 22).fill(i % 2 === 0 ? "#F5F5F5" : "#FFFFFF");
      doc.font("Helvetica").fontSize(10).fillColor("#333333").text(row[0], 60, y + 6).text(row[1], 350, y + 6, { width: 80, align: "right" }).text(row[2], 440, y + 6, { width: 95, align: "right" });
      y += 22;
    });
    doc.rect(50, y, 495, 24).fill("#1a472a");
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#FFFFFF").text("NET REVENUE", 60, y + 6).text(formatMoney(totalRevenue), 350, y + 6, { width: 80, align: "right" });
    y += 40;

    // Booking Summary
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#1a472a").text("Booking Summary", 50, y);
    y += 20; drawLine(doc, y, "#1a472a"); y += 15;
    const bookingRows = [
      ["Confirmed",       String(confirmedBookings.length), "#2d6a4f"],
      ["Pending Payment", String(pendingBookings.length),   "#856404"],
      ["Cancelled",       String(cancelledBookings.length), "#8B0000"],
      ["Expired",         String(expiredBookings.length),   "#666666"],
      ["Total",           String(allBookings.length),       "#000000"]
    ];
    bookingRows.forEach((row, i) => {
      doc.rect(50, y, 495, 22).fill(i % 2 === 0 ? "#F5F5F5" : "#FFFFFF");
      doc.font("Helvetica").fontSize(10).fillColor("#333333").text(row[0], 60, y + 6);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(row[2]).text(row[1], 440, y + 6, { width: 95, align: "right" });
      y += 22;
    });
    y += 20;

    // Revenue by Table
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#1a472a").text("Revenue by Table", 50, y);
    y += 20; drawLine(doc, y, "#1a472a"); y += 15;
    doc.rect(50, y, 495, 22).fill("#1a472a");
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF").text("Table", 60, y + 6).text("Bookings", 250, y + 6, { width: 100, align: "center" }).text("Revenue", 440, y + 6, { width: 95, align: "right" });
    y += 22;
    const tableEntries = Object.entries(revenueByTable).sort((a, b) => b[1] - a[1]);
    if (tableEntries.length === 0) {
      doc.rect(50, y, 495, 22).fill("#F5F5F5");
      doc.font("Helvetica").fontSize(10).fillColor("#999999").text("No confirmed bookings in this period", 60, y + 6);
      y += 22;
    } else {
      tableEntries.forEach(([tableId, revenue], i) => {
        const bookingCount = confirmedBookings.filter(b => b.tableId === tableId).length;
        const tableName = tables.find(t => t.hardware_id === tableId)?.name || tableId;
        doc.rect(50, y, 495, 22).fill(i % 2 === 0 ? "#F5F5F5" : "#FFFFFF");
        doc.font("Helvetica").fontSize(10).fillColor("#333333").text(tableName, 60, y + 6).text(String(bookingCount), 250, y + 6, { width: 100, align: "center" }).text(formatMoney(revenue), 440, y + 6, { width: 95, align: "right" });
        y += 22;
      });
    }

    // Page 2 - Transactions
    doc.addPage();
    y = 50;
    doc.rect(0, 0, 595, 55).fill("#1a472a");
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#FFFFFF").text("Transaction Detail", 50, 18);
    doc.font("Helvetica").fontSize(9).fillColor("#90EE90").text(`${formatDate(fromDate)} — ${formatDate(toDate)}`, 50, 38);
    y = 75;

    doc.rect(50, y, 495, 22).fill("#1a472a");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF")
      .text("Date & Time", 58, y + 7).text("User", 170, y + 7).text("Type", 300, y + 7).text("Method", 365, y + 7).text("Amount", 450, y + 7, { width: 85, align: "right" });
    y += 22;

    const recentTransactions = allTransactions.slice(0, 40);
    if (recentTransactions.length === 0) {
      doc.rect(50, y, 495, 30).fill("#F5F5F5");
      doc.font("Helvetica").fontSize(10).fillColor("#999999").text("No transactions in this period", 60, y + 10);
    } else {
      recentTransactions.forEach((t, i) => {
        if (y > 750) { doc.addPage(); y = 50; }
        const bg = i % 2 === 0 ? "#F5F5F5" : "#FFFFFF";
        const userName = t.userId?.name || "Unknown";
        const typeLabel = t.type === "topup" ? "Top Up" : t.type === "refund" ? "Refund" : "Payment";
        const methodLabel = t.method === "paynow" ? "PayNow" : "Wallet";
        const amountColor = t.type === "topup" ? "#2d6a4f" : "#8B0000";
        const amountPrefix = t.type === "topup" ? "+" : "-";
        doc.rect(50, y, 495, 20).fill(bg);
        doc.font("Helvetica").fontSize(8).fillColor("#333333")
          .text(`${formatDate(t.createdAt)} ${formatTime(t.createdAt)}`, 58, y + 6)
          .text(userName.slice(0, 18), 170, y + 6).text(typeLabel, 300, y + 6).text(methodLabel, 365, y + 6);
        doc.font("Helvetica-Bold").fontSize(8).fillColor(amountColor)
          .text(`${amountPrefix}${formatMoney(Math.abs(t.amount))}`, 450, y + 6, { width: 85, align: "right" });
        y += 20;
      });
      if (allTransactions.length > 40) {
        y += 10;
        doc.font("Helvetica").fontSize(9).fillColor("#666666").text(`... and ${allTransactions.length - 40} more transactions not shown`, 50, y);
      }
    }

    // Footer
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      drawLine(doc, 785, "#CCCCCC");
      doc.font("Helvetica").fontSize(8).fillColor("#999999")
        .text("Envo Pool Pte Ltd  •  Confidential  •  For authorised recipients only", 50, 792, { align: "center", width: 495 })
        .text(`Page ${i + 1} of ${pageCount}`, 50, 805, { align: "right", width: 495 });
    }

    doc.end();

  } catch (err) {
    console.error("Report error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// This line intentionally left blank