exports.calculateBookingPrice = (table, startTime, endTime) => {
  const start = new Date(startTime);
  const end = new Date(endTime);

  // Calculate duration in hours
  const hours = (end - start) / (1000 * 60 * 60);

  if (hours <= 0) {
    throw new Error("Invalid booking time range");
  }

  return table.basePrice * hours;
};