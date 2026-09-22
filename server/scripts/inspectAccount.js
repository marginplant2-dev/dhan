#!/usr/bin/env node
/**
 * Inspect a single challenge account — shows configured DD rules,
 * realised daily PnL, violations log, and a per-trade summary so you
 * can debug "why did this account fail?".
 *
 * Usage:
 *   node scripts/inspectAccount.js <accountIdOrCode>
 *
 * Examples:
 *   node scripts/inspectAccount.js CH11A23C
 *   node scripts/inspectAccount.js 67abc...          # mongo _id
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ChallengeAccount = require('../models/ChallengeAccount');
const ChallengePosition = require('../models/ChallengePosition');
const Challenge = require('../models/Challenge');
const User = require('../models/User');

const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const pct = (v) => `${Number(v || 0).toFixed(2)}%`;

async function main() {
  const key = process.argv[2];
  if (!key) {
    console.error('Usage: node scripts/inspectAccount.js <accountIdOrCode>');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  // Try by accountId code first, then by mongo _id
  let acc = await ChallengeAccount.findOne({ accountId: key.toUpperCase() })
    .populate('challengeId')
    .populate('userId', 'name email oderId');
  if (!acc) {
    try {
      acc = await ChallengeAccount.findById(key)
        .populate('challengeId')
        .populate('userId', 'name email oderId');
    } catch (_) { /* invalid ObjectId */ }
  }
  if (!acc) {
    console.error(`No account found with id/code: ${key}`);
    process.exit(1);
  }

  const ch = acc.challengeId;
  const evalRules = ch?.rules || {};
  const fundedRules = ch?.fundedSettings || {};
  const ddRules = acc.status === 'FUNDED' ? fundedRules : evalRules;

  console.log('\n=== ACCOUNT ===');
  console.log(`  ID:           ${acc.accountId}  (${acc._id})`);
  console.log(`  Type:         ${acc.accountType}`);
  console.log(`  Status:       ${acc.status}`);
  console.log(`  User:         ${acc.userId?.name || '-'} (${acc.userId?.email || '-'}) [${acc.userId?.oderId || '-'}]`);
  console.log(`  Challenge:    ${ch?.name || '-'} · steps=${ch?.stepsCount} · fund=${inr(acc.initialBalance)}`);
  console.log(`  Phase:        ${acc.currentPhase} / ${acc.totalPhases}`);
  console.log(`  Created:      ${acc.createdAt?.toISOString()}`);
  console.log(`  Failed at:    ${acc.failedAt?.toISOString() || '-'}`);
  console.log(`  Fail reason:  ${acc.failReason || '-'}`);

  console.log('\n=== EVALUATION RULES (challenge.rules) ===');
  console.log(`  Max daily DD %:        ${evalRules.maxDailyDrawdownPercent}`);
  console.log(`  Max overall DD %:      ${evalRules.maxOverallDrawdownPercent}`);
  console.log(`  Profit target Phase 1: ${evalRules.profitTargetPhase1Percent}%`);
  console.log(`  Profit target Phase 2: ${evalRules.profitTargetPhase2Percent}%`);
  console.log(`  Max one-day profit %:  ${evalRules.maxOneDayProfitPercentOfTarget}`);
  console.log(`  Consistency %:         ${evalRules.consistencyRulePercent}`);
  console.log(`  Min trading days:      ${evalRules.tradingDaysRequired}`);
  console.log(`  Challenge expiry days: ${evalRules.challengeExpiryDays}`);

  if (acc.status === 'FUNDED' || acc.accountType === 'FUNDED') {
    console.log('\n=== FUNDED RULES (challenge.fundedSettings) ===');
    console.log(`  Max daily DD %:    ${fundedRules.maxDailyDrawdownPercent}`);
    console.log(`  Max overall DD %:  ${fundedRules.maxOverallDrawdownPercent}`);
    console.log(`  Profit split %:    ${fundedRules.profitSplitPercent}`);
    console.log(`  Min profit %:      ${fundedRules.minProfitPercentForPayout}`);
    console.log(`  Max payout %:      ${fundedRules.maxWithdrawalPercent}`);
  }

  console.log('\n=== ACCOUNT METRICS ===');
  console.log(`  Initial balance:        ${inr(acc.initialBalance)}`);
  console.log(`  Current balance:        ${inr(acc.currentBalance)}`);
  console.log(`  Current equity:         ${inr(acc.currentEquity)}`);
  console.log(`  Lowest today:           ${inr(acc.lowestEquityToday)}`);
  console.log(`  Lowest overall:         ${inr(acc.lowestEquityOverall)}`);
  console.log(`  Day start equity:       ${inr(acc.dayStartEquity)}`);
  console.log(`  Phase start balance:    ${inr(acc.phaseStartBalance)}`);
  console.log(`  Current daily DD %:     ${pct(acc.currentDailyDrawdownPercent)}`);
  console.log(`  Current overall DD %:   ${pct(acc.currentOverallDrawdownPercent)}`);
  console.log(`  Current profit %:       ${pct(acc.currentProfitPercent)}`);
  console.log(`  Total trades:           ${acc.totalTrades}`);
  console.log(`  Unique trading days:    ${(acc.uniqueTradingDays || []).join(', ') || '-'}`);

  // Daily PnL map — show how the per-day P&L stacks against the daily DD limit
  console.log('\n=== DAILY PnL MAP (from closed trades) ===');
  const dmap = acc.dailyPnlMap || new Map();
  const entries = dmap instanceof Map ? Array.from(dmap.entries()) : Object.entries(dmap);
  if (entries.length === 0) {
    console.log('  (no entries)');
  } else {
    const ddLimit = ddRules.maxDailyDrawdownPercent;
    const ddLimitAbs = ddLimit ? (Number(acc.initialBalance) * ddLimit) / 100 : null;
    console.log(`  Daily DD limit: ${ddLimit}% = ${ddLimitAbs ? inr(ddLimitAbs) : '-'} (anchor: initialBalance ${inr(acc.initialBalance)})`);
    for (const [day, pnl] of entries.sort()) {
      const flag = ddLimitAbs && pnl < 0 && Math.abs(pnl) >= ddLimitAbs ? '  ⚠  BREACH' : '';
      console.log(`    ${day}: ${pnl >= 0 ? '+' : ''}${inr(pnl)}${flag}`);
    }
  }

  // Violations log — what the engine actually flagged
  console.log('\n=== VIOLATIONS LOG ===');
  if (!Array.isArray(acc.violations) || acc.violations.length === 0) {
    console.log('  (none)');
  } else {
    for (const v of acc.violations) {
      console.log(`  [${v.severity}] ${v.code}: ${v.description}`);
      console.log(`    at ${v.timestamp?.toISOString?.() || v.timestamp}`);
    }
  }

  // Last 20 trades
  console.log('\n=== LAST 20 CLOSED TRADES ===');
  const trades = await ChallengePosition.find({ challengeAccountId: acc._id, status: 'closed' })
    .sort({ closedAt: -1 })
    .limit(20)
    .lean();
  if (trades.length === 0) {
    console.log('  (none)');
  } else {
    for (const t of trades.reverse()) {
      const pnlStr = (t.realisedPnl >= 0 ? '+' : '') + inr(t.realisedPnl);
      console.log(`  ${t.closedAt?.toISOString?.().replace('T', ' ').slice(0, 16) || '-'}  ${t.symbol.padEnd(22)} ${t.side.toUpperCase().padEnd(5)} qty=${String(t.quantity).padStart(4)}  entry=${String(t.entryPrice).padStart(8)}  exit=${String(t.closePrice).padStart(8)}  pnl=${pnlStr}  [${t.closeReason || 'user'}]`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('inspect error:', err);
  process.exit(1);
});
