const mongoose = require('mongoose');
const IB = require('../models/IB');
const IBCoupon = require('../models/IBCoupon');
const IBCommission = require('../models/IBCommission');
const Wallet = require('../models/Wallet');
const ChallengeAccount = require('../models/ChallengeAccount');
const User = require('../models/User');

/**
 * IB Coupon Service (multi-coupon model).
 *
 * One IB can have multiple active coupons at the same time, each with
 * its own unique code, discount %, validity, usage cap, and IB
 * commission %. Each coupon is a row in the IBCoupon collection.
 *
 * Lifecycle:
 *   IB user clicks "Apply for new coupon"  → requestCoupon()
 *     creates a doc with status='pending_issue' and a freshly-generated
 *     unique code (referralCode + 2 random chars).
 *   Admin sees the request in the pending queue and clicks Issue with
 *   terms → issueCoupon() flips it to 'active' with validUntil.
 *   On purchase → validateCouponForPurchase() looks up by code, applies
 *   discount, redeemCoupon() bumps counters and credits the IB.
 *   When validUntil passes OR redemptionCount hits maxRedemptions, the
 *   coupon auto-flips to 'expired' (lazy at validate-time + an explicit
 *   sweep helper).
 */

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
function clampPercent(p) {
  const num = Number(p || 0);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(100, num));
}

class IBCouponService {
  /**
   * IB user requests a new coupon. Creates a `pending_issue` row that
   * shows up in the admin's pending queue. The unique code is generated
   * here so the IB can see (and start sharing once active) it.
   */
  async requestCoupon(ibId, applicationNote = '') {
    const ib = await IB.findById(ibId);
    if (!ib) throw new Error('IB not found');
    if (ib.status !== 'active') throw new Error('IB account is not active');

    // Block duplicate pending requests — one open request at a time keeps
    // the admin queue clean. The IB can have multiple ACTIVE coupons
    // simultaneously though.
    const existing = await IBCoupon.findOne({ ibId: ib._id, status: 'pending_issue' });
    if (existing) {
      throw new Error('You already have a pending coupon request awaiting admin approval');
    }

    // Placeholder code — gets replaced at issue-time with the
    // discount-based public code (e.g. VIBHOOTI20).
    const code = await IBCoupon.generatePlaceholderCode(ib.referralCode);
    if (!code) throw new Error('Failed to generate placeholder coupon code');

    const coupon = await IBCoupon.create({
      ibId: ib._id,
      ibUserId: ib.userId,
      ibOderId: ib.oderId,
      code,
      status: 'pending_issue',
      applicationNote: String(applicationNote || '').slice(0, 500)
    });
    return coupon;
  }

