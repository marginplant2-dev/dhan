const mongoose = require('mongoose');

/**
 * Introducing Broker (IB) Schema
 * Handles multi-level referral system with customizable commission structures
 */
const ibSchema = new mongoose.Schema({
  // Reference to User
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  oderId: { type: String, required: true, unique: true }, // User's oderId for quick lookup
  
  // IB Identification
  referralCode: { type: String, required: true, unique: true, uppercase: true },
  
  // IB Status
  status: { 
    type: String, 
    enum: ['pending', 'active', 'suspended', 'rejected'], 
    default: 'pending' 
  },
  
  // Parent IB (for multi-level)
  parentIBId: { type: mongoose.Schema.Types.ObjectId, ref: 'IB', default: null },
  parentReferralCode: { type: String, default: null },
  
  // IB Level in hierarchy (1 = direct, 2 = sub-IB, etc.)
  level: { type: Number, default: 1, min: 1, max: 5 },
  
  // Commission Settings (Admin configurable per IB)
  commissionSettings: {
    type: { 
      type: String, 
      enum: ['per_lot', 'revenue_percent', 'spread_share', 'hybrid'], 
      default: 'per_lot' 
    },
    // Per Lot Commission (e.g., $5 per lot traded)
    perLotAmount: { type: Number, default: 0 },
    // Revenue Percent (e.g., 10% of spread/commission revenue)
    revenuePercent: { type: Number, default: 0, min: 0, max: 100 },
    // Spread Share (e.g., 30% of spread markup)
    spreadSharePercent: { type: Number, default: 0, min: 0, max: 100 },
    // Multi-level commission rates (percentage of sub-IB earnings)
    multiLevelRates: {
      level1: { type: Number, default: 0 }, // Direct referral
      level2: { type: Number, default: 0 }, // Sub-IB level 1
      level3: { type: Number, default: 0 }, // Sub-IB level 2
      level4: { type: Number, default: 0 },
      level5: { type: Number, default: 0 }
    }
  },
  
  // Statistics
  stats: {
    totalReferrals: { type: Number, default: 0 },
    activeReferrals: { type: Number, default: 0 },
    totalSubIBs: { type: Number, default: 0 },
    totalLotsTraded: { type: Number, default: 0 },
    totalVolumeUSD: { type: Number, default: 0 },
    totalCommissionEarned: { type: Number, default: 0 },
    totalCommissionPaid: { type: Number, default: 0 },
    pendingCommission: { type: Number, default: 0 },
    thisMonthCommission: { type: Number, default: 0 },
    thisMonthLots: { type: Number, default: 0 }
  },
  
  // Wallet (IB earnings separate from trading wallet)
  wallet: {
    balance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    pendingWithdrawal: { type: Number, default: 0 }
  },

  // Active coupon issued by admin — drives challenge-purchase discounts and
  // IB challenge-purchase commission. One active coupon per IB at a time;
  // past coupons (re-issued or expired) move to couponHistory below.
  coupon: {
    code: { type: String, default: null, uppercase: true }, // mirrors referralCode for clarity
    status: {
      type: String,
      enum: ['none', 'active', 'expired', 'pending_renewal'],
      default: 'none'
    },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    validityDays: { type: Number, default: 0, min: 0 },
    validUntil: { type: Date, default: null },
    challengePurchaseCommissionPercent: { type: Number, default: 0, min: 0, max: 100 },
    // Optional cap on how many times this coupon can be redeemed.
    // 0 = unlimited (until validUntil expires).
    maxRedemptions: { type: Number, default: 0, min: 0 },
    issuedAt: { type: Date, default: null },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    renewalRequestedAt: { type: Date, default: null },
    renewalNote: { type: String, default: '' },
    redemptionCount: { type: Number, default: 0 },
    totalDiscountGiven: { type: Number, default: 0 },
    totalCommissionEarned: { type: Number, default: 0 }
  },
  couponHistory: [{
    code: { type: String },
    discountPercent: { type: Number },
    validityDays: { type: Number },
    validUntil: { type: Date },
    challengePurchaseCommissionPercent: { type: Number },
    maxRedemptions: { type: Number, default: 0 },
    issuedAt: { type: Date },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expiredAt: { type: Date },
    redemptionCount: { type: Number, default: 0 },
    totalDiscountGiven: { type: Number, default: 0 },
    totalCommissionEarned: { type: Number, default: 0 },
    reason: { type: String, default: '' } // 'expired' | 'reissued' | 'admin_revoked' | 'redemption_limit'
  }],

  // Application Details
  applicationDetails: {
    businessName: { type: String, default: '' },
    website: { type: String, default: '' },
    marketingPlan: { type: String, default: '' },
    expectedMonthlyReferrals: { type: Number, default: 0 },
    experience: { type: String, default: '' }
  },
  
  // Admin Notes
  adminNotes: { type: String, default: '' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectedReason: { type: String, default: '' },
  
  // Timestamps
  appliedAt: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes for performance (userId, oderId, referralCode already indexed via unique: true)
ibSchema.index({ parentIBId: 1 });
ibSchema.index({ status: 1 });
ibSchema.index({ 'stats.totalCommissionEarned': -1 });
ibSchema.index({ 'coupon.status': 1 });
ibSchema.index({ 'coupon.validUntil': 1 });

// Generate unique referral code (legacy random fallback — kept for cases
// where the user's name yields no usable Latin characters).
ibSchema.statics.generateReferralCode = async function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let exists = true;

  while (exists) {
    code = 'IB';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await this.findOne({ referralCode: code });
    exists = !!existing;
  }

  return code;
};

// Generate referral code derived from the user's display name, e.g.
// "Pravin Kumar" → "PRAVIN24". Falls back to legacy random IB+6 when the
// name has no usable Latin alphanumerics (single-char / non-Latin only).
ibSchema.statics.generateReferralCodeFromName = async function(name) {
  const raw = String(name || '');
  // Strip diacritics, uppercase, keep [A-Z0-9] only.
  const cleaned = raw.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
  // Take first whitespace-separated token of length >= 3.
  const tokens = cleaned.split(/\s+/).filter(Boolean).map(t => t.replace(/[^A-Z0-9]/g, ''));
  const base = tokens.find(t => t.length >= 3);

  if (!base) {
    return this.generateReferralCode();
  }

  const baseCode = base.slice(0, 8);
  const tryGenerate = async (digitLen) => {
    for (let i = 0; i < 12; i++) {
      const max = Math.pow(10, digitLen);
      const num = Math.floor(Math.random() * max).toString().padStart(digitLen, '0');
      const candidate = (baseCode + num).slice(0, 12);
      const existing = await this.findOne({ referralCode: candidate });
      if (!existing) return candidate;
    }
    return null;
  };

  let code = await tryGenerate(2);
  if (!code) code = await tryGenerate(3);
  if (!code) code = await tryGenerate(4);
  if (!code) code = await this.generateReferralCode();
  return code;
};

// Get all downline IBs recursively
ibSchema.methods.getDownlineIBs = async function(maxDepth = 5) {
  const IB = mongoose.model('IB');
  const downline = [];
  
  const fetchLevel = async (parentId, currentDepth) => {
    if (currentDepth > maxDepth) return;
    
    const children = await IB.find({ parentIBId: parentId, status: 'active' });
    for (const child of children) {
      downline.push({ ib: child, depth: currentDepth });
      await fetchLevel(child._id, currentDepth + 1);
    }
  };
  
  await fetchLevel(this._id, 1);
  return downline;
};

// Credit commission to IB wallet
ibSchema.methods.creditCommission = async function(amount, description, tradeId) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    this.wallet.balance += amount;
    this.wallet.totalEarned += amount;
    this.stats.totalCommissionEarned += amount;
    this.stats.thisMonthCommission += amount;
    this.lastActivityAt = new Date();
    
    await this.save({ session });
    
    // Create commission record
    const IBCommission = mongoose.model('IBCommission');
    await IBCommission.create([{
      ibId: this._id,
      amount,
      description,
      tradeId,
      status: 'credited'
    }], { session });
    
    await session.commitTransaction();
    return true;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const IB = mongoose.model('IB', ibSchema);

module.exports = IB;
