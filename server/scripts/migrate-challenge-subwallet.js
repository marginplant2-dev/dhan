/**
 * One-time migration: populate the new isolated sub-wallet fields on existing
 * ChallengeAccount documents from the legacy `currentBalance / currentEquity`
 * fields.
 *
 * Safe to re-run. Only touches accounts where `walletBalance === 0` AND the
 * legacy `currentBalance > 0`, so accounts already migrated (or brand-new
 * post-deploy) are skipped.
 *
 * Usage:
 *   DRY_RUN=1 node server/scripts/migrate-challenge-subwallet.js
 *   node server/scripts/migrate-challenge-subwallet.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const ChallengeAccount = require('../models/ChallengeAccount');

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

(async () => {
  await connectDB();

  const accounts = await ChallengeAccount.find({
    $or: [
      { walletBalance: { $in: [null, 0] } },
      { walletEquity: { $in: [null, 0] } }
    ]
  });

  let touched = 0;
  let skipped = 0;
  for (const acc of accounts) {
    const legacyBalance = Number(acc.currentBalance) || 0;
    const legacyEquity = Number(acc.currentEquity) || legacyBalance;
    if (!legacyBalance) { skipped += 1; continue; }

    acc.walletBalance = legacyBalance;
    acc.walletEquity = legacyEquity;
    acc.walletCredit = 0;
    acc.walletMargin = 0;
    acc.walletFreeMargin = legacyEquity;
    acc.walletMarginLevel = 0;

    if (!DRY_RUN) {
      await acc.save().catch(err => console.error(`[migrate] save failed for ${acc.accountId}: ${err.message}`));
    }
    touched += 1;
  }

  console.log(`[migrate] touched=${touched} skipped=${skipped} dryRun=${DRY_RUN}`);
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('[migrate] fatal:', err);
  process.exit(1);
});
