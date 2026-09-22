#!/usr/bin/env node
/**
 * Reconcile an IB's coupon redemption counters against the audit-grade ground
 * truth (ChallengeAccount.couponSnapshot).
 *
 * Why: the Overview tab shows `sum(coupon.redemptionCount)` (a counter bumped at
 * RESERVE time, i.e. when a buyer REQUESTS a challenge — before admin approval),
 * while the Redemptions tab counts ChallengeAccounts that actually carry a
 * couponSnapshot (written only on APPROVAL). A reservation that was never
 * approved (pending, or rejected without releasing the slot) makes the two
 * disagree — e.g. Overload "4" vs Redemptions "3", and an inflated wallet.
 *
 * This prints, per coupon: redemptionCount vs the real completed count, the
 * commission credited (wallet/stats) vs the snapshot sum, and the actual
 * snapshot rows + any pending/orphaned reservations — so you can see exactly
 * what the 4th (uncounted) redemption is.
 *
 * With --apply it rebases each coupon's redemptionCount to its real completed
 * redemption count (snapshot-backed). It does NOT touch the wallet/earnings —
 * those are real money; the report tells you whether they need a manual fix.
 *
 * Usage (from server/ dir):
 *   node scripts/reconcileIbCoupons.js PRANEETH20            # by coupon code
 *   node scripts/reconcileIbCoupons.js --ib 681078           # by IB user oderId
 *   node scripts/reconcileIbCoupons.js PRANEETH20 --apply    # fix redemptionCount
 */

require('dotenv').config();
const mongoose = require('mongoose');
const IB = require('../models/IB');
const IBCoupon = require('../models/IBCoupon');
const IBCommission = require('../models/IBCommission');
const ChallengeAccount = require('../models/ChallengeAccount');
const Wallet = require('../models/Wallet');

const APPLY = process.argv.includes('--apply');
const BACKFILL = process.argv.includes('--backfill');
const ibFlagIdx = process.argv.indexOf('--ib');
const ibKey = ibFlagIdx >= 0 ? process.argv[ibFlagIdx + 1] : null;
const couponKey = process.argv.find((a, i) => i >= 2 && !a.startsWith('--') && a !== ibKey);
const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

