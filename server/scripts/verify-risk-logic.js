#!/usr/bin/env node
/**
 * Quick sanity checks for ledger drawdown % and trade-hold rules (no DB).
 * Run: node server/scripts/verify-risk-logic.js
 */

const assert = require('assert');
const {
  drawdownPercentOfBalance,
  assertTradeHoldInternal
} = require('../services/riskManagement.service');

// Ledger: loss vs balance as % of balance
assert.ok(drawdownPercentOfBalance(1000, 150) >= 85, '85% drawdown at equity 150');
assert.ok(drawdownPercentOfBalance(1000, 151) < 85, 'just below 85%');
assert.ok(drawdownPercentOfBalance(1000, 200) === 80, '80% drawdown');
assert.ok(drawdownPercentOfBalance(0, 0) === 0, 'zero balance safe');

const risk = { profitTradeHoldMinSeconds: 30, lossTradeHoldMinSeconds: 30 };
const tooYoung = new Date(Date.now() - 10_000);
assert.throws(
  () => assertTradeHoldInternal(tooYoung, 10, risk),
  /Profit trades must be held/
);
assert.throws(
  () => assertTradeHoldInternal(tooYoung, -10, risk),
  /Loss trades must be held/
);

const oldEnough = new Date(Date.now() - 31_000);
assertTradeHoldInternal(oldEnough, 10, risk);
assertTradeHoldInternal(oldEnough, -10, risk);
assertTradeHoldInternal(oldEnough, 0, risk);

assertTradeHoldInternal(oldEnough, 5, { profitTradeHoldMinSeconds: 0, lossTradeHoldMinSeconds: 0 });

console.log('verify-risk-logic: all checks passed');
