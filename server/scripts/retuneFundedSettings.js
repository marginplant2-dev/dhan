#!/usr/bin/env node
/**
 * One-time migration to align all existing challenges + funded accounts
 * with the new payout rules:
 *
 *   profitSplitPercent          80 → 100      (user keeps full profit)
 *   maxWithdrawalPercent         8 →   5      (5% cap per 14-day cycle)
 *   minProfitPercentForPayout    8 →   5      (5% target before payout)
 *
 * The other rules (14-day cooldown, 30-day life, 5 min trading days,
 * 30% consistency, 4%/10% DD) stay at their current defaults; admin can
 * still override per-challenge from the Prop Trading admin page.
 *
 * What this script does:
 *   1. For every Challenge: overwrite the 3 changing fundedSettings
 *      values to the new defaults. Other fundedSettings fields are left
 *      alone in case an admin already customised them.
 *   2. For every existing ACTIVE / FUNDED ChallengeAccount: bump
 *      profitSplitPercent to 100 so old funded accounts also get the
 *      full 5% payout. (FAILED / EXPIRED / PASSED / CANCELLED untouched.)
 *
 * Usage from server/ directory:
 *   node scripts/retuneFundedSettings.js --dry-run   # report only
 *   node scripts/retuneFundedSettings.js             # apply changes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Challenge = require('../models/Challenge');
const ChallengeAccount = require('../models/ChallengeAccount');

const DRY_RUN = process.argv.includes('--dry-run');

const NEW_DEFAULTS = {
  profitSplitPercent: 100,
  maxWithdrawalPercent: 5,
  minProfitPercentForPayout: 5
};

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('Missing MONGODB_URI in env');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log('[retune] connected', DRY_RUN ? '(DRY RUN — no writes)' : '');

  // 1) Challenges
  const challenges = await Challenge.find({});
  console.log(`[retune] found ${challenges.length} challenge(s)`);
  let chUpdated = 0;
  for (const ch of challenges) {
    const before = {
      profitSplitPercent: ch.fundedSettings?.profitSplitPercent,
      maxWithdrawalPercent: ch.fundedSettings?.maxWithdrawalPercent,
      minProfitPercentForPayout: ch.fundedSettings?.minProfitPercentForPayout
    };
    const changes = [];
    if (before.profitSplitPercent !== NEW_DEFAULTS.profitSplitPercent) {
      changes.push(`split ${before.profitSplitPercent}→${NEW_DEFAULTS.profitSplitPercent}`);
    }
    if (before.maxWithdrawalPercent !== NEW_DEFAULTS.maxWithdrawalPercent) {
      changes.push(`cap ${before.maxWithdrawalPercent}→${NEW_DEFAULTS.maxWithdrawalPercent}%`);
    }
    if (before.minProfitPercentForPayout !== NEW_DEFAULTS.minProfitPercentForPayout) {
      changes.push(`minProfit ${before.minProfitPercentForPayout}→${NEW_DEFAULTS.minProfitPercentForPayout}%`);
    }
    if (changes.length === 0) {
      console.log(`  - ${ch.name || ch._id}: already aligned`);
      continue;
    }
    console.log(`  - ${ch.name || ch._id}: ${changes.join(', ')}`);
    if (!DRY_RUN) {
      ch.fundedSettings = {
        ...(ch.fundedSettings || {}),
        ...NEW_DEFAULTS
      };
      await ch.save();
    }
    chUpdated++;
  }

  // 2) Funded accounts — bump profitSplitPercent to 100 on every active
  //    FUNDED account so old accounts also get the full payout.
  const accountFilter = { status: { $in: ['FUNDED'] }, profitSplitPercent: { $ne: 100 } };
  const accountCount = await ChallengeAccount.countDocuments(accountFilter);
  console.log(`[retune] found ${accountCount} FUNDED account(s) with split != 100`);
  let accUpdated = 0;
  if (accountCount > 0 && !DRY_RUN) {
    const res = await ChallengeAccount.updateMany(
      accountFilter,
      { $set: { profitSplitPercent: 100 } }
    );
    accUpdated = res.modifiedCount;
  } else if (DRY_RUN) {
    accUpdated = accountCount;
  }

  console.log(`[retune] done — ${chUpdated} challenge(s) updated, ${accUpdated} funded account(s) updated${DRY_RUN ? ' (DRY RUN)' : ''}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[retune] error:', err);
  process.exit(1);
});
