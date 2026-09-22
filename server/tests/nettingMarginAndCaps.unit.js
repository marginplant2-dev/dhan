/**
 * Unit tests (no DB): expiry-day margin math + segment-wide lot projection.
 * Run: node tests/nettingMarginAndCaps.unit.js
 */

const NettingEngine = require('../engines/NettingEngine');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function run() {
  const eng = new NettingEngine();

  // --- Expiry day margin (fixed per lot) ---
  // Single-field path (futures, or options when no per-side override is set)
  let m = eng.resolveExpiryDayMarginAmount(
    { expiryDayIntradayMargin: 500, fixedExpiryDayIntradayAsPercent: false },
    { volume: 2, quantity: 100, price: 10 }
  );
  assert(m === 1000, `expiry fixed margin: expected 1000, got ${m}`);

  m = eng.resolveExpiryDayMarginAmount(
    { expiryDayIntradayMargin: 10, fixedExpiryDayIntradayAsPercent: true },
    { volume: 2, quantity: 100, price: 10 }
  );
  assert(m === 100, `expiry % margin: expected 10% of 1000 = 100, got ${m}`);

  assert(
    eng.resolveExpiryDayMarginAmount(
      { expiryDayIntradayMargin: 0, fixedExpiryDayIntradayAsPercent: false },
      { volume: 1, quantity: 1, price: 1 }
    ) === null,
    'expiry margin 0 should not apply'
  );

  // --- Per-side option expiry margin (Fix 17) ---
  // BUY uses expiryDayOptionBuyMargin when isOptionsInstrument, ignores SELL field
  m = eng.resolveExpiryDayMarginAmount(
    {
      expiryDayIntradayMargin: 500,         // fallback (would yield 1000)
      expiryDayOptionBuyMargin: 200,         // BUY override (yields 400)
      expiryDayOptionSellMargin: 700,
    },
    { volume: 2, quantity: 100, price: 10, side: 'buy', isOptionsInstrument: true }
  );
  assert(m === 400, `option BUY expiry margin: expected 200×2=400, got ${m}`);

  // SELL uses expiryDayOptionSellMargin
  m = eng.resolveExpiryDayMarginAmount(
    {
      expiryDayIntradayMargin: 500,
      expiryDayOptionBuyMargin: 200,
      expiryDayOptionSellMargin: 700,
    },
    { volume: 2, quantity: 100, price: 10, side: 'sell', isOptionsInstrument: true }
  );
  assert(m === 1400, `option SELL expiry margin: expected 700×2=1400, got ${m}`);

  // Strict FUT/OPT separation (Fix 17b): options with NO per-side override
  // returns null. No fallback to the futures field. The user explicitly
  // requested this — the futures field is futures-only.
  m = eng.resolveExpiryDayMarginAmount(
    { expiryDayIntradayMargin: 500 },
    { volume: 2, quantity: 100, price: 10, side: 'buy', isOptionsInstrument: true }
  );
  assert(m === null, `option BUY with no per-side override + only futures field set: expected null (strict separation), got ${m}`);

  // Futures (isOptionsInstrument=false) ignores per-side fields entirely
  m = eng.resolveExpiryDayMarginAmount(
    {
      expiryDayIntradayMargin: 500,
      expiryDayOptionBuyMargin: 200, // ignored for futures
      expiryDayOptionSellMargin: 700,
    },
    { volume: 2, quantity: 100, price: 10, side: 'buy', isOptionsInstrument: false }
  );
  assert(m === 1000, `futures expiry margin uses single field even when option fields are set: expected 1000, got ${m}`);

  // Per-side percent mode
  m = eng.resolveExpiryDayMarginAmount(
    {
      expiryDayOptionBuyMargin: 5, // 5% of notional (100 × 10 = 1000) = 50
      fixedExpiryDayOptionBuyAsPercent: true,
    },
    { volume: 2, quantity: 100, price: 10, side: 'buy', isOptionsInstrument: true }
  );
  assert(m === 50, `option BUY % expiry margin: expected 5% of 1000 = 50, got ${m}`);

  // Strict separation (Fix 17b): per-side override of 0 (blank) returns
  // null even if the futures field is set. No cross-fallback for options.
  m = eng.resolveExpiryDayMarginAmount(
    {
      expiryDayIntradayMargin: 500,
      expiryDayOptionBuyMargin: 0, // not set (0 = blank)
    },
    { volume: 2, quantity: 100, price: 10, side: 'buy', isOptionsInstrument: true }
  );
  assert(m === null, `option BUY blank per-side override does NOT fall back to futures field: expected null, got ${m}`);

  // --- Max exchange lots projection (segment total lots after order) ---
  const projected = eng.projectedSegmentVolumeTotal(
    [],
    'NSE_FUT',
    'NIFTY24JANFUT',
    null,
    5,
    'buy',
    false
  );
  assert(projected === 5, `empty book + 5 lots: expected 5, got ${projected}`);

  const pendingRows = [
    { symbol: 'ABC', volume: 3, status: 'pending', exchange: 'NFO', segment: 'FUT' }
  ];
  const withPending = eng.projectedSegmentVolumeTotal(
    pendingRows,
    'NSE_FUT',
    'XYZ',
    null,
    2,
    'buy',
    false
  );
  assert(withPending === 5, `pending 3 + new 2 on new symbol: expected 5, got ${withPending}`);

  console.log('nettingMarginAndCaps.unit.js — all checks passed');
}

try {
  run();
  process.exit(0);
} catch (e) {
  console.error('FAILED:', e.message);
  process.exit(1);
}
