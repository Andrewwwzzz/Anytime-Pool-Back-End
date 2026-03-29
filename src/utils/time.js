const getSGNow = () => {
  return new Date();
};

const toSGDate = (dateInput) => {
  return new Date(dateInput);
};

module.exports = {
  getSGNow,
  toSGDate
};