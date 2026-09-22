const mongoose = require('mongoose');

/**
 * IB Admin Settings Schema
 * Global settings controlled by admin
 */
const ibCopySettingsSchema = new mongoose.Schema({
  // Singleton identifier
  key: { type: String, default: 'global', unique: true },

  // ===== IB SETTINGS =====
  ib: {
    // Enable/Disable IB system
    enabled: { type: Boolean, default: true },

    // Auto-approve new IB applications
    autoApprove: { type: Boolean, default: false },

    // Default commission settings for new IBs
    defaultCommission: {
      type: { type: String, enum: ['per_lot', 'revenue_percent', 'spread_share', 'hybrid'], default: 'per_lot' },
      perLotAmount: { type: Number, default: 2 }, // $2 per lot
      revenuePercent: { type: Number, default: 10 },
      spreadSharePercent: { type: Number, default: 20 }
    },

    // Multi-level commission rates (default)
    defaultMultiLevelRates: {
      level1: { type: Number, default: 100 }, // 100% of their own commission
      level2: { type: Number, default: 10 },  // 10% of sub-IB level 1
      level3: { type: Number, default: 5 },
      level4: { type: Number, default: 2 },
      level5: { type: Number, default: 1 }
    },

    // Maximum levels for multi-level
    maxLevels: { type: Number, default: 5, min: 1, max: 10 },

    // Minimum withdrawal amount
    minWithdrawal: { type: Number, default: 50 },

    // Commission caps
    maxPerLotCommission: { type: Number, default: 20 },
    maxRevenuePercent: { type: Number, default: 50 },

    // Payout schedule
    payoutSchedule: { type: String, enum: ['instant', 'daily', 'weekly', 'monthly'], default: 'instant' }
  },

  // ===== WALLET SETTINGS =====
  wallet: {
    // Withdrawal settings
    minWithdrawal: { type: Number, default: 10 },
    maxWithdrawalPerDay: { type: Number, default: 10000 },
    withdrawalFeePercent: { type: Number, default: 0 },
    withdrawalFeeFixed: { type: Number, default: 0 },

    // Transfer settings
    allowInternalTransfers: { type: Boolean, default: true },
    transferFeePercent: { type: Number, default: 0 },

    // Auto-withdrawal approval threshold
    autoApproveWithdrawalBelow: { type: Number, default: 0 } // 0 = always require approval
  },

  // ===== SETTLEMENT SETTINGS =====
  settlement: {
    // Daily settlement time (UTC hour)
    dailySettlementHour: { type: Number, default: 0 }, // Midnight UTC

    // Commission settlement
    commissionSettlementSchedule: { type: String, enum: ['instant', 'daily', 'weekly'], default: 'instant' }
  },

  // Last updated
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Static: Get global settings (singleton pattern)
ibCopySettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne({ key: 'global' });

  if (!settings) {
    settings = await this.create({ key: 'global' });
  }

  return settings;
};

// Static: Update settings
ibCopySettingsSchema.statics.updateSettings = async function(updates, adminId) {
  const settings = await this.getSettings();

  // Deep merge updates
  Object.keys(updates).forEach(key => {
    if (typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
      settings[key] = { ...settings[key].toObject(), ...updates[key] };
    } else {
      settings[key] = updates[key];
    }
  });

  settings.updatedBy = adminId;
  settings.updatedAt = new Date();

  await settings.save();
  return settings;
};

const IBCopySettings = mongoose.model('IBCopySettings', ibCopySettingsSchema);

module.exports = IBCopySettings;
