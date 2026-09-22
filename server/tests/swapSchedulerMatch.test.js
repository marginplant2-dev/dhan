'use strict';

/**
 * Pure unit test for the per-minute swap scheduler match logic (Fix 23).
 *
 * Mirrors the filter from settlement.cron.js → runSwapScheduler so we can
 * validate without booting Mongo:
 *   - matches segments where swapTime === currentISTMinute
 *   - skips segments already processed today (lastSwapAppliedDate === today)
 *   - treats null/undefined lastSwapAppliedDate as due
 *   - HH:mm parsing rejects malformed times
 *
 * Run: node server/tests/swapSchedulerMatch.test.js
 */

function isHHmm(v) {
  if (v == null || v === '') return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

function dueSegments(segments, currentISTMinute, todayISTDate) {
  return segments
    .filter(s => s.swapTime === currentISTMinute)
    .filter(s => s.lastSwapAppliedDate !== todayISTDate);
}

let pass = 0;
let fail = 0;
function check(name, cond, info) {
  if (cond) { pass++; }
  else { fail++; console.error(`FAIL: ${name}`, info || ''); }
}

// === HH:mm validation ===
check('valid 22:30', isHHmm('22:30') === true);
check('valid 00:00', isHHmm('00:00') === true);
check('valid 23:59', isHHmm('23:59') === true);
check('reject 24:00', isHHmm('24:00') === false);
check('reject 22:60', isHHmm('22:60') === false);
check('reject empty', isHHmm('') === false);
check('reject null', isHHmm(null) === false);
check('reject 9:30 (no leading zero)', isHHmm('9:30') === false);
check('reject 22:5 (single minute digit)', isHHmm('22:5') === false);

// === scheduler match ===
const segments = [
  { name: 'NSE_FUT', swapTime: '22:30', lastSwapAppliedDate: null },
  { name: 'NSE_OPT', swapTime: '22:30', lastSwapAppliedDate: '2026-04-08' },
  { name: 'FOREX',   swapTime: '22:00', lastSwapAppliedDate: null },
  { name: 'NSE_EQ',  swapTime: '15:30', lastSwapAppliedDate: '2026-04-08' },
  { name: 'MCX_FUT', swapTime: '23:55', lastSwapAppliedDate: null },
];

// Scenario 1: 22:30 IST on 2026-04-09 — NSE_FUT due, NSE_OPT was processed
// 2026-04-08 (yesterday) so it's also due, FOREX/NSE_EQ/MCX_FUT all not due
// because their swapTime doesn't match.
{
  const due = dueSegments(segments, '22:30', '2026-04-09');
  check('22:30 4/9 → 2 due (NSE_FUT, NSE_OPT)', due.length === 2);
  check('22:30 4/9 → contains NSE_FUT', due.some(s => s.name === 'NSE_FUT'));
  check('22:30 4/9 → contains NSE_OPT', due.some(s => s.name === 'NSE_OPT'));
  check('22:30 4/9 → does NOT contain FOREX', !due.some(s => s.name === 'FOREX'));
}

// Scenario 2: 22:30 IST on 2026-04-08 — NSE_OPT was already done today, only
// NSE_FUT is due.
{
  const due = dueSegments(segments, '22:30', '2026-04-08');
  check('22:30 4/8 → 1 due (NSE_FUT only)', due.length === 1);
  check('22:30 4/8 → only NSE_FUT', due[0]?.name === 'NSE_FUT');
}

// Scenario 3: 22:00 IST on 2026-04-09 — only FOREX
{
  const due = dueSegments(segments, '22:00', '2026-04-09');
  check('22:00 4/9 → 1 due (FOREX)', due.length === 1);
  check('22:00 4/9 → FOREX only', due[0]?.name === 'FOREX');
}

// Scenario 4: 15:31 (1 min off NSE_EQ) → nothing
{
  const due = dueSegments(segments, '15:31', '2026-04-09');
  check('15:31 → no segments due', due.length === 0);
}

// Scenario 5: idempotency — second tick at same minute, after marking
// lastSwapAppliedDate, should yield 0 due segments.
{
  const updated = segments.map(s =>
    s.swapTime === '22:30' ? { ...s, lastSwapAppliedDate: '2026-04-09' } : s
  );
  const due = dueSegments(updated, '22:30', '2026-04-09');
  check('22:30 4/9 second tick → 0 due (idempotent)', due.length === 0);
}

if (fail > 0) {
  console.error(`\nswapSchedulerMatch.test.js: ${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`swapSchedulerMatch.test.js: all ${pass} checks passed`);
