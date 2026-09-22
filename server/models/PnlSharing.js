const mongoose = require('mongoose');

// PnL Sharing Settings Schema - Configurable sharing % per admin
const pnlSharingSettingsSchema = new mongoose.Schema({
  // The admin who receives the share
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  adminOderId: { type: String, required: true },
  adminRole: { type: String, enum: ['sub_admin', 'broker'], required: true },
  
  // Who configured this setting (parent admin)
  configuredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  configuredByOderId: { type: String },
  
  // Default sharing percentages
  lossSharePercent: { type: Number, default: 0, min: 0, max: 100 },
  profitSharePercent: { type: Number, default: 0, min: 0, max: 100 },
  
  // Segment-specific overrides (optional)
  segmentOverrides: [{
    segment: { type: String }, // 'NSE_FUT', 'NSE_OPT', 'MCX_FUT', 'MCX_OPT', 'NSE_EQ', etc.
    lossSharePercent: { type: Number, min: 0, max: 100 },
    profitSharePercent: { type: Number, min: 0, max: 100 }
  }],
  
  // Settlement configuration
  settlementMode: { 
    type: String, 
    enum: ['instant', 'daily', 'weekly', 'monthly'], 
    default: 'instant' 
  },
  minSettlementAmount: { type: Number, default: 0 },
  
  isActive: { type: Boolean, default: true },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Ensure one setting per admin
pnlSharingSettingsSchema.index({ adminId: 1 }, { unique: true });
pnlSharingSettingsSchema.index({ adminOderId: 1 }, { unique: true });

// Get sharing percent for a specific segment
pnlSharingSettingsSchema.methods.getSharePercent = function(segment, isLoss = true) {
  // Check segment override first
  const override = this.segmentOverrides?.find(s => s.segment === segment);
  if (override) {
    return isLoss ? override.lossSharePercent : override.profitSharePercent;
  }
  // Fall back to default
  return isLoss ? this.lossSharePercent : this.profitSharePercent;
};

// PnL Distribution Log Schema - Track all distributions
const pnlDistributionLogSchema = new mongoose.Schema({
  // Trade reference
  tradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade' },
  tradeOderId: { type: String },
  positionId: { type: mongoose.Schema.Types.ObjectId },
  positionOderId: { type: String },
  
  // User who made the trade
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userOderId: { type: String, required: true },
  userName: { type: String },
  
  // Trade details
  symbol: { type: String, required: true },
  segment: { type: String }, // 'NSE_FUT', 'MCX_FUT', etc.
  exchange: { type: String },
  side: { type: String, enum: ['buy', 'sell'] },
  volume: { type: Number },
  quantity: { type: Number },
  
  // Original trade P/L
  tradePnL: { type: Number, required: true },
  isUserLoss: { type: Boolean, required: true }, // true if user lost money
  
  // Distribution to this admin
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  adminOderId: { type: String, required: true },
  adminRole: { type: String, enum: ['super_admin', 'sub_admin', 'broker'] },
  adminName: { type: String },
  
  // Share calculation
  sharePercent: { type: Number, required: true },
  shareAmount: { type: Number, required: true }, // Positive = credit, Negative = debit
  shareType: { type: String, enum: ['loss_share', 'profit_share'], required: true },
  
  // Wallet update reference
  walletBefore: { type: Number },
  walletAfter: { type: Number },
  
  // Settlement status
  settlementStatus: { 
    type: String, 
    enum: ['instant', 'pending', 'settled'], 
    default: 'instant' 
  },
  settledAt: { type: Date },
  
  closedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes for efficient queries
pnlDistributionLogSchema.index({ adminOderId: 1, createdAt: -1 });
pnlDistributionLogSchema.index({ userOderId: 1, createdAt: -1 });
pnlDistributionLogSchema.index({ segment: 1, createdAt: -1 });
pnlDistributionLogSchema.index({ closedAt: -1 });
pnlDistributionLogSchema.index({ settlementStatus: 1 });

// Static method to get summary for an admin
pnlDistributionLogSchema.statics.getSummary = async function(adminOderId, dateFrom = null, dateTo = null) {
  const match = { adminOderId };
  
  if (dateFrom || dateTo) {
    match.closedAt = {};
    if (dateFrom) match.closedAt.$gte = new Date(dateFrom);
    if (dateTo) match.closedAt.$lte = new Date(dateTo);
  }
  
  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: '$shareAmount' },
        totalLossShare: { 
          $sum: { $cond: [{ $eq: ['$shareType', 'loss_share'] }, '$shareAmount', 0] }
        },
        totalProfitShare: { 
          $sum: { $cond: [{ $eq: ['$shareType', 'profit_share'] }, '$shareAmount', 0] }
        },
        tradeCount: { $sum: 1 },
        totalTradePnL: { $sum: '$tradePnL' }
      }
    }
  ]);
  
  return result[0] || {
    totalEarnings: 0,
    totalLossShare: 0,
    totalProfitShare: 0,
    tradeCount: 0,
    totalTradePnL: 0
  };
};

// Static method to get segment-wise summary
pnlDistributionLogSchema.statics.getSegmentSummary = async function(adminOderId, dateFrom = null, dateTo = null) {
  const match = { adminOderId };
  
  if (dateFrom || dateTo) {
    match.closedAt = {};
    if (dateFrom) match.closedAt.$gte = new Date(dateFrom);
    if (dateTo) match.closedAt.$lte = new Date(dateTo);
  }
  
  return await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$segment',
        totalEarnings: { $sum: '$shareAmount' },
        tradeCount: { $sum: 1 }
      }
    },
    { $sort: { totalEarnings: -1 } }
  ]);
};

// Static method to get user-wise summary (for brokers)
pnlDistributionLogSchema.statics.getUserSummary = async function(adminOderId, dateFrom = null, dateTo = null) {
  const match = { adminOderId };
  
  if (dateFrom || dateTo) {
    match.closedAt = {};
    if (dateFrom) match.closedAt.$gte = new Date(dateFrom);
    if (dateTo) match.closedAt.$lte = new Date(dateTo);
  }
  
  return await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$userOderId',
        userName: { $first: '$userName' },
        totalEarnings: { $sum: '$shareAmount' },
        tradeCount: { $sum: 1 },
        totalTradePnL: { $sum: '$tradePnL' }
      }
    },
    { $sort: { totalEarnings: -1 } }
  ]);
};

const PnlSharingSettings = mongoose.model('PnlSharingSettings', pnlSharingSettingsSchema);
const PnlDistributionLog = mongoose.model('PnlDistributionLog', pnlDistributionLogSchema);

module.exports = { PnlSharingSettings, PnlDistributionLog };
