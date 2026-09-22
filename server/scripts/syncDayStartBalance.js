#!/usr/bin/env node
/**
 * One-time backfill for ChallengeAccount.dayStartBalance.
 *
 * Context:
 *   Daily DD anchor was moved from dayStartEquity → dayStartBalance in
 *   commit b41af2f. Existing accounts have NEVER had dayStartBalance set
 *   (it's a new field). The model + display fall back to dayStartEquity
 *   when dayStartBalance is null, but on accounts where dayStartEquity
 *   captured floating P&L overnight, the fallback still shows a phantom
 *   daily loss in the Objectives panel and breach math.
 *
 * What this script does:
 *   - For every ACTIVE / FUNDED account, set dayStartBalance = walletBalance
 *     (current balance, no floating). This represents what dayStartBalance
 *     would have been if the next 00:05 IST cron had already run.
 *   - Also resets lowestEquityToday to currentEquity so the engine's
 *     watermark agrees with the new starting reference.
 *   - Recomputes currentDailyDrawdownPercent (will be 0 immediately after).
 *
 * Safe to run multiple times. By default only updates accounts where
 *   dayStartBalance is missing OR clearly stale (i.e. drifted from
 *   walletBalance by > 1 rupee).
 *
 * Usage:
 *   node scripts/syncDayStartBalance.js              # dry-run
 *   node scripts/syncDayStartBalance.js --apply      # persist
 *   node scripts/syncDayStartBalance.js CH802344 --apply   # one account
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ChallengeAccount = require('../models/ChallengeAccount');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const filterId = args.find(a => !a.startsWith('--')) || null;

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('Connected to MongoDB');
  console.log(`Mode: ${APPLY ? 'APPLY (writes)' : 'DRY-RUN (no writes)'}`);
  if (filterId) console.log(`Filter: ${filterId}`);
  console.log('');

  const q = {
    status: { $in: ['ACTIVE', 'FUNDED'] },
    accountType: { $ne: 'DEMO' }
  };
  if (filterId) q.accountId = filterId;
  const accounts = await ChallengeAccount.find(q);
  console.log(`Scanning ${accounts.length} accounts...\n`);

  let touched = 0;
  for (const acc of accounts) {
    const wallet = Number(acc.walletBalance);
    const equity = Number(acc.currentEquity) || wallet;
    const dsbCurrent = acc.dayStartBalance == null ? null : Number(acc.dayStartBalance);
    const dseCurrent = acc.dayStartEquity == null ? null : Number(acc.dayStartEquity);

    // Only fix the cases that actively cause a PHANTOM LOSS in display /
    // breach math. Skip accounts where dayStart < wallet — that just means
    // the trader has gained ₹X today, and lowering dayStart to current
    // wallet would erase the gain (and on the next dip create a phantom
    // loss against the freshly-bumped reference).
    //
    // Also skip FUNDED accounts whose wallet balance is below dayStart by a
    // large amount (post-payout / reactivation oddities) — those need a
    // human eye, not an automated sync.
    const isMissing = dsbCurrent == null;
    const isPhantomLoss = dsbCurrent != null && (dsbCurrent - wallet) > 1;
    // Heuristic: drift > ₹10,000 on a FUNDED account is almost certainly a
    // post-payout state, not a stale snapshot bug. Surface but don't touch.
    const looksManualReview = acc.status === 'FUNDED' && Math.abs(wallet - dsbCurrent) > 10000;

    if (looksManualReview) {
      console.log(`${acc.accountId}  status=${acc.status}  ⚠️ MANUAL REVIEW`);
      console.log(`  Wallet:                ${inr(wallet)}`);
      console.log(`  Day-start balance:     ${inr(dsbCurrent)}`);
      console.log(`  → skip (drift too large for safe auto-sync — likely post-payout)\n`);
      continue;
    }
    if (!isMissing && !isPhantomLoss) continue;

    console.log(`${acc.accountId}  status=${acc.status}`);
    console.log(`  Wallet balance:        ${inr(wallet)}`);
    console.log(`  Current equity:        ${inr(equity)}`);
    console.log(`  Day-start balance:     ${dsbCurrent == null ? '(null)' : inr(dsbCurrent)}`);
    console.log(`  Day-start equity:      ${dseCurrent == null ? '(null)' : inr(dseCurrent)}`);
    const reasons = [];
    if (isMissing) reasons.push('dayStartBalance NULL');
    if (isPhantomLoss) reasons.push(`phantom loss (dayStart ₹${dsbCurrent} > wallet — drift ${inr(dsbCurrent - wallet)})`);
    console.log(`  Reason:                ${reasons.join(', ')}`);
    console.log(`  → sync dayStartBalance & dayStartEquity to ${inr(wallet)}`);

    if (APPLY) {
      acc.dayStartBalance = wallet;
      acc.dayStartEquity = wallet;
      acc.lowestEquityToday = equity;
      acc.currentDailyDrawdownPercent = 0;
      await acc.save();
      touched += 1;
      console.log(`  ✓ Saved`);
    }
    console.log('');
  }

  console.log(`\nDone. ${APPLY ? `Updated ${touched} accounts.` : 'Dry run — pass --apply to persist.'}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
