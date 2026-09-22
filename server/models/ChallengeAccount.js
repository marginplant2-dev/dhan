const mongoose = require('mongoose');

const challengeAccountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  challengeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Challenge',
    // DEMO accounts are not bought against a Challenge, so they legitimately
    // have no challengeId. Keeping this unconditionally required made every
    // demo creation throw a validation error before it could be saved.
    required: function () { return this.accountType !== 'DEMO'; }
  },
  accountId: {
    type: String,
    unique: true,
    required: true
  },

  // Account Type
  accountType: {
    type: String,
    enum: ['CHALLENGE', 'FUNDED', 'DEMO'],
    default: 'CHALLENGE'
  },

  // Phase tracking
  currentPhase: {
    type: Number,
    default: 1
  },
  totalPhases: {
    type: Number,
    required: true
  },

  // Timestamp the current phase began. Set on account creation (= phase 1
  // start) and re-set every time the account advances a phase. Used to
  // filter the Trading Journal so each phase shows only its own trades —
  // without this, a user who passed phase 1 would still see phase-1 trades
  // mixed into the phase-2 calendar.
  phaseStartedAt: {
    type: Date,
    default: null
  },

  // Status
  status: {
    type: String,
    enum: ['PENDING', 'ACTIVE', 'PASSED', 'FAILED', 'FUNDED', 'EXPIRED', 'CANCELLED'],
    default: 'ACTIVE'
  },
  failReason: {
    type: String,
    default: null
  },
  failedAt: {
    type: Date,
    default: null
  },
  passedAt: {
    type: Date,
    default: null
  },

  // Balance tracking
  initialBalance: {
    type: Number,
    required: true
  },
  currentBalance: {
    type: Number,
    required: true
  },
  currentEquity: {
    type: Number,
    required: true
  },

  // Isolated virtual sub-wallet (FTMO-style). These fields mirror
  // User.wallet but are fully independent per challenge account. Trades
  // placed on this account debit/credit ONLY these fields — the user's
  // main wallet is NEVER touched. At admin-approved payout time, the
  // platform transfers real INR from its treasury into the user's
  // walletINR, then resets these fields to initialBalance.
  walletBalance: { type: Number, default: 0 },
  walletCredit: { type: Number, default: 0 },
  walletEquity: { type: Number, default: 0 },
  walletMargin: { type: Number, default: 0 },
  walletFreeMargin: { type: Number, default: 0 },
  walletMarginLevel: { type: Number, default: 0 },

  // Phase start values (for drawdown calculation)
  phaseStartBalance: {
    type: Number,
    required: true
  },
  dayStartEquity: {
    type: Number,
    default: null
  },
  // Snapshot of walletBalance at start of trading day. Daily DD breach
  // base = max(dayStartBalance, dayStartEquity) per the rules spec — gives
  // the trader the more favourable of the two when one ended yesterday
  // higher than the other (e.g. floating loss at day-end made equity dip
  // below balance).
  dayStartBalance: {
    type: Number,
    default: null
  },
  lowestEquityToday: {
    type: Number,
    default: null
  },
  lowestEquityOverall: {
    type: Number,
    default: null
  },
  highestEquity: {
    type: Number,
    default: null
  },

  // Drawdown tracking
  currentDailyDrawdownPercent: {
    type: Number,
    default: 0
  },
  currentOverallDrawdownPercent: {
    type: Number,
    default: 0
  },
  maxDailyDrawdownHit: {
    type: Number,
    default: 0
  },
  maxOverallDrawdownHit: {
    type: Number,
    default: 0
  },

  // Profit tracking
  currentProfitPercent: {
    type: Number,
    default: 0
  },
  totalProfitLoss: {
    type: Number,
    default: 0
  },

  // Trade tracking
  tradesToday: {
    type: Number,
    default: 0
  },
  openTradesCount: {
    type: Number,
    default: 0
  },
  totalTrades: {
    type: Number,
    default: 0
  },
  tradingDaysCount: {
    type: Number,
    default: 0
  },
  lastTradingDay: {
    type: Date,
    default: null
  },
  // ISO date strings (YYYY-MM-DD) of every day the user placed at least one
  // trade — enforced against Challenge.rules.tradingDaysRequired in
  // checkProfitTarget so a user can't farm a single-day 8% spike and pass.
  uniqueTradingDays: {
    type: [String],
    default: []
  },
  expiredAt: {
    type: Date,
    default: null
  },
  // Per-day PnL map (YYYY-MM-DD → profit/loss amount). Used by the
  // max-one-day-profit and consistency rules in propTradingEngine.
  dailyPnlMap: {
    type: Map,
    of: Number,
    default: () => new Map()
  },

  // Rule violations
  violations: [{
    rule: String,
    description: String,
    severity: {
      type: String,
      enum: ['WARNING', 'FAIL']
    },
    tradeId: mongoose.Schema.Types.ObjectId,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  warningsCount: {
    type: Number,
    default: 0
  },

  // Payment
  paymentId: {
    type: String,
    default: null
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'REFUNDED', 'PAYMENT_PENDING', 'PAYMENT_REJECTED'],
    default: 'PENDING'
  },

  // Link to the pending challenge_purchase Transaction. Set when the
  // user submits a buy-request via the UPI flow; the admin approval
  // handler reads this back to activate the account.
  pendingPurchaseTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null
  },

  // IB coupon snapshot — populated only when this challenge was bought
  // with a coupon code. Captures all the params at the moment of redemption
  // so admin/IB dashboards can audit historical purchases even after the
  // IB's coupon is re-issued or revoked.
  couponSnapshot: {
    code: { type: String, default: null, uppercase: true },
    ibId: { type: mongoose.Schema.Types.ObjectId, ref: 'IB', default: null },
    ibUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    discountPercent: { type: Number, default: 0 },
    originalFee: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    finalFee: { type: Number, default: 0 },
    challengePurchaseCommissionPercent: { type: Number, default: 0 },
    ibCommissionAmount: { type: Number, default: 0 },
    ibCommissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IBCommission', default: null },
    redeemedAt: { type: Date, default: null }
  },

  // Funded account specific
  fundedAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChallengeAccount',
    default: null
  },
  profitSplitPercent: {
    type: Number,
    default: 80
  },
  totalWithdrawn: {
    type: Number,
    default: 0
  },
  lastWithdrawalDate: {
    type: Date,
    default: null
  },
  // Number of successful payouts on this funded account (resets per account,
  // not per cycle). Used for analytics / UI badges.
  payoutCount: {
    type: Number,
    default: 0
  },
  // Anchor for both the 14-day payout window and the 30-day account life.
  // Set when the engine flips an account to status='FUNDED'.
  fundedAt: {
    type: Date,
    default: null
  },
  // For demo accounts: last time the user reset the balance to initial.
  // Drives the resetCooldownHours gate in demo.service.resetDemo().
  lastResetAt: {
    type: Date,
    default: null
  },

  // Number of times this account has been reset via the PAID user reset flow
  // (pay 50% fee → admin approves → account restarts fresh). The reset offer
  // is a ONE-TIME courtesy: once resetCount >= 1 the user must buy a brand-new
  // challenge instead of resetting again. Admin's manual /admin/reset/:id does
  // NOT touch this counter — it's an admin override, independent of the
  // user's one-time paid reset.
  resetCount: {
    type: Number,
    default: 0
  },

  // Trailing drawdown (Instant / Funded accounts) — OPT-IN per account, default
  // OFF for everyone. When enabled, a trailing equity floor follows the account's
  // peak (closed-only) equity up by (initialBalance − 6%×initialBalance) and locks
  // at breakeven; a close that drops equity ≤ the floor breaches the account. This
  // REPLACES the static max-overall-drawdown floor for that account (daily DD still
  // applies). Evaluated after each trade close. See challengePropEngine /
  // propTradingEngine.onTradeClosed for the logic.
  trailingDrawdown: {
    enabled: { type: Boolean, default: false },
    peakEquity: { type: Number, default: null },
    trailingFloor: { type: Number, default: null },
    isLocked: { type: Boolean, default: false }
  },

  // Timestamps. expiresAt is null while the account is in PENDING
  // (buy-request awaiting admin approval) — clock starts ticking only
  // when the admin activates the account.
  expiresAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for IB coupon redemption queries
