#!/usr/bin/env node
/**
 * Revert the LAST closed trade on a challenge account, then reactivate
 * the account if it was FAILED/EXPIRED. Use this when a single bad
 * trade has wrongly failed (or just messed up the P&L on) an account
 * and you want to wipe that one trade clean.
 *
 * What it does, in order, atomically per account:
 *   1. Finds the most recently closed ChallengePosition on the account.
 *   2. Subtracts its net P&L (`position.profit`) from walletBalance,
 *      currentBalance, currentEquity, totalProfitLoss.
 *      `position.profit` already = realisedPnl - openCommission - closeCommission,
 *      i.e. the FULL net wallet impact of opening + closing this trade.
 *   3. Decrements totalTrades; if the trade was closed today (IST),
 *      decrements tradesToday and removes its bucket from dailyPnlMap.
 *   4. Resets DD watermarks (dayStartEquity / lowestEquityToday / DD %)
 *      anchored to the freshly reverted equity so the next tick can't
 *      re-fail the account on stale state.
 *   5. If status is FAILED or EXPIRED → flips back to ACTIVE (or FUNDED
 *      if the account was a funded one), clears failedAt/failReason,
 *      and removes all FAIL-severity violations.
 *   6. Deletes the position document.
 *
 * Phase advancement, funded-account spawning, payouts and uniqueTradingDays
 * are NOT reversed — those are out of scope for a "delete one bad trade"
 * action. If the account had passed a phase or been funded as a result of
 * this trade, run inspectAccount.js after and revert manually.
 *
 * Usage from server/ dir:
 *   node scripts/revertLastTrade.js <accountIdOrCode>
 *   node scripts/revertLastTrade.js <accountIdOrCode> --dry-run
 *   node scripts/revertLastTrade.js <accountIdOrCode> --position <positionId>
 *
 * Flags:
 *   --dry-run            report the planned changes, don't write
 *   --position <id>      target a specific positionId instead of the
 *                        most-recent closed one (e.g. the PK2TG suffix
 *                        you see on the Orders page — pass the full id)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ChallengeAccount = require('../models/ChallengeAccount');
const ChallengePosition = require('../models/ChallengePosition');

const inr = (v) =>
  `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function todayIstIso() {
  // YYYY-MM-DD in IST — same shape used by propTradingEngine.dailyPnlMap keys.
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist.toISOString().slice(0, 10);
}

function dateIstIso(d) {
  if (!d) return null;
  const ist = new Date(new Date(d).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist.toISOString().slice(0, 10);
}

async function main() {
  const args = process.argv.slice(2);
  const key = args.find((a) => !a.startsWith('--'));
  if (!key) {
    console.error(
      'Usage: node scripts/revertLastTrade.js <accountIdOrCode> [--dry-run] [--position <positionId>]'
    );
    process.exit(1);
  }
  const dryRun = args.includes('--dry-run');
  const posIdx = args.indexOf('--position');
  const targetPositionId = posIdx >= 0 ? args[posIdx + 1] : null;

  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  // Resolve account by accountId (CH164013) or _id.
  let acc = await ChallengeAccount.findOne({ accountId: key.toUpperCase() });
  if (!acc) {
    try {
      acc = await ChallengeAccount.findById(key);
    } catch (_) {
      /* invalid ObjectId — ignore */
    }
  }
  if (!acc) {
    console.error(`No account found: ${key}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // Resolve the position to revert.
  let pos = null;
  if (targetPositionId) {
    pos = await ChallengePosition.findOne({
      challengeAccountId: acc._id,
      positionId: targetPositionId,
      status: 'closed'
    });
    if (!pos) {
      console.error(
        `No closed position with positionId=${targetPositionId} on account ${acc.accountId}`
      );
      await mongoose.disconnect();
      process.exit(1);
    }
  } else {
    pos = await ChallengePosition.findOne({
      challengeAccountId: acc._id,
      status: 'closed'
    }).sort({ closeTime: -1 });
    if (!pos) {
      console.error(`No closed positions on account ${acc.accountId}`);
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  const netPnl = Number(pos.profit) || 0; // already net of open+close commission
  const closedDayIso = dateIstIso(pos.closeTime);
  const today = todayIstIso();
  const closedToday = closedDayIso === today;

  console.log('\n=== ACCOUNT (BEFORE) ===');
  console.log(`  ID:                   ${acc.accountId}  (${acc._id})`);
  console.log(`  Status:               ${acc.status}`);
  console.log(`  Failed at:            ${acc.failedAt?.toISOString() || '-'}`);
  console.log(`  Fail reason:          ${acc.failReason || '-'}`);
  console.log(`  Wallet balance:       ${inr(acc.walletBalance)}`);
  console.log(`  Current balance:      ${inr(acc.currentBalance)}`);
  console.log(`  Current equity:       ${inr(acc.currentEquity)}`);
  console.log(`  Total P&L:            ${inr(acc.totalProfitLoss)}`);
  console.log(`  Total trades:         ${acc.totalTrades}`);
  console.log(`  Trades today:         ${acc.tradesToday}`);
  console.log(`  Daily DD %:           ${Number(acc.currentDailyDrawdownPercent || 0).toFixed(2)}`);
  console.log(`  FAIL violations:      ${(acc.violations || []).filter((v) => v.severity === 'FAIL').length}`);

  console.log('\n=== POSITION TO REVERT ===');
  console.log(`  positionId:           ${pos.positionId}`);
  console.log(`  symbol:               ${pos.symbol}  ${pos.side?.toUpperCase()}  vol=${pos.volume}`);
  console.log(`  entry → close:        ${pos.entryPrice} → ${pos.closePrice}`);
  console.log(`  realised P&L:         ${inr(pos.realisedPnl)}`);
  console.log(`  open + close comm:    ${inr((Number(pos.openCommission) || 0) + (Number(pos.closeCommission) || 0))}`);
  console.log(`  net profit (booked):  ${inr(netPnl)}`);
  console.log(`  closed at:            ${pos.closeTime?.toISOString() || '-'}  (closed ${closedToday ? 'TODAY (IST)' : 'on a previous day'})`);

  // Compute reverted balances.
  const newWalletBalance = Number(acc.walletBalance || 0) - netPnl;
  const newCurrentBalance = Number(acc.currentBalance || 0) - netPnl;
  const newTotalPnl = Number(acc.totalProfitLoss || 0) - netPnl;
  const newTotalTrades = Math.max(0, Number(acc.totalTrades || 0) - 1);
  const newTradesToday = closedToday
    ? Math.max(0, Number(acc.tradesToday || 0) - 1)
    : Number(acc.tradesToday || 0);

  // Equity = balance + floating PnL of remaining open positions.
  const stillOpen = await ChallengePosition.find({
    challengeAccountId: acc._id,
    status: 'open'
  });
  const floatingPnl = stillOpen.reduce((s, p) => s + (Number(p.profit) || 0), 0);
  const margin = stillOpen.reduce((s, p) => s + (Number(p.marginUsed) || 0), 0);
  const newEquity = newWalletBalance + Number(acc.walletCredit || 0) + floatingPnl;

  // Status flip if currently failed/expired.
  const wasDead = ['FAILED', 'EXPIRED'].includes(acc.status);
  const newStatus = wasDead
    ? acc.accountType === 'FUNDED'
      ? 'FUNDED'
      : 'ACTIVE'
    : acc.status;

  console.log('\n=== CHANGES TO APPLY ===');
  console.log(`  Wallet balance:       ${inr(acc.walletBalance)} → ${inr(newWalletBalance)}   (Δ ${inr(-netPnl)})`);
  console.log(`  Current balance:      ${inr(acc.currentBalance)} → ${inr(newCurrentBalance)}`);
  console.log(`  Current equity:       ${inr(acc.currentEquity)} → ${inr(newEquity)}`);
  console.log(`  Total P&L:            ${inr(acc.totalProfitLoss)} → ${inr(newTotalPnl)}`);
  console.log(`  Total trades:         ${acc.totalTrades} → ${newTotalTrades}`);
  console.log(`  Trades today:         ${acc.tradesToday} → ${newTradesToday}${closedToday ? '' : ' (unchanged — not closed today)'}`);
  console.log(`  Daily DD reset:       dayStart=${inr(newEquity)}, lowestToday=${inr(newEquity)}, DD%=0`);
  if (wasDead) {
    console.log(`  Status:               ${acc.status} → ${newStatus}`);
    console.log(`  failedAt:             clear`);
    console.log(`  failReason:           clear`);
    console.log(`  FAIL violations:      remove all`);
  } else {
    console.log(`  Status:               ${acc.status} (unchanged — not failed)`);
  }
  console.log(`  Position ${pos.positionId}: DELETE`);

  if (dryRun) {
    console.log('\n⚠  --dry-run set — no changes written.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // ----- Apply -----
  acc.walletBalance = newWalletBalance;
  acc.currentBalance = newCurrentBalance;
  acc.currentEquity = newEquity;
  acc.walletEquity = newEquity;
  acc.walletMargin = margin;
  acc.walletFreeMargin = Math.max(0, newEquity - margin);
  acc.walletMarginLevel = margin > 0 ? (newEquity / margin) * 100 : 0;
  acc.totalProfitLoss = newTotalPnl;
  acc.totalTrades = newTotalTrades;
  if (closedToday) acc.tradesToday = newTradesToday;

  // Subtract this trade's P&L from the day's bucket in dailyPnlMap.
  if (closedDayIso) {
    if (!(acc.dailyPnlMap instanceof Map)) {
      acc.dailyPnlMap = new Map(Object.entries(acc.dailyPnlMap || {}));
    }
    const prev = Number(acc.dailyPnlMap.get(closedDayIso) || 0);
    const next = prev - netPnl;
    if (Math.abs(next) < 0.005) acc.dailyPnlMap.delete(closedDayIso);
    else acc.dailyPnlMap.set(closedDayIso, next);
    acc.markModified('dailyPnlMap');
  }

  // DD reset anchored to the new equity so the next tick can't re-fail.
  acc.dayStartEquity = newEquity;
  acc.lowestEquityToday = newEquity;
  if (newEquity > Number(acc.lowestEquityOverall || 0)) {
    acc.lowestEquityOverall = newEquity;
  }
  acc.currentDailyDrawdownPercent = 0;
  // Recompute overall DD from initialBalance just in case.
  const initial = Number(acc.initialBalance || 0);
  if (initial > 0) {
    const overallDd = ((initial - Math.min(initial, newEquity)) / initial) * 100;
    acc.currentOverallDrawdownPercent = Math.max(0, overallDd);
  }

  if (wasDead) {
    acc.status = newStatus;
    acc.failedAt = null;
    acc.failReason = '';
    acc.expiredAt = null;
    if (Array.isArray(acc.violations)) {
      acc.violations = acc.violations.filter((v) => v.severity !== 'FAIL');
    }
  }

  await acc.save();
  await ChallengePosition.deleteOne({ _id: pos._id });

  console.log('\n=== AFTER ===');
  const fresh = await ChallengeAccount.findById(acc._id);
  console.log(`  Status:               ${fresh.status}`);
  console.log(`  Wallet balance:       ${inr(fresh.walletBalance)}`);
  console.log(`  Current equity:       ${inr(fresh.currentEquity)}`);
  console.log(`  Total trades:         ${fresh.totalTrades}`);
  console.log(`  Daily DD %:           ${Number(fresh.currentDailyDrawdownPercent || 0).toFixed(2)}`);
  console.log(`  FAIL violations:      ${(fresh.violations || []).filter((v) => v.severity === 'FAIL').length}`);
  console.log(`\n✅ Trade ${pos.positionId} reverted${wasDead ? ' and account reactivated' : ''}.`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('revertLastTrade error:', err);
  process.exit(1);
});
