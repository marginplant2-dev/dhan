const mongoose = require('mongoose');
const IB = require('../models/IB');
const IBCommission = require('../models/IBCommission');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const IBCopySettings = require('../models/IBCopySettings');
const User = require('../models/User');

/**
 * Commission Service
 * Handles IB commission calculations and payouts
 */
class CommissionService {
  /**
   * Calculate and distribute IB commission when trade closes
   * This is the main hook called from trade close
   */
  async processTradeCommission(tradeData) {
    const {
      userId,
      oderId,
      tradeId,
      positionId,
      symbol,
      volume, // lots
      entryPrice,
      closePrice,
      profit,
      spread,
      platformCommission
    } = tradeData;

    // Get user to find their referrer
    const user = await User.findOne({ oderId });
    if (!user || !user.referredBy) {
      return null; // No referrer, no commission
    }

    // Find the IB who referred this user
    const ib = await IB.findOne({ referralCode: user.referredBy, status: 'active' });
    if (!ib) {
      return null; // IB not found or not active
    }

    // Get global settings
    const settings = await IBCopySettings.getSettings();
    if (!settings.ib.enabled) {
      return null; // IB system disabled
    }

    // Calculate commission based on IB's settings
    const commission = await this.calculateCommission(ib, {
      volume,
      spread,
      platformCommission,
      profit
    });

    if (commission <= 0) {
      return null;
    }

    // Create idempotency key to prevent double processing
    const idempotencyKey = `ib_comm_${ib._id}_${tradeId}_direct`;
    
    // Check if already processed
    const existing = await IBCommission.findOne({ idempotencyKey });
    if (existing) {
      console.log(`Commission already processed: ${idempotencyKey}`);
      return existing;
    }

    // Process commission with transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create commission record
      const commissionRecord = await IBCommission.create([{
        ibId: ib._id,
        sourceType: 'trade',
        tradeId,
        positionId,
        referredUserId: user._id,
        referredOderId: oderId,
        levelDepth: 1,
        commissionType: ib.commissionSettings.type,
        tradeDetails: {
          symbol,
          volume,
          entryPrice,
          closePrice,
          profit,
          spread,
          platformCommission
        },
        calculationBase: this.getCalculationBase(ib.commissionSettings.type, { volume, spread, platformCommission }),
        rate: this.getCommissionRate(ib),
        amount: commission,
        status: 'credited',
        description: `Commission from trade ${tradeId} by ${oderId}`,
        idempotencyKey,
        processedAt: new Date()
      }], { session });

      // Credit to IB wallet
      let ibWallet = await Wallet.findOne({ userId: ib.userId, type: 'ib' }).session(session);
      if (!ibWallet) {
        ibWallet = await Wallet.create([{
          userId: ib.userId,
          oderId: ib.oderId,
          type: 'ib',
          balance: 0
        }], { session });
        ibWallet = ibWallet[0];
      }

      ibWallet.balance += commission;
      ibWallet.totalEarned += commission;
      ibWallet.lastTransactionAt = new Date();
      await ibWallet.save({ session });

      // Create wallet transaction
      await WalletTransaction.create([{
        walletId: ibWallet._id,
        userId: ib.userId,
        oderId: ib.oderId,
        walletType: 'ib',
        type: 'commission',
        amount: commission,
        balanceAfter: ibWallet.balance,
        relatedTradeId: tradeId,
        relatedIBId: ib._id,
        description: `IB Commission from ${oderId} trade`,
        status: 'completed',
        idempotencyKey: `wallet_${idempotencyKey}`
      }], { session });

      // Update IB stats
      ib.stats.totalCommissionEarned += commission;
      ib.stats.thisMonthCommission += commission;
      ib.stats.totalLotsTraded += volume;
      ib.wallet.balance += commission;
      ib.wallet.totalEarned += commission;
      ib.lastActivityAt = new Date();
      await ib.save({ session });

      await session.commitTransaction();

      // Process multi-level commissions (async, don't block)
      this.processMultiLevelCommission(ib, commission, tradeData).catch(err => {
        console.error('Multi-level commission error:', err);
      });

      return commissionRecord[0];
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Calculate commission based on IB settings
   */
  calculateCommission(ib, tradeData) {
    const { volume, spread, platformCommission, profit } = tradeData;
    const settings = ib.commissionSettings;

    switch (settings.type) {
      case 'per_lot':
        return volume * settings.perLotAmount;

      case 'revenue_percent':
        // Commission on platform's commission revenue
        const revenue = platformCommission || 0;
        return (revenue * settings.revenuePercent) / 100;

      case 'spread_share':
        // Share of spread markup
        const spreadValue = spread || 0;
        return (spreadValue * settings.spreadSharePercent) / 100;

      case 'hybrid':
        // Combination of all
        let total = 0;
        if (settings.perLotAmount > 0) {
          total += volume * settings.perLotAmount;
        }
        if (settings.revenuePercent > 0 && platformCommission) {
          total += (platformCommission * settings.revenuePercent) / 100;
        }
        if (settings.spreadSharePercent > 0 && spread) {
          total += (spread * settings.spreadSharePercent) / 100;
        }
        return total;

      default:
        return 0;
    }
  }

  /**
   * Get calculation base for commission record
   */
  getCalculationBase(type, data) {
    switch (type) {
      case 'per_lot':
        return data.volume;
      case 'revenue_percent':
        return data.platformCommission || 0;
      case 'spread_share':
        return data.spread || 0;
      default:
        return 0;
    }
  }

  /**
   * Get commission rate for record
   */
  getCommissionRate(ib) {
    const settings = ib.commissionSettings;
    switch (settings.type) {
      case 'per_lot':
        return settings.perLotAmount;
      case 'revenue_percent':
        return settings.revenuePercent;
      case 'spread_share':
        return settings.spreadSharePercent;
      default:
        return 0;
    }
  }

  /**
   * Process multi-level commission for parent IBs
   */
  async processMultiLevelCommission(childIB, childCommission, tradeData) {
    if (!childIB.parentIBId) {
      return; // No parent IB
    }

    const settings = await IBCopySettings.getSettings();
    const maxLevels = settings.ib.maxLevels;

    let currentIB = childIB;
    let currentLevel = 2; // Start at level 2 (parent of direct IB)

    while (currentIB.parentIBId && currentLevel <= maxLevels) {
      const parentIB = await IB.findOne({ _id: currentIB.parentIBId, status: 'active' });
      if (!parentIB) break;

      // Get multi-level rate for this level
      const levelKey = `level${currentLevel}`;
      const rate = parentIB.commissionSettings.multiLevelRates[levelKey] || 0;

      if (rate <= 0) {
        currentIB = parentIB;
        currentLevel++;
        continue;
      }

      // Calculate multi-level commission
      const mlCommission = (childCommission * rate) / 100;

      if (mlCommission <= 0) {
        currentIB = parentIB;
        currentLevel++;
        continue;
      }

      const idempotencyKey = `ib_comm_${parentIB._id}_${tradeData.tradeId}_ml${currentLevel}`;

      // Check if already processed
      const existing = await IBCommission.findOne({ idempotencyKey });
      if (existing) {
        currentIB = parentIB;
        currentLevel++;
        continue;
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Create commission record
        await IBCommission.create([{
          ibId: parentIB._id,
          sourceType: 'sub_ib',
          tradeId: tradeData.tradeId,
          positionId: tradeData.positionId,
          referredUserId: null,
          subIBId: childIB._id,
          levelDepth: currentLevel,
          commissionType: 'multi_level',
          calculationBase: childCommission,
          rate,
          amount: mlCommission,
          status: 'credited',
          description: `Multi-level commission (L${currentLevel}) from sub-IB`,
          idempotencyKey,
          processedAt: new Date()
        }], { session });

        // Credit to parent IB wallet
        let parentWallet = await Wallet.findOne({ userId: parentIB.userId, type: 'ib' }).session(session);
        if (!parentWallet) {
          parentWallet = await Wallet.create([{
            userId: parentIB.userId,
            oderId: parentIB.oderId,
            type: 'ib',
            balance: 0
          }], { session });
          parentWallet = parentWallet[0];
        }

        parentWallet.balance += mlCommission;
        parentWallet.totalEarned += mlCommission;
        parentWallet.lastTransactionAt = new Date();
        await parentWallet.save({ session });

        // Create wallet transaction
        await WalletTransaction.create([{
          walletId: parentWallet._id,
          userId: parentIB.userId,
          oderId: parentIB.oderId,
          walletType: 'ib',
          type: 'commission',
          amount: mlCommission,
          balanceAfter: parentWallet.balance,
          relatedTradeId: tradeData.tradeId,
          relatedIBId: parentIB._id,
          description: `Multi-level commission (L${currentLevel})`,
          status: 'completed',
          idempotencyKey: `wallet_${idempotencyKey}`
        }], { session });

        // Update parent IB stats
        parentIB.stats.totalCommissionEarned += mlCommission;
        parentIB.stats.thisMonthCommission += mlCommission;
        parentIB.wallet.balance += mlCommission;
        parentIB.wallet.totalEarned += mlCommission;
        parentIB.lastActivityAt = new Date();
        await parentIB.save({ session });

        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        console.error(`Multi-level commission error for level ${currentLevel}:`, error);
      } finally {
        session.endSession();
      }

      currentIB = parentIB;
      currentLevel++;
    }
  }

  /**
   * Get commission history for IB
   */
  async getCommissionHistory(ibId, options = {}) {
    const { page = 1, limit = 20, type = null, startDate = null, endDate = null } = options;

    const query = { ibId };

    if (type) {
      query.commissionType = type;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const total = await IBCommission.countDocuments(query);
    const commissions = await IBCommission.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('referredUserId', 'name email oderId');

    return {
      commissions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get commission summary for IB
   */
  async getCommissionSummary(ibId) {
    const ib = await IB.findById(ibId);
    if (!ib) {
      throw new Error('IB not found');
    }

    // Get this month's data
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const thisMonthCommissions = await IBCommission.aggregate([
      {
        $match: {
          ibId: new mongoose.Types.ObjectId(ibId),
          status: 'credited',
          createdAt: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: '$commissionType',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get all-time data
    const allTimeCommissions = await IBCommission.aggregate([
      {
        $match: {
          ibId: new mongoose.Types.ObjectId(ibId),
          status: 'credited'
        }
      },
      {
        $group: {
          _id: '$commissionType',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    return {
      wallet: ib.wallet,
      stats: ib.stats,
      thisMonth: thisMonthCommissions,
      allTime: allTimeCommissions
    };
  }

  /**
   * Reset monthly stats (called by cron)
   */
  async resetMonthlyStats() {
    await IB.updateMany(
      { status: 'active' },
      {
        $set: {
          'stats.thisMonthCommission': 0,
          'stats.thisMonthLots': 0
        }
      }
    );
  }
}

module.exports = new CommissionService();
