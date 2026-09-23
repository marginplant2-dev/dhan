/**
 * node scripts/instrumentExpiry.selfcheck.js
 *
 * The one rule that matters here: a live contract must never be reported as
 * expired. A wrong "expired" removes a tradable instrument from every user's
 * screen; a wrong "alive" is still caught downstream by the price checks. The
 * asserts below are written in that direction on purpose.
 */

const assert = require('assert');
const {
  expiryFromSymbol, isExpired, dropExpired, withResolvedExpiry, istDayKey,
} = require('../services/instrumentExpiry');

const iso = (d) => (d ? istDayKey(d) : null);

// ── weekly options: YY M DD, with O/N/D standing in for Oct/Nov/Dec ────────
assert.strictEqual(iso(expiryFromSymbol('NIFTY2692223300PE')), '2026-09-22');
assert.strictEqual(iso(expiryFromSymbol('NIFTY2692223300CE')), '2026-09-22');
assert.strictEqual(iso(expiryFromSymbol('BANKNIFTY26O0752000CE')), '2026-10-07');
assert.strictEqual(iso(expiryFromSymbol('SENSEX26N1180000PE')), '2026-11-11');
assert.strictEqual(iso(expiryFromSymbol('FINNIFTY26D3024000CE')), '2026-12-30');
// lower case and stray spacing must parse the same
assert.strictEqual(iso(expiryFromSymbol(' nifty2692223300pe ')), '2026-09-22');

// ── monthly options and futures: the month's last day, never earlier ───────
assert.strictEqual(iso(expiryFromSymbol('NIFTY26SEPFUT')), '2026-09-30');
assert.strictEqual(iso(expiryFromSymbol('BANKNIFTY26OCTFUT')), '2026-10-31');
assert.strictEqual(iso(expiryFromSymbol('CRUDEOIL26FEB6000CE')), '2026-02-28');
assert.strictEqual(iso(expiryFromSymbol('NIFTY28FEB23300PE')), '2028-02-29'); // leap year

// ── anything we do not understand stays unknown, which counts as alive ─────
for (const s of ['RELIANCE', 'NIFTY 50', 'SBIN-EQ', '', null, undefined, 'GOLD26XYZFUT']) {
  assert.strictEqual(expiryFromSymbol(s), null, `should not parse: ${s}`);
  assert.strictEqual(isExpired({ symbol: s }), false, `must stay tradable: ${s}`);
}
// a symbol naming a day that does not exist is not a date we understand
assert.strictEqual(expiryFromSymbol('NIFTY2623123300PE'), null); // 31 Feb

// ── the bug this module exists for ─────────────────────────────────────────
const TODAY = new Date('2026-09-23T04:00:00Z'); // 23 Sep 2026, 09:30 IST
// Yesterday's contract, saved with no expiry field — the exact row that let a
// dead option be bought a day after it died.
assert.strictEqual(isExpired({ symbol: 'NIFTY2692223300PE', expiry: null }, TODAY), true);
// Expiry day itself is still tradable, right up to the close.
assert.strictEqual(isExpired({ symbol: 'NIFTY2692323300PE', expiry: null }, TODAY), false);
assert.strictEqual(
  isExpired({ symbol: 'NIFTY2692323300PE' }, new Date('2026-09-23T09:55:00Z')), false,
  'expiry day must stay tradable after the close, not vanish mid-session',
);
// Tomorrow, and a month out.
assert.strictEqual(isExpired({ symbol: 'NIFTY2692423300PE' }, TODAY), false);
assert.strictEqual(isExpired({ symbol: 'NIFTY26OCTFUT' }, TODAY), false);

// ── the symbol wins over a stored field that disagrees ─────────────────────
assert.strictEqual(
  isExpired({ symbol: 'NIFTY2692223300PE', expiry: '2027-12-31' }, TODAY), true,
  'a stale stored expiry must not resurrect a dead contract',
);
// …and the stored field still covers symbols we cannot parse.
assert.strictEqual(isExpired({ symbol: 'WEIRDTHING', expiry: '2026-09-01' }, TODAY), true);
assert.strictEqual(isExpired({ symbol: 'WEIRDTHING', expiry: '2026-10-01' }, TODAY), false);

// ── list helpers ───────────────────────────────────────────────────────────
const list = [
  { symbol: 'NIFTY2692223300PE' },   // dead
  { symbol: 'NIFTY2692423300PE' },   // alive
  { symbol: 'RELIANCE' },            // equity, never expires
  { symbol: 'BANKNIFTY26SEPFUT' },   // alive to 30 Sep
];
assert.deepStrictEqual(
  dropExpired(list, TODAY).map((i) => i.symbol),
  ['NIFTY2692423300PE', 'RELIANCE', 'BANKNIFTY26SEPFUT'],
);

const filled = withResolvedExpiry({ symbol: 'NIFTY2692223300PE', expiry: null });
assert.strictEqual(iso(filled.expiry), '2026-09-22', 'subscribe must store the expiry it read');
assert.strictEqual(
  withResolvedExpiry({ symbol: 'RELIANCE', expiry: null }).expiry, null,
  'nothing to fill in for an equity',
);

console.log('instrumentExpiry selfcheck ok');
