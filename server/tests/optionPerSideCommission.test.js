'use strict';

/**
 * Pure unit test for the per-side option commission picker (Fix 22).
 *
 * Mirrors NettingEngine._isOptionsSegmentSettings + _pickCommissionRate so
 * we can validate the dispatch logic without booting Mongoose / mongo.
 *
 * Run: node server/tests/optionPerSideCommission.test.js
 */

function isOptionsSegmentSettings(segmentSettings) {
  if (!segmentSettings) return false;
  const name = String(segmentSettings.name || '').toUpperCase();
  if (name === 'NSE_OPT' || name === 'BSE_OPT' || name === 'MCX_OPT' || name === 'CRYPTO_OPTIONS') {
    return true;
  }
  const type = String(segmentSettings.segmentType || '').toUpperCase();
  return type === 'OPTIONS';
}

function pickCommissionRate(segmentSettings, actionSide) {
  if (!segmentSettings) return 0;
  if (isOptionsSegmentSettings(segmentSettings)) {
    const isBuy = String(actionSide || '').toLowerCase() === 'buy';
    return isBuy
      ? Number(segmentSettings.optionBuyCommission) || 0
      : Number(segmentSettings.optionSellCommission) || 0;
  }
  return Number(segmentSettings.commission) || 0;
}

let pass = 0;
let fail = 0;
function check(name, cond, info) {
  if (cond) { pass++; }
  else { fail++; console.error(`FAIL: ${name}`, info || ''); }
}

// === OPT segments → per-side picker ===
{
  const opt = { name: 'NSE_OPT', commission: 999, optionBuyCommission: 30, optionSellCommission: 50 };
  check('NSE_OPT buy → optionBuyCommission', pickCommissionRate(opt, 'buy') === 30);
  check('NSE_OPT sell → optionSellCommission', pickCommissionRate(opt, 'sell') === 50);
  check('NSE_OPT IGNORES legacy commission field', pickCommissionRate(opt, 'buy') !== 999);
}
{
  const opt = { name: 'BSE_OPT', commission: 0, optionBuyCommission: 10, optionSellCommission: 20 };
  check('BSE_OPT buy', pickCommissionRate(opt, 'buy') === 10);
  check('BSE_OPT sell', pickCommissionRate(opt, 'sell') === 20);
}
{
  const opt = { name: 'MCX_OPT', optionBuyCommission: 5, optionSellCommission: 7 };
  check('MCX_OPT buy', pickCommissionRate(opt, 'buy') === 5);
  check('MCX_OPT sell', pickCommissionRate(opt, 'sell') === 7);
}
{
  const opt = { name: 'CRYPTO_OPTIONS', optionBuyCommission: 1.5, optionSellCommission: 2.5 };
  check('CRYPTO_OPTIONS buy', pickCommissionRate(opt, 'buy') === 1.5);
  check('CRYPTO_OPTIONS sell', pickCommissionRate(opt, 'sell') === 2.5);
}

// === Non-OPT segments → single commission, ignores per-side fields ===
{
  const fut = { name: 'NSE_FUT', commission: 100, optionBuyCommission: 999, optionSellCommission: 999 };
  check('NSE_FUT buy → single commission', pickCommissionRate(fut, 'buy') === 100);
  check('NSE_FUT sell → single commission', pickCommissionRate(fut, 'sell') === 100);
  check('NSE_FUT IGNORES per-side fields', pickCommissionRate(fut, 'buy') !== 999);
}
{
  const eq = { name: 'NSE_EQ', commission: 50 };
  check('NSE_EQ buy', pickCommissionRate(eq, 'buy') === 50);
  check('NSE_EQ sell', pickCommissionRate(eq, 'sell') === 50);
}
{
  const forex = { name: 'FOREX', commission: 9 };
  check('FOREX buy', pickCommissionRate(forex, 'buy') === 9);
  check('FOREX sell', pickCommissionRate(forex, 'sell') === 9);
}

// === segmentType-only detection (for back-compat with looser callers) ===
{
  const opt = { segmentType: 'OPTIONS', optionBuyCommission: 11, optionSellCommission: 22 };
  check('segmentType=OPTIONS buy', pickCommissionRate(opt, 'buy') === 11);
  check('segmentType=OPTIONS sell', pickCommissionRate(opt, 'sell') === 22);
}

// === Edge cases ===
{
  const opt = { name: 'NSE_OPT', optionBuyCommission: 0, optionSellCommission: 50 };
  check('OPT zero buy → 0', pickCommissionRate(opt, 'buy') === 0);
  check('OPT zero buy still allows sell', pickCommissionRate(opt, 'sell') === 50);
}
{
  check('null segmentSettings → 0', pickCommissionRate(null, 'buy') === 0);
}
{
  const opt = { name: 'NSE_OPT', optionBuyCommission: 30, optionSellCommission: 40 };
  // case-insensitive
  check('side=BUY (uppercase) routes to buy', pickCommissionRate(opt, 'BUY') === 30);
  check('side=Sell (mixed) routes to sell', pickCommissionRate(opt, 'Sell') === 40);
}

if (fail > 0) {
  console.error(`\noptionPerSideCommission.test.js: ${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`optionPerSideCommission.test.js: all ${pass} checks passed`);
