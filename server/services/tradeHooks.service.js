/**
 * Trade Hooks Service
 * Integrates IB commission with trade execution
 * Called by trading engines when trades open/close
 */

const commissionService = require('./commission.service');
const ChallengeAccount = require('../models/ChallengeAccount');

// Lazy-load to avoid circular dependency
let _propEngine = null;
function getPropEngine() {
  if (!_propEngine) _propEngine = require('./propTradingEngine');
  return _propEngine;
}

class TradeHooksService {
  /**
   * Called when a trade is opened.
   * If `tradeData.challengeAccountId` is set, the trade is scoped to that
   * challenge account only. Otherwise, prop processing is skipped entirely —
   * trades on the main wallet do NOT implicitly affect any challenge account.
   */
  async onTradeOpen(tradeData) {
    const results = {};
    try {
      if (tradeData.userId && tradeData.challengeAccountId) {
        const propResult = await this._propOnTradeOpen(tradeData);
        if (propResult) results.prop = propResult;
      }
      return results;
    } catch (error) {
      console.error('[TradeHooks] Error on trade open:', error);
      return { error: error.message };
    }
  }

  /**
   * Prop Trading: validate + track the trade against a SPECIFIC challenge
   * account (not every active one).
   */
  async _propOnTradeOpen(tradeData) {
    try {
      const propEngine = getPropEngine();
      const acc = await ChallengeAccount.findOne({
        _id: tradeData.challengeAccountId,
        userId: tradeData.userId,
        status: { $in: ['ACTIVE', 'FUNDED'] }
      });
      if (!acc) return null;

      const validation = await propEngine.validateTradeOpen(acc._id, {
        symbol: tradeData.symbol,
        segment: tradeData.segment || tradeData.exchange,
        quantity: tradeData.volume,
        leverage: tradeData.leverage,
        sl: tradeData.stopLoss,
        stopLoss: tradeData.stopLoss,
        tp: tradeData.takeProfit,
        takeProfit: tradeData.takeProfit
      });

      if (!validation.valid) {
        return { accountId: acc.accountId, status: 'violation', reason: validation.error };
      }

      await propEngine.onTradeOpened(acc._id);
      return { accountId: acc.accountId, status: 'tracked' };
    } catch (err) {
      console.error('[TradeHooks] Prop onTradeOpen error:', err.message);
      return null;
    }
  }

  /**
   * Called when a trade is closed
   * Triggers IB commission calculation
   */
  async onTradeClose(tradeData) {
    const {
      userId,
      oderId,
      tradeId,
      positionId,
      symbol,
      side,
      volume,
      entryPrice,
      closePrice,
      profit,
      spread,
      commission: platformCommission,
      mode
    } = tradeData;

    const results = {
      ibCommission: null
    };

    try {
      // Process IB commission
      const ibCommission = await commissionService.processTradeCommission({
        userId,
        oderId,
        tradeId,
        positionId,
        symbol,
        volume,
        entryPrice,
        closePrice,
        profit,
        spread,
        platformCommission
      });

      if (ibCommission) {
        results.ibCommission = ibCommission;
        console.log(`[TradeHooks] IB commission processed: ₹${ibCommission.amount}`);
      }

      // Prop Trading hook — update ONLY the specific challenge account this
      // trade is scoped to. Main-wallet trades do not affect any challenge.
      if (userId && tradeData.challengeAccountId) {
        const propResult = await this._propOnTradeClose(userId, tradeData.challengeAccountId, profit);
        if (propResult) results.prop = propResult;
      }

      return results;
    } catch (error) {
      console.error('[TradeHooks] Error on trade close:', error);
      return { ...results, error: error.message };
    }
  }

  /**
   * Prop Trading: update ONE challenge account on trade close.
   */
  async _propOnTradeClose(userId, challengeAccountId, pnl) {
    try {
      const propEngine = getPropEngine();
      const acc = await ChallengeAccount.findOne({
        _id: challengeAccountId,
        userId,
        status: { $in: ['ACTIVE', 'FUNDED'] }
      });
      if (!acc) return null;

      const result = await propEngine.onTradeClosed(acc._id, Number(pnl) || 0);
      if (!result) return null;

      if (result.failed) {
        console.log(`[TradeHooks] Prop account ${acc.accountId} FAILED: ${result.reason}`);
      }
      if (result.funded) {
        console.log(`[TradeHooks] Prop account ${acc.accountId} FUNDED!`);
      }

      return {
        accountId: acc.accountId,
        failed: result.failed || false,
        phaseCompleted: result.phaseCompleted || false,
        funded: result.funded || false,
        balance: result.account?.currentBalance
      };
    } catch (err) {
      console.error('[TradeHooks] Prop onTradeClose error:', err.message);
      return null;
    }
  }

  /**
   * Called when a trade is modified (SL/TP change)
   */
  async onTradeModify(tradeData) {
    const { positionId } = tradeData;

    try {
      console.log(`[TradeHooks] Trade modified: ${positionId}`);
      return { success: true };
    } catch (error) {
      console.error('[TradeHooks] Error on trade modify:', error);
      return { error: error.message };
    }
  }
}

module.exports = new TradeHooksService();
