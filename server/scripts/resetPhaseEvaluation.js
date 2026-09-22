#!/usr/bin/env node
/**
 * Reset a multi-step challenge account so its CURRENT phase starts as a fresh
 * evaluation from the ORIGINAL fund size.
 *
 * Background: the old phase-advance flow carried phase-1's balance/equity
 * forward into phase 2 (e.g. ₹1,08,997 instead of resetting to the ₹1,00,000
 * base). Standard 2-step model treats each phase as an independent evaluation
 * starting from the same capital. The engine is now fixed for future passes;
 * this repairs accounts already stranded with carried-forward balances.
 *
 * It rebases balance / equity / the whole sub-wallet to initialBalance, wipes
 * phase P&L, squares off any open positions, and zeroes all objective trackers
 * (DD, trading days, trade counters) — exactly what the engine now does.
 *
 * Usage (from server/ dir):
 *   node scripts/resetPhaseEvaluation.js CH928579           # one account, dry run
 *   node scripts/resetPhaseEvaluation.js CH928579 --apply   # one account, apply
 *
 *   # Bulk: ONLY accounts that advanced a phase but never reset the balance
 *   # (status ACTIVE, currentPhase >= 2, phaseStartBalance != initialBalance).
 *   # Real phase-1 traders are NOT touched.
 *   node scripts/resetPhaseEvaluation.js --all              # dry run — list them
 *   node scripts/resetPhaseEvaluation.js --all --apply      # reset them all
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ChallengeAccount = require('../models/ChallengeAccount');
const ChallengePosition = require('../models/ChallengePosition');

const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');
const key = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

async function resetAccount(acc) {
  const base = Number(acc.initialBalance) > 0 ? Number(acc.initialBalance) : Number(acc.currentEquity);
  await ChallengePosition.updateMany(
    { challengeAccountId: acc._id, status: 'open' },
    { $set: { status: 'closed', closeTime: new Date(), closedBy: 'phase_advance', profit: 0, realisedPnl: 0 } }
  );
  acc.currentBalance = base;
  acc.currentEquity = base;
  acc.totalProfitLoss = 0;
  acc.openTradesCount = 0;
  acc.walletBalance = base;
  acc.walletEquity = base;
  acc.walletCredit = 0;
  acc.walletMargin = 0;
  acc.walletFreeMargin = base;
  acc.walletMarginLevel = 0;
  acc.phaseStartBalance = base;
  acc.phaseStartedAt = new Date();
  acc.currentProfitPercent = 0;
  acc.currentDailyDrawdownPercent = 0;
  acc.maxDailyDrawdownHit = 0;
  acc.currentOverallDrawdownPercent = 0;
  acc.lowestEquityToday = base;
  acc.lowestEquityOverall = base;
  acc.highestEquity = base;
  acc.dayStartEquity = base;
  acc.dayStartBalance = base;
  acc.uniqueTradingDays = [];
  acc.dailyPnlMap = new Map();
  acc.markModified('dailyPnlMap');
  acc.tradingDaysCount = 0;
  acc.totalTrades = 0;
  acc.tradesToday = 0;
  acc.lastTradingDay = null;
  if (Array.isArray(acc.violations)) {
    acc.violations = acc.violations.filter(v => v.severity === 'FAIL');
  }
  await acc.save();
  return base;
}

async function reportAccount(acc) {
  const base = Number(acc.initialBalance) > 0 ? Number(acc.initialBalance) : Number(acc.currentEquity);
  const openCount = await ChallengePosition.countDocuments({ challengeAccountId: acc._id, status: 'open' });
  console.log(`\n  Account:      ${acc.accountId} (${acc._id})`);
  console.log(`  Status:       ${acc.status}  ·  Phase ${acc.currentPhase}/${acc.totalPhases}`);
  console.log(`  Initial:      ${inr(acc.initialBalance)}`);
  console.log(`  Current bal:  ${inr(acc.currentBalance)}  →  ${inr(base)}`);
  console.log(`  Current eqty: ${inr(acc.currentEquity)}  →  ${inr(base)}`);
  console.log(`  phaseStart:   ${inr(acc.phaseStartBalance)}  →  ${inr(base)}`);
  console.log(`  Open trades:  ${openCount}${openCount ? ' (will be squared off)' : ''}`);
}

async function main() {
  if (!key && !ALL) {
    console.error('Usage: node scripts/resetPhaseEvaluation.js <accountIdOrCode> [--apply]');
    console.error('   or: node scripts/resetPhaseEvaluation.js --all [--apply]');
    process.exit(1);
  }
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  await mongoose.connect(mongoUri);
  console.log('[reset] connected', APPLY ? '(APPLY)' : '(DRY RUN — no writes)');

  if (ALL) {
    // Phase-advance bug signature: still ACTIVE (mid-evaluation), advanced past
    // phase 1, but the per-phase anchor was never rebased to the fund size.
    const candidates = await ChallengeAccount.find({
      status: 'ACTIVE',
      currentPhase: { $gte: 2 }
    });
    const affected = candidates.filter(a =>
      Math.abs(Number(a.phaseStartBalance) - Number(a.initialBalance)) > 1
    );
    console.log(`[reset] ${candidates.length} ACTIVE phase>=2 account(s); ${affected.length} affected (phaseStart != initial)`);
    for (const acc of affected) {
      await reportAccount(acc);
      if (APPLY) {
        const base = await resetAccount(acc);
        console.log(`     ✓ reset to fresh phase-${acc.currentPhase} evaluation at ${inr(base)}`);
      }
    }
    if (!APPLY) console.log(`\n[reset] dry run only — re-run with --all --apply to reset the ${affected.length} account(s) above.`);
    else console.log(`\n[reset] ✓ done — ${affected.length} account(s) reset.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  let acc = await ChallengeAccount.findOne({ accountId: key.toUpperCase() });
  if (!acc) { try { acc = await ChallengeAccount.findById(key); } catch (_) {} }
  if (!acc) { console.error(`No account found: ${key}`); process.exit(1); }

  await reportAccount(acc);
  if (acc.status !== 'ACTIVE') {
    console.log(`\n  ⚠ status is ${acc.status}, not ACTIVE — reset still applies to balances but double-check this is intended.`);
  }
  if (!APPLY) {
    console.log('\n[reset] dry run only — re-run with --apply to write.');
    await mongoose.disconnect();
    process.exit(0);
  }
  const base = await resetAccount(acc);
  console.log(`\n[reset] ✓ ${acc.accountId} reset to fresh phase-${acc.currentPhase} evaluation at ${inr(base)}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => { console.error('[reset] error:', err); process.exit(1); });
