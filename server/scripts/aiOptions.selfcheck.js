/**
 * Self-check for the two pieces of AI Options logic that can silently show a
 * paying user something wrong: the strike window, and the reconcile step that
 * refuses anything Gemini invented.
 *
 *   node scripts/aiOptions.selfcheck.js
 */
const assert = require('assert');
const { _pickStrikeWindow: pickStrikeWindow, _reconcile: reconcile } = require('../services/aiOptions.service');

// ── strike window ────────────────────────────────────────────────────────
const ladder = [24800, 24850, 24900, 24950, 25000, 25050, 25100, 25150, 25200];

// Spot between two strikes picks the nearer one as ATM and centres on it.
let w = pickStrikeWindow(ladder, 25010, 2);
assert.deepStrictEqual([...w].sort((a, b) => a - b), [24900, 24950, 25000, 25050, 25100],
  'window should centre on 25000');

// Near the bottom of the ladder it must not run off the start.
w = pickStrikeWindow(ladder, 24800, 3);
assert.deepStrictEqual([...w].sort((a, b) => a - b), [24800, 24850, 24900, 24950],
  'window should clamp at the low end');

// Duplicates (CE and PE share a strike) collapse; junk strikes are dropped.
assert.strictEqual(pickStrikeWindow([25000, 25000, 0, NaN, 25050], 25000, 1).size, 2);
assert.strictEqual(pickStrikeWindow([], 25000, 3).size, 0);

// ── reconcile ────────────────────────────────────────────────────────────
const contracts = [
  { symbol: 'NIFTY25SEP25000CE', strike: 25000, type: 'CE', expiry: '2026-09-18', ltp: 112.5, lotSize: 75 },
  { symbol: 'NIFTY25SEP24950PE', strike: 24950, type: 'PE', expiry: '2026-09-18', ltp: 96.8, lotSize: 75 },
];

const out = reconcile([
  // a strike that was never sent — must be dropped, not shown
  { symbol: 'NIFTY25SEP99999CE', strike: 99999, type: 'CE', score: 9.9, confidence: 'High', rationale: 'made up' },
  // the model's own price is ignored in favour of ours
  { symbol: 'NIFTY25SEP25000CE', strike: 25000, type: 'CE', ltp: 999, score: 9.2, expectedMoveLow: 40, expectedMoveHigh: 80, confidence: 'High', rationale: 'ok' },
  // duplicate of the same contract — kept once
  { symbol: 'NIFTY25SEP25000CE', score: 8.0, confidence: 'High', rationale: 'dupe' },
  // out-of-range score and a junk confidence get normalised
  { symbol: 'NIFTY25SEP24950PE', score: 42, confidence: 'VERY HIGH', rationale: 'clamp me' },
], contracts);

const bySym = Object.fromEntries(out.map((s) => [s.symbol, s]));

assert.strictEqual(out.length, 2, 'invented strike and duplicate must be dropped');
assert.ok(!out.some((s) => s.strike === 99999), 'hallucinated contract leaked through');
assert.strictEqual(bySym['NIFTY25SEP25000CE'].ltp, 112.5, 'price must come from our data, not the model');
assert.strictEqual(bySym['NIFTY25SEP24950PE'].score, 10, 'score must clamp to 10');
assert.strictEqual(bySym['NIFTY25SEP24950PE'].confidence, 'Medium', 'unknown confidence must fall back to Medium');
// Clamped to 10, the PE outranks the CE's 9.2 — so it must lead the list.
assert.deepStrictEqual(out.map((s) => s.symbol), ['NIFTY25SEP24950PE', 'NIFTY25SEP25000CE'],
  'must be sorted by score, best first');

// Nothing usable in, nothing out — never a half-built row.
assert.strictEqual(reconcile([], contracts).length, 0);
assert.strictEqual(reconcile([{ symbol: 'NOPE' }], contracts).length, 0);

console.log('aiOptions self-check: all assertions passed');

// ── reading a reasoning model's reply ────────────────────────────────────
const { _extractText: extractText, _emptyReplyReason: why } = require('../services/aiOptions.service');

const reply = (parts, finishReason) => ({ candidates: [{ finishReason, content: { parts } }] });

// The bug that broke verification: the first part is a thought, so parts[0].text
// is undefined even though the model answered perfectly well.
assert.strictEqual(
  extractText(reply([{ text: 'let me think...', thought: true }, { text: 'ok' }])),
  'ok', 'a leading thought part must not hide the real answer');

// Several text parts belong to one answer.
assert.strictEqual(extractText(reply([{ text: '{"a":' }, { text: '1}' }])), '{"a":1}');

// Nothing usable — empty string, never undefined, so callers can just test it.
assert.strictEqual(extractText(reply([{ thought: true }])), '');
assert.strictEqual(extractText({}), '');
assert.strictEqual(extractText(reply([])), '');

// The reason has to name the actual cause, since it is shown to an admin.
assert.match(why(reply([], 'MAX_TOKENS')), /output limit/);
assert.match(why(reply([], 'SAFETY')), /safety/);
assert.match(why({ promptFeedback: { blockReason: 'OTHER' } }), /prompt blocked/);
assert.match(why(reply([], '')), /no text part/);

console.log('aiOptions self-check: reply-parsing assertions passed');
