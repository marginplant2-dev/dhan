#!/usr/bin/env node
/**
 * Force the payout cooldown to 14 days on every challenge.
 *
 * `fundedSettings.withdrawalFrequencyDays` drives two things — the "Payout
 * Cycle" line on the public pricing card and the real cooldown check in
 * propTradingEngine.withdrawProfit() — so a challenge saved with 5 shows
 * "Every 5 days" on the site and lets users withdraw twice as often as
 * intended. The schema default is already 14; this aligns the documents an
 * admin saved with a different value.
 *
 * Usage from server/ directory:
 *   node scripts/setPayoutCycle14.js --dry-run   # report only
 *   node scripts/setPayoutCycle14.js             # apply changes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Challenge = require('../models/Challenge');

const DRY_RUN = process.argv.includes('--dry-run');
const PAYOUT_CYCLE_DAYS = 14;

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('Missing MONGODB_URI in env');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log('[payout-cycle] connected', DRY_RUN ? '(DRY RUN — no writes)' : '');

  const challenges = await Challenge.find({});
  console.log(`[payout-cycle] found ${challenges.length} challenge(s)`);

  let updated = 0;
  for (const ch of challenges) {
    const current = ch.fundedSettings?.withdrawalFrequencyDays;
    if (current === PAYOUT_CYCLE_DAYS) {
      console.log(`  - ${ch.name || ch._id}: already ${PAYOUT_CYCLE_DAYS} days`);
      continue;
    }
    console.log(`  - ${ch.name || ch._id}: ${current ?? 'unset'} → ${PAYOUT_CYCLE_DAYS} days`);
    if (!DRY_RUN) {
      ch.fundedSettings = {
        ...(ch.fundedSettings || {}),
        withdrawalFrequencyDays: PAYOUT_CYCLE_DAYS
      };
      await ch.save();
    }
    updated++;
  }

  console.log(`[payout-cycle] done — ${updated} challenge(s) updated${DRY_RUN ? ' (DRY RUN)' : ''}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[payout-cycle] error:', err);
  process.exit(1);
});
