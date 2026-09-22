const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const ChallengeAccount = require('../models/ChallengeAccount');
const Challenge = require('../models/Challenge');
const IBCoupon = require('../models/IBCoupon');
const IB = require('../models/IB');
const ibCouponService = require('./ibCoupon.service');
const globalCouponService = require('./globalCoupon.service');
const GlobalCoupon = require('../models/GlobalCoupon');

/**
 * Challenge Approval Service
 *
 * Owns the admin-side review of challenge_purchase Transactions created
 * by propTradingEngine.requestChallengeBuy(). Approving a request flips
 * the linked ChallengeAccount from PENDING/PAYMENT_PENDING to ACTIVE
 * (or instant-FUNDED) and finalises any coupon redemption. Rejecting
 * cancels the account and releases the reserved coupon slot.
 */

function computeExpiresAt(challenge) {
  const days = Number(challenge?.rules?.challengeExpiryDays);
  if (!days || days <= 0) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

class ChallengeApprovalService {
  /**
   * Approve a pending challenge_purchase Transaction. Activates the
   * linked ChallengeAccount and finalises coupon redemption if any.
   */
  async approveChallengeBuy(txId, adminId) {
    const tx = await Transaction.findById(txId);
    if (!tx) throw new Error('Transaction not found');
    if (tx.type !== 'challenge_purchase') throw new Error('Not a challenge purchase transaction');
    if (tx.status !== 'pending') throw new Error(`Transaction is already ${tx.status}`);

    const accountId = tx.challengePurchaseInfo?.challengeAccountId;
    if (!accountId) throw new Error('Linked challenge account missing on transaction');
    const account = await ChallengeAccount.findById(accountId);
    if (!account) throw new Error('Linked challenge account not found');

    const challenge = await Challenge.findById(account.challengeId);
    if (!challenge) throw new Error('Challenge not found');

    // Instant (0-Step) = TRUE instant funding → on approval the account
    // activates DIRECTLY as a proper FUNDED account (no evaluation). 1-/2-step
    // challenges activate as ACTIVE evaluation and must hit the profit target
    // to flip to FUNDED via the engine's checkProfitTarget logic.
    const isInstant = challenge.stepsCount === 0;

    // Finalise coupon redemption if a coupon was applied. The slot was
    // already reserved at request time; this writes the IBCommission
    // ledger row (IB coupon only), credits the IB wallet, and writes
    // couponSnapshot. Global coupons skip the IB ledger entirely — only
    // discount totals are updated for analytics.
    let commission = null;
    const couponType = tx.challengePurchaseInfo?.couponType;
    const ibCouponId = tx.challengePurchaseInfo?.ibCouponId;
    const globalCouponId = tx.challengePurchaseInfo?.globalCouponId;

    if (couponType === 'ib' && ibCouponId) {
      const coupon = await IBCoupon.findById(ibCouponId);
      if (!coupon) throw new Error('Coupon record vanished — cannot finalise');
      const ib = await IB.findById(coupon.ibId);
      if (!ib) throw new Error('IB record vanished — cannot finalise');
      const originalFee = Number(tx.challengePurchaseInfo.originalFee || 0);
      const finalFee = Number(tx.challengePurchaseInfo.finalFee || 0);
      const discountAmount = Number(tx.challengePurchaseInfo.couponDiscountAmount || 0);
      const commissionAmount = Math.round(finalFee * (Number(coupon.challengePurchaseCommissionPercent) || 0)) / 100;

      commission = await ibCouponService.redeemCoupon({
        ib,
        coupon,
        challengeAccount: account,
        buyerUserId: account.userId,
        originalFee,
        discountAmount,
        finalFee,
        commissionAmount
      });

      account.couponSnapshot = {
        code: coupon.code,
        ibId: ib._id,
        ibUserId: ib.userId,
        discountPercent: coupon.discountPercent,
        originalFee,
        discountAmount,
        finalFee,
        challengePurchaseCommissionPercent: coupon.challengePurchaseCommissionPercent,
        ibCommissionAmount: commissionAmount,
        ibCommissionId: commission._id,
        redeemedAt: new Date()
      };
    } else if (couponType === 'global' && globalCouponId) {
      const coupon = await GlobalCoupon.findById(globalCouponId);
      if (coupon) {
        const discountAmount = Number(tx.challengePurchaseInfo.couponDiscountAmount || 0);
        await globalCouponService.finalize(coupon, discountAmount);
        account.couponSnapshot = {
          code: coupon.code,
          ibId: null,
          ibUserId: null,
          discountPercent: coupon.discountPercent,
          originalFee: Number(tx.challengePurchaseInfo.originalFee || 0),
          discountAmount,
          finalFee: Number(tx.challengePurchaseInfo.finalFee || 0),
          challengePurchaseCommissionPercent: 0,
          ibCommissionAmount: 0,
          ibCommissionId: null,
          redeemedAt: new Date()
        };
      }
    }

    // Flip the account live.
    const nowTs = new Date();
    if (isInstant) {
      // Direct funded account — no evaluation. Funded lifetime + payout gates.
      account.status = 'FUNDED';
      account.accountType = 'FUNDED';
      account.currentPhase = 0;
      account.totalPhases = 0;
      account.fundedAt = nowTs;
      account.payoutCount = 0;
      const fundedLifetimeDays = Number(challenge.fundedSettings?.accountLifetimeDays) > 0
        ? Number(challenge.fundedSettings.accountLifetimeDays)
        : 30;
      account.expiresAt = new Date(nowTs.getTime() + fundedLifetimeDays * 86400000);
    } else {
      account.status = 'ACTIVE';
      account.expiresAt = computeExpiresAt(challenge);
    }
    account.paymentStatus = 'COMPLETED';
    account.dayStartEquity = account.initialBalance;
    account.dayStartBalance = account.initialBalance;
    await account.save();

    // Mark the transaction approved.
    tx.status = 'approved';
    tx.processedBy = adminId ? String(adminId) : 'admin';
    tx.processedAt = new Date();
    await tx.save();

    // User-facing: "your account is LIVE" (Email 3). Best-effort — never block.
    try {
      const emailService = require('./email.service');
      const User = require('../models/User');
      const user = await User.findById(account.userId).select('name email oderId').lean();
      if (user?.email) {
        const r = challenge.rules || {};
        const profitTarget = isInstant
          ? (r.profitTargetInstantPercent ?? r.profitTargetPhase1Percent)
          : (r.profitTargetPhase1Percent ?? r.profitTargetInstantPercent);
        emailService.sendTemplatedEmail('challenge_active', user.email, {
          userName: user.name || user.oderId || 'Trader',
          accountType: challenge.name || account.accountType || 'Funded Account',
          accountSize: Number(account.initialBalance || 0).toLocaleString('en-IN'),
          profitTarget: profitTarget != null ? profitTarget : '—',
          maxDrawdown: r.maxOverallDrawdownPercent != null ? r.maxOverallDrawdownPercent : '—',
          dailyDrawdown: r.maxDailyDrawdownPercent != null ? r.maxDailyDrawdownPercent : '—',
          minTradingDays: r.tradingDaysRequired != null ? r.tradingDaysRequired : '—'
        }).catch(() => {});
      }
    } catch (_) { /* email best-effort */ }

    return { transaction: tx, account, commission };
  }

  /**
   * Reject a pending challenge_purchase Transaction. Cancels the
   * linked ChallengeAccount and releases the coupon slot if any.
   */
  async rejectChallengeBuy(txId, adminId, reason = '') {
    const tx = await Transaction.findById(txId);
    if (!tx) throw new Error('Transaction not found');
    if (tx.type !== 'challenge_purchase') throw new Error('Not a challenge purchase transaction');
    if (tx.status !== 'pending') throw new Error(`Transaction is already ${tx.status}`);

    const accountId = tx.challengePurchaseInfo?.challengeAccountId;
    if (accountId) {
      const account = await ChallengeAccount.findById(accountId);
      if (account) {
        account.status = 'CANCELLED';
        account.paymentStatus = 'PAYMENT_REJECTED';
        account.failReason = `Payment rejected: ${reason || 'no reason provided'}`;
        await account.save();
      }
    }

    const rejCouponType = tx.challengePurchaseInfo?.couponType;
    const rejIbCouponId = tx.challengePurchaseInfo?.ibCouponId;
    const rejGlobalCouponId = tx.challengePurchaseInfo?.globalCouponId;
    if (rejCouponType === 'global' && rejGlobalCouponId) {
      try { await globalCouponService.releaseSlot(rejGlobalCouponId); } catch (e) { /* swallow */ }
    } else if (rejIbCouponId) {
      try { await ibCouponService.releaseCouponSlot(rejIbCouponId); } catch (e) { /* swallow */ }
    }

    tx.status = 'rejected';
    tx.rejectionReason = String(reason || '').slice(0, 500);
    tx.processedBy = adminId ? String(adminId) : 'admin';
    tx.processedAt = new Date();
    await tx.save();

    return { transaction: tx };
  }

  /**
   * Admin-facing list of challenge_purchase transactions, filterable.
   */
  async list({ status = null, search = null, page = 1, limit = 50 }) {
    const filter = { type: 'challenge_purchase' };
    if (status && status !== 'all') filter.status = status;
    if (search) {
      const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { oderId: rx },
        { userName: rx },
        { 'paymentDetails.referenceNumber': rx },
        { 'challengePurchaseInfo.challengeName': rx }
      ];
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const total = await Transaction.countDocuments(filter);
    // Rows go out without the base64 payment screenshot — with it, one page of
    // this queue was 1.6 MB. hasProof tells the panel whether "View" has
    // anything to fetch from /admin/transactions/:txId/proof.
    const rows = await Transaction.find(filter)
      .select('-proofImage')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();
    const withProof = new Set((await Transaction.find({ _id: { $in: rows.map((r) => r._id) }, proofImage: { $nin: ['', null] } })
      .select('_id').lean()).map((r) => String(r._id)));
    rows.forEach((r) => { r.hasProof = withProof.has(String(r._id)); });

    const summaryAgg = await Transaction.aggregate([
      { $match: { type: 'challenge_purchase' } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      }
    ]);
    const summary = { pending: 0, approved: 0, rejected: 0, totalApproved: 0, totalPending: 0 };
    summaryAgg.forEach(s => {
      if (s._id === 'pending') { summary.pending = s.count; summary.totalPending = s.total; }
      else if (s._id === 'approved' || s._id === 'completed') {
        summary.approved += s.count; summary.totalApproved += s.total;
      } else if (s._id === 'rejected') { summary.rejected = s.count; }
    });

    return {
      rows,
      summary,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    };
  }
}

module.exports = new ChallengeApprovalService();