  /**
   * Admin issues (or re-issues terms on) a coupon. Required when the
   * coupon is `pending_issue`; also usable to update an `active` coupon
   * mid-cycle. Sets validUntil = now + validityDays.
   */
  async issueCoupon(couponId, adminId, payload = {}) {
    const coupon = await IBCoupon.findById(couponId);
    if (!coupon) throw new Error('Coupon not found');

    const discountPercent = clampPercent(payload.discountPercent);
    const challengePurchaseCommissionPercent = clampPercent(payload.challengePurchaseCommissionPercent);
    const validityDays = Math.max(1, Math.floor(Number(payload.validityDays || 0)));
    if (!validityDays) throw new Error('Validity days must be at least 1');
    const maxRedemptions = Math.max(0, Math.floor(Number(payload.maxRedemptions || 0)));

    // Three ways the code is set:
    //   1. Admin sent an explicit `code` override → validate uniqueness
    //      and use it. Throws if the chosen code is already in use by
    //      another coupon (active or otherwise).
    //   2. First issue (was pending_issue) → auto-generate from name+%.
    //   3. Explicit `regenerateCode: true` flag → auto-regenerate.
    //   4. Otherwise → keep existing code (so buyers don't lose access
    //      when admin tweaks discount mid-cycle).
    const customCode = payload.code != null ? String(payload.code).trim().toUpperCase() : '';
    if (customCode) {
      if (!/^[A-Z0-9][A-Z0-9\-_]{1,23}$/.test(customCode)) {
        throw new Error('Coupon code must be 2-24 chars: letters, digits, hyphen or underscore');
      }
      const conflict = await IBCoupon.findOne({ code: customCode, _id: { $ne: coupon._id } });
      if (conflict) {
        const status = conflict.status === 'active' ? 'an active'
          : conflict.status === 'pending_issue' ? 'a pending'
          : 'an existing';
        throw new Error(`Code "${customCode}" is already ${status} coupon — pick a different code`);
      }
      coupon.code = customCode;
    } else {
      const isFirstIssue = coupon.status === 'pending_issue';
      if (isFirstIssue || payload.regenerateCode) {
        const ib = await IB.findById(coupon.ibId);
        if (ib) {
          const newCode = await IBCoupon.generateCodeForDiscount(
            ib.referralCode,
            discountPercent,
            coupon._id
          );
          if (newCode) coupon.code = newCode;
        }
      }
    }

    const now = new Date();
    coupon.discountPercent = discountPercent;
    coupon.challengePurchaseCommissionPercent = challengePurchaseCommissionPercent;
    coupon.validityDays = validityDays;
    coupon.validUntil = new Date(now.getTime() + validityDays * 86400000);
    coupon.maxRedemptions = maxRedemptions;
    coupon.status = 'active';
    coupon.issuedAt = coupon.issuedAt || now;
    coupon.issuedBy = adminId || coupon.issuedBy || null;
    coupon.expiredAt = null;
    coupon.expiredReason = '';
    await coupon.save();
    return coupon;
  }

  /**
   * Admin revokes an active coupon. Moves status to admin_revoked so any
   * future validation attempts fail with a clear message.
   */
  async revokeCoupon(couponId, reason = '') {
    const coupon = await IBCoupon.findById(couponId);
    if (!coupon) throw new Error('Coupon not found');
    if (coupon.status !== 'active' && coupon.status !== 'pending_issue') {
      throw new Error('Coupon is not active');
    }
    coupon.status = 'admin_revoked';
    coupon.expiredAt = new Date();
    coupon.expiredReason = `admin_revoked: ${String(reason || '').slice(0, 200)}`;
    await coupon.save();
    return coupon;
  }

  /**
   * Atomically reserve a redemption slot on a coupon. Increments
   * redemptionCount in a single MongoDB operation only if a slot is
   * still available, so two simultaneous purchases (e.g. user
   * double-clicks Buy) cannot both pass — one of them will get null
   * back and we throw `Coupon redemption limit reached`.
   *
   * If this redemption fills the cap, status is flipped to 'expired'
   * in a follow-up save.
   *
   * On any post-reservation failure (insufficient wallet, account
   * creation error, etc.) the caller MUST call `releaseCouponSlot()`
   * to undo the increment.
   */
  async reserveCouponSlot(rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    const reserved = await IBCoupon.findOneAndUpdate(
      {
        code,
        status: 'active',
        $or: [
          { maxRedemptions: 0 },
          { $expr: { $lt: ['$redemptionCount', '$maxRedemptions'] } }
        ]
      },
      { $inc: { redemptionCount: 1 } },
      { new: true }
    );

    if (!reserved) {
      const cur = await IBCoupon.findOne({ code });
      if (!cur) throw new Error('Invalid coupon code');
      if (cur.status === 'pending_issue') throw new Error('Coupon not yet issued by admin');
      if (cur.status === 'admin_revoked') throw new Error('Coupon has been revoked');
      if (cur.maxRedemptions > 0 && cur.redemptionCount >= cur.maxRedemptions) {
        if (cur.status !== 'expired') {
          cur.status = 'expired';
          cur.expiredAt = new Date();
          cur.expiredReason = 'redemption_limit';
          await cur.save();
        }
        throw new Error('Coupon redemption limit reached');
      }
      throw new Error('Coupon is not active');
    }

    // Cap-hit auto-expire on this very redemption.
    if (reserved.maxRedemptions > 0 && reserved.redemptionCount >= reserved.maxRedemptions) {
      reserved.status = 'expired';
      reserved.expiredAt = new Date();
      reserved.expiredReason = 'redemption_limit';
      await reserved.save();
    }
    return reserved;
  }

