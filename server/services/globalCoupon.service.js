const GlobalCoupon = require('../models/GlobalCoupon');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const ChallengeAccount = require('../models/ChallengeAccount');

function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }
function clampPercent(p) {
  const n = Number(p || 0);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

class GlobalCouponService {
  async createCoupon(payload, adminId) {
    const code = String(payload.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9\-_]{1,23}$/.test(code)) {
      throw new Error('Code must be 2-24 chars: letters, digits, hyphen or underscore');
    }
    const exists = await GlobalCoupon.findOne({ code });
    if (exists) throw new Error(`Code "${code}" already exists`);

    const discountPercent = clampPercent(payload.discountPercent);
    if (discountPercent <= 0) throw new Error('Discount must be greater than 0');

    const validityDays = Math.max(0, Math.floor(Number(payload.validityDays || 0)));
    const validUntil = validityDays > 0
      ? new Date(Date.now() + validityDays * 86400000)
      : null;

    const coupon = await GlobalCoupon.create({
      code,
      status: 'active',
      discountPercent,
      validityDays,
      validUntil,
      maxRedemptions: Math.max(0, Math.floor(Number(payload.maxRedemptions || 0))),
      firstTimeOnly: payload.firstTimeOnly !== false,
      showOnBanner: !!payload.showOnBanner,
      bannerText: String(payload.bannerText || '').slice(0, 200),
      createdBy: adminId || null
    });
    return coupon;
  }

  async updateCoupon(couponId, payload) {
    const coupon = await GlobalCoupon.findById(couponId);
    if (!coupon) throw new Error('Coupon not found');

    if (payload.code != null) {
      const newCode = String(payload.code).trim().toUpperCase();
      if (newCode && newCode !== coupon.code) {
        if (!/^[A-Z0-9][A-Z0-9\-_]{1,23}$/.test(newCode)) {
          throw new Error('Code must be 2-24 chars: letters, digits, hyphen or underscore');
        }
        const conflict = await GlobalCoupon.findOne({ code: newCode, _id: { $ne: coupon._id } });
        if (conflict) throw new Error(`Code "${newCode}" already exists`);
        coupon.code = newCode;
      }
    }

    if (payload.discountPercent != null) coupon.discountPercent = clampPercent(payload.discountPercent);
    if (payload.maxRedemptions != null) coupon.maxRedemptions = Math.max(0, Math.floor(Number(payload.maxRedemptions)));
    if (payload.firstTimeOnly != null) coupon.firstTimeOnly = !!payload.firstTimeOnly;
    if (payload.showOnBanner != null) coupon.showOnBanner = !!payload.showOnBanner;
    if (payload.bannerText != null) coupon.bannerText = String(payload.bannerText || '').slice(0, 200);

    if (payload.validityDays != null) {
      const days = Math.max(0, Math.floor(Number(payload.validityDays)));
      coupon.validityDays = days;
      coupon.validUntil = days > 0 ? new Date(Date.now() + days * 86400000) : null;
    }

    if (payload.status === 'admin_disabled') {
      coupon.status = 'admin_disabled';
      coupon.expiredAt = new Date();
      coupon.expiredReason = 'admin_disabled';
    } else if (payload.status === 'active' && coupon.status !== 'active') {
      coupon.status = 'active';
      coupon.expiredAt = null;
      coupon.expiredReason = '';
    }

    await coupon.save();
    return coupon;
  }

  async deleteCoupon(couponId) {
    const r = await GlobalCoupon.findByIdAndDelete(couponId);
    if (!r) throw new Error('Coupon not found');
    return { deleted: true };
  }

  /**
   * Read-only validation. Throws if not usable. Does NOT consume a slot.
   */
  async validate(rawCode, buyerUserId, originalFee) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) throw new Error('Coupon code required');

    const coupon = await GlobalCoupon.findOne({ code });
    if (!coupon) throw new Error('Invalid coupon code');

    if (coupon.status === 'admin_disabled') throw new Error('Coupon has been disabled');
    if (coupon.status === 'expired') throw new Error('Coupon expired');

    if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
      coupon.status = 'expired';
      coupon.expiredAt = new Date();
      coupon.expiredReason = 'date';
      await coupon.save();
      throw new Error('Coupon expired');
    }
    if (coupon.maxRedemptions > 0 && coupon.redemptionCount >= coupon.maxRedemptions) {
      coupon.status = 'expired';
      coupon.expiredAt = new Date();
      coupon.expiredReason = 'redemption_limit';
      await coupon.save();
      throw new Error('Coupon redemption limit reached');
    }

    if (coupon.firstTimeOnly && buyerUserId) {
      // Two checks:
      //   1. Prior challenge_purchase Transaction (any non-rejected status)
      //   2. Any existing ChallengeAccount for this user (covers legacy
      //      wallet-flow purchases too)
      // Either signal = "not first time" → block coupon usage.
      const buyer = await User.findById(buyerUserId).select('oderId');
      const oderId = buyer?.oderId;

      let priorTxCount = 0;
      if (oderId) {
        priorTxCount = await Transaction.countDocuments({
          oderId,
          type: 'challenge_purchase',
          status: { $in: ['pending', 'approved', 'completed', 'processing'] }
        });
      }
      const priorAccountCount = await ChallengeAccount.countDocuments({ userId: buyerUserId });

      if (priorTxCount > 0 || priorAccountCount > 0) {
        throw new Error('This coupon is valid only on your first challenge purchase');
      }
    }

    const fee = Math.max(0, Number(originalFee || 0));
    const discountPercent = clampPercent(coupon.discountPercent);
    const discountAmount = round2(fee * discountPercent / 100);
    const finalFee = Math.max(0, round2(fee - discountAmount));

    return {
      coupon,
      originalFee: fee,
      discountPercent,
      discountAmount,
      finalFee
    };
  }

  /**
   * Atomic slot reservation — increments redemptionCount only if a slot
   * is still available. Mirrors IBCoupon's approach.
   */
  async reserveSlot(rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    const reserved = await GlobalCoupon.findOneAndUpdate(
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
      const cur = await GlobalCoupon.findOne({ code });
      if (!cur) throw new Error('Invalid coupon code');
      if (cur.status === 'admin_disabled') throw new Error('Coupon disabled');
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
    if (reserved.maxRedemptions > 0 && reserved.redemptionCount >= reserved.maxRedemptions) {
      reserved.status = 'expired';
      reserved.expiredAt = new Date();
      reserved.expiredReason = 'redemption_limit';
      await reserved.save();
    }
    return reserved;
  }

  async releaseSlot(couponId) {
    if (!couponId) return;
    await GlobalCoupon.findByIdAndUpdate(couponId, { $inc: { redemptionCount: -1 } });
    const c = await GlobalCoupon.findById(couponId);
    if (c && c.status === 'expired' && c.expiredReason === 'redemption_limit'
        && c.maxRedemptions > 0 && c.redemptionCount < c.maxRedemptions) {
      c.status = 'active';
      c.expiredAt = null;
      c.expiredReason = '';
      await c.save();
    }
  }

  /**
   * Finalize on admin approval — bump running totals.
   */
  async finalize(coupon, discountAmount) {
    if (!coupon) return;
    coupon.totalDiscountGiven = (coupon.totalDiscountGiven || 0) + (discountAmount || 0);
    await coupon.save();
  }

  /**
   * Banner — pick the most recently created active coupon flagged for banner display.
   */
  async getActiveBannerCoupon() {
    const now = new Date();
    return await GlobalCoupon.findOne({
      status: 'active',
      showOnBanner: true,
      $or: [
        { validUntil: null },
        { validUntil: { $gt: now } }
      ]
    }).sort({ createdAt: -1 }).lean();
  }

  async listAll() {
    return await GlobalCoupon.find().sort({ createdAt: -1 }).lean();
  }
}

module.exports = new GlobalCouponService();
