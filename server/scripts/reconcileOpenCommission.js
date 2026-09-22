#!/usr/bin/env node
/**
 * One-shot reconciliation for the openCommission balance-leak bug.
 *
 * Bug (now fixed in challengePropEngine.service.js openPosition):
 *   At open, walletBalance was debited in-memory then onTradeOpened()
 *   re-fetched the account from DB and saved it — overwriting and
 *   losing the debit. Closed positions still stored position.openCommission
 *   correctly, so Today's PnL (sum of position.profit) included the
 *   openCommission deduction even though balance never did.
 *
 * Effect: balance ends up ₹(sum of openCommissions across all positions)
 *   higher than it should be. User sees Today's PnL of -₹714.75 but
 *   balance only dropped ₹594.75.
 *
 * This script:
 *   1. For each ChallengeAccount, sums position.openCommission across
 *      ALL its positions (open + closed) ever.
 *   2. Sums the balance contribution that SHOULD have happened: realisedPnl
 *      for closed positions, 0 for open (floating doesn't hit balance).
 *   3. Compares actual walletBalance vs expected balance.
 *   4. If actual > expected by approximately Σ openCommission of trades
 *      that were never debited, reduces walletBalance by the missing amount.
 *
 * Run with: node scripts/reconcileOpenCommission.js [--apply]
 *   Without --apply: dry run, prints what would change.
 *   With --apply:    persists changes.
 *
 * Specific account: node scripts/reconcileOpenCommission.js CH669388 --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ChallengeAccount = require('../models/ChallengeAccount');
const ChallengePosition = require('../models/ChallengePosition');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const accountIdFilter = args.find(a => !a.startsWith('--')) || null;

const inr = (n) => `₹${Number(n || 0).toFixed(2)}`;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('Connected to MongoDB');
  console.log(`Mode: ${APPLY ? 'APPLY (writes)' : 'DRY-RUN (no writes)'}`);
  if (accountIdFilter) console.log(`Filter: accountId = ${accountIdFilter}`);
  console.log('');

  const query = { accountType: { $ne: 'DEMO' } };
  if (accountIdFilter) query.accountId = accountIdFilter;
  const accounts = await ChallengeAccount.find(query);
  console.log(`Scanning ${accounts.length} accounts...\n`);

  let fixed = 0;
  let totalRecovered = 0;

  for (const acc of accounts) {
    const positions = await ChallengePosition.find({ challengeAccountId: acc._id });
    if (positions.length === 0) continue;

    const sumOpenCommAll = positions.reduce((s, p) => s + (Number(p.openCommission) || 0), 0);
    const sumOpenCommClosed = positions
      .filter(p => p.status === 'closed')
      .reduce((s, p) => s + (Number(p.openCommission) || 0), 0);
    const sumOpenCommOpen = positions
      .filter(p => p.status === 'open')
      .reduce((s, p) => s + (Number(p.openCommission) || 0), 0);
    const sumCloseComm = positions
      .filter(p => p.status === 'closed')
      .reduce((s, p) => s + (Number(p.closeCommission) || 0), 0);
    const sumRealised = positions
      .filter(p => p.status === 'closed')
      .reduce((s, p) => s + (Number(p.realisedPnl) || 0), 0);
    const sumProfitClosed = positions
      .filter(p => p.status === 'closed')
      .reduce((s, p) => s + (Number(p.profit) || 0), 0);

    const initial = Number(acc.phaseStartBalance) || Number(acc.initialBalance) || 0;
    // Expected balance = initial + Σ profit(closed) − Σ openCommission(open positions still locked)
    // Rationale:
    //   - For closed trades, position.profit already = realisedPnl − openComm − closeComm
    //     so summing profit gives the net balance change those trades should have produced.
    //   - For OPEN positions, openCommission was supposed to be debited at open (still pending).
    // Legacy trades may have realisedPnl=0 (field added later) but profit is always populated,
    // so we trust profit as ground truth instead of recomputing from realisedPnl.
    const expectedBalance = initial + sumProfitClosed - sumOpenCommOpen;
    const actualBalance = Number(acc.walletBalance);
    const drift = actualBalance - expectedBalance;

    if (Math.abs(drift) < 0.5) continue;

    console.log(`${acc.accountId}  (${acc.status})`);
    console.log(`  Initial:                ${inr(initial)}`);
    console.log(`  Σ profit(closed):       ${inr(sumProfitClosed)}`);
    console.log(`  Σ openComm(open pos):   ${inr(sumOpenCommOpen)}`);
    console.log(`  Σ openComm(all pos):    ${inr(sumOpenCommAll)}`);
    console.log(`  Σ closeCommission:      ${inr(sumCloseComm)}`);
    console.log(`  Σ realisedPnl (legacy): ${inr(sumRealised)}`);
    console.log(`  Expected balance:       ${inr(expectedBalance)}`);
    console.log(`  Actual balance:         ${inr(actualBalance)}`);
    console.log(`  Drift:                  ${inr(drift)}  ${drift > 0 ? '(balance OVER — missing openComm debits)' : '(balance UNDER)'}`);

    // Drift ≈ Σ openCommission(closed) means the bug ate commission debits on
    // ALL closed trades. Drift ≈ Σ openCommission(all) means it ate debits on
    // both closed and currently-open trades. Either way, the recovery amount
    // equals the drift itself (we just deduct it from the bloated balance).
    const matchesClosedOpenComm = Math.abs(drift - sumOpenCommClosed) < 1;
    const matchesAllOpenComm = Math.abs(drift - sumOpenCommAll) < 1;

    if (drift > 0 && (matchesClosedOpenComm || matchesAllOpenComm)) {
      const matchLabel = matchesAllOpenComm ? 'Σ openCommission(all)' : 'Σ openCommission(closed)';
      console.log(`  → Drift ≈ ${matchLabel}. Reducing walletBalance by ${inr(drift)}`);
      if (APPLY) {
        acc.walletBalance = Number((actualBalance - drift).toFixed(2));
        acc.currentBalance = acc.walletBalance;
        acc.currentEquity = acc.walletBalance;
        await acc.save();
        fixed += 1;
        totalRecovered += drift;
        console.log(`  ✓ Saved. New balance: ${inr(acc.walletBalance)}`);
      } else {
        console.log(`  (dry-run — pass --apply to persist)`);
      }
    } else {
      console.log(`  ! Drift does not cleanly match openCommission sums — manual investigation needed.`);
      console.log(`    drift − Σ openComm(closed) = ${inr(drift - sumOpenCommClosed)}`);
      console.log(`    drift − Σ openComm(all)    = ${inr(drift - sumOpenCommAll)}`);
    }
    console.log('');
  }

  console.log(`\nDone. ${APPLY ? `Fixed ${fixed} accounts, total ${inr(totalRecovered)} recovered.` : 'Dry run — no changes made.'}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
