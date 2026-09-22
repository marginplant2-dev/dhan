#!/usr/bin/env node
/**
 * Scan all FAILED ChallengeAccounts and flag the ones whose REALIZED loss
 * is actually under the configured Daily DD / Overall DD limit. These are
 * "false failures" — the engine watermark fired on a floating intraday
 * dip, but the auto-close (pre-markPriceMap fix) closed at a recovered
 * price, leaving realised loss noticeably below the breach amount.
 *
 * Usage:
 *   node scripts/findFalseFailures.js              # dry-run (default)
 *   node scripts/findFalseFailures.js --apply      # reactivate all detected
 *   node scripts/findFalseFailures.js --csv        # dump as CSV
 *
 * What counts as a false failure:
 *   - Account status = FAILED
 *   - Fail reason mentions 'drawdown' (daily OR overall)
 *   - Realized loss = (initialBalance − walletBalance)
 *     AND today's realised loss = (sum of positive entries in dailyPnlMap
 *     for the failure day) are both LESS than the configured limit
 *
 * Safe by default — without --apply nothing is mutated.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ChallengeAccount = require('../models/ChallengeAccount');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const CSV = args.includes('--csv');

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function dayKey(d) {
  if (!d) return null;
  const ist = new Date(new Date(d).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist.toISOString().slice(0, 10);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  if (!CSV) {
    console.log('Connected to MongoDB');
    console.log(`Mode: ${APPLY ? 'APPLY (writes)' : 'DRY-RUN (no writes)'}`);
    console.log('');
  }

  const accounts = await ChallengeAccount.find({
    status: 'FAILED',
    accountType: { $ne: 'DEMO' }
  }).populate('challengeId');

  if (CSV) {
    console.log('accountId,user,failReason,initial,wallet,realisedLoss,realisedLossPct,dailyDDlimit%,overallDDlimit%,verdict');
  }

  const candidates = [];
  for (const acc of accounts) {
    const failReason = String(acc.failReason || '').toLowerCase();
    if (!failReason.includes('drawdown')) continue;

    const ch = acc.challengeId || {};
    const rules = ch.rules || {};
    const initial = Number(acc.initialBalance) || 0;
    if (initial <= 0) continue;

    const wallet = Number(acc.walletBalance) || Number(acc.currentBalance) || 0;
    const realisedLoss = Math.max(0, initial - wallet);
    const realisedPct = (realisedLoss / initial) * 100;

    const dailyLimit = Number(rules.maxDailyDrawdownPercent) || 0;
    const overallLimit = Number(rules.maxOverallDrawdownPercent) || 0;

    // Today's (= failure day's) realised P&L from dailyPnlMap
    const failDayKey = dayKey(acc.failedAt) || dayKey(new Date());
    const dailyMap = acc.dailyPnlMap instanceof Map
      ? acc.dailyPnlMap
      : new Map(Object.entries(acc.dailyPnlMap || {}));
    const failDayPnl = Number(dailyMap.get(failDayKey) || 0);
    const failDayLoss = Math.max(0, -failDayPnl);
    const failDayLossPct = (failDayLoss / initial) * 100;

    // False failure?
    //   - Daily DD reason: failDayLossPct < dailyLimit
    //   - Overall DD reason: realisedPct < overallLimit
    const isDaily = failReason.includes('daily');
    const isOverall = failReason.includes('overall');
    let isFalse = false;
    let verdict = '';
    if (isDaily && dailyLimit > 0 && failDayLossPct < dailyLimit) {
      isFalse = true;
      verdict = `FALSE — realised daily loss ${failDayLossPct.toFixed(2)}% < limit ${dailyLimit}%`;
    } else if (isOverall && overallLimit > 0 && realisedPct < overallLimit) {
      isFalse = true;
      verdict = `FALSE — realised overall loss ${realisedPct.toFixed(2)}% < limit ${overallLimit}%`;
    } else {
      verdict = `LEGIT — realised loss meets/exceeds limit`;
    }

    if (CSV) {
      const userName = acc.userId ? String(acc.userId) : '';
      console.log(`${acc.accountId},${userName},"${acc.failReason}",${initial},${wallet},${realisedLoss},${realisedPct.toFixed(2)},${dailyLimit},${overallLimit},"${verdict}"`);
      if (isFalse) candidates.push(acc);
      continue;
    }

    console.log(`${acc.accountId}  status=${acc.status}  reason="${acc.failReason}"`);
    console.log(`  Initial:           ${inr(initial)}`);
    console.log(`  Wallet:            ${inr(wallet)}`);
    console.log(`  Realised loss:     ${inr(realisedLoss)}  (${realisedPct.toFixed(2)}%)`);
    if (isDaily) {
      console.log(`  Daily DD limit:    ${dailyLimit}%  =  ${inr((dailyLimit / 100) * initial)}`);
      console.log(`  Fail-day loss:     ${inr(failDayLoss)}  (${failDayLossPct.toFixed(2)}%)`);
    }
    if (isOverall) {
      console.log(`  Overall DD limit:  ${overallLimit}%  =  ${inr((overallLimit / 100) * initial)}`);
    }
    console.log(`  Verdict:           ${verdict}`);

    if (isFalse) {
      candidates.push(acc);
      if (APPLY) {
        // Inline reactivate logic mirroring scripts/reactivateAccount.js
        // so we don't shell out per-account. Resets DD watermarks to
        // current equity, clears FAIL violations, flips status to ACTIVE.
        const newEquity = Number(acc.currentEquity) || wallet;
        acc.status = 'ACTIVE';
        acc.failedAt = null;
        acc.failReason = null;
        if (acc.expiredAt) acc.expiredAt = null;
        acc.violations = (acc.violations || []).filter(v => v.severity !== 'FAIL');
        acc.lowestEquityToday = newEquity;
        acc.lowestEquityOverall = newEquity;
        acc.dayStartEquity = newEquity;
        acc.dayStartBalance = wallet;
        acc.currentDailyDrawdownPercent = 0;
        acc.currentOverallDrawdownPercent = 0;
        acc.maxDailyDrawdownHit = 0;
        await acc.save();
        console.log(`  ✓ Reactivated`);
      } else {
        console.log(`  → Would reactivate (pass --apply)`);
      }
    }
    console.log('');
  }

  if (!CSV) {
    console.log(`\nScanned ${accounts.length} FAILED accounts.`);
    console.log(`False failures detected: ${candidates.length}`);
    if (APPLY) {
      console.log(`Reactivated: ${candidates.length}`);
    } else if (candidates.length > 0) {
      console.log(`Re-run with --apply to reactivate all ${candidates.length}.`);
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
