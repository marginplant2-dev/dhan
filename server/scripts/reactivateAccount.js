#!/usr/bin/env node
/**
 * Reactivate a wrongly-FAILED (or EXPIRED) challenge account.
 *
 * Flips status FAILED/EXPIRED → ACTIVE, clears the failure metadata
 * + the FAIL severity violations, and resets DD watermarks to the
 * account's current equity so a stale daily loss can't immediately
 * re-trigger the breach.
 *
 * Usage from server/ dir:
 *   node scripts/reactivateAccount.js <accountIdOrCode>
 *   node scripts/reactivateAccount.js <accountIdOrCode> --dry-run
 *   node scripts/reactivateAccount.js <accountIdOrCode> --restore-balance 200000
 *
 * Flags:
 *   --dry-run            report what would change, no writes
 *   --restore-balance N  also set currentBalance/walletBalance to N
 *                        (use when you want to undo a bad trade's P&L too)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ChallengeAccount = require('../models/ChallengeAccount');
const ChallengePosition = require('../models/ChallengePosition');

const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

async function main() {
  const args = process.argv.slice(2);
  const key = args.find(a => !a.startsWith('--'));
  if (!key) {
    console.error('Usage: node scripts/reactivateAccount.js <accountIdOrCode> [--dry-run] [--restore-balance N]');
    process.exit(1);
  }
  const dryRun = args.includes('--dry-run');
  const balIdx = args.indexOf('--restore-balance');
  const restoreBalance = balIdx >= 0 ? Number(args[balIdx + 1]) : null;
  if (balIdx >= 0 && !(restoreBalance > 0)) {
    console.error('--restore-balance requires a positive number');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  let acc = await ChallengeAccount.findOne({ accountId: key.toUpperCase() });
  if (!acc) {
    try { acc = await ChallengeAccount.findById(key); } catch (_) { /* invalid */ }
  }
  if (!acc) {
    console.error(`No account found: ${key}`);
    process.exit(1);
  }

  console.log('\n=== BEFORE ===');
  console.log(`  ID:                   ${acc.accountId}  (${acc._id})`);
  console.log(`  Status:               ${acc.status}`);
  console.log(`  Failed at:            ${acc.failedAt?.toISOString() || '-'}`);
  console.log(`  Fail reason:          ${acc.failReason || '-'}`);
  console.log(`  Current balance:      ${inr(acc.currentBalance)}`);
  console.log(`  Current equity:       ${inr(acc.currentEquity)}`);
  console.log(`  Wallet balance:       ${inr(acc.walletBalance)}`);
  console.log(`  Day-start equity:     ${inr(acc.dayStartEquity)}`);
  console.log(`  Lowest today:         ${inr(acc.lowestEquityToday)}`);
  console.log(`  Lowest overall:       ${inr(acc.lowestEquityOverall)}`);
  console.log(`  Daily DD %:           ${Number(acc.currentDailyDrawdownPercent || 0).toFixed(2)}`);
  console.log(`  Overall DD %:         ${Number(acc.currentOverallDrawdownPercent || 0).toFixed(2)}`);
  console.log(`  FAIL violations:      ${(acc.violations || []).filter(v => v.severity === 'FAIL').length}`);

  if (acc.status === 'ACTIVE' || acc.status === 'FUNDED') {
    console.log(`\n⚠  Account is already ${acc.status} — nothing to revert.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  // Decide target status — preserve FUNDED type if it was a funded account that
  // got failed, otherwise back to ACTIVE evaluation status.
  const newStatus = acc.accountType === 'FUNDED' ? 'FUNDED' : 'ACTIVE';

  console.log('\n=== CHANGES TO APPLY ===');
  console.log(`  Status:               ${acc.status} → ${newStatus}`);
  console.log(`  failedAt:             clear`);
  console.log(`  failReason:           clear`);
  console.log(`  expiredAt:            clear (if set)`);
  console.log(`  FAIL violations:      remove all`);

  // Decide equity baseline for the DD reset. If --restore-balance is given,
  // use that. Otherwise use whichever is HIGHER: current equity or the
  // failed-trade-time balance. We want today's DD trackers to anchor at
  // a value that won't immediately re-fail the account.
  const newEquity = restoreBalance != null
    ? restoreBalance
    : Math.max(Number(acc.currentEquity || 0), Number(acc.currentBalance || 0));

  console.log(`  Balance + equity reset → ${inr(newEquity)} (so today's loss doesn't auto re-fail)`);

  if (dryRun) {
    console.log('\n⚠  --dry-run set — no changes written.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Apply
  acc.status = newStatus;
  acc.failedAt = null;
  acc.failReason = '';
  acc.expiredAt = null;
  if (Array.isArray(acc.violations)) {
    acc.violations = acc.violations.filter(v => v.severity !== 'FAIL');
  }

  // Reset balance + equity if restore-balance flag set
  if (restoreBalance != null) {
    acc.currentBalance = newEquity;
    acc.currentEquity = newEquity;
    acc.walletBalance = newEquity;
    acc.walletEquity = newEquity;
    acc.walletFreeMargin = newEquity;
    acc.walletMargin = 0;
    acc.walletMarginLevel = 0;
  }

  // Reset DD trackers so today's loss doesn't immediately re-trigger.
  // Anchor to current (possibly restored) equity. Both dayStartEquity AND
  // dayStartBalance must reset to the same anchor — Daily DD calc reads
  // dayStartBalance first, and the Objectives panel uses the same field
  // for its "today's loss" amount; leaving dayStartBalance stale would
  // leave the panel showing pre-reactivate losses.
  acc.dayStartEquity = newEquity;
  acc.dayStartBalance = newEquity;
  acc.lowestEquityToday = newEquity;
  // Don't lower the all-time overall watermark — only lift it if balance was
  // restored above it.
  if (newEquity > Number(acc.lowestEquityOverall || 0)) {
    acc.lowestEquityOverall = newEquity;
  }
  acc.currentDailyDrawdownPercent = 0;
  acc.currentOverallDrawdownPercent = 0;
  acc.maxDailyDrawdownHit = 0;

  // Reset today's PnL bucket so the consistency / max-one-day check starts
  // clean from the moment of reactivation.
  const todayIso = new Date().toISOString().slice(0, 10);
  if (acc.dailyPnlMap && (acc.dailyPnlMap instanceof Map ? acc.dailyPnlMap.has(todayIso) : todayIso in (acc.dailyPnlMap || {}))) {
    if (acc.dailyPnlMap instanceof Map) acc.dailyPnlMap.delete(todayIso);
    else delete acc.dailyPnlMap[todayIso];
    acc.markModified('dailyPnlMap');
  }

  await acc.save();

  console.log('\n=== AFTER ===');
  console.log(`  Status:               ${acc.status}`);
  console.log(`  Current balance:      ${inr(acc.currentBalance)}`);
  console.log(`  Day-start equity:     ${inr(acc.dayStartEquity)}`);
  console.log(`  FAIL violations:      ${(acc.violations || []).filter(v => v.severity === 'FAIL').length}`);
  console.log('\n✅ Account reactivated. User can resume trading.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('reactivate error:', err);
  process.exit(1);
});
