#!/usr/bin/env node
/**
 * One-off cleanup: remove ADMIN_RESET and other admin-side warning
 * violations from every ChallengeAccount so users don't see leftover
 * "Challenge reset by admin ..." messages in their Violations panel.
 *
 * Usage from server/ dir:
 *   node scripts/clearAdminResetViolations.js
 *   node scripts/clearAdminResetViolations.js --dry-run
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ChallengeAccount = require('../models/ChallengeAccount');

const DRY_RUN = process.argv.includes('--dry-run');
const ADMIN_RULE_TAGS = new Set(['ADMIN_RESET', 'ADMIN_NOTE', 'ADMIN_OVERRIDE']);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('[cleanup] connected', DRY_RUN ? '(DRY RUN — no writes)' : '');

  const accounts = await ChallengeAccount.find({
    'violations.rule': { $in: Array.from(ADMIN_RULE_TAGS) }
  });
  console.log(`[cleanup] found ${accounts.length} account(s) with admin warning violations`);

  let totalRemoved = 0;
  for (const a of accounts) {
    const before = a.violations.length;
    const filtered = a.violations.filter(v => !ADMIN_RULE_TAGS.has(v.rule));
    const removed = before - filtered.length;
    console.log(`  - ${a.accountId}: ${removed} removed (${before} → ${filtered.length})`);
    if (!DRY_RUN && removed > 0) {
      a.violations = filtered;
      await a.save();
    }
    totalRemoved += removed;
  }

  console.log(`[cleanup] done — ${totalRemoved} admin-side violations cleared${DRY_RUN ? ' (DRY RUN)' : ''}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[cleanup] error:', err);
  process.exit(1);
});
