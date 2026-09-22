#!/usr/bin/env node
/**
 * Diagnose + repair "passed the objectives but account never went FUNDED".
 *
 * Auto-pass only fires at the exact instant a trade closes. If that close
 * doesn't line up with every gate (or a gate the objectives panel doesn't even
 * show — consistency rule, min-trades — blocks it), the account stays ACTIVE
 * forever while the panel reads 100%. This script shows EXACTLY which gate is
 * the hold-up, and with --apply runs the real engine pass check (which, when
 * all gates clear, marks the account PASSED and mints the funded account).
 *
 * Usage (from server/ dir):
 *   node scripts/evaluatePass.js CH841844           # one account — explain only
 *   node scripts/evaluatePass.js CH841844 --apply   # pass + fund if it qualifies
 *   node scripts/evaluatePass.js --all              # scan all ACTIVE — explain
 *   node scripts/evaluatePass.js --all --apply      # pass + fund every qualifier
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ChallengeAccount = require('../models/ChallengeAccount');
const ChallengePosition = require('../models/ChallengePosition');
const Challenge = require('../models/Challenge');
const propTradingEngine = require('../services/propTradingEngine');

const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');
const key = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const mark = (ok) => (ok ? '✓' : '✗');

/** Read-only gate preview — mirrors checkProfitTarget's gates without mutating. */
function previewGates(account, challenge) {
  const rules = challenge.rules || {};
  const targetPct = propTradingEngine.getTargetPercent(account, challenge);
  const cappedPct = propTradingEngine.getCappedProfitPercent(account, challenge);
  const targetOk = targetPct > 0 && cappedPct >= targetPct;

  const failViol = Array.isArray(account.violations) && account.violations.some(v => v.severity === 'FAIL');
  const consistency = propTradingEngine.checkConsistencyRule(account, challenge);

  const minTrades = Number(rules.minTradesRequired) || 0;
  const trades = Number(account.totalTrades) || 0;
  const minTradesOk = trades >= minTrades;

  const needDays = Number(rules.tradingDaysRequired) || 0;
  const days = Array.isArray(account.uniqueTradingDays) ? account.uniqueTradingDays.length : 0;
  const daysOk = days >= needDays;

  const blocks = [];
  if (!targetOk) blocks.push(`profit target (${cappedPct.toFixed(2)}% / ${targetPct}% counted-after-cap)`);
  if (failViol) blocks.push('a FAIL violation exists');
  if (!minTradesOk) blocks.push(`min trades (${trades}/${minTrades})`);
  if (!daysOk) blocks.push(`trading days (${days}/${needDays})`);
  // Consistency is NOT a pass/fail gate (info only) — matches the engine.

  console.log(`  ${mark(targetOk)} Profit target: counted ${cappedPct.toFixed(2)}% vs ${targetPct}% needed (raw equity profit ${Number(account.currentProfitPercent || 0).toFixed(2)}%)`);
  console.log(`  ${mark(!failViol)} No FAIL violation`);
  console.log(`  ${mark(minTradesOk)} Min trades: ${trades}/${minTrades}`);
  console.log(`  ${mark(daysOk)} Trading days: ${days}/${needDays}`);
  console.log(`  · Consistency (info only, does NOT block): best day ${consistency.bestDayRatio != null ? consistency.bestDayRatio.toFixed(1) + '%' : 'n/a'}${rules.consistencyRulePercent ? `, configured max ${rules.consistencyRulePercent}%` : ' (not configured)'}`);

  return blocks;
}

async function handle(account) {
  const challenge = await Challenge.findById(account.challengeId);
  console.log(`\n=== ${account.accountId} (${account._id}) ===`);
  console.log(`  Status ${account.status} · Phase ${account.currentPhase}/${account.totalPhases} · steps=${challenge?.stepsCount} · fund=${inr(account.initialBalance)} · equity=${inr(account.currentEquity)}`);

  if (account.status !== 'ACTIVE') {
    console.log(`  (skipped — only ACTIVE accounts are evaluated; this is ${account.status})`);
    return;
  }

  const realOpen = await ChallengePosition.countDocuments({ challengeAccountId: account._id, status: 'open' });
  if (realOpen > 0) {
    console.log(`  ⚠ ${realOpen} open position(s) — pass is judged on realised profit; close them first.`);
  }
  if (Number(account.openTradesCount) !== realOpen) {
    console.log(`  (note: stored openTradesCount=${account.openTradesCount} but actual open=${realOpen} — counter was stale)`);
  }

  // Rebuild realised profit from actual closed positions (same source as the
  // Objectives panel) so a stale dailyPnlMap doesn't skew the diagnosis.
  const sync = await propTradingEngine.syncRealizedFromPositions(account);
  console.log(`  Realised profit (rebuilt from ${sync.days} trading day(s)): ${inr(sync.sumRealized)}`);

  const blocks = previewGates(account, challenge);
  if (blocks.length > 0) {
    console.log(`  → WOULD NOT PASS — blocked by: ${blocks.join('; ')}`);
    return;
  }
  console.log('  → All gates clear — qualifies to PASS' + (challenge.stepsCount > 1 && account.currentPhase < account.totalPhases ? ` (advance to phase ${account.currentPhase + 1})` : ' → FUNDED'));

  if (APPLY) {
    const result = await propTradingEngine.checkProfitTarget(account, challenge);
    if (result.funded) {
      console.log(`  ✓ PASSED + funded account created: ${result.fundedAccount?.accountId || '-'}`);
    } else if (result.targetReached) {
      console.log(`  ✓ advanced to phase ${result.nextPhase} (fresh evaluation)`);
    } else {
      console.log(`  ⚠ engine did not pass: ${result.reason || result.code || 'unknown'}`);
    }
  }
}

async function main() {
  if (!key && !ALL) {
    console.error('Usage: node scripts/evaluatePass.js <accountIdOrCode> [--apply]   |   --all [--apply]');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('[evalPass] connected', APPLY ? '(APPLY — will pass/fund qualifiers)' : '(DIAGNOSE ONLY — no writes)');

  if (ALL) {
    const accounts = await ChallengeAccount.find({ status: 'ACTIVE' });
    console.log(`[evalPass] ${accounts.length} ACTIVE account(s)`);
    for (const acc of accounts) await handle(acc);
  } else {
    let acc = await ChallengeAccount.findOne({ accountId: key.toUpperCase() });
    if (!acc) { try { acc = await ChallengeAccount.findById(key); } catch (_) {} }
    if (!acc) { console.error(`No account found: ${key}`); process.exit(1); }
    await handle(acc);
  }

  if (!APPLY) console.log('\n[evalPass] diagnosis only — re-run with --apply to actually pass/fund the qualifiers above.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => { console.error('[evalPass] error:', err); process.exit(1); });
