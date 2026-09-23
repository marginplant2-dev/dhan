/**
 * Is this contract still alive today?
 *
 * The stored `expiry` field cannot be trusted: instruments subscribed from the
 * picker arrive without one, so they save as expiry: null and then look
 * immortal to every filter that reads that field. The trading symbol, however,
 * always carries the date — NIFTY2692223300PE is the 22 Sep 2026 23300 PE — so
 * that is what we read first, and the stored field is only a fallback.
 *
 * The rule this module must never break: a live contract must never be
 * reported as expired. Anything it cannot parse is "unknown", and unknown is
 * treated as alive — a wrong "dead" hides a tradable contract from everyone,
 * while a wrong "alive" is caught by the price and margin checks downstream.
 * instrumentExpiry.selfcheck.js pins that direction.
 */

const MONTHS = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

// Weekly symbols compress the month into one character: 1-9 for Jan-Sep, then
// O, N, D for the three months whose numbers would need two digits.
const WEEKLY_MONTH = {
  1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, O: 9, N: 10, D: 11,
};

//  NIFTY24SEP23300CE · BANKNIFTY24SEPFUT · CRUDEOIL24SEP6000PE
const MONTHLY = /^([A-Z][A-Z&\-]*?)(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d+(?:\.\d+)?)?(CE|PE|FUT)$/;
//  NIFTY2692223300PE · SENSEX2590580000CE
const WEEKLY = /^([A-Z][A-Z&\-]*?)(\d{2})([1-9OND])(\d{2})(\d+(?:\.\d+)?)(CE|PE)$/;

/** Expiry as a UTC-midnight Date for the IST calendar day the contract dies. */
function dateFrom(yy, monthIndex, day) {
  const year = 2000 + yy;
  const d = new Date(Date.UTC(year, monthIndex, day));
  // Reject a date the calendar rolled over (e.g. "31" in a 30-day month):
  // a symbol that does not describe a real day is not one we understand.
  if (d.getUTCMonth() !== monthIndex || d.getUTCDate() !== day) return null;
  return d;
}

/**
 * Read the expiry out of a trading symbol.
 * @returns {Date|null} null when the symbol carries no date we recognise
 *                      (equities, indices, anything unparsed).
 */
function expiryFromSymbol(symbol) {
  const s = String(symbol || '').toUpperCase().replace(/\s+/g, '');
  if (!s) return null;

  const weekly = WEEKLY.exec(s);
  if (weekly) {
    const [, , yy, mon, dd] = weekly;
    const monthIndex = WEEKLY_MONTH[mon];
    if (monthIndex === undefined) return null;
    return dateFrom(Number(yy), monthIndex, Number(dd));
  }

  const monthly = MONTHLY.exec(s);
  if (monthly) {
    const [, , yy, mmm] = monthly;
    // A monthly symbol names the month but not the day, and the exchange moves
    // the day around (holidays, the 2025 weekday changes). The last calendar
    // day of that month is the only bound that cannot cut a live contract off
    // early — the real expiry is always on or before it.
    const monthIndex = MONTHS[mmm];
    const lastDay = new Date(Date.UTC(2000 + Number(yy), monthIndex + 1, 0)).getUTCDate();
    return dateFrom(Number(yy), monthIndex, lastDay);
  }

  return null;
}

/** IST calendar day as YYYY-MM-DD. */
function istDayKey(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(d));
}

/** The expiry we trust: the symbol first, the stored field only as a fallback. */
function resolveExpiry(instrument) {
  if (!instrument) return null;
  const fromSymbol = expiryFromSymbol(instrument.symbol || instrument.tradingsymbol);
  if (fromSymbol) return fromSymbol;
  const raw = instrument.expiry;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * True only when we know the contract died before today (IST).
 * Unknown expiry → false, deliberately: see the note at the top.
 */
function isExpired(instrument, now = new Date()) {
  const expiry = resolveExpiry(instrument);
  if (!expiry) return false;
  return istDayKey(expiry) < istDayKey(now);
}

/** Convenience for list endpoints: keep everything still tradable today. */
function dropExpired(instruments, now = new Date()) {
  if (!Array.isArray(instruments)) return instruments;
  return instruments.filter((i) => !isExpired(i, now));
}

/** Same instrument with `expiry` filled in from its symbol when it was missing. */
function withResolvedExpiry(instrument) {
  if (!instrument) return instrument;
  if (instrument.expiry) return instrument;
  const expiry = expiryFromSymbol(instrument.symbol || instrument.tradingsymbol);
  return expiry ? { ...instrument, expiry } : instrument;
}

module.exports = {
  expiryFromSymbol,
  resolveExpiry,
  isExpired,
  dropExpired,
  withResolvedExpiry,
  istDayKey,
};
