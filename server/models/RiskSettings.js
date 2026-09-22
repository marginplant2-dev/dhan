const mongoose = require('mongoose');

// Global Risk Settings Schema - Platform-wide settings (not per segment)
const riskSettingsSchema = new mongoose.Schema({
  // Identifier - only one document should exist with type 'global'
  type: {
    type: String,
    enum: ['global'],
    default: 'global',
    unique: true
  },
  
  // ============== RISK MANAGEMENT SETTINGS ==============
  ledgerBalanceClose: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  profitTradeHoldMinSeconds: {
    type: Number,
    default: 0,
    min: 0
  },
  lossTradeHoldMinSeconds: {
    type: Number,
    default: 0,
    min: 0
  },
  blockLimitAboveBelowHighLow: {
    type: Boolean,
    default: false
  },
  blockLimitBetweenHighLow: {
    type: Boolean,
    default: false
  },
  exitOnlyMode: {
    type: Boolean,
    default: false
  },
  
  // ============== MT5-STYLE MARGIN CONTROL ==============
  // Works globally for both Hedging and Netting modes
  marginCallLevel: {
    type: Number,
    default: 100,
    min: 0,
    max: 1000
  },
  stopOutLevel: {
    type: Number,
    default: 50,
    min: 0,
    max: 100
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
riskSettingsSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Static method to get or create global settings
riskSettingsSchema.statics.getGlobalSettings = async function() {
  let settings = await this.findOne({ type: 'global' });
  if (!settings) {
    settings = await this.create({ type: 'global' });
  }
  return settings;
};

module.exports = mongoose.model('RiskSettings', riskSettingsSchema);
