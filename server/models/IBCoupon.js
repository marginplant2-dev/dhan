const mongoose = require('mongoose');

/**
 * IBCoupon — separate collection so a single IB can hold multiple
 * simultaneously-active coupons with different terms (e.g. one 20% off
 * code and another 10% off code). The IB.referralCode field stays as the
 * IB's stable identifier; each coupon has its own unique `code` derived
 * from the referralCode + a short random suffix.
 *
 * Lifecycle:
 *   pending_issue → admin sets terms → active
 *   active → date expires OR cap reached → expired
 *   active → admin revokes → admin_revoked
 */
const ibCouponSchema = new mongoose.Schema({
  ibId: { type: mongoose.Schema.Types.ObjectId, ref: 'IB', required: true, index: true },
  ibUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ibOderId: { type: String, default: null },

  code: { type: String, required: true, unique: true, uppercase: true },

  status: {
    type: String,
    enum: ['pending_issue', 'active', 'expired', 'admin_revoked'],
    default: 'pending_issue'
  },

  // Terms (set by admin at issue time)
  discountPercent: { type: Number, default: 0, min: 0, max: 100 },
  validityDays: { type: Number, default: 0, min: 0 },
  validUntil: { type: Date, default: null },
  maxRedemptions: { type: Number, default: 0, min: 0 }, // 0 = unlimited
  challengePurchaseCommissionPercent: { type: Number, default: 0, min: 0, max: 100 },

  // Lifecycle metadata
  applicationNote: { type: String, default: '' }, // user's request note
  issuedAt: { type: Date, default: null },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  expiredAt: { type: Date, default: null },
  expiredReason: { type: String, default: '' }, // 'date' | 'redemption_limit' | 'admin_revoked' | ...

  // Counters
  redemptionCount: { type: Number, default: 0 },
  totalDiscountGiven: { type: Number, default: 0 },
  totalCommissionEarned: { type: Number, default: 0 }
}, { timestamps: true });

ibCouponSchema.index({ status: 1 });
ibCouponSchema.index({ ibId: 1, status: 1 });
ibCouponSchema.index({ validUntil: 1 });

/**
 * Strip trailing digits / dashes from a referralCode to recover the
 * "name" part. e.g. "VIBHOOTI24" → "VIBHOOTI", "PRAVIN-7K" → "PRAVIN".
 */
ibCouponSchema.statics.extractNameBase = function (referralCode) {
  return String(referralCode || '')
    .toUpperCase()
    .replace(/[-_]?\d+[A-Z]*$/, '')      // trailing digits (with optional letter suffix)
    .replace(/[-_]+$/, '')               // trailing dashes/underscores
    .replace(/[^A-Z0-9]/g, '');
};

/**
 * Pre-issue placeholder code — used at request time when the discount
 * is not yet known. Format: <NAME>-<2 random chars>. Replaced at
 * issue time with the discount-based public code.
 */
ibCouponSchema.statics.generatePlaceholderCode = async function (referralCode) {
  const base = this.extractNameBase(referralCode);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 20; i++) {
    let suffix = '';
    for (let j = 0; j < 2; j++) suffix += chars[Math.floor(Math.random() * chars.length)];
    const candidate = `${base}-PEND-${suffix}`.toUpperCase().slice(0, 24);
    const exists = await this.findOne({ code: candidate });
    if (!exists) return candidate;
  }
  return `${base}-PEND-${Date.now().toString(36).toUpperCase().slice(-4)}`;
};

/**
 * Public discount-based coupon code. Format: <NAME><DISCOUNT> e.g.
 * "VIBHOOTI20" for a 20%-off coupon. On collision (same name+discount
 * already in use by another IB) appends a letter A, B, C, …, then a
 * 2-letter suffix.
 *
 * Pass `excludeId` so a re-issue on the same coupon doesn't collide
 * against itself.
 */
ibCouponSchema.statics.generateCodeForDiscount = async function (referralCode, discountPercent, excludeId = null) {
  const base = this.extractNameBase(referralCode) || 'IB';
  const pct = Math.round(Number(discountPercent) || 0);
  const baseCode = `${base}${pct}`;
  const findExisting = async (code) => {
    const q = { code };
    if (excludeId) q._id = { $ne: excludeId };
    return await this.findOne(q);
  };
  if (!(await findExisting(baseCode))) return baseCode;

  // Single-letter suffix: A, B, C, ...
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let i = 0; i < letters.length; i++) {
    const candidate = `${baseCode}${letters[i]}`;
    if (!(await findExisting(candidate))) return candidate;
  }
  // Two-letter random suffix as last resort
  for (let i = 0; i < 50; i++) {
    const a = letters[Math.floor(Math.random() * letters.length)];
    const b = letters[Math.floor(Math.random() * letters.length)];
    const candidate = `${baseCode}${a}${b}`;
    if (!(await findExisting(candidate))) return candidate;
  }
  return `${baseCode}${Date.now().toString(36).toUpperCase().slice(-3)}`;
};

// Legacy alias — used at IB approval before request-flow existed.
ibCouponSchema.statics.generateCodeForIB = async function (referralCode) {
  return this.generatePlaceholderCode(referralCode);
};

const IBCoupon = mongoose.model('IBCoupon', ibCouponSchema);

module.exports = IBCoupon;
