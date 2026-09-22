/**
 * Self-check for candle gap filling.
 *
 *   node src/components/TVChart/gapFill.selfcheck.mjs
 *
 * The rules that must hold: a quiet stretch inside the session gets flat bars,
 * a stretch outside it (overnight, weekend, after close) gets nothing, and the
 * browser is never handed an unbounded number of invented bars.
 */

import assert from 'node:assert';
import { parseSession, inSession, bridge, fillSessionGaps, MAX_FILLED_BARS } from './gapFill.js';

const NSE = parseSession('0915-1530');
assert.deepStrictEqual(NSE, { startMin: 555, endMin: 930 });
assert.strictEqual(parseSession('24x7'), null, '24x7 has no window to fill against');

/** A Thursday, 2026-09-17, at the given IST time. */
const ist = (h, m) => Date.UTC(2026, 8, 17, h, m) - 5.5 * 3600 * 1000;

assert.strictEqual(inSession(ist(10, 0), NSE), true);
assert.strictEqual(inSession(ist(9, 0), NSE), false, 'before the open');
assert.strictEqual(inSession(ist(15, 45), NSE), false, 'after the close');
assert.strictEqual(inSession(Date.UTC(2026, 8, 19, 5, 0), NSE), false, 'Saturday');

/* ── the reported bug: history stops, trading resumes 45 minutes later ──── */
const step = 5 * 60 * 1000;
const bars = [
  { time: ist(10, 5),  open: 150, high: 152, low: 149, close: 151, volume: 10 },
  { time: ist(10, 50), open: 155, high: 158, low: 154, close: 157, volume: 12 },
];
const filled = fillSessionGaps(bars, 300, '0915-1530');
assert.strictEqual(filled.length, 2 + 8, 'eight missing five-minute buckets must be bridged');
assert.strictEqual(filled[0].time, bars[0].time);
assert.strictEqual(filled[filled.length - 1].time, bars[1].time);
for (const b of filled.slice(1, -1)) {
  assert.strictEqual(b.open, 151, 'a bridged bar is flat at the previous close');
  assert.strictEqual(b.high, 151);
  assert.strictEqual(b.low, 151);
  assert.strictEqual(b.close, 151);
  assert.strictEqual(b.volume, 0, 'nothing traded, so no volume is invented');
}
// Strictly increasing time — TradingView rejects anything else.
for (let i = 1; i < filled.length; i++) {
  assert.ok(filled[i].time > filled[i - 1].time, 'bars must stay in order');
}

/* ── overnight must stay empty, exactly as Zerodha shows it ─────────────── */
const overnight = fillSessionGaps([
  { time: ist(15, 25), open: 100, high: 100, low: 100, close: 100, volume: 1 },
  { time: Date.UTC(2026, 8, 18, 4, 0) /* next day 09:30 IST */, open: 102, high: 102, low: 102, close: 102, volume: 1 },
], 300, '0915-1530');
// Only the in-session minutes on either side get bars: 15:25→15:30 has none
// left, and 09:15→09:30 the next morning is three buckets.
assert.strictEqual(overnight.length, 2 + 3, 'only the next morning is bridged, not the night');

/* ── guards ────────────────────────────────────────────────────────────── */
assert.strictEqual(fillSessionGaps(bars, 86400, '0915-1530').length, 2, 'daily bars need a holiday calendar, so are left alone');
assert.strictEqual(fillSessionGaps(bars, 300, '24x7').length, 2, '24x7 instruments are left alone');
assert.deepStrictEqual(fillSessionGaps([], 300, '0915-1530'), []);

const wide = bridge({ time: ist(9, 20), close: 10 }, ist(9, 20) + 400 * 24 * 3600 * 1000, 60_000, NSE, MAX_FILLED_BARS);
assert.strictEqual(wide.length, 0, 'a listing-sized gap is not a quiet patch');

const budgeted = bridge({ time: ist(9, 16), close: 10 }, ist(15, 29), 60_000, NSE, 5);
assert.strictEqual(budgeted.length, 5, 'the budget is respected');

console.log('gap-fill self-check: all assertions passed');
