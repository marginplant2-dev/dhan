const mongoose = require('mongoose');
const Challenge = require('../models/Challenge');
const ChallengeAccount = require('../models/ChallengeAccount');
const PropSettings = require('../models/PropSettings');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const ibCouponService = require('./ibCoupon.service');
const globalCouponService = require('./globalCoupon.service');

/**
 * Day-bucket key in IST. dailyPnlMap and uniqueTradingDays are keyed by
 * the trader's local trading day, NOT UTC. Previously we used
 * `new Date().toISOString().slice(0, 10)` (UTC) which split a single
 * IST trading day across two buckets whenever a trade closed between
 * 00:00 and 05:30 IST — that wrongly inflated the max-one-day-profit
 * check (the "day's" profit was actually only part of yesterday's IST
 * day) and double-counted uniqueTradingDays for one calendar day.
 */
function istDayKey(d = new Date()) {
  const ist = new Date(new Date(d).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist.toISOString().slice(0, 10);
}

const ERROR_CODES = {
  CHALLENGE_MODE_DISABLED: 'CHALLENGE_MODE_DISABLED',
  CHALLENGE_NOT_FOUND: 'CHALLENGE_NOT_FOUND',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_NOT_ACTIVE: 'ACCOUNT_NOT_ACTIVE',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  STOP_LOSS_REQUIRED: 'STOP_LOSS_REQUIRED',
  MAX_TRADES_PER_DAY: 'MAX_TRADES_PER_DAY',
  MAX_CONCURRENT_TRADES: 'MAX_CONCURRENT_TRADES',
  LOT_SIZE_VIOLATION: 'LOT_SIZE_VIOLATION',
  SYMBOL_NOT_ALLOWED: 'SYMBOL_NOT_ALLOWED',
  SEGMENT_NOT_ALLOWED: 'SEGMENT_NOT_ALLOWED',
  MIN_HOLD_TIME: 'MIN_HOLD_TIME',
  DAILY_DRAWDOWN_BREACH: 'DAILY_DRAWDOWN_BREACH',
  OVERALL_DRAWDOWN_BREACH: 'OVERALL_DRAWDOWN_BREACH',
  EXPIRED: 'EXPIRED',
  MAX_LEVERAGE_EXCEEDED: 'MAX_LEVERAGE_EXCEEDED',
  TAKE_PROFIT_REQUIRED: 'TAKE_PROFIT_REQUIRED',
  MAX_TOTAL_TRADES: 'MAX_TOTAL_TRADES',
  MIN_TRADES_NOT_MET: 'MIN_TRADES_NOT_MET',
  TRADING_DAYS_NOT_MET: 'TRADING_DAYS_NOT_MET',
  MAX_ONE_DAY_PROFIT: 'MAX_ONE_DAY_PROFIT',
  CONSISTENCY_RULE: 'CONSISTENCY_RULE',
  // Soft "stop for today" gate: today's profit already hit the per-day cap, so
  // any further profit today is wasted (won't count toward target). Blocks new
  // trade-opens (closes still allowed) and tells the trader to resume next day.
  DAILY_PROFIT_CAP_REACHED: 'DAILY_PROFIT_CAP_REACHED'
};

class PropTradingEngine {
  constructor() {
    this.ERROR_CODES = ERROR_CODES;
  }

  /**
   * Check if challenge mode is enabled for an admin
   */
  async isChallengeEnabled(adminId) {
    const settings = await PropSettings.getSettings(adminId || null);
    return settings?.challengeModeEnabled === true;
  }

  /**
   * Compute challenge expiry date
   */
  computeExpiresAt(challenge) {
    const expiresAt = new Date();
    const expiryDays = challenge.rules?.challengeExpiryDays;
    if (challenge.stepsCount === 0 && !expiryDays) {
      expiresAt.setFullYear(expiresAt.getFullYear() + 50); // instant fund = no expiry
    } else {
      const n = Number(expiryDays);
      expiresAt.setDate(expiresAt.getDate() + (Number.isFinite(n) && n > 0 ? n : 30));
    }
    return expiresAt;
  }

  /**
   * Buy challenge — deduct from wallet and create ChallengeAccount.
   * Optionally applies an IB coupon to discount the fee and credit the
   * IB's wallet with the configured commission percentage.
   */
  async buyChallenge(userId, challengeId, tierIndex, couponCode = null) {
    const challenge = await Challenge.findById(challengeId);
    if (!challenge || !challenge.isActive) {
      throw new Error('Challenge not found or inactive');
    }

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Check if challenge mode is enabled
    const enabled = await this.isChallengeEnabled(challenge.adminId);
    if (!enabled) throw new Error('Challenge mode is currently disabled');

    // Resolve the (fundSize, fee) pair the user is buying. Prefer the picked
    // tier; fall back to the legacy single fundSize/fee if the challenge has
    // no tiers or no tierIndex was sent.
    let fundSize, challengeFee;
    if (Array.isArray(challenge.tiers) && challenge.tiers.length > 0) {
      const idx = Number.isInteger(tierIndex) ? tierIndex : 0;
      if (idx < 0 || idx >= challenge.tiers.length) {
        throw new Error('Invalid tier selection');
      }
      const tier = challenge.tiers[idx];
      fundSize = Number(tier.fundSize);
      challengeFee = Number(tier.challengeFee);
    } else {
      fundSize = Number(challenge.fundSize);
      challengeFee = Number(challenge.challengeFee);
    }
    if (!(fundSize > 0) || !(challengeFee >= 0)) {
      throw new Error('Challenge pricing is misconfigured');
    }

    const originalFee = challengeFee;

    // Apply IB coupon if provided. Throws on any invalid state — message
    // is bubbled straight to the API response.
    let couponContext = null;
    let reservedCouponId = null;
    if (couponCode) {
      // 1) Read-only pre-flight validation (self-redemption, expiry,
      //    suspended IB, etc).
      couponContext = await ibCouponService.validateCouponForPurchase(couponCode, userId, originalFee);
      // 2) Atomically reserve a redemption slot. This is the cap-safety
      //    gate — concurrent buyers (e.g. user double-clicks Buy) cannot
      //    both pass this step.
      const reserved = await ibCouponService.reserveCouponSlot(couponCode);
      reservedCouponId = reserved._id;
      // Refresh context with the post-increment doc so couponSnapshot
      // reflects the actual count after this redemption.
      couponContext.coupon = reserved;
      challengeFee = couponContext.finalFee;
    }

    try {
      // Check user's wallet balance (stored on User.wallet embedded field)
      const userBalance = Number(user.wallet?.balance) || 0;
      if (userBalance < challengeFee) {
        throw new Error(`Insufficient balance. Need ₹${challengeFee}, available: ₹${userBalance.toFixed(2)}`);
      }

      // Deduct (discounted) fee from user's wallet
      user.wallet.balance = userBalance - challengeFee;
      await user.save();
    } catch (err) {
      // Roll back the reserved slot so the cap is intact for the next
      // buyer.
      if (reservedCouponId) {
        try { await ibCouponService.releaseCouponSlot(reservedCouponId); } catch (e) { /* swallow */ }
      }
      throw err;
    }

    // From here on, any failure must release the coupon slot reserved above
    // AND refund the user's wallet (we already debited it).
    let account;
    let couponResult = null;
    try {
    // Create challenge account
    const isInstant = challenge.stepsCount === 0;
    const accountId = await ChallengeAccount.generateAccountId('CH');
    const totalPhases = isInstant ? 0 : challenge.stepsCount;
    const now = new Date();
    // Instant (0-Step) = TRUE instant funding → the account is created DIRECTLY
    // as a proper FUNDED account (no evaluation, no profit target to pass). The
    // funded lifetime + payout gates apply from the moment of purchase.
    const fundedLifetimeDays = Number(challenge.fundedSettings?.accountLifetimeDays) > 0
      ? Number(challenge.fundedSettings.accountLifetimeDays)
      : 30;
    const expiresAt = isInstant
      ? new Date(now.getTime() + fundedLifetimeDays * 86400000)
      : this.computeExpiresAt(challenge);

    account = await ChallengeAccount.create({
      userId,
      challengeId: challenge._id,
      accountId,
      accountType: isInstant ? 'FUNDED' : 'CHALLENGE',
      currentPhase: isInstant ? 0 : 1,
      totalPhases,
      status: isInstant ? 'FUNDED' : 'ACTIVE',
      initialBalance: fundSize,
      currentBalance: fundSize,
      currentEquity: fundSize,
      phaseStartBalance: fundSize,
      phaseStartedAt: now,
      dayStartEquity: fundSize,
      dayStartBalance: fundSize,
      lowestEquityToday: fundSize,
      lowestEquityOverall: fundSize,
      highestEquity: fundSize,
      // Isolated sub-wallet — virtual money that the user trades on.
      walletBalance: fundSize,
      walletEquity: fundSize,
      walletCredit: 0,
      walletMargin: 0,
      walletFreeMargin: fundSize,
      walletMarginLevel: 0,
      profitSplitPercent: challenge.fundedSettings?.profitSplitPercent || 80,
      paymentStatus: 'COMPLETED',
      // Instant-funded: anchor payout-age + lifetime gates from purchase time.
      fundedAt: isInstant ? now : null,
      payoutCount: 0,
      expiresAt
    });

    // If a coupon was applied, record the redemption: create the
    // IBCommission ledger row, credit the IB's wallet, and snapshot the
    // full coupon state onto the ChallengeAccount for audit.
    if (couponContext) {
      const commission = await ibCouponService.redeemCoupon({
        ib: couponContext.ib,
        coupon: couponContext.coupon,
        challengeAccount: account,
        buyerUserId: userId,
        originalFee: couponContext.originalFee,
        discountAmount: couponContext.discountAmount,
        finalFee: couponContext.finalFee,
        commissionAmount: couponContext.commissionAmount
      });
      account.couponSnapshot = {
        code: couponContext.coupon.code,
        ibId: couponContext.ib._id,
        ibUserId: couponContext.ib.userId,
        discountPercent: couponContext.discountPercent,
        originalFee: couponContext.originalFee,
        discountAmount: couponContext.discountAmount,
        finalFee: couponContext.finalFee,
        challengePurchaseCommissionPercent: couponContext.commissionPercent,
        ibCommissionAmount: couponContext.commissionAmount,
        ibCommissionId: commission._id,
        redeemedAt: new Date()
      };
      await account.save();

      couponResult = {
        applied: true,
        code: couponContext.coupon.code,
        discountPercent: couponContext.discountPercent,
        originalFee: couponContext.originalFee,
        discountAmount: couponContext.discountAmount,
        finalFee: couponContext.finalFee,
        ibCommissionAmount: couponContext.commissionAmount
      };
    }
    } catch (err) {
      // Rollback: refund wallet, release coupon slot, drop the partial
      // ChallengeAccount if it was created.
      try {
        const u = await User.findById(userId);
        if (u) {
          u.wallet.balance = (Number(u.wallet?.balance) || 0) + Number(challengeFee);
          await u.save();
        }
      } catch (e) { /* swallow */ }
      if (reservedCouponId) {
        try { await ibCouponService.releaseCouponSlot(reservedCouponId); } catch (e) { /* swallow */ }
      }
      if (account && account._id) {
        try { await ChallengeAccount.deleteOne({ _id: account._id }); } catch (e) { /* swallow */ }
      }
      throw err;
    }

    return { account, challenge, coupon: couponResult };
  }

  /**
   * Request a challenge purchase via direct UPI payment.
   *
   * The user pays admin's UPI externally and submits the txn reference +
   * screenshot through the buy-request modal. We:
   *   1. validate the challenge + tier + (optional) coupon (read-only)
   *   2. reserve the coupon slot atomically (so cap can't overflow even
   *      under double-submit) — released on rejection
   *   3. create a ChallengeAccount in PENDING / PAYMENT_PENDING state
   *      (wallet sub-fields populated so activation is just a status flip)
   *   4. create a Transaction (type='challenge_purchase', status='pending')
   *      that is what the admin sees in the Bank & Fund Management →
   *      Challenge Buys queue
   * No money is moved. The user's main wallet is never touched.
   */
  async requestChallengeBuy(userId, { challengeId, tierIndex, couponCode, paymentProof, paymentMethod = 'upi', razorpayOrderId = null }) {
    const Transaction = require('../models/Transaction');

    // Manual UPI needs the payment proof up front. Razorpay creates the pending
    // record first and attaches the gateway order id afterwards, so it skips this.
    if (paymentMethod === 'upi' && (!paymentProof || !paymentProof.adminUpiId || !paymentProof.transactionRef)) {
      throw new Error('Admin UPI ID and transaction reference are required');
    }

    const challenge = await Challenge.findById(challengeId);
    if (!challenge || !challenge.isActive) {
      throw new Error('Challenge not found or inactive');
    }
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const enabled = await this.isChallengeEnabled(challenge.adminId);
    if (!enabled) throw new Error('Challenge mode is currently disabled');

    // Resolve tier
    let fundSize, challengeFee;
    if (Array.isArray(challenge.tiers) && challenge.tiers.length > 0) {
      const idx = Number.isInteger(tierIndex) ? tierIndex : 0;
      if (idx < 0 || idx >= challenge.tiers.length) throw new Error('Invalid tier selection');
      const tier = challenge.tiers[idx];
      fundSize = Number(tier.fundSize);
      challengeFee = Number(tier.challengeFee);
    } else {
      fundSize = Number(challenge.fundSize);
      challengeFee = Number(challenge.challengeFee);
    }
    if (!(fundSize > 0) || !(challengeFee >= 0)) {
      throw new Error('Challenge pricing is misconfigured');
    }

    const originalFee = challengeFee;
    let couponContext = null;
    let couponType = null;       // 'ib' or 'global'
    let reservedCouponId = null;
    if (couponCode) {
      // Try IB coupon first; if not found, fall back to GlobalCoupon
      let ibError = null;
      try {
        couponContext = await ibCouponService.validateCouponForPurchase(couponCode, userId, originalFee);
        const reserved = await ibCouponService.reserveCouponSlot(couponCode);
        reservedCouponId = reserved._id;
        couponContext.coupon = reserved;
        couponType = 'ib';
      } catch (e) {
        ibError = e;
      }
      if (!couponContext) {
        try {
          couponContext = await globalCouponService.validate(couponCode, userId, originalFee);
          const reserved = await globalCouponService.reserveSlot(couponCode);
          reservedCouponId = reserved._id;
          couponContext.coupon = reserved;
          couponType = 'global';
        } catch (e) {
          // Surface global error if it's a meaningful one (first-time block, expired);
          // otherwise surface the IB error (which is most likely "Invalid coupon code")
          const msg = String(e.message || '');
          if (/first|expired|disabled|limit reached/i.test(msg)) throw e;
          throw ibError || e;
        }
      }
      challengeFee = couponContext.finalFee;
    }

    let account = null;
    let tx = null;
    try {
      // Pre-populate the challenge account so activation is just a status flip.
      const accountId = await ChallengeAccount.generateAccountId('CH');
      const totalPhases = challenge.stepsCount === 0 ? 0 : challenge.stepsCount;

      account = await ChallengeAccount.create({
        userId,
        challengeId: challenge._id,
        accountId,
        accountType: 'CHALLENGE',
        currentPhase: challenge.stepsCount === 0 ? 0 : 1,
        totalPhases,
        status: 'PENDING',
        initialBalance: fundSize,
        currentBalance: fundSize,
        currentEquity: fundSize,
        phaseStartBalance: fundSize,
        phaseStartedAt: new Date(),
        dayStartEquity: fundSize,
        lowestEquityToday: fundSize,
        lowestEquityOverall: fundSize,
        highestEquity: fundSize,
        walletBalance: fundSize,
        walletEquity: fundSize,
        walletCredit: 0,
        walletMargin: 0,
        walletFreeMargin: fundSize,
        walletMarginLevel: 0,
        profitSplitPercent: challenge.fundedSettings?.profitSplitPercent || 80,
        paymentStatus: 'PAYMENT_PENDING',
        expiresAt: null
      });

      // Automated gateways (Razorpay, Cashfree) skip the manual UPI proof — the
      // order id is stamped onto paymentDetails by the gateway route after this.
      const isGateway = paymentMethod === 'razorpay' || paymentMethod === 'cashfree';
      tx = await Transaction.create({
        oderId: user.oderId,
        type: 'challenge_purchase',
        amount: challengeFee,
        currency: 'INR',
        paymentMethod: isGateway ? paymentMethod : 'upi',
        paymentDetails: isGateway
          ? (paymentMethod === 'razorpay' ? { razorpayOrderId: razorpayOrderId || null } : {})
          : {
              upiId: String(paymentProof.adminUpiId).trim(),
              referenceNumber: String(paymentProof.transactionRef).trim()
            },
        proofImage: isGateway ? '' : (paymentProof.screenshotBase64 || ''),
        status: 'pending',
        userName: user.name || '',
        userNote: isGateway ? `Paid via ${paymentMethod === 'cashfree' ? 'Cashfree' : 'Razorpay'}` : String(paymentProof.note || '').slice(0, 500),
        challengePurchaseInfo: {
          challengeId: challenge._id,
          challengeAccountId: account._id,
          challengeName: challenge.name || '',
          tierIndex: Number.isInteger(tierIndex) ? tierIndex : 0,
          fundSize,
          originalFee,
          finalFee: challengeFee,
          couponCode: couponContext ? couponContext.coupon.code : null,
          couponDiscountAmount: couponContext ? couponContext.discountAmount : 0,
          ibCouponId: couponContext && couponType === 'ib' ? couponContext.coupon._id : null,
          globalCouponId: couponContext && couponType === 'global' ? couponContext.coupon._id : null,
          couponType: couponContext ? couponType : null
        }
      });

      account.pendingPurchaseTransactionId = tx._id;
      await account.save();

      return {
        account,
        transaction: tx,
        fee: challengeFee,        // final payable (after coupon) — used to size the Razorpay order
        originalFee,
        coupon: couponContext ? {
          applied: true,
          code: couponContext.coupon.code,
          discountPercent: couponContext.discountPercent,
          originalFee: couponContext.originalFee,
          discountAmount: couponContext.discountAmount,
          finalFee: couponContext.finalFee
        } : null
      };
    } catch (err) {
      // Rollback: release coupon slot, drop the partial account / tx.
      if (reservedCouponId) {
        try {
          if (couponType === 'global') await globalCouponService.releaseSlot(reservedCouponId);
          else await ibCouponService.releaseCouponSlot(reservedCouponId);
        } catch (e) { /* swallow */ }
      }
      if (account?._id) {
        try { await ChallengeAccount.deleteOne({ _id: account._id }); } catch (e) { /* swallow */ }
      }
      if (tx?._id) {
        try { await Transaction.deleteOne({ _id: tx._id }); } catch (e) { /* swallow */ }
      }
      throw err;
    }
  }

  /**
   * Validate trade open request against challenge rules
   */
  async validateTradeOpen(challengeAccountId, tradeParams) {
    const account = await ChallengeAccount.findById(challengeAccountId).populate('challengeId');
    if (!account) {
      return { valid: false, error: 'Challenge account not found', code: ERROR_CODES.ACCOUNT_NOT_FOUND };
    }

    // Demo accounts are always tradable — no status/expiry/rule gates.
    if (account.accountType === 'DEMO') {
      return { valid: true, account, challenge: account.challengeId };
    }

    if (account.status !== 'ACTIVE' && account.status !== 'FUNDED') {
      return { valid: false, error: `Account is ${account.status}`, code: ERROR_CODES.ACCOUNT_NOT_ACTIVE };
    }

    // Check expiry
    if (account.expiresAt && new Date() > new Date(account.expiresAt)) {
      account.status = 'EXPIRED';
      await account.save();
      return { valid: false, error: 'Challenge has expired', code: ERROR_CODES.EXPIRED };
    }

    const challenge = account.challengeId;
    const rules = challenge.rules || {};

    // SL / TP are optional on all challenges — users can trade without them.
    // (The schema keeps stopLossMandatory / takeProfitMandatory for historical
    // data compatibility but the validator no longer enforces them.)

    // Max leverage
    if (rules.maxLeverage && tradeParams.leverage && Number(tradeParams.leverage) > Number(rules.maxLeverage)) {
      return { valid: false, error: `Leverage ${tradeParams.leverage}x exceeds max ${rules.maxLeverage}x`, code: ERROR_CODES.MAX_LEVERAGE_EXCEEDED };
    }

    // Max trades per day
    if (rules.maxTradesPerDay && account.tradesToday >= rules.maxTradesPerDay) {
      return { valid: false, error: `Max ${rules.maxTradesPerDay} trades per day reached`, code: ERROR_CODES.MAX_TRADES_PER_DAY };
    }

    // ── Max one-day-profit cap reached → stop NEW opens for the rest of the
    // IST day. Once today's realised profit hits the cap, block new trade-opens
    // and tell the trader to resume next day. Position CLOSES are still allowed
    // (validateTradeClose is separate), so nobody gets trapped.
    // Applies to BOTH evaluation (ACTIVE) AND funded (FUNDED / Instant) accounts:
    // the cap is shown in the Objectives panel for all of them, so it must be
    // enforced for all of them — previously it was gated to ACTIVE only, which
    // let funded/instant accounts keep trading after the cap was hit.
    // Opt-in: only fires when a cap is configured (getMaxOneDayProfitAbs > 0).
    if (account.status === 'ACTIVE' || account.status === 'FUNDED') {
      const oneDayCap = this.getMaxOneDayProfitAbs(account, challenge);
      if (oneDayCap > 0) {
        const todayKey = istDayKey();
        const todayProfit = Number((account.dailyPnlMap && account.dailyPnlMap.get(todayKey)) || 0);
        if (todayProfit >= oneDayCap - 1e-6) {
          const inr = (n) => Math.round(n).toLocaleString('en-IN');
          return {
            valid: false,
            code: ERROR_CODES.DAILY_PROFIT_CAP_REACHED,
            error: `Daily profit cap reached. You've already made ₹${inr(todayProfit)} today (max ₹${inr(oneDayCap)}/day). Please resume trading on the next trading day.`,
            dailyProfit: todayProfit,
            cap: oneDayCap
          };
        }
      }
    }

    // Max total trades over the lifetime of the account
    if (rules.maxTotalTrades && account.totalTrades >= rules.maxTotalTrades) {
      return { valid: false, error: `Max total ${rules.maxTotalTrades} trades reached`, code: ERROR_CODES.MAX_TOTAL_TRADES };
    }

    // Max concurrent trades
    if (rules.maxConcurrentTrades && account.openTradesCount >= rules.maxConcurrentTrades) {
      return { valid: false, error: `Max ${rules.maxConcurrentTrades} concurrent trades reached`, code: ERROR_CODES.MAX_CONCURRENT_TRADES };
    }

    // Lot size validation
    const qty = tradeParams.quantity || tradeParams.lots;
    if (rules.minLotSize && qty < rules.minLotSize) {
      return { valid: false, error: `Minimum lot size is ${rules.minLotSize}`, code: ERROR_CODES.LOT_SIZE_VIOLATION };
    }
    if (rules.maxLotSize && qty > rules.maxLotSize) {
      return { valid: false, error: `Maximum lot size is ${rules.maxLotSize}`, code: ERROR_CODES.LOT_SIZE_VIOLATION };
    }
    // Whole-lots-only enforcement: when admin disables fractional lots,
    // values like 1.5 / 2.5 / 3.5 are rejected. Tolerance handles float drift.
    // Also enforce when minLotSize >= 1 (whole number) unless fractional is explicitly allowed.
    const wholeLotEnforced = rules.allowFractionalLots === false ||
      (rules.allowFractionalLots !== true && rules.minLotSize >= 1 && rules.minLotSize % 1 === 0);
    if (wholeLotEnforced) {
      const rounded = Math.round(qty);
      if (Math.abs(qty - rounded) > 1e-9) {
        return { valid: false, error: 'Fractional lots are not allowed on this challenge — use whole numbers (1, 2, 3 …)', code: ERROR_CODES.LOT_SIZE_VIOLATION };
      }
    }

    // Allowed symbols
    if (rules.allowedSymbols && rules.allowedSymbols.length > 0) {
      if (!rules.allowedSymbols.includes(tradeParams.symbol)) {
        return { valid: false, error: `Symbol ${tradeParams.symbol} is not allowed`, code: ERROR_CODES.SYMBOL_NOT_ALLOWED };
      }
    }

    // Allowed segments
    if (rules.allowedSegments && rules.allowedSegments.length > 0) {
      const seg = (tradeParams.segment || '').toUpperCase();
      if (!rules.allowedSegments.includes(seg)) {
        return { valid: false, error: `Segment ${tradeParams.segment} is not allowed`, code: ERROR_CODES.SEGMENT_NOT_ALLOWED };
      }
    }

    return { valid: true, account, challenge };
  }

  /**
   * Validate trade close request (min hold time)
   */
  async validateTradeClose(challengeAccountId, trade) {
    const account = await ChallengeAccount.findById(challengeAccountId).populate('challengeId');
    if (!account) return { valid: false, error: 'Account not found' };

    const rules = account.challengeId?.rules || {};

    if (rules.minTradeHoldTimeSeconds > 0 && trade.openedAt) {
      const holdTime = (Date.now() - new Date(trade.openedAt).getTime()) / 1000;
      if (holdTime < rules.minTradeHoldTimeSeconds) {
        const remaining = Math.ceil(rules.minTradeHoldTimeSeconds - holdTime);
        return { valid: false, error: `Wait ${remaining} more seconds (min hold time)`, code: ERROR_CODES.MIN_HOLD_TIME, remainingSeconds: remaining };
      }
    }
    return { valid: true, account };
  }

  /**
   * Called when a trade is opened on a challenge account
   */
  async onTradeOpened(challengeAccountId) {
    const account = await ChallengeAccount.findById(challengeAccountId).populate('challengeId');
    if (!account) return null;

    // Demo accounts: bump counters only, skip DD breach + rule evaluation.
    if (account.accountType === 'DEMO') {
      account.openTradesCount += 1;
      account.tradesToday += 1;
      account.totalTrades += 1;
      await account.save();
      return account;
    }

    account.openTradesCount += 1;
    account.tradesToday += 1;
    account.totalTrades += 1;

    // Check if new trading day. IST-anchored so a single Indian trading
    // day is one bucket regardless of UTC midnight crossing.
    const todayIso = istDayKey();              // YYYY-MM-DD in IST
    const lastDayIso = account.lastTradingDay ? istDayKey(account.lastTradingDay) : null;
    const today = todayIso;                    // alias kept for readability below
    const lastDay = lastDayIso;
    if (today !== lastDay) {
      account.tradingDaysCount += 1;
      account.lastTradingDay = new Date();
      account.tradesToday = 1;
      // Snapshot BOTH balance and equity at start of day so Daily DD uses
      // max(dayStartBalance, dayStartEquity) per rules spec.
      account.dayStartEquity = account.currentEquity;
      account.dayStartBalance = account.currentBalance != null ? account.currentBalance : account.walletBalance;
      account.lowestEquityToday = account.currentEquity;
    }

    // Track unique trading days for tradingDaysRequired rule. We use an
    // array of ISO date strings because Mongoose doesn't support Set types
    // natively; duplicates are suppressed with a simple includes-check.
    if (!Array.isArray(account.uniqueTradingDays)) account.uniqueTradingDays = [];
    if (!account.uniqueTradingDays.includes(todayIso)) {
      account.uniqueTradingDays.push(todayIso);
    }

    await account.save();

    // Re-evaluate equity and DD on every trade-open so a breach from a previous
    // tick (e.g. unrealised loss from earlier trades) can't be masked by simply
    // opening a new position. FUNDED accounts use the funded-phase DD rules
    // (4% daily / 10% overall by default) — different from the evaluation rules.
    if (account.challengeId && (account.status === 'ACTIVE' || account.status === 'FUNDED')) {
      const ddRules = account.status === 'FUNDED'
        ? (account.challengeId.fundedSettings || {})
        : (account.challengeId.rules || {});
      await this.checkDrawdownBreach(account, ddRules);
    }

    return account;
  }

  /**
   * Called when a trade is closed — updates balance, checks rules
   */
  async onTradeClosed(challengeAccountId, closePnL, opts = {}) {
    const account = await ChallengeAccount.findById(challengeAccountId).populate('challengeId');
    if (!account) return null;

    // When the caller (challengePropEngine.closePosition) has ALREADY settled
    // the sub-wallet (walletBalance += pnl; currentBalance = walletBalance),
    // we must NOT add closePnL to the balance again here — doing so double-
    // counts the trade and inflates currentBalance/currentEquity by the
    // trade's P&L (this was the recurring "balance/profit/DD wrong every day"
    // bug). In that case we sync from the already-settled walletBalance.
    // The other callers (/trade-closed route, tradeHooks) do NOT pre-settle,
    // so they keep the original `+= closePnL` behaviour.
    const settled = opts.balanceAlreadySettled === true;

    // Demo accounts: book P&L into balance, skip every rule + violation check.
    if (account.accountType === 'DEMO') {
      if (settled) {
        account.currentBalance = Number(account.walletBalance);
        account.currentEquity = Number(account.walletEquity ?? account.walletBalance);
      } else {
        account.currentBalance += closePnL;
        account.currentEquity = account.currentBalance;
        account.walletBalance = account.currentBalance;
        account.walletEquity = account.currentEquity;
      }
      account.openTradesCount = Math.max(0, account.openTradesCount - 1);
      account.totalProfitLoss = (Number(account.totalProfitLoss) || 0) + closePnL;
      await account.save();
      return { account, failed: false, demo: true };
    }

    const challenge = account.challengeId;
    const rules = challenge.rules || {};
    // Funded accounts enforce fundedSettings DD rules (4% daily / 10% overall
    // by default) instead of the evaluation rules. Evaluation accounts keep
    // using challenge.rules.
    const ddRules = account.status === 'FUNDED'
      ? (challenge.fundedSettings || {})
      : rules;

    // Update balance — when closePosition already settled the sub-wallet,
    // sync from walletBalance instead of re-adding closePnL (avoids the
    // double-count that inflated currentBalance/currentEquity by one trade).
    if (settled) {
      account.currentBalance = Number(account.walletBalance);
      account.currentEquity = Number(account.walletEquity ?? account.walletBalance);
    } else {
      account.currentBalance += closePnL;
      account.currentEquity = account.currentBalance;
    }
    account.openTradesCount = Math.max(0, account.openTradesCount - 1);
    account.totalProfitLoss += closePnL;

    // Update equity tracking
    await account.updateEquity(account.currentEquity);

    // Track daily PnL for max-one-day-profit / consistency rules. Keyed
    // by IST trading day (NOT UTC) so a single Indian session is one
    // bucket — see istDayKey() at top of file for the full rationale.
    const todayIso = istDayKey();
    if (!account.dailyPnlMap) account.dailyPnlMap = new Map();
    const prevDayPnl = account.dailyPnlMap.get(todayIso) || 0;
    account.dailyPnlMap.set(todayIso, prevDayPnl + closePnL);
    account.markModified('dailyPnlMap');

    // Trailing drawdown is active for this account? (Instant/Funded, opt-in.)
    // When on, the static overall-DD floor is skipped and replaced by the
    // trailing floor evaluated below; daily DD still applies as normal.
    const trailingOn = account.accountType === 'FUNDED'
      && account.trailingDrawdown && account.trailingDrawdown.enabled === true;

    // Check drawdown breach (daily always; overall skipped when trailing is on)
    const ddResult = await this.checkDrawdownBreach(account, ddRules, null, { skipOverall: trailingOn });
    if (ddResult.breached) {
      return { account, failed: true, reason: ddResult.reason };
    }

    // ── Trailing drawdown floor (evaluated after each trade close) ──────────
    // Peak tracks the highest CLOSED equity (currentBalance = initial + realised;
    // floating P&L is never counted). Floor = peak − 6%×initial, only moves up,
    // and locks at breakeven (initialBalance). Breach when closed equity ≤ floor.
    if (trailingOn) {
      const td = account.trailingDrawdown;
      const initial = Number(account.initialBalance) || 0;
      const trailAbs = 0.06 * initial;
      const closedEquity = Number(account.currentBalance) || 0;

      if (td.peakEquity == null || closedEquity > td.peakEquity) td.peakEquity = closedEquity;
      if (!td.isLocked) {
        let floor = td.peakEquity - trailAbs;
        if (floor >= initial) { floor = initial; td.isLocked = true; }
        td.trailingFloor = floor;
      } else {
        td.trailingFloor = initial;
      }
      account.markModified('trailingDrawdown');

      if (closedEquity <= td.trailingFloor) {
        account.status = 'FAILED';
        account.failedAt = new Date();
        account.failReason = `Trailing drawdown breach — equity ₹${Math.round(closedEquity).toLocaleString('en-IN')} ≤ floor ₹${Math.round(td.trailingFloor).toLocaleString('en-IN')}`;
        await account.addViolation('TRAILING_DRAWDOWN_BREACH', account.failReason, 'FAIL');
        this.sendAccountResultEmail(account, 'breached').catch(() => {});
        // Auto-close any open positions on the now-failed account.
        try {
          const ChallengePosition = require('../models/ChallengePosition');
          const challengePropEngine = require('./challengePropEngine.service');
          const ZerodhaService = require('./zerodha.service');
          const livePrices = typeof ZerodhaService.getAllPrices === 'function' ? ZerodhaService.getAllPrices() : {};
          const stillOpen = await ChallengePosition.find({ challengeAccountId: account._id, status: 'open' });
          for (const p of stillOpen) {
            const lp = livePrices[p.symbol] || {};
            const px = Number(lp.lastPrice || lp.last_price || lp.ltp || p.currentPrice || p.entryPrice) || Number(p.entryPrice);
            if (px > 0) await challengePropEngine.closePosition(p.positionId, px, 'trailing_breach').catch(() => {});
          }
        } catch (_) { /* best-effort auto-close */ }
        return { account, failed: true, reason: account.failReason };
      }
      await account.save();
    }

    // Check max one-day profit rule
    const oneDayResult = await this.checkMaxOneDayProfit(account, challenge);
    if (oneDayResult.violated) {
      // Warn but don't fail — the account just can't pass while violated
    }

    // Check profit target (phase progression) — only for evaluation accounts.
    // FUNDED accounts use payout-gates (withdrawProfit) instead of pass logic,
    // so we must NOT call checkProfitTarget on them (it would otherwise
    // re-trigger "pass" → create another funded account from a funded account).
    if (account.status === 'ACTIVE') {
      const profitResult = await this.checkProfitTarget(account, challenge);
      if (profitResult.targetReached) {
        return { account, phaseCompleted: true, nextPhase: profitResult.nextPhase, funded: profitResult.funded };
      }
    }

    await account.save();
    return { account, failed: false };
  }

  /**
   * Real-time equity update (called on price changes for open positions)
   */
  async updateRealTimeEquity(challengeAccountId, newEquity, markPriceMap = null) {
    const account = await ChallengeAccount.findById(challengeAccountId).populate('challengeId');
    if (!account) return null;

    // Demo accounts: just mark-to-market, skip DD breach checks entirely.
    if (account.accountType === 'DEMO') {
      account.currentEquity = newEquity;
      account.walletEquity = newEquity;
      await account.save();
      return { account, breached: false, demo: true };
    }

    if (account.status !== 'ACTIVE' && account.status !== 'FUNDED') return null;

    // FUNDED accounts use funded-phase DD rules (4% daily / 10% overall);
    // evaluation accounts use challenge.rules.
    const rules = account.status === 'FUNDED'
      ? (account.challengeId?.fundedSettings || {})
      : (account.challengeId?.rules || {});
    await account.updateEquity(newEquity);

    // Pass the per-position markPriceMap (captured by refreshEquity in the
    // same tick) so the auto-close on breach uses the EXACT mark price that
    // caused the floating dip, not a possibly-recovered DB re-read.
    // Trailing-drawdown accounts skip the static overall floor on ticks too —
    // their trailing floor is evaluated only after a trade CLOSES (in
    // onTradeClosed), never on floating ticks. Daily DD still applies live.
    const trailingOn = account.accountType === 'FUNDED'
      && account.trailingDrawdown && account.trailingDrawdown.enabled === true;
    const ddResult = await this.checkDrawdownBreach(account, rules, markPriceMap, { skipOverall: trailingOn });
    if (ddResult.breached) {
      return { account, breached: true, reason: ddResult.reason };
    }

    return {
      account,
      breached: false,
      dailyDrawdown: account.currentDailyDrawdownPercent,
      overallDrawdown: account.currentOverallDrawdownPercent,
      profitPercent: account.currentProfitPercent
    };
  }

  /**
   * Send the breach (Email 4) or pass (Email 5) email for a challenge account.
   * Best-effort + self-contained (lazy requires avoid circular imports). Called
   * from both the auto engine checks and the admin force-pass/force-fail routes.
   * @param {object} account ChallengeAccount document
   * @param {'breached'|'passed'} outcome
   */
  async sendAccountResultEmail(account, outcome) {
    try {
      if (!account) return;
      const emailService = require('./email.service');
      const User = require('../models/User');
      const user = await User.findById(account.userId).select('name email oderId').lean();
      if (!user?.email) return;
      const userName = user.name || user.oderId || 'Trader';

      if (outcome === 'breached') {
        await emailService.sendTemplatedEmail('challenge_breached', user.email, {
          userName,
          couponCode: process.env.BREACH_COUPON_CODE || 'DHANFUNDED20',
          couponDiscount: process.env.BREACH_COUPON_DISCOUNT || '20',
          couponValidityDays: process.env.BREACH_COUPON_VALIDITY_DAYS || '7'
        });
      } else if (outcome === 'passed') {
        const Challenge = require('../models/Challenge');
        const challenge = await Challenge.findById(account.challengeId).select('name').lean();
        const tradingDays = Array.isArray(account.uniqueTradingDays) ? account.uniqueTradingDays.length : 0;
        const initial = Number(account.initialBalance) || 0;
        const profitPct = account.currentProfitPercent != null
          ? Number(account.currentProfitPercent)
          : (initial > 0 ? ((Number(account.currentEquity || account.currentBalance || 0) - initial) / initial) * 100 : 0);
        await emailService.sendTemplatedEmail('challenge_passed', user.email, {
          userName,
          accountType: challenge?.name || account.accountType || 'Evaluation',
          profitAchieved: Number(profitPct).toFixed(2),
          maxDrawdownUsed: Number(account.currentOverallDrawdownPercent || 0).toFixed(2),
          tradingDaysCompleted: tradingDays
        });
      }
    } catch (e) {
      console.error('[email] sendAccountResultEmail failed:', e.message);
    }
  }

  /**
   * Check daily and overall drawdown limits
   */
  async checkDrawdownBreach(account, rules, markPriceMap = null, opts = {}) {
    let breachReason = null;

    // Idempotency guard: account already FAILED/EXPIRED/PASSED/FUNDED-broken
    // — do not fire another violation row or re-run auto-close. Without this
    // we saw two DAILY_DRAWDOWN_BREACH rows on the same FAILED account when
    // onTradeClosed (from auto-close) called checkDrawdownBreach a second
    // time on the same account snapshot.
    if (account.status && account.status !== 'ACTIVE' && account.status !== 'FUNDED') {
      return { breached: false, reason: null };
    }

    // Daily drawdown
    if (rules.maxDailyDrawdownPercent && account.currentDailyDrawdownPercent >= rules.maxDailyDrawdownPercent) {
      breachReason = `Daily drawdown limit (${rules.maxDailyDrawdownPercent}%) exceeded`;
      console.log(
        `[DD-BREACH][DAILY] account=${account.accountId} ` +
        `used=${Number(account.currentDailyDrawdownPercent).toFixed(2)}% ` +
        `limit=${rules.maxDailyDrawdownPercent}% ` +
        `dayStart=${account.dayStartEquity} lowest=${account.lowestEquityToday} equity=${account.currentEquity}`
      );
      await account.addViolation('DAILY_DRAWDOWN_BREACH', breachReason, 'FAIL');
    }

    // Overall drawdown — SKIPPED when the trailing-drawdown floor is active for
    // this account (the trailing floor replaces the static max-overall floor).
    if (!breachReason && !opts.skipOverall && rules.maxOverallDrawdownPercent && account.currentOverallDrawdownPercent >= rules.maxOverallDrawdownPercent) {
      breachReason = `Overall drawdown limit (${rules.maxOverallDrawdownPercent}%) exceeded`;
      console.log(
        `[DD-BREACH][OVERALL] account=${account.accountId} ` +
        `used=${Number(account.currentOverallDrawdownPercent).toFixed(2)}% ` +
        `limit=${rules.maxOverallDrawdownPercent}% ` +
        `initial=${account.initialBalance} lowest=${account.lowestEquityOverall} equity=${account.currentEquity}`
      );
      await account.addViolation('OVERALL_DRAWDOWN_BREACH', breachReason, 'FAIL');
    }

    if (breachReason) {
      account.status = 'FAILED';
      account.failedAt = new Date();
      account.failReason = breachReason;
      await account.save();
      this.sendAccountResultEmail(account, 'breached').catch(() => {}); // Email 4 (best-effort)
      console.log(`[DD-BREACH] FAILED account=${account.accountId} reason="${breachReason}" — auto-closing positions`);

      // Auto-close ALL open positions on this failed account so the user
      // doesn't keep trading on a dead account. We close at the live bid
      // (BUY) / ask (SELL) — same logic as the 15:15 market-close cron.
      // Lazy require to avoid circular import (challengePropEngine ↔ engine).
      try {
        const ChallengePosition = require('../models/ChallengePosition');
        const challengePropEngine = require('./challengePropEngine.service');
        const ZerodhaService = require('./zerodha.service');
        const livePrices = typeof ZerodhaService.getAllPrices === 'function'
          ? ZerodhaService.getAllPrices()
          : {};
        const openPositions = await ChallengePosition.find({
          challengeAccountId: account._id,
          status: 'open'
        }).lean();
        if (openPositions.length > 0) {
          console.log(`[ChallengeFail] auto-closing ${openPositions.length} position(s) on FAILED account ${account.accountId}`);
          for (const pos of openPositions) {
            try {
              // CRITICAL: use pos.currentPrice (the exact tick that triggered
              // the DD breach), NOT a fresh Zerodha LTP. refreshEquity()
              // set pos.currentPrice during mark-to-market — that price is
              // what produced the floating loss that breached the limit.
              // Fetching a fresh tick here would close at a (possibly
              // recovered) price, so realized loss < floating loss that
              // failed the account → confusing for users who see ₹11K
              // closed but the engine says ₹30K DD.
              // Closing at the breach-tick price makes realized P/L
              // exactly equal to the floating P/L that caused the failure
              // — fully reconcilable in trade history.
              const lp = livePrices[pos.symbol] || {};
              const lpLast = Number(lp.lastPrice ?? lp.last_price ?? lp.last);
              const lpBid = Number(lp.bid);
              const lpAsk = Number(lp.ask);
              // HIGHEST priority: markPriceMap entry — captured in-memory by
              // refreshEquity for THIS exact tick. Immune to DB races where a
              // concurrent tick overwrites pos.currentPrice with a recovered
              // price before this auto-close fetches.
              const inMemMark = markPriceMap && markPriceMap.get
                ? Number(markPriceMap.get(String(pos.positionId)))
                : NaN;
              const breachMarkFromDb = Number(pos.currentPrice) > 0 ? Number(pos.currentPrice) : null;
              const breachMark = Number.isFinite(inMemMark) && inMemMark > 0
                ? inMemMark
                : breachMarkFromDb;
              const liveFallback = pos.side === 'buy'
                ? (Number.isFinite(lpBid) && lpBid > 0 ? lpBid
                   : Number.isFinite(lpLast) && lpLast > 0 ? lpLast : null)
                : (Number.isFinite(lpAsk) && lpAsk > 0 ? lpAsk
                   : Number.isFinite(lpLast) && lpLast > 0 ? lpLast : null);

              // Priority: in-memory tick mark > DB pos.currentPrice > live tick > entry
              const px = breachMark ?? liveFallback ?? Number(pos.entryPrice) ?? null;

              if (Number.isFinite(px) && px > 0) {
                await challengePropEngine.closePosition(pos.positionId, px, 'challenge-failed');
              } else {
                console.warn(`[ChallengeFail] no usable price for ${pos.symbol} (${pos.positionId})`);
              }
            } catch (e) {
              console.error(`[ChallengeFail] close error on ${pos.positionId}:`, e.message);
            }
          }
        }
      } catch (e) {
        console.error('[ChallengeFail] auto-close loop error:', e.message);
      }

      return { breached: true, reason: breachReason };
    }

    return { breached: false };
  }

  /**
   * Resolve the active profit target % for any challenge type / phase
   */
  getTargetPercent(account, challenge) {
    const rules = challenge.rules || {};
    if (challenge.stepsCount === 0) {
      return rules.profitTargetInstantPercent || 0;
    }
    if (account.currentPhase === 1) return rules.profitTargetPhase1Percent || 0;
    if (account.currentPhase === 2) return rules.profitTargetPhase2Percent || 0;
    return 0;
  }

  /**
   * Absolute ₹ cap for ONE day's profit (the max-one-day-profit rule).
   * Returns 0 when the rule isn't configured or there's no active target.
   *   cap = maxOneDayProfitPercentOfTarget% × targetPercent% × phaseStartBalance
   * Single source of truth so validateTradeOpen, checkMaxOneDayProfit and
   * checkProfitTarget all agree on the same number.
   */
  getMaxOneDayProfitAbs(account, challenge) {
    const rules = (challenge && challenge.rules) || {};
    const capPercent = Number(rules.maxOneDayProfitPercentOfTarget) || 0;
    const targetPercent = this.getTargetPercent(account, challenge);
    if (capPercent <= 0 || !targetPercent) return 0;
    const base = Number(account.phaseStartBalance) || Number(account.initialBalance) || 0;
    return (capPercent / 100) * (targetPercent / 100) * base;
  }

  /**
   * Capped profit % toward target — the one-day-profit cap applied per day,
   * exactly like checkProfitTarget's pass calc. Use this for any "target
   * progress" UI so the bar reflects what ACTUALLY counts toward passing (a
   * single big day is capped). Computed FRESH from dailyPnlMap (the stored
   * currentProfitPercent is uncapped and can be stale). No cap rule → still
   * computed fresh, just uncapped.
   */
  getCappedProfitPercent(account, challenge) {
    const rules = (challenge && challenge.rules) || {};
    const base = Number(account.phaseStartBalance) || Number(account.initialBalance) || 0;
    if (base <= 0) return Number(account.currentProfitPercent) || 0;
    const dpm = account.dailyPnlMap;
    if (!dpm || dpm.size === 0) return Number(account.currentProfitPercent) || 0;
    const capPercent = Number(rules.maxOneDayProfitPercentOfTarget) || 0;
    const targetPercent = this.getTargetPercent(account, challenge);
    const maxDayAbs = (capPercent > 0 && targetPercent)
      ? (capPercent / 100) * (targetPercent / 100) * base
      : Infinity;
    let sum = 0;
    for (const [, pnl] of dpm) {
      sum += pnl > 0 ? Math.min(pnl, maxDayAbs) : pnl;
    }
    return (sum / base) * 100;
  }

  /**
   * Rebuild realised-profit trackers (dailyPnlMap + currentProfitPercent) from
   * ACTUAL closed positions in the current phase. The stored dailyPnlMap is
   * accumulated incrementally at trade-close and can drift / go stale (a close
   * that bypassed onTradeClosed, a legacy account, a phase reset), which makes
   * checkProfitTarget judge "not at target" even when the Objectives panel
   * (which recomputes fresh from positions) shows 100%. The pass sweep and the
   * manual evaluator call this first so the engine judges on the SAME accurate
   * data. In-memory only — the caller / checkProfitTarget decides what persists.
   */
  async syncRealizedFromPositions(account) {
    const ChallengePosition = require('../models/ChallengePosition');
    const phaseStartedAt = account.phaseStartedAt || account.createdAt;

    // Closed positions in this phase → realised P&L + per-day map (by closeTime).
    const closedQuery = { challengeAccountId: account._id, status: 'closed' };
    if (phaseStartedAt) closedQuery.closeTime = { $gte: phaseStartedAt };
    const closed = await ChallengePosition.find(closedQuery).select('profit closeTime openTime createdAt').lean();
    // All open positions (for trading-day counting; same as the Objectives panel).
    const open = await ChallengePosition.find({ challengeAccountId: account._id, status: 'open' })
      .select('openTime createdAt').lean();

    const map = new Map();
    let sumRealized = 0;
    for (const p of closed) {
      const pnl = Number(p.profit) || 0;
      sumRealized += pnl;
      const day = p.closeTime ? istDayKey(p.closeTime) : istDayKey();
      map.set(day, (map.get(day) || 0) + pnl);
    }
    account.dailyPnlMap = map;
    account.markModified('dailyPnlMap');

    // Rebuild unique trading days from ACTUAL positions (by open time) so the
    // trading-days gate matches the panel's 5/5 instead of a stale stored array.
    const dayset = new Set();
    for (const p of [...closed, ...open]) {
      const t = p.openTime || p.createdAt;
      if (t) dayset.add(istDayKey(t));
    }
    account.uniqueTradingDays = Array.from(dayset);
    account.markModified('uniqueTradingDays');
    account.tradingDaysCount = dayset.size;

    // Rebuild the trade counter too (min-trades gate) so a stale low value
    // can't block a genuine pass.
    account.totalTrades = closed.length + open.length;

    const base = Number(account.phaseStartBalance) || Number(account.initialBalance) || 0;
    if (base > 0) account.currentProfitPercent = (sumRealized / base) * 100;
    return { sumRealized, days: map.size, tradingDays: dayset.size, trades: account.totalTrades };
  }

  /**
   * Check max one-day profit rule (e.g. 40% of target)
   */
  async checkMaxOneDayProfit(account, challenge) {
    const rules = challenge.rules || {};
    const capPercent = rules.maxOneDayProfitPercentOfTarget;
    if (!capPercent || capPercent <= 0) return { violated: false };

    const targetPercent = this.getTargetPercent(account, challenge);
    if (!targetPercent) return { violated: false };

    const maxDayProfitAbs = (capPercent / 100) * (targetPercent / 100) * account.phaseStartBalance;
    const dailyPnlMap = account.dailyPnlMap || new Map();

    // First pass: AUTO-HEAL stale warnings. If a day was previously flagged
    // for breaching the cap but subsequent losses pulled its NET pnl back
    // below the cap, the WARNING is no longer accurate — drop it so the
    // user isn't permanently blocked from passing by a violation that no
    // longer exists. Previously the warning was added once and never
    // cleared, which is what admin/users were calling "max 1 day profit
    // revert nahi ho rha" — the day's profit recovered but the warning
    // stayed forever.
    if (Array.isArray(account.violations) && account.violations.length > 0) {
      const before = account.violations.length;
      account.violations = account.violations.filter(v => {
        if (v.rule !== 'MAX_ONE_DAY_PROFIT' || v.severity !== 'WARNING') return true;
        // Pull the YYYY-MM-DD day token out of the description.
        const m = (v.description || '').match(/\d{4}-\d{2}-\d{2}/);
        if (!m) return true; // can't tell which day — keep
        const dayKey = m[0];
        const currentPnl = Number(dailyPnlMap.get(dayKey) || 0);
        const stillBreached = currentPnl > maxDayProfitAbs;
        return stillBreached; // keep only if still breached
      });
      if (account.violations.length !== before) {
        const cleared = before - account.violations.length;
        account.warningsCount = Math.max(0, Number(account.warningsCount || 0) - cleared);
        console.log(`[MaxOneDayProfit] auto-cleared ${cleared} stale WARNING(s) on ${account.accountId}`);
      }
    }

    // Second pass: flag any day that's currently over the cap.
    for (const [day, pnl] of dailyPnlMap) {
      if (pnl > maxDayProfitAbs) {
        const existing = (account.violations || []).find(
          v => v.rule === 'MAX_ONE_DAY_PROFIT' && v.description?.includes(day)
        );
        if (!existing) {
          await account.addViolation(
            'MAX_ONE_DAY_PROFIT',
            `Day ${day}: profit ₹${pnl.toFixed(2)} exceeds ${capPercent}% of target (max ₹${maxDayProfitAbs.toFixed(2)})`,
            'WARNING'
          );
        }
        return { violated: true, day, pnl, max: maxDayProfitAbs };
      }
    }
    return { violated: false };
  }

  /**
   * Check consistency rule at pass-time (e.g. no single day > 30% of total profit)
   */
  checkConsistencyRule(account, challenge) {
    const rules = challenge.rules || {};
    const consistencyPercent = rules.consistencyRulePercent;
    if (!consistencyPercent || consistencyPercent <= 0) return { passed: true };

    const dailyPnlMap = account.dailyPnlMap || new Map();
    let totalProfit = 0;
    let bestDay = 0;
    let bestDayKey = '';

    for (const [day, pnl] of dailyPnlMap) {
      if (pnl > 0) {
        totalProfit += pnl;
        if (pnl > bestDay) {
          bestDay = pnl;
          bestDayKey = day;
        }
      }
    }

    if (totalProfit <= 0) return { passed: true };

    const bestDayRatio = (bestDay / totalProfit) * 100;
    if (bestDayRatio > consistencyPercent) {
      return {
        passed: false,
        reason: `Consistency rule: best day (${bestDayKey}) is ${bestDayRatio.toFixed(1)}% of total profit, max allowed is ${consistencyPercent}%`,
        code: ERROR_CODES.CONSISTENCY_RULE,
        bestDayRatio
      };
    }
    return { passed: true, bestDayRatio };
  }

  /**
   * Check profit target for phase progression
   */
  async checkProfitTarget(account, challenge) {
    const rules = challenge.rules || {};
    const targetPercent = this.getTargetPercent(account, challenge);

    // No target configured — nothing to check
    if (!targetPercent) return { targetReached: false };

    // Rules spec: Max 1-Day Profit does NOT fail / block passing — it just
    // CAPS the counted profit toward the target. Recompute profit% using
    // the capped per-day sum (positive days capped at maxDayProfitAbs,
    // negative days fully counted). If capped profit still meets target,
    // the user passes.
    const capPercent = Number(rules.maxOneDayProfitPercentOfTarget) || 0;
    let effectiveProfitPercent = Number(account.currentProfitPercent) || 0;
    if (capPercent > 0 && account.dailyPnlMap && account.dailyPnlMap.size > 0) {
      const maxDayProfitAbs = (capPercent / 100) * (targetPercent / 100) * Number(account.phaseStartBalance);
      let cappedSum = 0;
      for (const [, pnl] of account.dailyPnlMap) {
        cappedSum += pnl > 0 ? Math.min(pnl, maxDayProfitAbs) : pnl;
      }
      effectiveProfitPercent = (cappedSum / Number(account.phaseStartBalance)) * 100;
    }

    if (effectiveProfitPercent >= targetPercent) {
      // Check for FAIL violations
      if (account.violations.some(v => v.severity === 'FAIL')) {
        return { targetReached: false };
      }

      // Note: Max 1-Day Profit cap is now baked into effectiveProfitPercent
      // above — no separate gate. If the capped profit reaches target, the
      // user has properly spread profit across days and earns the pass.
      // Still call checkMaxOneDayProfit() so warning rows update for admin
      // visibility, but ignore its 'violated' verdict for passing.
      try { await this.checkMaxOneDayProfit(account, challenge); } catch (_) {}

      // NOTE: the consistency rule is intentionally NOT a pass/fail gate.
      // Only the objectives shown on the panel decide passing (profit target,
      // trading days, daily/overall loss, max-one-day cap). A single big day's
      // excess is already handled by the Max-One-Day-Profit CAP above (only the
      // capped amount counts toward target) — it must never silently BLOCK a
      // pass the way the old hidden consistency gate did.

      // Gate: minimum trades required for this phase
      if (rules.minTradesRequired && (account.totalTrades || 0) < rules.minTradesRequired) {
        return {
          targetReached: false,
          reason: `Need ${rules.minTradesRequired - (account.totalTrades || 0)} more trade(s) to qualify`,
          code: ERROR_CODES.MIN_TRADES_NOT_MET
        };
      }

      // Gate: minimum unique trading days required
      if (rules.tradingDaysRequired) {
        const days = Array.isArray(account.uniqueTradingDays) ? account.uniqueTradingDays.length : 0;
        if (days < rules.tradingDaysRequired) {
          return {
            targetReached: false,
            reason: `Need ${rules.tradingDaysRequired - days} more trading day(s) to qualify`,
            code: ERROR_CODES.TRADING_DAYS_NOT_MET
          };
        }
      }

      // For instant (0-step) with a profit target configured, passing means
      // we mark the account as PASSED and create a funded account.
      if (challenge.stepsCount === 0 || account.currentPhase >= account.totalPhases) {
        // Challenge PASSED — but DON'T flip to PASSED until the funded account
        // is actually minted. If funded creation fails, the account stays
        // ACTIVE and the next trade-close retries this whole block, so it can
        // never get stuck "PASSED but never funded" (the reported bug).
        let fundedAccount;
        try {
          fundedAccount = await this.createFundedAccount(account);
        } catch (err) {
          console.error(`[checkProfitTarget] funded account creation failed for ${account.accountId} — leaving ACTIVE to retry:`, err.message);
          return { targetReached: false, reason: 'Funding in progress — will retry on next trade', code: 'FUNDING_RETRY' };
        }

        account.status = 'PASSED';
        account.passedAt = new Date();
        account.fundedAccountId = fundedAccount._id;
        await account.save();
        this.sendAccountResultEmail(account, 'passed').catch(() => {}); // Email 5 (best-effort)

        return { targetReached: true, funded: true, fundedAccount };
      } else if (account.currentPhase < account.totalPhases) {
        // Advance to next phase — phase 2 starts as a COMPLETELY FRESH
        // evaluation from the ORIGINAL fund size. Standard 2-step model: each
        // phase is an INDEPENDENT evaluation, NOT cumulative. Phase 1's
        // profit/loss is wiped and the trader restarts at the same base
        // capital (e.g. ₹1L) under phase-2 rules — balance, equity, the whole
        // sub-wallet and every objective reset to the starting state.
        const baseBalance = Number(account.initialBalance) > 0
          ? Number(account.initialBalance)
          : Number(account.currentEquity);

        // Square off anything still open from phase 1 — those positions belong
        // to the old phase and must not bleed into the reset wallet.
        const ChallengePosition = require('../models/ChallengePosition');
        await ChallengePosition.updateMany(
          { challengeAccountId: account._id, status: 'open' },
          { $set: { status: 'closed', closeTime: new Date(), closedBy: 'phase_advance', profit: 0, realisedPnl: 0 } }
        );

        account.currentPhase += 1;

        // Balance / equity / sub-wallet → back to the original fund size.
        account.currentBalance = baseBalance;
        account.currentEquity = baseBalance;
        account.totalProfitLoss = 0;
        account.openTradesCount = 0;
        account.walletBalance = baseBalance;
        account.walletEquity = baseBalance;
        account.walletCredit = 0;
        account.walletMargin = 0;
        account.walletFreeMargin = baseBalance;
        account.walletMarginLevel = 0;

        // Phase target anchor + profit tracker
        account.phaseStartBalance = baseBalance;
        account.phaseStartedAt = new Date();
        account.currentProfitPercent = 0;

        // Drawdown trackers anchored on the fresh base
        account.currentDailyDrawdownPercent = 0;
        account.maxDailyDrawdownHit = 0;
        account.currentOverallDrawdownPercent = 0;
        account.lowestEquityToday = baseBalance;
        account.lowestEquityOverall = baseBalance;
        account.highestEquity = baseBalance;
        account.dayStartEquity = baseBalance;
        account.dayStartBalance = baseBalance;

        // Trading-days + consistency + max-one-day + trade counters
        account.uniqueTradingDays = [];
        account.dailyPnlMap = new Map();
        account.markModified('dailyPnlMap');
        account.tradingDaysCount = 0;
        account.totalTrades = 0;
        account.tradesToday = 0;
        account.lastTradingDay = null;

        // Clear any non-FAIL warning violations from phase 1 so the
        // consistency / max-one-day gates evaluate fresh next time.
        if (Array.isArray(account.violations)) {
          account.violations = account.violations.filter(v => v.severity === 'FAIL');
        }

        await account.save();
        return { targetReached: true, nextPhase: account.currentPhase, funded: false };
      }
    }

    return { targetReached: false };
  }

  /**
   * Create funded account after challenge passed
   */
  async createFundedAccount(challengeAccount) {
    // Idempotent: if this challenge account already minted a funded account,
    // return it instead of creating a duplicate. Lets the pass flow retry
    // safely without spawning a second FUNDED account.
    if (challengeAccount.fundedAccountId) {
      const existing = await ChallengeAccount.findById(challengeAccount.fundedAccountId);
      if (existing) return existing;
    }

    const challenge = await Challenge.findById(challengeAccount.challengeId);
    const accountId = await ChallengeAccount.generateAccountId('FND');
    // Funded accounts get a fixed lifetime from fundedSettings (default 30 days).
    // After this date the expiry cron auto-flips the account to EXPIRED.
    const lifetimeDays = Number(challenge.fundedSettings?.accountLifetimeDays) > 0
      ? Number(challenge.fundedSettings.accountLifetimeDays)
      : 30;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + lifetimeDays * 86400000);

    // Funded account size MUST inherit from the original challenge account's
    // initialBalance — that captures the tier (e.g. ₹10L) the user actually
    // bought. challenge.fundSize is just the BASE on the challenge template
    // and is identical for everyone regardless of tier. Using it dropped
    // ₹10L-tier users to ₹1L-base funded accounts (90% loss for the trader).
    // Fallback to challenge.fundSize only if the source field is missing.
    const fundSize = Number(challengeAccount.initialBalance) > 0
      ? Number(challengeAccount.initialBalance)
      : Number(challenge.fundSize);

    const fundedAccount = await ChallengeAccount.create({
      userId: challengeAccount.userId,
      challengeId: challengeAccount.challengeId,
      accountId,
      accountType: 'FUNDED',
      currentPhase: 0,
      totalPhases: 0,
      status: 'FUNDED',
      initialBalance: fundSize,
      currentBalance: fundSize,
      currentEquity: fundSize,
      phaseStartBalance: fundSize,
      dayStartEquity: fundSize,
      dayStartBalance: fundSize,
      lowestEquityToday: fundSize,
      lowestEquityOverall: fundSize,
      highestEquity: fundSize,
      walletBalance: fundSize,
      walletEquity: fundSize,
      walletCredit: 0,
      walletMargin: 0,
      walletFreeMargin: fundSize,
      walletMarginLevel: 0,
      profitSplitPercent: challenge.fundedSettings?.profitSplitPercent || 80,
      paymentStatus: 'COMPLETED',
      expiresAt,
      // Anchor for payout-age and account-life gates. Both derive from this
      // single timestamp so they can never drift.
      fundedAt: now,
      payoutCount: 0,
      // Fresh trackers — consistency rule + min-trading-days start from zero.
      uniqueTradingDays: [],
      dailyPnlMap: new Map(),
      tradingDaysCount: 0,
      totalTrades: 0,
      tradesToday: 0
    });

    challengeAccount.fundedAccountId = fundedAccount._id;
    await challengeAccount.save();

    return fundedAccount;
  }

  /**
   * Withdraw profit from funded account
   */
  async withdrawProfit(challengeAccountId, userId, payoutDetails = {}) {
    const upiId = String(payoutDetails.upiId || '').trim();
    const holderName = String(payoutDetails.holderName || '').trim();
    const requestedAmount = Number(payoutDetails.amount) > 0 ? Number(payoutDetails.amount) : null;
    const qrImage = payoutDetails.qrImage || '';
    if (!upiId) throw new Error('UPI ID is required');
    if (!holderName) throw new Error('Account holder name is required');

    const account = await ChallengeAccount.findById(challengeAccountId).populate('challengeId');
    if (!account) throw new Error('Account not found');
    if (account.status !== 'FUNDED') throw new Error('Only funded accounts can withdraw');
    if (String(account.userId) !== String(userId)) throw new Error('Not your account');

    // Resolve user's display oderId for the Transaction record (Fund Management
    // uses User.findOne({oderId}) to locate the user on approval).
    const ownerUser = await User.findById(account.userId).select('oderId').lean();
    const displayOderId = ownerUser?.oderId || String(account.userId);

    const challenge = account.challengeId;
    const rules = challenge.fundedSettings || {};

    // Check withdrawal frequency
    if (rules.withdrawalFrequencyDays && account.lastWithdrawalDate) {
      const daysSince = (Date.now() - new Date(account.lastWithdrawalDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < rules.withdrawalFrequencyDays) {
        const remaining = Math.ceil(rules.withdrawalFrequencyDays - daysSince);
        throw new Error(`Can withdraw again in ${remaining} days`);
      }
    }

    // Any pending payout request blocks a new one so the admin queue stays
    // single-decision-per-account. Check both new-schema (challengeAccountId
    // inside paymentDetails) and legacy records (kind field).
    const Transaction = require('../models/Transaction');
    const existingPending = await Transaction.findOne({
      type: 'withdrawal',
      status: 'pending',
      $or: [
        { oderId: displayOderId, 'paymentDetails.kind': 'prop_payout' },
        { oderId: String(account.userId), 'paymentDetails.kind': 'prop_payout' },
        { 'paymentDetails.challengeAccountId': String(account._id) }
      ]
    });
    if (existingPending) {
      throw new Error('A payout request is already pending for this account');
    }

    // ─── Real prop-firm payout eligibility gates ──────────────────────
    // All 5 gates are evaluated before computing withdrawable amount so
    // we can surface the FIRST unmet condition with a precise reason.
    const fs = rules;        // alias — already = challenge.fundedSettings
    const initial = Number(account.initialBalance) || 0;
    const balanceNow = Number(account.walletBalance) || Number(account.currentBalance) || 0;
    const profit = Math.max(0, balanceNow - initial);
    const fundedAtMs = account.fundedAt ? new Date(account.fundedAt).getTime() : null;

    // Gate 1: account must be old enough since funding (default 14 days)
    if (fs.minDaysSinceFundedForPayout && fundedAtMs) {
      const ageDays = (Date.now() - fundedAtMs) / 86400000;
      if (ageDays < fs.minDaysSinceFundedForPayout) {
        const wait = Math.ceil(fs.minDaysSinceFundedForPayout - ageDays);
        throw new Error(`Payout available after ${wait} more day(s). Funded accounts need ${fs.minDaysSinceFundedForPayout} days before first payout.`);
      }
    }

    // Gate 2: minimum unique trading days (default 5)
    const tradingDays = Array.isArray(account.uniqueTradingDays) ? account.uniqueTradingDays.length : 0;
    if (fs.minTradingDaysForPayout && tradingDays < fs.minTradingDaysForPayout) {
      throw new Error(`Need ${fs.minTradingDaysForPayout - tradingDays} more trading day(s) before payout (you have ${tradingDays}).`);
    }

    // Gate 3: minimum profit % over initial (default 8%)
    if (fs.minProfitPercentForPayout && initial > 0) {
      const profitPct = ((balanceNow - initial) / initial) * 100;
      if (profitPct < fs.minProfitPercentForPayout) {
        throw new Error(`Profit must reach ${fs.minProfitPercentForPayout}% before payout (currently ${profitPct.toFixed(2)}%).`);
      }
    }

    // Gate 4: consistency rule — best day ≤ N% of total profit (default 30%)
    // Reuse checkConsistencyRule() helper; it expects `rules.consistencyRulePercent`.
    if (fs.consistencyMaxDayPercent) {
      const consistencyCheck = this.checkConsistencyRule(account, {
        rules: { consistencyRulePercent: fs.consistencyMaxDayPercent }
      });
      if (!consistencyCheck.passed) {
        throw new Error(consistencyCheck.reason);
      }
    }

    if (profit <= 0) throw new Error('No profit to withdraw');

    const splitPercent = account.profitSplitPercent || 80;
    const maxWithdrawable = (profit * splitPercent) / 100;
    if (maxWithdrawable <= 0) throw new Error('No withdrawable amount');

    // Gate 5: per-cycle payout cap (defaults to 5% of initial when the
    // challenge has none set). Silently caps — the user can still request,
    // just at the maximum allowed per window.
    let cappedMax = maxWithdrawable;
    const capPercent = Number(fs.maxWithdrawalPercent) || 5;
    if (capPercent > 0 && initial > 0) {
      const capAmount = (initial * capPercent) / 100;
      if (cappedMax > capAmount) cappedMax = capAmount;
    }

    // If the user specified a custom amount, validate it; otherwise use the
    // cap-adjusted withdrawable. Cap at min(maxWithdrawable, cycle cap) so the
    // user can never request more than their share OR more than the cycle cap.
    const withdrawable = requestedAmount != null
      ? Math.min(requestedAmount, cappedMax)
      : cappedMax;
    if (withdrawable <= 0) throw new Error('Withdrawal amount must be positive');

    // Create a pending Transaction. Admin reviews + approves in the payout
    // queue; admin approval is what actually moves real INR into
    // User.walletINR and resets the challenge account's wallet to initial.
    const tx = await Transaction.create({
      oderId: displayOderId,
      type: 'withdrawal',
      amount: withdrawable,
      currency: 'INR',
      paymentMethod: 'upi',
      status: 'pending',
      userName: holderName,
      userNote: String(payoutDetails.note || `Prop profit payout · ${splitPercent}% of ₹${profit.toFixed(2)} profit · challenge ${account.accountId}`).slice(0, 500),
      proofImage: qrImage || '',
      paymentDetails: {
        upiId,
        challengeAccountId: String(account._id),
        challengeAccountCode: account.accountId,
        profit,
        splitPercent,
        kind: 'prop_payout'
      },
      withdrawalInfo: {
        method: 'upi',
        upiDetails: { upiId, name: holderName }
      }
    });

    return {
      pending: true,
      transactionId: tx._id,
      requestedAmount: withdrawable,
      profit,
      splitPercent,
      account
    };
  }

  /**
   * Get account dashboard data (for user view)
   */
  async getAccountDashboard(challengeAccountId, userId) {
    const account = await ChallengeAccount.findById(challengeAccountId)
      .populate('challengeId')
      .populate('userId', 'name email oderId');

    if (!account) return null;
    if (userId && String(account.userId._id || account.userId) !== String(userId)) return null;

    const challenge = account.challengeId;
    const rules = challenge.rules || {};

    // Remaining time
    const remainingMs = new Date(account.expiresAt) - new Date();
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));

    // Target progress — works for instant, 1-step, and 2-step. Uses the CAPPED
    // profit % (one-day-profit cap applied) so the bar matches the Objectives
    // panel + pass engine, not the raw/stale stored currentProfitPercent.
    const targetPercent = this.getTargetPercent(account, challenge);
    const cappedProfitPercent = this.getCappedProfitPercent(account, challenge);
    const targetProgress = targetPercent > 0 ? Math.min(100, (Math.max(0, cappedProfitPercent) / targetPercent) * 100) : 0;

    // Withdrawable profit (funded only)
    let withdrawable = 0;
    if (account.status === 'FUNDED') {
      const profit = Math.max(0, account.currentBalance - account.initialBalance);
      withdrawable = (profit * (account.profitSplitPercent || 80)) / 100;
    }

    return {
      account: {
        _id: account._id,
        accountId: account.accountId,
        accountType: account.accountType,
        status: account.status,
        currentPhase: account.currentPhase,
        totalPhases: account.totalPhases,
        failReason: account.failReason,
        passedAt: account.passedAt,
        failedAt: account.failedAt,
        createdAt: account.createdAt
      },
      balance: {
        initial: account.initialBalance,
        current: account.walletBalance ?? account.currentBalance,
        equity: account.walletEquity ?? account.currentEquity,
        profitLoss: account.totalProfitLoss
      },
      drawdown: {
        dailyUsed: account.currentDailyDrawdownPercent || 0,
        dailyMax: rules.maxDailyDrawdownPercent || 5,
        dailyRemaining: Math.max(0, (rules.maxDailyDrawdownPercent || 5) - (account.currentDailyDrawdownPercent || 0)),
        overallUsed: account.currentOverallDrawdownPercent || 0,
        overallMax: rules.maxOverallDrawdownPercent || 10,
        overallRemaining: Math.max(0, (rules.maxOverallDrawdownPercent || 10) - (account.currentOverallDrawdownPercent || 0))
      },
      profit: {
        currentPercent: cappedProfitPercent || 0,
        targetPercent,
        targetProgress,
        amountToTarget: targetPercent > 0 ? Math.max(0, (targetPercent / 100) * account.phaseStartBalance - account.totalProfitLoss) : 0
      },
      trades: {
        today: account.tradesToday,
        maxPerDay: rules.maxTradesPerDay || null,
        openCount: account.openTradesCount,
        maxConcurrent: rules.maxConcurrentTrades || null,
        total: account.totalTrades,
        tradingDays: Array.isArray(account.uniqueTradingDays) ? account.uniqueTradingDays.length : 0,
        requiredDays: rules.tradingDaysRequired || null
      },
      rules: {
        stopLossMandatory: rules.stopLossMandatory || false,
        minHoldTimeSeconds: rules.minTradeHoldTimeSeconds || 0,
        maxLeverage: rules.maxLeverage || 100,
        minLotSize: rules.minLotSize || 0.01,
        maxLotSize: rules.maxLotSize || 100
      },
      time: {
        expiresAt: account.expiresAt,
        remainingDays,
        createdAt: account.createdAt
      },
      funded: {
        profitSplitPercent: account.profitSplitPercent || 80,
        withdrawable,
        totalWithdrawn: account.totalWithdrawn || 0,
        lastWithdrawalDate: account.lastWithdrawalDate
      },
      violations: account.violations || [],
      challenge: {
        _id: challenge._id,
        name: challenge.name,
        fundSize: challenge.fundSize,
        stepsCount: challenge.stepsCount,
        challengeFee: challenge.challengeFee
      }
    };
  }
}

module.exports = new PropTradingEngine();
