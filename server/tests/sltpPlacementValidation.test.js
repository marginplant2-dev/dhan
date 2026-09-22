'use strict';

/**
 * Pure unit test for NettingEngine.validateSLTPPlacement (Fix 12).
 *
 * Two layered checks:
 *   1) Direction: SL on the loss side, TP on the profit side
 *   2) Limit-away gap: minimum distance from price (matches the existing
 *      limit-away rule used for pending order prices)
 *
 * Run with: node server/tests/sltpPlacementValidation.test.js
 *
 * The function is pure (no DB, no awaits) so we can require the engine and
 * call it directly.
 */

const NettingEngine = require('../engines/NettingEngine');
const ne = new NettingEngine();

let failed = 0;
function expectOK(result, msg) {
  if (result !== null) {
    console.error(`FAIL: ${msg}\n  expected: null (passes)\n  got:      ${result}`);
    failed += 1;
  }
}
function expectErr(result, contains, msg) {
  if (result === null) {
    console.error(`FAIL: ${msg}\n  expected error containing "${contains}"\n  got null (incorrectly passed)`);
    failed += 1;
    return;
  }
  if (!String(result).includes(contains)) {
    console.error(`FAIL: ${msg}\n  expected error containing "${contains}"\n  got: ${result}`);
    failed += 1;
  }
}

// ============================================================================
// 1) Direction-only checks (no segment settings — limit-away skipped)
// ============================================================================

// BUY happy path: SL below, TP above
expectOK(ne.validateSLTPPlacement('buy', 100, 90, 110, null), '1a) BUY SL<ref<TP passes');

// BUY: SL above ref → reject
expectErr(
  ne.validateSLTPPlacement('buy', 100, 110, 120, null),
  'must be BELOW',
  '1b) BUY SL above price → reject'
);

// BUY: SL == ref → reject (user said "not same entry price")
expectErr(
  ne.validateSLTPPlacement('buy', 100, 100, 110, null),
  'must be BELOW',
  '1c) BUY SL equal to price → reject (>= triggers)'
);

// BUY: TP at or below ref → reject
expectErr(
  ne.validateSLTPPlacement('buy', 100, 90, 100, null),
  'must be ABOVE',
  '1d) BUY TP equal to price → reject'
);
expectErr(
  ne.validateSLTPPlacement('buy', 100, 90, 80, null),
  'must be ABOVE',
  '1e) BUY TP below price → reject'
);

// SELL happy path: SL above, TP below
expectOK(ne.validateSLTPPlacement('sell', 100, 110, 90, null), '1f) SELL SL>ref>TP passes');

// SELL: SL below → reject
expectErr(
  ne.validateSLTPPlacement('sell', 100, 90, 80, null),
  'must be ABOVE',
  '1g) SELL SL below price → reject'
);

// SELL: SL == ref → reject
expectErr(
  ne.validateSLTPPlacement('sell', 100, 100, 90, null),
  'must be ABOVE',
  '1h) SELL SL equal to price → reject'
);

// SELL: TP above → reject
expectErr(
  ne.validateSLTPPlacement('sell', 100, 110, 110, null),
  'must be BELOW',
  '1i) SELL TP equal to price → reject'
);

// ============================================================================
// 2) Null/undefined SL or TP — that side is skipped
// ============================================================================

expectOK(ne.validateSLTPPlacement('buy', 100, null, 110, null), '2a) Null SL with valid TP passes');
expectOK(ne.validateSLTPPlacement('buy', 100, 90, null, null), '2b) Null TP with valid SL passes');
expectOK(ne.validateSLTPPlacement('buy', 100, undefined, undefined, null), '2c) Both undefined passes');
expectOK(ne.validateSLTPPlacement('buy', 100, '', '', null), '2d) Both empty string passes');

// ============================================================================
// 3) Reference price = 0 → silently skip (no error)
// ============================================================================

expectOK(ne.validateSLTPPlacement('buy', 0, 90, 110, null), '3a) ref=0 skips check');
expectOK(ne.validateSLTPPlacement('buy', null, 90, 110, null), '3b) ref=null skips');

// ============================================================================
// 4) Limit-away gap — percent
// ============================================================================

const seg5pct = { limitAwayPercent: 5 }; // 5% gap → at ref=100, gap = 5

