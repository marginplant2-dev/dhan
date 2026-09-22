#!/usr/bin/env node
/**
 * Resync challenge-account balances that were corrupted by the
 * onTradeClosed double-count bug (currentBalance/currentEquity were inflated
 * by the LAST closed trade's P&L because closePosition settled the wallet AND
 * onTradeClosed re-added the same P&L).
 *
 * The authoritative balance = phaseStartBalance + realised P&L of the CURRENT
 * phase's closed trades. This script recomputes it from actual ChallengePosition
 * data and (with --apply) writes the corrected balance/equity/profit% + re-
 * anchors today's daily-DD watermark so the stale inflated value can't linger.
 *
 * Usage (run from server/ dir):
 *   node scripts/resyncChallengeBalances.js                 # dry-run, ALL active/funded
 *   node scripts/resyncChallengeBalances.js CH510603        # dry-run, one account
 *   node scripts/resyncChallengeBalances.js --apply         # fix ALL drifted
 *   node scripts/resyncChallengeBalances.js CH510603 --apply
 *
 * Safe by default — without --apply nothing is written.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ChallengeAccount = require('../models/ChallengeAccount');
const ChallengePosition = require('../models/ChallengePosition');

const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const accountKey = args.find((a) => !a.startsWith('--')) || null;
// Tolerance: ignore sub-₹1 float noise.
const EPS = 1.0;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log(`Mode: ${APPLY ? 'APPLY (writes)' : 'DRY-RUN (no writes)'}\n`);

  const query = { status: { $in: ['ACTIVE', 'FUNDED'] }, accountType: { $ne: 'DEMO' } };
  if (accountKey) {
    // single account by code or _id
    const byCode = await ChallengeAccount.findOne({ accountId: accountKey.toUpperCase() }).select('_id');
    if (byCode) query._id = byCode._id;
    else { try { query._id = new mongoose.Types.ObjectId(accountKey); } catch (_) { /* ignore */ } }
  }

  const accounts = await ChallengeAccount.find(query);
  let drifted = 0;
  let fixed = 0;

  for (const acc of accounts) {
    const initial = Number(acc.initialBalance) || 0;
    const phaseStart = Number(acc.phaseStartBalance) || initial;

    // Current-phase closed trades only (phase-2+ accounts filter by phaseStartedAt).
    const closedQuery = { challengeAccountId: acc._id, status: 'closed' };
    if (Number(acc.currentPhase) > 1 && acc.phaseStartedAt) {
      closedQuery.closeTime = { $gte: acc.phaseStartedAt };
    }
    const closed = await ChallengePosition.find(closedQuery).lean();
    const open = await ChallengePosition.find({ challengeAccountId: acc._id, status: 'open' }).lean();

    const realised = closed.reduce((s, p) => s + (Number(p.profit) || 0), 0);
    const floating = open.reduce((s, p) => s + (Number(p.profit) || 0), 0);

    const correctBalance = phaseStart + realised;
    const correctEquity = correctBalance + floating;

    const storedBalance = Number(acc.currentBalance) || 0;
    const diff = storedBalance - correctBalance;

    if (Math.abs(diff) < EPS) continue; // in sync — skip

    drifted++;
    console.log(`${acc.accountId}  (${acc._id})  phase ${acc.currentPhase}/${acc.totalPhases}`);
    console.log(`  Stored balance:    ${inr(storedBalance)}`);
    console.log(`  Correct balance:   ${inr(correctBalance)}   (phaseStart ${inr(phaseStart)} + realised ${inr(realised)})`);
    console.log(`  Drift:             ${diff > 0 ? '+' : ''}${inr(diff)}   ${diff > 0 ? '(INFLATED)' : '(under)'}`);
    console.log(`  Open floating:     ${inr(floating)}  →  correct equity ${inr(correctEquity)}`);

    if (!APPLY) {
      console.log(`  → would fix (pass --apply)\n`);
      continue;
    }

    // Write corrected balance + equity to BOTH field families.
    acc.currentBalance = correctBalance;
    acc.currentEquity = correctEquity;
    acc.walletBalance = correctBalance;
    acc.walletEquity = correctEquity;
    acc.totalProfitLoss = correctEquity - initial;
    acc.currentProfitPercent = phaseStart > 0 ? ((correctEquity - phaseStart) / phaseStart) * 100 : 0;

    // Re-anchor TODAY's daily-DD watermark so the inflated-era values don't
    // leave a phantom daily loss/gain. (Overall watermark left intact — it's a
    // real historical low and isn't part of this corruption.)
    acc.dayStartBalance = correctBalance;
    acc.dayStartEquity = correctEquity;
    acc.lowestEquityToday = correctEquity;
    acc.currentDailyDrawdownPercent = 0;
    if (Number(acc.lowestEquityOverall) > correctEquity) acc.lowestEquityOverall = correctEquity;

    await acc.save();
    fixed++;
    console.log(`  ✓ Fixed → balance ${inr(correctBalance)}, equity ${inr(correctEquity)}, profit ${acc.currentProfitPercent.toFixed(2)}%\n`);
  }

  console.log(`\nScanned ${accounts.length} account(s). Drifted: ${drifted}. ${APPLY ? `Fixed: ${fixed}.` : (drifted ? `Re-run with --apply to fix.` : 'All in sync.')}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error('resync error:', err); process.exit(1); });
