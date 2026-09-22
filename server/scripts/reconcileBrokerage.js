/**
 * reconcileBrokerage.js
 *
 * Walks all closed ChallengePosition documents for a given challenge
 * account (or every account when --all is passed) and rebuilds
 * walletBalance from scratch as:
 *
 *   walletBalance = initialBalance
 *                 + Σ position.profit (across closed trades)
 *                 - Σ open-commission of currently open positions
 *
 * The `position.profit` field is treated as the source of truth for
 * per-trade net P&L (challengePropEngine.service.js sets it to
 * `realisedPnl - openComm - closeComm`). Currently open positions had
 * their open commission debited at trade-open time and must continue to
 * be reflected as a wallet deduction until the position closes.
 *
 * Why this script exists: some legacy trades were closed by code paths
 * that didn't deduct brokerage from the wallet correctly. Running this
 * reconciler restores the invariant so the Balance / Equity tiles, the
 * insights API, and the Objectives panel all agree on a brokerage-net
 * total P&L.
 *
 * Usage:
 *   node scripts/reconcileBrokerage.js --account CH164013
 *   node scripts/reconcileBrokerage.js --all
 *   node scripts/reconcileBrokerage.js --account CH164013 --dry-run
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ChallengeAccount = require('../models/ChallengeAccount');
const ChallengePosition = require('../models/ChallengePosition');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const ALL = argv.includes('--all');
const accIdx = argv.indexOf('--account');
const ONLY_ACCOUNT = accIdx >= 0 ? argv[accIdx + 1] : null;

if (!ALL && !ONLY_ACCOUNT) {
  console.error('Usage: node reconcileBrokerage.js --account <accountId> | --all  [--dry-run]');
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('✓ Connected to MongoDB');
  if (DRY_RUN) console.log('(dry-run mode — no writes will be performed)');

  const query = ONLY_ACCOUNT ? { accountId: ONLY_ACCOUNT } : {};
  const accounts = await ChallengeAccount.find(query);
  console.log(`Found ${accounts.length} account(s) to reconcile.`);

  let updated = 0;
  let skipped = 0;

  for (const acc of accounts) {
    const initial = Number(acc.initialBalance) || 0;
    const [closed, open] = await Promise.all([
      ChallengePosition.find({ challengeAccountId: acc._id, status: 'closed' }).lean(),
      ChallengePosition.find({ challengeAccountId: acc._id, status: 'open' }).lean()
    ]);

    const sumProfit = closed.reduce((s, p) => s + (Number(p.profit) || 0), 0);
    const sumOpenCommOfOpen = open.reduce((s, p) => s + (Number(p.openCommission) || 0), 0);
    const sumOpenCommissionInrOfOpen = open.reduce(
      (s, p) => s + (Number(p.openCommissionInr) || 0), 0
    );
    // Prefer the INR field if it's been populated; fall back to legacy
    // `openCommission` when only that exists.
    const openOpenComm = sumOpenCommissionInrOfOpen || sumOpenCommOfOpen;

    const floating = open.reduce((s, p) => s + (Number(p.profit) || 0), 0);
    const margin = open.reduce((s, p) => s + (Number(p.marginUsed) || 0), 0);

    const newBalance = Number((initial + sumProfit - openOpenComm).toFixed(2));
    const newEquity = Number((newBalance + floating).toFixed(2));
    const newFreeMargin = Number((newEquity - margin).toFixed(2));

    const before = {
      walletBalance: Number(acc.walletBalance) || 0,
      walletEquity: Number(acc.walletEquity) || 0,
      currentBalance: Number(acc.currentBalance) || 0,
      currentEquity: Number(acc.currentEquity) || 0
    };

    const drift = Number((before.walletBalance - newBalance).toFixed(2));

    console.log(
      `  ${acc.accountId} → balance ${before.walletBalance.toFixed(2)} → ${newBalance.toFixed(2)} ` +
      `(drift ${drift >= 0 ? '+' : ''}${drift.toFixed(2)})  ` +
      `[${closed.length} closed, ${open.length} open, ΣP&L ${sumProfit.toFixed(2)}, ` +
      `openComm-of-open ${openOpenComm.toFixed(2)}]`
    );

    if (Math.abs(drift) < 0.01) {
      skipped += 1;
      continue;
    }

    if (!DRY_RUN) {
      acc.walletBalance = newBalance;
      acc.walletEquity = newEquity;
      acc.walletMargin = margin;
      acc.walletFreeMargin = newFreeMargin;
      acc.currentBalance = newBalance;
      acc.currentEquity = newEquity;
      // Refresh derived profit % for the current phase too, so the
      // Objectives panel doesn't read a stale value on next render.
      const phaseStart = Number(acc.phaseStartBalance) || initial;
      if (phaseStart > 0) {
        acc.currentProfitPercent = Number(
          (((newEquity - phaseStart) / phaseStart) * 100).toFixed(4)
        );
      }
      acc.totalProfitLoss = Number((newEquity - initial).toFixed(2));
      await acc.save();
    }
    updated += 1;
  }

  console.log('');
  console.log(`Accounts updated: ${updated}`);
  console.log(`Accounts skipped (already in sync): ${skipped}`);
  console.log('✓ Done');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('reconcileBrokerage failed:', err);
  process.exit(1);
});
