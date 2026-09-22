const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  oderId: { type: String, required: true, unique: true }, // Auto-generated 6-digit ID starting with 6
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  // Uniqueness enforced via a PARTIAL index below (only real string phones),
  // NOT inline unique+sparse. A plain/sparse unique index still treats a
  // missing/null phone as the value `null`, so a 2nd phone-less user (e.g.
  // Google sign-up) hit E11000 dup key { phone: null }. Partial excludes
  // null/missing entirely. Run scripts/fixPhoneIndex.js once to migrate the
  // legacy non-sparse index on existing deployments.
  phone: { type: String, trim: true },
  password: { type: String, minlength: 6 },
  name: { type: String, required: true, trim: true },

  // Google OAuth
  googleId: { type: String, default: null, sparse: true, index: true },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  
  // Profile
  profile: {
    avatar: { type: String, default: '' }, // Profile image path/URL
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, enum: ['male', 'female', 'other', ''], default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: 'India' },
    pincode: { type: String, default: '' }
  },
  
  // Wallet & Trading Account (INR-only platform)
  wallet: {
    balance: { type: Number, default: 0 },      // Available balance (free margin) in INR
    credit: { type: Number, default: 0 },       // Bonus/credit in INR
    creditInr: { type: Number, default: 0 },    // Legacy mirror of credit — kept for back-compat
    equity: { type: Number, default: 0 },
    margin: { type: Number, default: 0 },
    freeMargin: { type: Number, default: 0 },
    marginLevel: { type: Number, default: 0 },
  },

  walletINR: {
    balance: { type: Number, default: 0 },
    totalDeposits: { type: Number, default: 0 },
    totalWithdrawals: { type: Number, default: 0 }
  },

  // First-deposit timestamp — Fix 21 Phase 2. Set the first time the
  // server adds money to wallet.balance via the admin wallet endpoint.
  // Used by the auto-trigger to decide whether to apply a `first_deposit`
  // template (only fires once) vs a `regular_deposit` template.
  firstDepositAt: { type: Date, default: null },
  
  // Trading Statistics
  stats: {
    totalTrades: { type: Number, default: 0 },
    winningTrades: { type: Number, default: 0 },
    losingTrades: { type: Number, default: 0 },
    totalProfit: { type: Number, default: 0 },
    totalLoss: { type: Number, default: 0 },
    netPnL: { type: Number, default: 0 }
  },
  
  // Account Settings
  leverage: { type: Number, default: 100 },
  currency: { type: String, default: 'INR' },
  allowedCurrencyDisplay: { type: String, enum: ['INR'], default: 'INR' },
  isActive: { type: Boolean, default: true },
  
  // Trade Mode Settings - which modes this user can access
  allowedTradeModes: {
    hedging: { type: Boolean, default: true },
    netting: { type: Boolean, default: true },
    binary: { type: Boolean, default: true }
  },
  isVerified: { type: Boolean, default: false },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  
  // Security
  passwordChangedAt: { type: Date, default: null },
  passwordResetToken: { type: String, default: null },
  passwordResetExpires: { type: Date, default: null },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  
  // KYC Status
  kycVerified: { type: Boolean, default: false },
  kycStatus: { type: String, enum: ['not_submitted', 'pending', 'approved', 'rejected', 'resubmit'], default: 'not_submitted' },
  
  // Saved Bank Accounts for withdrawals
  bankAccounts: [{
    _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    ifsc: { type: String, required: true },
    accountHolder: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Saved UPI IDs for withdrawals
  upiAccounts: [{
    _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    upiId: { type: String, required: true },
    name: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // IB Referral System
  referredBy: { type: String, default: null }, // Referral code of the IB who referred this user
  referredByIBId: { type: mongoose.Schema.Types.ObjectId, ref: 'IB', default: null },
  
  // Parent Admin/Broker hierarchy
  parentAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  parentAdminOderId: { type: String, default: null }, // For easy lookup (SA/AD/BR prefix)
  // When this user joined its CURRENT owner. null = never moved, so the whole
  // history counts. Revenue readers must honour it via earnsFrom() (§7).
  parentAdminAssignedAt: { type: Date, default: null },
  
  // User Preferences (moved from localStorage to database)
  preferences: {
    displayCurrency: { type: String, enum: ['INR'], default: 'INR' },
    darkMode: { type: Boolean, default: true },
    activePage: { type: String, default: 'home' },
    watchlist: [{ type: String }], // Array of symbol strings
    lastSelectedSymbol: { type: String, default: '' }, // Market chart: last active symbol (persist reload)
    chartTabs: [{ type: String }], // Open chart tabs (same order as UI)
    chartInterval: { type: String, default: '1h' },
    orderPanelSide: { type: String, enum: ['left', 'right'], default: 'right' }
  },
  
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: null }
}, { timestamps: true });

// Phone uniqueness ONLY for real (string) phone numbers — null/missing phones
// (Google sign-ups, etc.) are excluded so they never collide on { phone: null }.
userSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } } }
);


// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password') || !this.password) return;
  
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  this.passwordChangedAt = new Date();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false; // Google OAuth users have no password
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if password was changed after token was issued
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Generate 6-digit user ID starting with 6
userSchema.statics.generateUserId = async function() {
  let userId;
  let exists = true;
  
  while (exists) {
    // Generate random 5 digits and prepend with 6
    const random = Math.floor(10000 + Math.random() * 90000);
    userId = `6${random}`;
    
    // Check if ID already exists
    const existingUser = await this.findOne({ oderId: userId });
    exists = !!existingUser;
  }
  
  return userId;
};

