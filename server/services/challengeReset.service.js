// Shared logic for the paid "Reset / Restart" of a FAILED challenge account.
// Used by BOTH the dedicated reset-request routes (routes/propTrading.js) and
// the generic admin transaction approve handler (index.js), so approving a
// reset from the Challenge Resets tab OR the Deposits inbox does the same thing.
const ChallengePosition = require('../models/ChallengePosition');

// Reset fee = 50% of what the challenge tier costs (pre-discount).
function computeResetFee(account) {
  let baseFee = Number(account?.couponSnapshot?.originalFee) || 0;
  if (!baseFee) {
    const ch = account.challengeId; // must be populated
    if (ch) {
      const tiers = Array.isArray(ch.tiers) && ch.tiers.length
        ? ch.tiers
        : [{ fundSize: Number(ch.fundSize) || 0, challengeFee: Number(ch.challengeFee) || 0 }];
      const tier = tiers.find(t => Number(t.fundSize) === Number(account.initialBalance)) || tiers[0] || {};
      baseFee = Number(tier.challengeFee) || 0;
    }
  }
  return { baseFee, resetFee: Math.round(baseFee * 0.5) };
}

// Wipe all trades and restart the account like a brand-new evaluation.
async function resetChallengeAccountFresh(account, challenge) {
  const base = Number(account.initialBalance) || Number(challenge?.fundSize) || 0;

  // Instant challenges (stepsCount === 0) have no evaluation — they are FUNDED
  // from day one. A reset must restore them to that SAME funded state, not to a
  // plain ACTIVE evaluation. Otherwise the reset Instant account vanishes from
  // the Passed Challenges page (which lists FUNDED / PASSED accounts) and the
  // user loses their funded status. (BUG 2)
  const isInstant = challenge?.stepsCount === 0;

  // 1) Delete every trade so the account restarts at 0 trades.
  await ChallengePosition.deleteMany({ challengeAccountId: account._id });

  // 2) Fresh evaluation expiry window.
  const expiryDays = challenge?.rules?.challengeExpiryDays;
  const expiresAt = new Date();
  if (isInstant && (expiryDays === null || expiryDays === undefined)) {
    expiresAt.setFullYear(expiresAt.getFullYear() + 50);
  } else {
    const n = Number(expiryDays);
    expiresAt.setDate(expiresAt.getDate() + (Number.isFinite(n) && n > 0 ? n : 30));
  }

  // 3) Reset every balance / risk / counter back to the starting fund.
  //    Instant → restore FUNDED (phase 0); evaluation → ACTIVE (phase 1).
  account.status = isInstant ? 'FUNDED' : 'ACTIVE';
  account.accountType = isInstant ? 'FUNDED' : 'CHALLENGE';
  account.currentPhase = isInstant ? 0 : 1;
  account.fundedAt = isInstant ? new Date() : null;
  account.currentBalance = base;
  account.currentEquity = base;
  account.phaseStartBalance = base;
  account.walletBalance = base;
  account.walletEquity = base;
  account.walletMargin = 0;
  account.walletFreeMargin = base;
  account.walletMarginLevel = 0;
  account.dayStartEquity = base;
  account.dayStartBalance = base;
  account.lowestEquityToday = base;
  account.lowestEquityOverall = base;
  account.highestEquity = base;
  account.currentDailyDrawdownPercent = 0;
  account.currentOverallDrawdownPercent = 0;
  account.maxDailyDrawdownHit = 0;
  account.maxOverallDrawdownHit = 0;
  account.currentProfitPercent = 0;
  account.totalProfitLoss = 0;
  account.tradesToday = 0;
  account.openTradesCount = 0;
  account.totalTrades = 0;
  account.tradingDaysCount = 0;
  account.warningsCount = 0;
  account.failReason = null;
  account.failedAt = null;
  account.passedAt = null;
  account.violations = [];
  account.dailyPnlMap = new Map();
  account.uniqueTradingDays = [];
  account.lastTradingDay = null;
  account.phaseStartedAt = new Date();
  account.expiresAt = expiresAt;
  // Consume the one-time paid reset. Once this is >= 1 the reset-info /
  // reset-request endpoints refuse a second reset — the user must buy a new
  // challenge instead. (BUG 1)
  account.resetCount = (Number(account.resetCount) || 0) + 1;
  await account.save();
  return account;
}

module.exports = { computeResetFee, resetChallengeAccountFresh };
