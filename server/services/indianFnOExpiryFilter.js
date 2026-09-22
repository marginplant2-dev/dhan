const ExpirySettings = require('../models/ExpirySettings');

/** Client ?segment= values from /api/zerodha/instruments/search */
const CLIENT_SEGMENT_TO_KEY = {
  nseFut: 'NFO_FUT',
  nseOpt: 'NFO_OPT',
  mcxFut: 'MCX_FUT',
  mcxOpt: 'MCX_OPT',
  bseFut: 'BFO_FUT',
  bseOpt: 'BFO_OPT'
};

/** Admin segment names from segment docs / query */
const ADMIN_SEGMENT_TO_KEY = {
  NSE_FUT: 'NFO_FUT',
  NSE_OPT: 'NFO_OPT',
  NFO_FUT: 'NFO_FUT',
  NFO_OPT: 'NFO_OPT',
  MCX_FUT: 'MCX_FUT',
  MCX_OPT: 'MCX_OPT',
  BSE_FUT: 'BFO_FUT',
  BSE_OPT: 'BFO_OPT',
  BFO_FUT: 'BFO_FUT',
  BFO_OPT: 'BFO_OPT'
};

function mapClientSegmentToExpirySettingsKey(segment) {
  if (!segment) return null;
  return CLIENT_SEGMENT_TO_KEY[segment] || null;
}

function mapAdminSegmentToExpirySettingsKey(segmentName) {
  if (!segmentName) return null;
  return ADMIN_SEGMENT_TO_KEY[String(segmentName).toUpperCase()] || null;
}

/** When `segmentName` query is missing but exchange + F&O type are known */
function inferExpiryKeyFromExchangeAndType(exchange, typeFilter) {
  const ex = String(exchange || '').toUpperCase();
  const isOpt = Array.isArray(typeFilter);
  const isFut = typeFilter === 'FUT';
  if (ex === 'NFO' && isFut) return 'NFO_FUT';
  if (ex === 'NFO' && isOpt) return 'NFO_OPT';
  if (ex === 'MCX' && isFut) return 'MCX_FUT';
  if (ex === 'MCX' && isOpt) return 'MCX_OPT';
  if (ex === 'BFO' && isFut) return 'BFO_FUT';
  if (ex === 'BFO' && isOpt) return 'BFO_OPT';
  return null;
}

function istDayKey(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(d));
}

function parseExpiryDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole IST calendar days from today to expiry (negative if expiry is before today). */
function istCalendarDaysFromTodayTo(expiryDate) {
  const todayKey = istDayKey(new Date());
  const expKey = istDayKey(expiryDate);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const [ey, em, ed] = expKey.split('-').map(Number);
  const t0 = Date.UTC(ty, tm - 1, td);
  const t1 = Date.UTC(ey, em - 1, ed);
  return Math.floor((t1 - t0) / 86400000);
}

function uniqueSortedExpiryDates(instruments) {
  const byKey = new Map();
  for (const inst of instruments) {
    const d = parseExpiryDate(inst.expiry);
    if (!d) continue;
    const k = istDayKey(d);
    if (!byKey.has(k)) byKey.set(k, d);
  }
  return Array.from(byKey.values()).sort((a, b) => a - b);
}

/**
 * Which serial expiries are visible: E0 always; E_i included only if
 * IST days from today to E_{i-1}'s expiry <= openNextBeforeDays (rollover window).
 * openNextBeforeDays <= 0 disables that gate (show up to `show` expiries always).
 */
function computeVisibleExpiryDates(sortedExpiryDates, show, openNextBeforeDays) {
  const n = sortedExpiryDates.length;
  if (n === 0) return [];
  const cap = Math.min(Math.max(1, show || 1), 5, n);

  if (openNextBeforeDays == null || openNextBeforeDays <= 0) {
    return sortedExpiryDates.slice(0, cap);
  }

  let count = 1;
  for (let i = 1; i < cap; i++) {
    const prev = sortedExpiryDates[i - 1];
    const daysLeft = istCalendarDaysFromTodayTo(prev);
    if (daysLeft <= openNextBeforeDays) count = i + 1;
    else break;
  }
  return sortedExpiryDates.slice(0, count);
}

function resolveSettingsForUnderlying(doc, underlyingUpper) {
  const show = doc?.show ?? 3;
  const openNextBeforeDays = doc?.openNextBeforeDays ?? 5;
  const scripts = doc?.scriptSettings || [];
  const row = scripts.find(
    (s) => String(s.scriptName || '').toUpperCase() === underlyingUpper
  );
  return {
    show: row?.show ?? show,
    openNextBeforeDays: row?.openNextBeforeDays ?? openNextBeforeDays
  };
}

/**
 * Apply admin Expiry Settings to Zerodha-style rows (name, expiry, symbol/tradingsymbol).
 * Does not persist anything. If no DB row, uses defaults: show=3, openNextBeforeDays=0 (no day gate).
 */
async function filterZerodhaInstrumentsByExpirySettings(instruments, settingsKey) {
  if (!settingsKey || !instruments?.length) return instruments;

  const withExpiry = instruments.filter((i) => parseExpiryDate(i.expiry));
  if (withExpiry.length === 0) return instruments;

  const doc = await ExpirySettings.findOne({ segmentName: settingsKey }).lean();
  if (!doc) return instruments;

  const byUnderlying = new Map();
  const passthrough = [];

  for (const inst of instruments) {
    const d = parseExpiryDate(inst.expiry);
    if (!d) {
      passthrough.push(inst);
      continue;
    }
    const und = String(inst.name || '').trim();
    if (!und) {
      passthrough.push(inst);
      continue;
    }
    if (!byUnderlying.has(und)) byUnderlying.set(und, []);
    byUnderlying.get(und).push(inst);
  }

  const out = [...passthrough];

  for (const [underlying, group] of byUnderlying) {
    const undUp = underlying.toUpperCase();
    const { show, openNextBeforeDays } = resolveSettingsForUnderlying(doc, undUp);

    const sorted = uniqueSortedExpiryDates(group);
    const visibleDates = computeVisibleExpiryDates(sorted, show, openNextBeforeDays);
    const allowedKeys = new Set(visibleDates.map((d) => istDayKey(d)));

    for (const inst of group) {
      const d = parseExpiryDate(inst.expiry);
      if (d && allowedKeys.has(istDayKey(d))) out.push(inst);
    }
  }

  return out;
}

module.exports = {
  mapClientSegmentToExpirySettingsKey,
  mapAdminSegmentToExpirySettingsKey,
  inferExpiryKeyFromExchangeAndType,
  filterZerodhaInstrumentsByExpirySettings,
  computeVisibleExpiryDates,
  istCalendarDaysFromTodayTo,
  istDayKey
};