// BUY ref 100, 5% band: SL <= 95 OK, SL > 95 reject
expectOK(ne.validateSLTPPlacement('buy', 100, 95, 105, seg5pct), '4a) BUY exactly at band passes');
expectOK(ne.validateSLTPPlacement('buy', 100, 90, 110, seg5pct), '4b) BUY safely outside band passes');
expectErr(
  ne.validateSLTPPlacement('buy', 100, 96, 110, seg5pct),
  'too close to price',
  '4c) BUY SL too close (96 within 5 of 100) → reject'
);
expectErr(
  ne.validateSLTPPlacement('buy', 100, 90, 104, seg5pct),
  'too close to price',
  '4d) BUY TP too close (104 within 5 of 100) → reject'
);

// SELL ref 100, 5% band: SL >= 105 OK
expectOK(ne.validateSLTPPlacement('sell', 100, 105, 95, seg5pct), '4e) SELL exactly at band passes');
expectErr(
  ne.validateSLTPPlacement('sell', 100, 104, 95, seg5pct),
  'too close to price',
  '4f) SELL SL too close → reject'
);
expectErr(
  ne.validateSLTPPlacement('sell', 100, 105, 96, seg5pct),
  'too close to price',
  '4g) SELL TP too close → reject'
);

// ============================================================================
// 5) Limit-away gap — points (overrides percent if both set)
// ============================================================================

const seg10pts = { limitAwayPoints: 10, limitAwayPercent: 999 }; // points wins
expectOK(ne.validateSLTPPlacement('buy', 100, 90, 110, seg10pts), '5a) BUY at 10pt band passes');
expectErr(
  ne.validateSLTPPlacement('buy', 100, 95, 110, seg10pts),
  '10 points',
  '5b) BUY SL within 10pt band → reject (uses points label)'
);
expectErr(
  ne.validateSLTPPlacement('buy', 100, 90, 105, seg10pts),
  '10 points',
  '5c) BUY TP within 10pt band → reject'
);

// ============================================================================
// 6) No limit-away configured → only direction is enforced
// ============================================================================

const segEmpty = { limitAwayPoints: 0, limitAwayPercent: 0 };
expectOK(ne.validateSLTPPlacement('buy', 100, 99.99, 100.01, segEmpty), '6a) Tiny gap allowed when no band set (direction only)');

// ============================================================================
// 7) Side variants — case insensitive
// ============================================================================

expectOK(ne.validateSLTPPlacement('BUY', 100, 90, 110, null), '7a) Uppercase BUY works');
expectOK(ne.validateSLTPPlacement('Sell', 100, 110, 90, null), '7b) Mixed-case Sell works');

// ============================================================================
// 8) Invalid inputs
// ============================================================================

expectErr(
  ne.validateSLTPPlacement('buy', 100, 'not-a-number', 110, null),
  'Invalid stop loss',
  '8a) Non-numeric SL → reject'
);
expectErr(
  ne.validateSLTPPlacement('buy', 100, 90, 'NaN-string', null),
  'Invalid take profit',
  '8b) Non-numeric TP → reject'
);

// Unknown side → silently skip (don't break workflows that pass weird sides)
expectOK(ne.validateSLTPPlacement('hodl', 100, 50, 200, null), '8c) Unknown side → skip silently');

// ============================================================================
// 9) Realistic integration: BUY @ 4000 with 1% band
// ============================================================================

const seg1pct = { limitAwayPercent: 1 }; // 1% of 4000 = 40

// SL must be <= 3960
expectOK(ne.validateSLTPPlacement('buy', 4000, 3950, 4060, seg1pct), '9a) BUY 4000 1% band: SL=3950 TP=4060 OK');
expectErr(
  ne.validateSLTPPlacement('buy', 4000, 3970, 4060, seg1pct),
  'too close',
  '9b) BUY 4000 1% band: SL=3970 too close (within 40)'
);
expectErr(
  ne.validateSLTPPlacement('buy', 4000, 3950, 4030, seg1pct),
  'too close',
  '9c) BUY 4000 1% band: TP=4030 too close (within 40)'
);

if (failed === 0) {
  console.log('OK sltpPlacementValidation.test.js — all assertions passed');
  process.exit(0);
} else {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
