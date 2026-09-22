const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  oderId: { type: String, required: true }, // User ID
  
  // Transaction Type
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'admin_fund_request', 'admin_wallet_adjustment', 'challenge_purchase', 'challenge_reset', 'ai_subscription'],
    required: true
  },

  // Wallet source — distinguishes a regular user-wallet deposit/withdrawal
  // from an IB-earnings withdrawal so admin approval logic can debit the
  // right pool. Defaults to 'main' for backwards compatibility.
  source: {
    type: String,
    enum: ['main', 'ib'],
    default: 'main'
  },
  
  // Amount
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  
  // Payment Method (optional for admin fund requests)
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'upi', 'crypto', 'card', 'wallet', 'admin_transfer', 'razorpay', 'cashfree'],
    required: false,
    default: null
  },
  
  // Admin Fund Request fields
  adminRequesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  adminParentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  parentType: { type: String, enum: ['admin', 'user'], default: 'admin' },
  
  // Payment Details (varies by method)
  paymentDetails: {
    // Bank Transfer
    bankName: { type: String },
    accountNumber: { type: String },
    ifscCode: { type: String },
    accountHolderName: { type: String },
    
    // UPI
    upiId: { type: String },
    
    // Crypto
    cryptoType: { type: String }, // BTC, ETH, USDT
    walletAddress: { type: String },
    txHash: { type: String },
    
    // Card
    cardLast4: { type: String },
    cardType: { type: String }, // visa, mastercard
    
    // Reference/UTR
    referenceNumber: { type: String },
    utrNumber: { type: String },

    // Razorpay (gateway) — set for paymentMethod='razorpay'
    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },

    // Cashfree (gateway) — set for paymentMethod='cashfree'
    cashfreeOrderId: { type: String, index: true },
    cashfreePaymentId: { type: String },

    // Prop payout fields (withdrawal from funded challenge account)
    challengeAccountId: { type: String },
    challengeAccountCode: { type: String },
    profit: { type: Number },
    splitPercent: { type: Number },
    kind: { type: String }
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'processing', 'approved', 'rejected', 'completed', 'failed'],
    default: 'pending'
  },
  
  // Admin Processing
  processedBy: { type: String, default: null }, // Admin user ID
  processedAt: { type: Date, default: null },
  adminNote: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },
  
  // User Notes
  userNote: { type: String, default: '' },
  
  // Proof/Screenshot
  proofImage: { type: String, default: '' },
  
  // User name (for display)
  userName: { type: String, default: '' },

  // Bonus auto-trigger (Fix 21c). When a deposit is approved and the
  // bonusAutoTrigger service grants a bonus, the resulting INR amount and
  // template name are snapshotted onto the transaction so admin/user
  // history pages can show "this deposit got a ₹X bonus" without joining
  // the UserBonus collection.
  bonusAmount: { type: Number, default: 0, min: 0 },
  bonusTemplateName: { type: String, default: '' },
  
  // Withdrawal Info (structured details from user)
  withdrawalInfo: {
    method: { type: String }, // 'bank', 'upi', 'crypto'
    bankDetails: {
      bankName: { type: String },
      accountNumber: { type: String },
      ifsc: { type: String },
      accountHolder: { type: String }
    },
    upiDetails: {
      upiId: { type: String },
      name: { type: String }
    },
    cryptoDetails: {
      network: { type: String },
      address: { type: String }
    }
  },

  // Challenge purchase info — populated for type='challenge_purchase'
  // transactions only. The buyer paid the admin's UPI directly; this
  // record drives the admin approval queue and links to the
  // ChallengeAccount that gets activated on approval.
  challengePurchaseInfo: {
    challengeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Challenge', default: null },
    challengeAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChallengeAccount', default: null },
    challengeName: { type: String, default: '' },
    tierIndex: { type: Number, default: 0 },
    fundSize: { type: Number, default: 0 },
    originalFee: { type: Number, default: 0 },
    finalFee: { type: Number, default: 0 },
    couponCode: { type: String, default: null, uppercase: true },
    couponDiscountAmount: { type: Number, default: 0 },
    ibCouponId: { type: mongoose.Schema.Types.ObjectId, ref: 'IBCoupon', default: null },
    globalCouponId: { type: mongoose.Schema.Types.ObjectId, ref: 'GlobalCoupon', default: null },
    couponType: { type: String, enum: ['ib', 'global', null], default: null }
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for faster queries
transactionSchema.index({ oderId: 1, type: 1, status: 1 });
transactionSchema.index({ createdAt: -1 });
// Admin dashboard / reports filter by type+status and by payout kind with no
// leading oderId — these avoid full collection scans on those aggregations.
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ 'paymentDetails.kind': 1, type: 1, status: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
