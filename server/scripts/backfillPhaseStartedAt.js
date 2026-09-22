#!/usr/bin/env node
/**
 * One-time backfill for `phaseStartedAt` on legacy ChallengeAccounts.
 *
 * Context: The Trading Journal calendar mixed phase-1 and phase-2 trades
 * for any account that advanced phases before the `phaseStartedAt` field
 * existed. The insights API auto-heals on first read — but this script
 * fixes ALL affected accounts in one shot so admins / users see clean
 * phase-2 calendars immediately after deploy.
 *
 * Boundary derivation (matches the API's auto-heal logic):
 *   - For each ACTIVE / PASSED account where currentPhase > 1 AND
 *     phaseStartedAt is missing:
 *   - Walk through closed positions in close-time order, accumulating
 *     profit on top of initialBalance.
 *   - The first close that brings running equity to >= phaseStartBalance
 *     is treated as the moment phase 1 ended → its closeTime becomes
 *     phaseStartedAt.
 *
 * Phase-1 accounts (currentPhase == 1) get phaseStartedAt = createdAt
 * so they're consistent for all future code paths.
 *
 * Usage (from the server/ directory):
 *   node scripts/backfillPhaseStartedAt.js
 *   node scripts/backfillPhaseStartedAt.js --dry-run     # report only
 *   node scripts/backfillPhaseStartedAt.js --account 6a06abM33323dc01e11a23c
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ChallengeAccount = require('../models/ChallengeAccount');
const ChallengePosition = require('../models/ChallengePosition');

const DRY_RUN = process.argv.includes('--dry-run');
const accountFlagIdx = process.argv.indexOf('--account');
const ONLY_ACCOUNT = accountFlagIdx > -1 ? process.argv[accountFlagIdx + 1] : null;

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI / MONGO_URI not set in .env');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');
  if (DRY_RUN) console.log('  (DRY RUN — no writes)');

  const baseQuery = { phaseStartedAt: { $in: [null, undefined] } };
  if (ONLY_ACCOUNT) {
    // Accept either the human-readable accountId string or a Mongo _id
    // (24-char hex string) — admins typically copy whichever is visible
    // in the dashboard URL.
    if (/^[a-f0-9]{24}$/i.test(ONLY_ACCOUNT)) {
      baseQuery._id = new mongoose.Types.ObjectId(ONLY_ACCOUNT);
    } else {
      baseQuery.accountId = ONLY_ACCOUNT;
    }
    // Allow targeting a specific account even if phaseStartedAt is already
    // set (in case the previous derivation was wrong and we want to redo).
    delete baseQuery.phaseStartedAt;
  }

  const accounts = await ChallengeAccount.find(baseQuery).lean();
  console.log(`Found ${accounts.length} accounts without phaseStartedAt.`);

  let phase1Set = 0;
  let phase2Healed = 0;
  let phase2Unhealed = 0;
  let skipped = 0;

  for (const acc of accounts) {
    const phase = Number(acc.currentPhase) || 1;

    // Phase 1 (or instant 0-step): boundary = createdAt.
    if (phase <= 1) {
      console.log(`  [phase ${phase}] ${acc.accountId} → createdAt = ${acc.createdAt?.toISOString()}`);
      if (!DRY_RUN) {
        await ChallengeAccount.updateOne(
          { _id: acc._id },
          { $set: { phaseStartedAt: acc.createdAt } }
        );
      }
      phase1Set++;
      continue;
    }

    // Phase 2+: derive the boundary from the closed-trade equity walk.
    const closed = await ChallengePosition.find({
      challengeAccountId: acc._id,
      status: 'closed'
    }).sort({ closeTime: 1 }).lean();

    const initialBalance = Number(acc.initialBalance) || 0;
    const target = Number(acc.phaseStartBalance) || initialBalance;

    // Try two strategies in order:
    //  (1) First trade whose closing running balance >= target (exact hit).
    //  (2) The peak running balance across all trades — when there were
    //      open positions at phase advance (their floating PnL is part of
    //      phaseStartBalance but their profit field crystallises later) or
    //      the user took a phase-2 loss, the cumulative never reaches the
    //      target. The peak then marks "best equity ever" which is the
    //      closest proxy for the phase-1 → phase-2 transition.
    let running = initialBalance;
    let boundary = null;
    let strategyUsed = '';

    // Strategy 1: exact-or-over threshold (with small tolerance).
    const EPS = 1.0;
    for (const p of closed) {
      running += Number(p.profit) || 0;
      if (running >= target - EPS) {
        boundary = p.closeTime;
        strategyUsed = 'threshold-hit';
        break;
      }
    }

    // Strategy 2: peak running balance.
    if (!boundary) {
      let peak = initialBalance;
      let peakTime = null;
      running = initialBalance;
      for (const p of closed) {
        running += Number(p.profit) || 0;
        if (running > peak) {
          peak = running;
          peakTime = p.closeTime;
        }
      }
      // Only trust peak if it's at least within 5% of target — otherwise
      // we'd be making up boundaries on accounts that barely traded.
      const within5pct = peak >= target * 0.95;
      if (peakTime && within5pct) {
        boundary = peakTime;
        strategyUsed = `peak-${peak.toFixed(2)}/${target.toFixed(2)}`;
      }
    }

    if (boundary) {
      console.log(`  [phase ${phase}] ${acc.accountId} → ${boundary.toISOString()} (${strategyUsed}, target ${target}, ${closed.length} trades)`);
      if (!DRY_RUN) {
        await ChallengeAccount.updateOne(
          { _id: acc._id },
          { $set: { phaseStartedAt: boundary } }
        );
      }
      phase2Healed++;
    } else {
      console.log(`  [phase ${phase}] ${acc.accountId} → ⚠️ could not derive (running ${running.toFixed(2)} vs target ${target}). Falling back to passedAt or now.`);
      const fallback = acc.passedAt || new Date();
      if (!DRY_RUN) {
        await ChallengeAccount.updateOne(
          { _id: acc._id },
          { $set: { phaseStartedAt: fallback } }
        );
      }
      phase2Unhealed++;
    }
  }

  console.log('');
  console.log(`Phase 1 accounts updated:        ${phase1Set}`);
  console.log(`Phase 2+ accounts auto-healed:   ${phase2Healed}`);
  console.log(`Phase 2+ accounts fallback set:  ${phase2Unhealed}`);
  console.log(`Skipped:                          ${skipped}`);
  console.log(DRY_RUN ? '(no writes — dry run)' : '✓ Done');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
