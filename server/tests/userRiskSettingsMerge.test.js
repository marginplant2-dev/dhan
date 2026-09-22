'use strict';

/**
 * Pure unit tests for the UserRiskSettings.getEffectiveSettings() merge.
 *
 * We can't easily run a Mongoose-backed test here without spinning up a DB,
 * so this file replicates the merge logic exactly and asserts that:
 *
 *  1. A user override (non-null) wins over the global setting.
 *  2. A null override falls through to the global setting.
 *  3. If both are missing, the documented defaults are returned.
 *  4. The MT5 margin-call / stop-out fields are NEVER dropped (they used to be —
 *     see Fix 9 in agent.md §13).
 *
 * Run: node server/tests/userRiskSettingsMerge.test.js
 */

// This must mirror the merge() inside server/models/UserRiskSettings.js
function merge(globalSettings, userSettings) {
  return {
    ledgerBalanceClose: userSettings?.ledgerBalanceClose ?? globalSettings.ledgerBalanceClose ?? 0,
    profitTradeHoldMinSeconds: userSettings?.profitTradeHoldMinSeconds ?? globalSettings.profitTradeHoldMinSeconds ?? 0,
    lossTradeHoldMinSeconds: userSettings?.lossTradeHoldMinSeconds ?? globalSettings.lossTradeHoldMinSeconds ?? 0,
    blockLimitAboveBelowHighLow: userSettings?.blockLimitAboveBelowHighLow ?? globalSettings.blockLimitAboveBelowHighLow ?? false,
    blockLimitBetweenHighLow: userSettings?.blockLimitBetweenHighLow ?? globalSettings.blockLimitBetweenHighLow ?? false,
    exitOnlyMode: userSettings?.exitOnlyMode ?? globalSettings.exitOnlyMode ?? false,
    marginCallLevel: userSettings?.marginCallLevel ?? globalSettings.marginCallLevel ?? 100,
    stopOutLevel: userSettings?.stopOutLevel ?? globalSettings.stopOutLevel ?? 50,
    hasUserOverride: !!userSettings
  };
}

let failed = 0;
function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    console.error(`FAIL: ${msg}\n  expected: ${expected}\n  actual:   ${actual}`);
    failed += 1;
  }
}

// 1) User override wins over global
{
  const eff = merge(
    { marginCallLevel: 100, stopOutLevel: 50 },
    { marginCallLevel: 80,  stopOutLevel: 30 }
  );
  assertEq(eff.marginCallLevel, 80, 'user marginCallLevel must override global');
  assertEq(eff.stopOutLevel, 30, 'user stopOutLevel must override global');
  assertEq(eff.hasUserOverride, true, 'hasUserOverride should be true when override present');
}

// 2) Null user override falls through to global
{
  const eff = merge(
    { marginCallLevel: 120, stopOutLevel: 40 },
    { marginCallLevel: null, stopOutLevel: null }
  );
  assertEq(eff.marginCallLevel, 120, 'null override must fall through to global marginCallLevel');
  assertEq(eff.stopOutLevel, 40, 'null override must fall through to global stopOutLevel');
}

// 3) No user settings at all → global wins
{
  const eff = merge({ marginCallLevel: 90, stopOutLevel: 25 }, null);
  assertEq(eff.marginCallLevel, 90, 'null userSettings → global marginCallLevel');
  assertEq(eff.stopOutLevel, 25, 'null userSettings → global stopOutLevel');
  assertEq(eff.hasUserOverride, false, 'hasUserOverride must be false when no override');
}

// 4) Both missing → documented MT5 defaults
{
  const eff = merge({}, null);
  assertEq(eff.marginCallLevel, 100, 'default marginCallLevel must be 100 (MT5 standard)');
  assertEq(eff.stopOutLevel, 50, 'default stopOutLevel must be 50 (MT5 standard)');
}

// 5) Regression: marginCallLevel/stopOutLevel must always be present in result
//    (the bug fixed in Fix 9: previously merge() omitted them entirely, so
//    checkStopOut received `undefined` and silently fell back to its own
//    hard-coded literals — meaning admin's per-user overrides AND any global
//    update were both ignored).
{
  const eff = merge({ marginCallLevel: 75, stopOutLevel: 35 }, { stopOutLevel: 20 });
  assertEq('marginCallLevel' in eff, true, 'merged object must contain marginCallLevel');
  assertEq('stopOutLevel' in eff, true, 'merged object must contain stopOutLevel');
  assertEq(eff.marginCallLevel, 75, 'marginCallLevel falls through');
  assertEq(eff.stopOutLevel, 20, 'stopOutLevel taken from override');
}

// 6) Other unrelated fields still merge correctly (non-regression)
{
  const eff = merge(
    { ledgerBalanceClose: 80, exitOnlyMode: false },
    { ledgerBalanceClose: 60 }
  );
  assertEq(eff.ledgerBalanceClose, 60, 'user ledgerBalanceClose overrides global');
  assertEq(eff.exitOnlyMode, false, 'exitOnlyMode falls through to global default');
}

if (failed === 0) {
  console.log('OK userRiskSettingsMerge.test.js — all assertions passed');
  process.exit(0);
} else {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
