'use strict';

/**
 * Pure checks for options strike band: max |strike − underlying| = underlying × (pct / 100).
 * Mirrors NettingEngine / MarketPage / UserSegmentSettings merge intent (no DB).
 */

function maxDistanceFromUnderlyingPercent(underlying, pct) {
  if (!Number.isFinite(underlying) || underlying <= 0) return 0;
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return underlying * (pct / 100);
}

function strikeWithinBand(strike, underlying, pct) {
  const max = maxDistanceFromUnderlyingPercent(underlying, pct);
  if (max <= 0) return true;
  return Math.abs(strike - underlying) <= max;
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  }
}

// 10% at 24_000 → ±2_400
assert(maxDistanceFromUnderlyingPercent(24000, 10) === 2400, '10% of 24000 should be 2400');

// Inside band
assert(strikeWithinBand(23000, 24000, 10), '23000 should be within 10% of 24000 (dist 1000 ≤ 2400)');
assert(strikeWithinBand(26400, 24000, 10), '26400 should be within 10% (dist 2400 ≤ 2400)');

// Outside band
assert(!strikeWithinBand(21000, 24000, 10), '21000 should be outside 10% (dist 3000 > 2400)');

// Points mode (conceptual): compare distance to fixed max
const ptsMax = 500;
assert(Math.abs(23500 - 24000) <= ptsMax, '500 pt cap allows 23500 vs underlying 24000');

if (failed === 0) {
  console.log('optionsStrikePercent.test.js: all checks passed');
}
process.exit(failed ? 1 : 0);
