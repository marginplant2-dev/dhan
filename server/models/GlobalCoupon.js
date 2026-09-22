const mongoose = require('mongoose');

/**
 * GlobalCoupon — admin-issued promotional codes that apply to ANY user,
 * independent of the IB referral system. Examples: WELCOME10, NEWUSER20.
 *
 * Differences from IBCoupon:
 *   - Not tied to an IB; no commission paid on redemption
 *   - Optionally first-time-only (user must have 0 approved challenge purchases)
 *   - Optionally surfaces on the landing-page top banner
 *
 * Lifecycle:
 *   active → date expires OR cap reached → expired
 *   active → admin disables → admin_disabled
 */
const globalCouponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },

  status: {
    type: String,
    enum: ['active', 'expired', 'admin_disabled'],
    default: 'active'
  },

  discountPercent: { type: Number, default: 0, min: 0, max: 100 },
  validityDays: { type: Number, default: 0, min: 0 },     // 0 = no expiry
  validUntil: { type: Date, default: null },              // computed = now + validityDays
  maxRedemptions: { type: Number, default: 0, min: 0 },   // 0 = unlimited

  // Restriction flags
  firstTimeOnly: { type: Boolean, default: true },        // only for users with no prior approved challenge purchase

  // Banner display
  showOnBanner: { type: Boolean, default: false },
  bannerText: { type: String, default: '' },              // optional override; if empty we render a default

  // Counters
  redemptionCount: { type: Number, default: 0 },
  totalDiscountGiven: { type: Number, default: 0 },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  expiredAt: { type: Date, default: null },
  expiredReason: { type: String, default: '' }
}, { timestamps: true });

globalCouponSchema.index({ status: 1, showOnBanner: 1 });

module.exports = mongoose.model('GlobalCoupon', globalCouponSchema);
