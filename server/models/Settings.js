const mongoose = require('mongoose');

// Trade Mode Settings Schema
const tradeModeSettingsSchema = new mongoose.Schema({
  mode: { type: String, enum: ['hedging', 'netting', 'binary'], required: true, unique: true },
  enabled: { type: Boolean, default: true },
  
  // Hedging specific
  minLotSize: { type: Number, default: 0.01 },
  maxLotSize: { type: Number, default: 100 },
  maxPositionsPerSymbol: { type: Number, default: 10 },
  maxTotalPositions: { type: Number, default: 50 },
  allowPartialClose: { type: Boolean, default: true },
  allowModifySLTP: { type: Boolean, default: true },
  defaultLeverage: { type: Number, default: 100 },
  // marginCallLevel / stopOutLevel removed — were dead config. Margin-call /
  // stop-out are account-wide and live on RiskSettings + UserRiskSettings.
  // See server/services/riskManagement.service.js → checkStopOut.
  allowIndianInstruments: { type: Boolean, default: false }, // Allow Indian instruments in Hedging mode
  
  // Netting specific
  minQuantity: { type: Number, default: 1 },
  maxQuantity: { type: Number, default: 10000 },
  intradayMaxQuantity: { type: Number, default: 5000 },
  carryForwardMaxQuantity: { type: Number, default: 2000 },
  autoSquareOffTime: { type: String, default: '15:30' },
  allowCarryForward: { type: Boolean, default: true },
  intradayMarginPercent: { type: Number, default: 20 },
  carryForwardMarginPercent: { type: Number, default: 100 },
  
  // Binary specific — min/max trade stake in INR (rupees); wallet still debits USD equivalent server-side
  minTradeAmount: { type: Number, default: 100 },
  maxTradeAmount: { type: Number, default: 1000000 },
  minExpiry: { type: Number, default: 60 },
  maxExpiry: { type: Number, default: 3600 },
  allowedExpiries: { type: [Number], default: [60, 120, 300, 600, 900, 1800, 3600] },
  expiryOptions: { type: [Number], default: [60, 120, 300, 600, 900, 1800, 3600] }, // Admin UI uses this field
  payoutPercent: { type: Number, default: 85 },
  refundOnTie: { type: Boolean, default: true },
  maxConcurrentTrades: { type: Number, default: 10 },
  dailyTradeLimit: { type: Number, default: 100 },
  dailyLossLimit: { type: Number, default: 500 },
  allowEarlyClosure: { type: Boolean, default: true },
  earlyClosureFee: { type: Number, default: 10 },
  lossRefundPercent: { type: Number, default: 0 }
}, { timestamps: true });

const TradeModeSettings = mongoose.model('TradeModeSettings', tradeModeSettingsSchema);

module.exports = TradeModeSettings;