  async releaseCouponSlot(couponId) {
    if (!couponId) return;
    await IBCoupon.findByIdAndUpdate(couponId, {
      $inc: { redemptionCount: -1 },
      // If the slot release brings count below cap, also un-expire so
      // the next buyer can use it. Status flip handled in a save below.
    });
    // Optional un-expire if the cap-hit auto-expire was set on the same redemption.
    const c = await IBCoupon.findById(couponId);
    if (c && c.status === 'expired' && c.expiredReason === 'redemption_limit'
        && c.maxRedemptions > 0 && c.redemptionCount < c.maxRedemptions) {
      c.status = 'active';
      c.expiredAt = null;
      c.expiredReason = '';
      await c.save();
    }
  }

  /**
   * Validate a coupon code at challenge checkout. Throws typed errors
   * the route can surface. Lazy-expires the coupon if its date has
   * passed or its cap has been reached. READ-ONLY — does not consume a
   * slot. Slot consumption is done by `reserveCouponSlot()` AFTER this
   * pre-flight check passes.
   */
  async validateCouponForPurchase(rawCode, buyerUserId, originalFee) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) throw new Error('Coupon code required');

    const coupon = await IBCoupon.findOne({ code });
    if (!coupon) throw new Error('Invalid coupon code');

    if (coupon.status === 'pending_issue') {
      throw new Error('Coupon not yet issued by admin');
    }
    if (coupon.status === 'admin_revoked') {
      throw new Error('Coupon has been revoked');
    }
    if (coupon.status === 'expired') {
      throw new Error('Coupon expired');
    }

    // Lazy date expiry
    if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
      coupon.status = 'expired';
      coupon.expiredAt = new Date();
      coupon.expiredReason = 'date';
      await coupon.save();
      throw new Error('Coupon expired');
    }
    // Lazy cap expiry
    if (coupon.maxRedemptions > 0 && coupon.redemptionCount >= coupon.maxRedemptions) {
      coupon.status = 'expired';
      coupon.expiredAt = new Date();
      coupon.expiredReason = 'redemption_limit';
      await coupon.save();
      throw new Error('Coupon redemption limit reached');
    }
    if (coupon.status !== 'active') {
      throw new Error('Coupon is not active');
    }

    if (String(coupon.ibUserId) === String(buyerUserId)) {
      throw new Error('You cannot use your own coupon');
    }

    const ib = await IB.findById(coupon.ibId);
    if (!ib || ib.status !== 'active') {
      throw new Error('IB account is not active');
    }

    const fee = Math.max(0, Number(originalFee || 0));
    const discountPercent = clampPercent(coupon.discountPercent);
    const commissionPercent = clampPercent(coupon.challengePurchaseCommissionPercent);
    const discountAmount = round2(fee * discountPercent / 100);
    const finalFee = Math.max(0, round2(fee - discountAmount));
    const commissionAmount = round2(finalFee * commissionPercent / 100);

    return {
      ib,
      coupon,
      originalFee: fee,
      discountPercent,
      discountAmount,
      finalFee,
      commissionPercent,
      commissionAmount
    };
  }

  /**
   * Apply redemption side-effects: create IBCommission, credit IB
   * wallet, bump IB stats and the coupon's running counters. Caller
   * writes couponSnapshot onto the ChallengeAccount.
   */
  async redeemCoupon({ ib, coupon, challengeAccount, buyerUserId, originalFee, discountAmount, finalFee, commissionAmount }) {
    if (!ib || !coupon || !challengeAccount) throw new Error('redeemCoupon: ib + coupon + challengeAccount required');

    let buyerOderId = null;
    try {
      const buyer = await User.findById(buyerUserId).select('oderId');
      buyerOderId = buyer?.oderId || null;
    } catch (e) { /* non-fatal */ }

    const commission = await IBCommission.create({
      ibId: ib._id,
      sourceType: 'challenge_purchase',
      challengeAccountId: challengeAccount._id,
      couponCode: coupon.code,
      referredUserId: buyerUserId,
      referredOderId: buyerOderId,
      commissionType: 'challenge_purchase_percent',
      calculationBase: finalFee,
      rate: coupon.challengePurchaseCommissionPercent,
      amount: commissionAmount,
      status: 'credited',
      description: `Challenge purchase via coupon ${coupon.code} (${coupon.discountPercent}% off ₹${originalFee})`,
      processedAt: new Date(),
      idempotencyKey: `cp_${challengeAccount._id}`
    });

    if (commissionAmount > 0) {
      await Wallet.findOneAndUpdate(
        { userId: ib.userId, type: 'ib' },
        {
          $inc: { balance: commissionAmount, totalEarned: commissionAmount },
          $set: { lastTransactionAt: new Date() },
          $setOnInsert: { oderId: ib.oderId, currency: 'INR', isActive: true }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    // Mirror onto IB doc for dashboard reads.
    ib.wallet.balance = (ib.wallet.balance || 0) + commissionAmount;
    ib.wallet.totalEarned = (ib.wallet.totalEarned || 0) + commissionAmount;
    ib.stats.totalCommissionEarned = (ib.stats.totalCommissionEarned || 0) + commissionAmount;
    ib.stats.thisMonthCommission = (ib.stats.thisMonthCommission || 0) + commissionAmount;
    ib.lastActivityAt = new Date();
    await ib.save();

    // NOTE: redemptionCount is NOT incremented here — the atomic
    // `reserveCouponSlot()` call before this method already did the
    // increment. We only add the running totals + audit fields.
    coupon.totalDiscountGiven = (coupon.totalDiscountGiven || 0) + discountAmount;
    coupon.totalCommissionEarned = (coupon.totalCommissionEarned || 0) + commissionAmount;
    await coupon.save();

    return commission;
  }

  /**
   * IB-facing list of own coupons (any status). For dashboard.
   */
  async listIBCoupons(ibId, options = {}) {
    const { status = null, page = 1, limit = 50 } = options;
    const query = { ibId };
    if (status && status !== 'all') query.status = status;
    const total = await IBCoupon.countDocuments(query);
    const rows = await IBCoupon.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return { rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /**
   * Admin-facing list of all coupons across all IBs, filterable.
   */
  async listAllCoupons(filter = {}) {
    const { status = null, search = null, page = 1, limit = 50 } = filter;
    const query = {};
    if (status && status !== 'all') query.status = status;
    if (search) {
      const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ code: rx }, { ibOderId: rx }];
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const total = await IBCoupon.countDocuments(query);
    const rows = await IBCoupon.find(query)
      .populate('ibUserId', 'name email oderId')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();
    return {
      rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    };
  }

  /**
   * Paginated coupon redemption history. Reads from ChallengeAccount
   * couponSnapshot (the snapshot is the audit-grade ground truth).
   */
  async listRedemptions(filter = {}) {
    const {
      ibId = null,
      userId = null,
      code = null,
      startDate = null,
      endDate = null,
      page = 1,
      limit = 20
    } = filter;

    const query = { 'couponSnapshot.code': { $ne: null } };
    if (ibId) query['couponSnapshot.ibId'] = new mongoose.Types.ObjectId(ibId);
    if (userId) query.userId = new mongoose.Types.ObjectId(userId);
    if (code) query['couponSnapshot.code'] = String(code).toUpperCase();
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));

    let total = await ChallengeAccount.countDocuments(query);
    const rows = await ChallengeAccount.find(query)
      .populate('userId', 'name email oderId')
      .populate('challengeId', 'name')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const summaryAgg = await ChallengeAccount.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalDiscount: { $sum: '$couponSnapshot.discountAmount' },
          totalCommission: { $sum: '$couponSnapshot.ibCommissionAmount' },
          totalGross: { $sum: '$couponSnapshot.originalFee' },
          totalNet: { $sum: '$couponSnapshot.finalFee' }
        }
      }
    ]);
    const summary = summaryAgg[0] || {
      count: 0, totalDiscount: 0, totalCommission: 0, totalGross: 0, totalNet: 0
    };
    delete summary._id;

    // Orphan redemptions: the IB genuinely earned (and often already withdrew) a
    // coupon commission, but the buyer's ChallengeAccount was later DELETED, so
    // no couponSnapshot survives and the snapshot-based list under-counts. The
    // IBCommission ledger is the source of truth for what was earned (it matches
    // the wallet), so we surface any commission with no surviving snapshot as a
    // synthetic row. Only on page 1 (the orphan query isn't paginated) so rows
    // don't duplicate across pages.
    if (ibId && pageNum === 1) {
      const IBCommission = require('../models/IBCommission');
      const snapAcctIds = new Set(rows.map(r => String(r._id)));
      const comms = await IBCommission.find({
        ibId: new mongoose.Types.ObjectId(ibId),
        couponCode: { $ne: null }
      }).populate('referredUserId', 'name oderId').lean();
      const couponDocs = await IBCoupon.find({ ibId }).lean();
      const couponByCode = {};
      couponDocs.forEach(c => { couponByCode[String(c.code).toUpperCase()] = c; });

      const orphanRows = [];
      for (const c of comms) {
        const acctId = c.challengeAccountId ? String(c.challengeAccountId) : null;
        if (acctId && snapAcctIds.has(acctId)) continue; // already shown via snapshot
        const amt = Number(c.amount) || Number(c.commissionAmount) || 0;
        if (!(amt > 0)) continue;
        const coup = couponByCode[String(c.couponCode || '').toUpperCase()] || {};
        const cp = Number(coup.challengePurchaseCommissionPercent) || 30;
        const dp = Number(coup.discountPercent) || 0;
        const finalFee = cp > 0 ? amt / (cp / 100) : 0;
        const originalFee = dp < 100 ? finalFee / (1 - dp / 100) : finalFee;
        const discountAmount = Math.max(0, originalFee - finalFee);
        orphanRows.push({
          _id: c._id,
          createdAt: c.createdAt,
          userId: c.referredUserId || { name: null, oderId: c.referredOderId },
          challengeId: null,
          couponSnapshot: { code: c.couponCode, originalFee, discountAmount, finalFee, ibCommissionAmount: amt }
        });
        summary.count += 1;
        summary.totalCommission += amt;
        summary.totalDiscount += discountAmount;
        summary.totalGross += originalFee;
        summary.totalNet += finalFee;
      }
      if (orphanRows.length > 0) {
        rows.push(...orphanRows);
        rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        total += orphanRows.length;
      }
    }

    return {
      rows,
      summary,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    };
  }

  /**
   * Sweep helper — flip date-passed coupons to expired. Safe to call
   * from a cron; not required for correctness because validate-time
   * checks lazy-expire.
   */
  async expireOverdueCoupons() {
    const now = new Date();
    const res = await IBCoupon.updateMany(
      { status: 'active', validUntil: { $lt: now } },
      { $set: { status: 'expired', expiredAt: now, expiredReason: 'date' } }
    );
    return { matched: res.matchedCount, modified: res.modifiedCount };
  }
}

module.exports = new IBCouponService();
