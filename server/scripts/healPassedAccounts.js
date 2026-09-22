#!/usr/bin/env node
/**
 * Heal accounts that PASSED an evaluation but never got a FUNDED account.
 *
 * Background: the old pass flow marked the account PASSED and THEN called
 * createFundedAccount() in a separate, non-atomic step. If funded creation
 * ever threw (validation / transient DB error), the account was left
 * permanently "PASSED but not funded" — the user passed 1-step / 2-step but
 * no funded account appeared, with no retry. The engine is now fixed to mint
 * funded FIRST and only flip to PASSED on success; this script repairs the
 * accounts that were already stranded under the old order.
 *
 * For every PASSED account with no live linked funded account it mints one
 * via the same engine path real passes use (so balances/rules/expiry match).
 *
 * Usage (from server/ dir):
 *   node scripts/healPassedAccounts.js            # dry run — report only
 *   node scripts/healPassedAccounts.js --apply    # actually create funded accounts
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ChallengeAccount = require('../models/ChallengeAccount');
const propTradingEngine = require('../services/propTradingEngine');

const APPLY = process.argv.includes('--apply');
const key = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('Missing MONGODB_URI in env');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log('[heal] connected', APPLY ? '(APPLY — will create funded accounts)' : '(DRY RUN — no writes)');

  // Targeted single account (e.g. CH160954) vs bulk scan of every PASSED account.
  // In targeted mode we DON'T do the user+challenge "sibling" dedup — that's only
  // a legacy fallback and could wrongly link a separate purchase to another
  // funded account. Targeted heal trusts only the account's OWN fundedAccountId.
  const targeted = !!key;
  let passed;
  if (targeted) {
    let acc = await ChallengeAccount.findOne({ accountId: key.toUpperCase() });
    if (!acc) { try { acc = await ChallengeAccount.findById(key); } catch (_) {} }
    if (!acc) { console.error(`No account found: ${key}`); process.exit(1); }
    if (acc.status !== 'PASSED') {
      console.log(`[heal] ${acc.accountId} status is ${acc.status} (not PASSED) — nothing to heal.`);
      await mongoose.disconnect(); process.exit(0);
    }
    passed = [acc];
  } else {
    passed = await ChallengeAccount.find({ status: 'PASSED' });
  }
  console.log(`[heal] ${targeted ? 'targeted' : 'found'} ${passed.length} PASSED account(s)`);

  let healed = 0;
  let alreadyOk = 0;

  for (const acc of passed) {
    // Already linked to a live funded account?
    let hasFunded = false;
    if (acc.fundedAccountId) {
      const linked = await ChallengeAccount.findById(acc.fundedAccountId).select('_id status').lean();
      if (linked) hasFunded = true;
    }
    // Fallback: any FUNDED/EXPIRED funded account for the same user+challenge
    // (covers rows minted before fundedAccountId was wired up). Skipped in
    // targeted mode — a separate purchase must not link to another's funded a/c.
    if (!hasFunded && !targeted) {
      const sibling = await ChallengeAccount.findOne({
        userId: acc.userId,
        challengeId: acc.challengeId,
        accountType: 'FUNDED'
      }).select('_id accountId').lean();
      if (sibling) {
        hasFunded = true;
        if (APPLY && !acc.fundedAccountId) {
          acc.fundedAccountId = sibling._id;
          await acc.save();
          console.log(`  · ${acc.accountId}: linked existing funded ${sibling.accountId}`);
        }
      }
    }

    if (hasFunded) { alreadyOk++; continue; }

    console.log(`  → ${acc.accountId} (user ${acc.userId}) PASSED with NO funded account · fund=${inr(acc.initialBalance)}`);
    if (APPLY) {
      try {
        const funded = await propTradingEngine.createFundedAccount(acc);
        console.log(`     ✓ created funded ${funded.accountId} (${inr(funded.currentBalance)})`);
        healed++;
      } catch (err) {
        console.error(`     ✗ failed to create funded for ${acc.accountId}:`, err.message);
      }
    } else {
      healed++; // would-heal count for the dry run
    }
  }

  console.log(`\n[heal] done — ${alreadyOk} already funded, ${healed} ${APPLY ? 'healed' : 'need healing'}${APPLY ? '' : ' (run with --apply to fix)'}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[heal] error:', err);
  process.exit(1);
});