challengeAccountSchema.index({ 'couponSnapshot.ibId': 1, createdAt: -1 });
challengeAccountSchema.index({ 'couponSnapshot.code': 1 });

// Hot-path indexes — these fields are queried on every prop dashboard load,
// every admin count, and every cron sweep. Without them each query was a full
// collection scan (the #1 cause of slow prop APIs).
challengeAccountSchema.index({ userId: 1, status: 1 });   // user my-accounts / status
challengeAccountSchema.index({ status: 1, accountType: 1 }); // pass sweep, daily reset, counts
challengeAccountSchema.index({ status: 1, expiresAt: 1 });   // expiry sweep
challengeAccountSchema.index({ challengeId: 1 });            // per-challenge lookups
challengeAccountSchema.index({ paymentStatus: 1, status: 1 }); // dashboard completed sales

// Generate unique account ID
challengeAccountSchema.statics.generateAccountId = async function (type = 'CH') {
  const prefix = type === 'FUNDED' ? 'FND' : type === 'DM' ? 'DM' : 'CH';
  const random = Math.floor(100000 + Math.random() * 900000);
  const accountId = `${prefix}${random}`;
  const exists = await this.findOne({ accountId });
  if (exists) {
    return this.generateAccountId(type);
  }
  return accountId;
};

