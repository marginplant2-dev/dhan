const ChallengeAccount = require('../models/ChallengeAccount');
const DemoSettings = require('../models/DemoSettings');

/**
 * Demo service — manages the platform-wide free practice account every
 * user can spin up from their dashboard. Demo accounts use the same
 * ChallengeAccount collection (accountType='DEMO') so they reuse the
 * existing trade engine, position management, and SL/TP plumbing. The
 * engine bypasses DD / expiry / profit-target gates for accountType='DEMO'.
 */

async function getOrCreateDemo(userId) {
  if (!userId) throw new Error('userId required');

  // One demo per user. If they already have one, return it (active or
  // any state). Demo accounts never EXPIRE / FAIL — they just exist.
  let demo = await ChallengeAccount.findOne({
    userId,
    accountType: 'DEMO'
  });
  if (demo) return demo;

  const settings = await DemoSettings.getSettings();
  if (!settings.enabled) {
    throw new Error('Demo trading is currently disabled by admin');
  }

  const fund = Number(settings.fundSize) || 200000;
  const accountId = await ChallengeAccount.generateAccountId('DM');

  demo = await ChallengeAccount.create({
    userId,
    challengeId: null,                   // demo isn't tied to a Challenge
    accountId,
    accountType: 'DEMO',
    status: 'ACTIVE',                    // permanently active
    currentPhase: 0,
    totalPhases: 0,
    initialBalance: fund,
    currentBalance: fund,
    currentEquity: fund,
    phaseStartBalance: fund,
    dayStartEquity: fund,
    lowestEquityToday: fund,
    lowestEquityOverall: fund,
    highestEquity: fund,
    walletBalance: fund,
    walletEquity: fund,
    walletCredit: 0,
    walletMargin: 0,
    walletFreeMargin: fund,
    walletMarginLevel: 0,
    profitSplitPercent: 0,               // not applicable
    paymentStatus: 'COMPLETED',
    expiresAt: null                      // never expires
  });

  return demo;
}

async function resetDemo(userId) {
  if (!userId) throw new Error('userId required');
  const demo = await ChallengeAccount.findOne({ userId, accountType: 'DEMO' });
  if (!demo) throw new Error('No demo account found');

  const settings = await DemoSettings.getSettings();

  // Cooldown check
  const cooldownH = Number(settings.resetCooldownHours) || 0;
  if (cooldownH > 0 && demo.lastResetAt) {
    const hoursSince = (Date.now() - new Date(demo.lastResetAt).getTime()) / 3600000;
    if (hoursSince < cooldownH) {
      const wait = Math.ceil(cooldownH - hoursSince);
      throw new Error(`Demo can be reset again in ${wait} hour(s).`);
    }
  }

  // Close any open positions first so the reset cleanly zeroes margin.
  const ChallengePosition = require('../models/ChallengePosition');
  const openPositions = await ChallengePosition.find({
    challengeAccountId: demo._id,
    status: 'open'
  });
  if (openPositions.length > 0) {
    // Cancel-style close: mark them closed at entry (no PnL), since this
    // is a reset and the user is essentially abandoning the positions.
    for (const pos of openPositions) {
      pos.status = 'closed';
      pos.closePrice = pos.entryPrice;
      pos.closedAt = new Date();
      pos.closeReason = 'demo-reset';
      pos.realisedPnl = 0;
      await pos.save();
    }
  }

  const fund = Number(settings.fundSize) || 200000;
  demo.initialBalance = fund;
  demo.currentBalance = fund;
  demo.currentEquity = fund;
  demo.phaseStartBalance = fund;
  demo.dayStartEquity = fund;
  demo.lowestEquityToday = fund;
  demo.lowestEquityOverall = fund;
  demo.highestEquity = fund;
  demo.walletBalance = fund;
  demo.walletEquity = fund;
  demo.walletMargin = 0;
  demo.walletFreeMargin = fund;
  demo.walletMarginLevel = 0;
  demo.openTradesCount = 0;
  demo.totalTrades = 0;
  demo.tradesToday = 0;
  demo.tradingDaysCount = 0;
  demo.totalProfitLoss = 0;
  demo.uniqueTradingDays = [];
  demo.dailyPnlMap = new Map();
  demo.markModified('dailyPnlMap');
  demo.lastResetAt = new Date();
  await demo.save();

  return demo;
}

module.exports = { getOrCreateDemo, resetDemo };
