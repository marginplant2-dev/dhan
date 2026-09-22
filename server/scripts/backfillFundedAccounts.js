#!/usr/bin/env node
/**
 * One-time backfill for pre-existing FUNDED challenge accounts.
 *
 * Before the Real Prop-Firm Funded Phase change, FUNDED accounts were
 * created with:
 *   - fundedAt = (not set — field didn't exist)
 *   - expiresAt = createdAt + 1 year
 *
 * The new flow needs:
 *   - fundedAt = createdAt (anchor for the 14-day payout window)
 *   - expiresAt = createdAt + N days (where N comes from fundedSettings.accountLifetimeDays, default 30)
 *
 * If the new expiresAt is already in the past, status is flipped to EXPIRED.
 *
 * Usage (from server/ dir):
 *   node scripts/backfillFundedAccounts.js
 *   node scripts/backfillFundedAccounts.js --dry-run   # report only, no writes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ChallengeAccount = require('../models/ChallengeAccount');
const Challenge = require('../models/Challenge');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('Missing MONGODB_URI in env');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log('[backfill] connected', DRY_RUN ? '(DRY RUN — no writes)' : '');

  const now = new Date();
  const accounts = await ChallengeAccount.find({
    accountType: 'FUNDED',
    $or: [{ fundedAt: null }, { fundedAt: { $exists: false } }]
  });

  console.log(`[backfill] found ${accounts.length} FUNDED account(s) missing fundedAt`);

  let updated = 0;
  let expired = 0;

  for (const a of accounts) {
    const challenge = await Challenge.findById(a.challengeId).select('fundedSettings.accountLifetimeDays').lean();
    const lifetimeDays = Number(challenge?.fundedSettings?.accountLifetimeDays) > 0
      ? Number(challenge.fundedSettings.accountLifetimeDays)
      : 30;

    const createdAt = a.createdAt || new Date(now.getTime() - lifetimeDays * 86400000);
    const newExpiresAt = new Date(createdAt.getTime() + lifetimeDays * 86400000);
    const shouldExpire = newExpiresAt < now;

    console.log(`  - ${a.accountId}: fundedAt=${createdAt.toISOString().slice(0, 10)}, expiresAt=${newExpiresAt.toISOString().slice(0, 10)}${shouldExpire ? ' → EXPIRED' : ''}`);

    if (!DRY_RUN) {
      a.fundedAt = createdAt;
      a.expiresAt = newExpiresAt;
      if (a.payoutCount == null) a.payoutCount = 0;
      if (shouldExpire && a.status === 'FUNDED') {
        a.status = 'EXPIRED';
        a.expiredAt = now;
        expired++;
      }
      await a.save();
    } else if (shouldExpire) {
      expired++;
    }
    updated++;
  }

  console.log(`[backfill] done — ${updated} account(s) backfilled, ${expired} marked EXPIRED${DRY_RUN ? ' (DRY RUN)' : ''}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[backfill] error:', err);
  process.exit(1);
});