// Update equity and check drawdowns
challengeAccountSchema.methods.updateEquity = async function (newEquity) {
  const Challenge = mongoose.model('Challenge');
  const challenge = await Challenge.findById(this.challengeId);

  this.currentEquity = newEquity;

  if (this.lowestEquityToday === null || newEquity < this.lowestEquityToday) {
    this.lowestEquityToday = newEquity;
  }
  if (this.lowestEquityOverall === null || newEquity < this.lowestEquityOverall) {
    this.lowestEquityOverall = newEquity;
  }
  if (this.highestEquity === null || newEquity > this.highestEquity) {
    this.highestEquity = newEquity;
  }

  // Calculate daily drawdown — fixed-₹ basis per rules spec.
  //   breach when currentEquity < dayStartBalance − (initial × dailyDD%)
  //
  // We anchor on dayStartBalance (wallet balance at 00:05 IST snapshot),
  // NOT dayStartEquity, because equity at the snapshot includes floating
  // P&L on open positions. A trader holding a +₹5K floating profit
  // overnight would have dayStartEquity inflated by ₹5K; the moment that
  // floating decays back to zero next day the engine sees a phantom ₹5K
  // "loss from start" and fires DD breach even though no real loss
  // occurred. Using balance gives a clean, deterministic reference that
  // matches what the user sees in their BALANCE card.
  // Falls back to dayStartEquity for legacy accounts where
  // dayStartBalance hasn't been set yet (new field).
  const dayStart = Number(this.dayStartBalance) || Number(this.dayStartEquity) || 0;
  if (dayStart > 0 && this.initialBalance > 0) {
    const drop = Math.max(0, dayStart - Number(this.lowestEquityToday));
    const dailyDD = (drop / this.initialBalance) * 100;
    this.currentDailyDrawdownPercent = Math.max(0, dailyDD);
    if (dailyDD > this.maxDailyDrawdownHit) {
      this.maxDailyDrawdownHit = dailyDD;
    }
  }

  // Calculate overall drawdown
  const overallDD = ((this.initialBalance - this.lowestEquityOverall) / this.initialBalance) * 100;
  this.currentOverallDrawdownPercent = Math.max(0, overallDD);
  if (overallDD > this.maxOverallDrawdownHit) {
    this.maxOverallDrawdownHit = overallDD;
  }

  // Calculate profit
  this.currentProfitPercent = ((newEquity - this.phaseStartBalance) / this.phaseStartBalance) * 100;
  this.totalProfitLoss = newEquity - this.initialBalance;

  this.updatedAt = new Date();
  await this.save();

  return {
    dailyDrawdown: this.currentDailyDrawdownPercent,
    overallDrawdown: this.currentOverallDrawdownPercent,
    profitPercent: this.currentProfitPercent
  };
};

// Reset daily stats — called by the 00:05 IST cron + when first trade of a
// new IST trading day fires. Snapshots BOTH balance and equity per spec; the
// breach base will use max(dayStartBalance, dayStartEquity).
challengeAccountSchema.methods.resetDailyStats = async function () {
  this.dayStartEquity = this.currentEquity;
  this.dayStartBalance = this.currentBalance != null ? this.currentBalance : this.walletBalance;
  this.lowestEquityToday = this.currentEquity;
  this.tradesToday = 0;
  this.currentDailyDrawdownPercent = 0;

  await this.save();
};

// Add violation
challengeAccountSchema.methods.addViolation = async function (rule, description, severity, tradeId = null) {
  this.violations.push({ rule, description, severity, tradeId, timestamp: new Date() });
  if (severity === 'WARNING') {
    this.warningsCount += 1;
  }
  if (severity === 'FAIL') {
    this.status = 'FAILED';
    this.failReason = `${rule}: ${description}`;
    this.failedAt = new Date();
  }
  await this.save();
  return this;
};

module.exports = mongoose.model('ChallengeAccount', challengeAccountSchema);
