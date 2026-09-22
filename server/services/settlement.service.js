const mongoose = require('mongoose');
const IB = require('../models/IB');
const Wallet = require('../models/Wallet');
const IBCommission = require('../models/IBCommission');
const IBCopySettings = require('../models/IBCopySettings');

/**
 * Settlement Service
 * Handles daily/periodic settlement tasks
 */
class SettlementService {
  /**
   * Run daily settlement (called by cron)
   */
  async runDailySettlement() {
    console.log('[Settlement] Starting daily settlement...');
    const results = {
      ibMonthlyReset: false,
      errors: []
    };

    try {
      // Check if it's the first day of the month - reset monthly stats
      const today = new Date();
      if (today.getDate() === 1) {
        await this.resetMonthlyStats();
        results.ibMonthlyReset = true;
      }

      // Clean up stale data
      await this.cleanupStaleData();

      console.log('[Settlement] Daily settlement completed:', results);
      return results;
    } catch (error) {
      console.error('[Settlement] Error during daily settlement:', error);
      results.errors.push(error.message);
      return results;
    }
  }

  /**
   * Reset monthly statistics for IBs
   */
  async resetMonthlyStats() {
    console.log('[Settlement] Resetting monthly IB stats...');

    await IB.updateMany(
      { status: 'active' },
      {
        $set: {
          'stats.thisMonthCommission': 0,
          'stats.thisMonthLots': 0
        }
      }
    );

    console.log('[Settlement] Monthly IB stats reset completed');
  }

  /**
   * Clean up stale data
   */
  async cleanupStaleData() {
    console.log('[Settlement] Cleaning up stale data...');

    // Remove old pending commissions (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    await IBCommission.deleteMany({
      status: 'pending',
      createdAt: { $lt: thirtyDaysAgo }
    });

    console.log('[Settlement] Stale data cleanup completed');
  }

  /**
   * Generate settlement report
   */
  async generateSettlementReport(startDate, endDate) {
    const report = {
      period: { startDate, endDate },
      ib: {
        totalCommissionsPaid: 0,
        commissionsByType: {},
        topIBs: []
      }
    };

    // IB Commissions
    const ibCommissions = await IBCommission.aggregate([
      {
        $match: {
          status: 'credited',
          createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
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

    ibCommissions.forEach(c => {
      report.ib.commissionsByType[c._id] = { total: c.total, count: c.count };
      report.ib.totalCommissionsPaid += c.total;
    });

    // Top IBs
    report.ib.topIBs = await IB.find({ status: 'active' })
      .sort({ 'stats.totalCommissionEarned': -1 })
      .limit(10)
      .populate('userId', 'name oderId');

    return report;
  }
}

module.exports = new SettlementService();