async function main() {
  if (!couponKey && !ibKey) {
    console.error('Usage: node scripts/reconcileIbCoupons.js <COUPONCODE> [--apply]   |   --ib <oderId> [--apply]');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('[reconcile] connected', APPLY ? '(APPLY — will rebase redemptionCount)' : '(REPORT ONLY)');

  // Resolve the IB.
  let ib = null;
  if (couponKey) {
    const c = await IBCoupon.findOne({ code: couponKey.toUpperCase() });
    if (c) ib = await IB.findById(c.ibId);
  }
  if (!ib && ibKey) {
    const User = require('../models/User');
    const u = await User.findOne({ oderId: ibKey });
    if (u) ib = await IB.findOne({ userId: u._id });
  }
  if (!ib) { console.error('IB not found for given coupon/ib key'); process.exit(1); }

  const wallet = await Wallet.findOne({ userId: ib.userId, type: 'ib' });
  console.log(`\n=== IB ${ib._id} (referralCode ${ib.referralCode}) ===`);
  console.log(`  wallet.totalEarned:        ${inr(wallet?.totalEarned)}`);
  console.log(`  wallet.balance:            ${inr(wallet?.balance)}`);
  console.log(`  stats.totalCommission:     ${inr(ib.stats?.totalCommissionEarned)}`);

  // IBCommission ledger (one row per credited commission). Cross-check each
  // against its ChallengeAccount: does the account still exist, and does it
  // carry the couponSnapshot? A commission whose account is MISSING is an
  // orphan (over-credit). A commission whose account EXISTS but has NO snapshot
  // is a real purchase that simply needs its snapshot back-filled (the answer
  // would then be 4, not 3).
  const commissions = await IBCommission.find({ ibId: ib._id }).lean();
  const commSum = commissions.reduce((s, c) => s + (Number(c.commissionAmount) || Number(c.amount) || 0), 0);
  console.log(`  IBCommission records:      ${commissions.length}  ·  sum ${inr(commSum)}`);
  console.log(`\n  Per-commission cross-check:${BACKFILL ? ' (BACKFILL ON)' : ''}`);
  const Transaction = require('../models/Transaction');
  for (const c of commissions) {
    const amt = Number(c.commissionAmount) || Number(c.amount) || 0;
    let acctState = 'no challengeAccountId';
    if (c.challengeAccountId) {
      const acct = await ChallengeAccount.findById(c.challengeAccountId);
      if (!acct) acctState = `ACCOUNT MISSING (${c.challengeAccountId}) → ORPHAN`;
      else if (!acct.couponSnapshot || !acct.couponSnapshot.code) {
        acctState = `${acct.accountId} ${acct.status} → exists but NO snapshot (back-fillable)`;
        if (BACKFILL) {
          // Reconstruct the missing couponSnapshot so this real purchase shows
          // up in the Redemptions list (and counts) like the other three.
          const coupon = await IBCoupon.findOne({ code: (c.couponCode || '').toUpperCase() });
          const cp = coupon?.challengePurchaseCommissionPercent || 30;
          const dp = coupon?.discountPercent || 20;
          // Prefer exact fees from the challenge_purchase Transaction; else derive
          // from the commission (amount = finalFee × commissionPercent).
          const tx = await Transaction.findOne({ type: 'challenge_purchase', 'challengePurchaseInfo.challengeAccountId': String(acct._id) }).lean();
          const cpi = tx?.challengePurchaseInfo || {};
          const finalFee = Number(cpi.finalFee) > 0 ? Number(cpi.finalFee) : (cp > 0 ? amt / (cp / 100) : 0);
          const originalFee = Number(cpi.originalFee) > 0 ? Number(cpi.originalFee) : (dp < 100 ? finalFee / (1 - dp / 100) : finalFee);
          const discountAmount = Number(cpi.couponDiscountAmount) > 0 ? Number(cpi.couponDiscountAmount) : Math.max(0, originalFee - finalFee);
          acct.couponSnapshot = {
            code: c.couponCode,
            ibId: ib._id,
            ibUserId: ib.userId,
            discountPercent: dp,
            originalFee, discountAmount, finalFee,
            challengePurchaseCommissionPercent: cp,
            ibCommissionAmount: amt,
            ibCommissionId: c._id,
            redeemedAt: c.createdAt,
          };
          await acct.save();
          acctState = `${acct.accountId} ${acct.status} → ✓ SNAPSHOT BACK-FILLED (fee ${inr(finalFee)}, comm ${inr(amt)})`;
        }
      }
      else acctState = `${acct.accountId} ${acct.status} → snapshot OK`;
    }
    console.log(`    · ${inr(amt)}  [${c.status}]  coupon=${c.couponCode || '-'}  buyer=${c.referredOderId || '-'}  ${new Date(c.createdAt).toISOString().slice(0,10)}  ${acctState}`);
  }

  // Ground truth: ChallengeAccounts carrying this IB's couponSnapshot.
  const snaps = await ChallengeAccount.find({ 'couponSnapshot.ibId': ib._id, 'couponSnapshot.code': { $ne: null } })
    .select('accountId status couponSnapshot createdAt').lean();
  const snapSum = snaps.reduce((s, a) => s + (Number(a.couponSnapshot?.ibCommissionAmount) || 0), 0);
  console.log(`\n  Completed redemptions (couponSnapshot, GROUND TRUTH): ${snaps.length}  ·  commission ${inr(snapSum)}`);
  for (const a of snaps) {
    console.log(`    · ${a.couponSnapshot.code}  ${a.accountId}  ${a.status}  fee ${inr(a.couponSnapshot.finalFee)}  comm ${inr(a.couponSnapshot.ibCommissionAmount)}`);
  }

  // Per-coupon redemptionCount vs real completed count for that code.
  const coupons = await IBCoupon.find({ ibId: ib._id });
  let totalCounter = 0, totalReal = 0;
  console.log(`\n  Coupons:`);
  for (const c of coupons) {
    const real = snaps.filter(s => s.couponSnapshot.code === c.code).length;
    totalCounter += Number(c.redemptionCount) || 0;
    totalReal += real;
    const flag = (Number(c.redemptionCount) || 0) !== real ? '  ⚠ MISMATCH' : '';
    console.log(`    · ${c.code} [${c.status}]  redemptionCount=${c.redemptionCount}  realCompleted=${real}${flag}`);
    if (APPLY && (Number(c.redemptionCount) || 0) !== real) {
      c.redemptionCount = real;
      await c.save();
      console.log(`        ✓ rebased redemptionCount → ${real}`);
    }
  }

  console.log(`\n  SUMMARY`);
  console.log(`    Overview "Total Redemptions" (sum redemptionCount): ${totalCounter}`);
  console.log(`    Real completed (snapshot count):                    ${totalReal}`);
  console.log(`    Wallet/stats earned:                                ${inr(wallet?.totalEarned)} / ${inr(ib.stats?.totalCommissionEarned)}`);
  console.log(`    Snapshot commission (ground truth):                 ${inr(snapSum)}`);
  if (Math.abs(Number(wallet?.totalEarned || 0) - snapSum) > 1) {
    console.log(`    ⚠ WALLET/EARNINGS DRIFT of ${inr(Number(wallet?.totalEarned || 0) - snapSum)} — this is REAL money; review the extra IBCommission/credit before adjusting. NOT auto-fixed.`);
  }
  if (!APPLY) console.log(`\n[reconcile] report only — re-run with --apply to rebase redemptionCount to ground truth.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => { console.error('[reconcile] error:', err); process.exit(1); });
