const { istDayKey } = require('./indianFnOExpiryFilter');

function parseExpiryDate(raw) {
  if (raw == null) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when the instrument's expiry date (exchange calendar) is today's calendar date in Asia/Kolkata. */
function isInstrumentExpiryTodayIST(expiryDate) {
  const d = parseExpiryDate(expiryDate);
  if (!d) return false;
  return istDayKey(d) === istDayKey(new Date());
}

module.exports = {
  parseExpiryDate,
  isInstrumentExpiryTodayIST
};