// Calculate equity based on balance and unrealized P/L
userSchema.methods.updateEquity = function(unrealizedPnL) {
  this.wallet.equity = this.wallet.balance + this.wallet.credit + unrealizedPnL;
  this.wallet.freeMargin = this.wallet.equity - this.wallet.margin;
  if (this.wallet.margin > 0) {
    this.wallet.marginLevel = (this.wallet.equity / this.wallet.margin) * 100;
  } else {
    this.wallet.marginLevel = 0;
  }
};

// Check if user has sufficient margin
userSchema.methods.hasSufficientMargin = function(requiredMargin) {
  return this.wallet.freeMargin >= requiredMargin;
};

// Deduct margin for new position
userSchema.methods.useMargin = function(amount) {
  this.wallet.margin += amount;
  this.wallet.freeMargin = this.wallet.equity - this.wallet.margin;
  if (this.wallet.margin > 0) {
    this.wallet.marginLevel = (this.wallet.equity / this.wallet.margin) * 100;
  }
};

// Release margin when position closed
userSchema.methods.releaseMargin = function(amount) {
  this.wallet.margin = Math.max(0, this.wallet.margin - amount);
  this.wallet.freeMargin = this.wallet.equity - this.wallet.margin;
  if (this.wallet.margin > 0) {
    this.wallet.marginLevel = (this.wallet.equity / this.wallet.margin) * 100;
  } else {
    this.wallet.marginLevel = 0;
  }
};

// Settle P/L to balance — MT5-style with credit-absorbs-losses (Fix 21c.3)
//
// MT5 lifecycle for a settled trade:
//   1. Profit  → goes to Balance. Credit untouched. Withdrawable cash grows.
//   2. Loss    → comes out of Balance first.
//   3. If loss > Balance → the overflow eats Credit (the bonus absorbs the
//      blow). Credit is decremented by the overflow amount, capped at 0.
//   4. If loss > Balance + Credit → the broker absorbs the rest (negative
//      balance protection). User's account does not go negative.
//
// This matches what real MT5 brokers do with deposit bonuses. Before this
// fix, our settlePnL only capped balance at 0 and never touched credit, so
// credit acted like a permanent equity boost. The user explicitly asked for
// MT5 parity in Fix 21c.
//
// NOTE: Do NOT reset equity = balance + credit here!
// That formula ignores unrealized PnL from OTHER open trades still running.
// The next updatePositionPrices tick will correctly set:
//   equity = balance + credit + sum(all open positions' floating PnL)
userSchema.methods.settlePnL = function(pnl) {
  const balanceBefore = this.wallet.balance;
  const creditBefore = this.wallet.credit || 0;
  this.wallet.balance += pnl;

  // ============ MT5-STYLE CREDIT ABSORPTION + NEGATIVE BALANCE PROTECTION ============
  // Step 1: if balance went negative, the overflow first eats credit.
  // Step 2: if credit also can't absorb the overflow, the broker eats the rest
  //         (cap balance at 0 — standard CFD negative balance protection).
  if (this.wallet.balance < 0) {
    const overflow = Math.abs(this.wallet.balance); // how much the loss exceeded balance
    this.wallet.balance = 0;
    if (creditBefore > 0) {
      const absorbedByCredit = Math.min(overflow, creditBefore);
      this.wallet.credit = creditBefore - absorbedByCredit;
      const remainingOverflow = overflow - absorbedByCredit;
      console.log(`[User][MT5-CREDIT-ABSORB] Loss overflow ${overflow.toFixed(4)} → credit absorbed ${absorbedByCredit.toFixed(4)} (${creditBefore.toFixed(4)} → ${this.wallet.credit.toFixed(4)})${remainingOverflow > 0 ? `, broker absorbed ${remainingOverflow.toFixed(4)} (NB-protection)` : ''} | pnl=${pnl.toFixed(4)}, balanceBefore=${balanceBefore.toFixed(4)}`);
    } else {
      console.log(`[User][NB-PROTECTION] Negative balance protection: capping balance to 0 (no credit to absorb), absorbed by broker: ${overflow.toFixed(4)}, pnl: ${pnl.toFixed(4)}, balanceBefore: ${balanceBefore.toFixed(4)}`);
    }
  }

  // Adjust equity by the settled PnL amount (keeps other positions' floating PnL intact).
  // Also subtract any credit that was burned by absorption — credit is part of equity,
  // so when credit decreases, equity must follow. Without this, equity would lag credit
  // until the next tick recalc.
  const creditBurned = creditBefore - (this.wallet.credit || 0); // positive when credit was eaten
  this.wallet.equity += pnl - creditBurned;
  if (this.wallet.equity < 0) {
    this.wallet.equity = 0;
  }
  this.wallet.freeMargin = this.wallet.equity - this.wallet.margin;

  // Update stats
  this.stats.totalTrades += 1;
  if (pnl >= 0) {
    this.stats.winningTrades += 1;
    this.stats.totalProfit += pnl;
  } else {
    this.stats.losingTrades += 1;
    this.stats.totalLoss += Math.abs(pnl);
  }
  this.stats.netPnL = this.stats.totalProfit - this.stats.totalLoss;
};

// Indexes for 3000+ users performance
// Note: oderId, email, phone already have indexes via unique: true in schema
userSchema.index({ isActive: 1, role: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ parentAdminId: 1 });
userSchema.index({ parentAdminOderId: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
