const mongoose = require('mongoose');

const symbolSchema = new mongoose.Schema({
  symbol: { type: String, required: true, unique: true, uppercase: true },
  name: { type: String, default: '' },
  description: { type: String, default: '' },
  
  // Category
  category: { 
    type: String, 
    enum: ['forex', 'crypto', 'stocks', 'commodities', 'indices', 'other'], 
    default: 'forex' 
  },
  
  // Contract specifications
  contractSize: { type: Number, default: 100000 },
  digits: { type: Number, default: 5 },
  pipSize: { type: Number, default: 0.0001 },
  pipValue: { type: Number, default: 10 },
  
  // Trading settings
  minLotSize: { type: Number, default: 0.01 },
  maxLotSize: { type: Number, default: 100 },
  lotStep: { type: Number, default: 0.01 },
  
  // Leverage
  maxLeverage: { type: Number, default: 100 },
  
  // Spread settings (can override ChargeSettings)
  spreadType: { type: String, enum: ['fixed', 'floating', 'variable'], default: 'floating' },
  spreadPips: { type: Number, default: 0 },
  markupPips: { type: Number, default: 0 },
  
  // Commission settings
  commissionType: { type: String, enum: ['per-lot', 'per-trade', 'percentage', 'none'], default: 'none' },
  commissionPerLot: { type: Number, default: 0 },
  
  // Swap settings
  swapLong: { type: Number, default: 0 },
  swapShort: { type: Number, default: 0 },
  swapType: { type: String, enum: ['points', 'percentage', 'money'], default: 'points' },
  tripleSwapDay: { type: Number, default: 3, min: 0, max: 6 },
  
  // Margin settings
  marginMode: { type: String, enum: ['percentage', 'fixed', 'calculated'], default: 'percentage' },
  marginRate: { type: Number, default: 100 },
  hedgedMarginRate: { type: Number, default: 50 },
  
  // Trading hours
  tradingHours: {
    enabled: { type: Boolean, default: false },
    sessions: [{
      day: { type: Number, min: 0, max: 6 },
      open: { type: String },
      close: { type: String }
    }]
  },
  
  // Trade modes allowed
  allowHedging: { type: Boolean, default: true },
  allowNetting: { type: Boolean, default: true },
  allowBinary: { type: Boolean, default: true },
  
  // Order types allowed
  allowMarketOrders: { type: Boolean, default: true },
  allowLimitOrders: { type: Boolean, default: true },
  allowStopOrders: { type: Boolean, default: true },
  
  // Risk settings
  maxPositionsPerUser: { type: Number, default: 10 },
  maxVolumePerUser: { type: Number, default: 50 },
  dailyLossLimit: { type: Number, default: 0 },
  
  // Status
  isActive: { type: Boolean, default: true },
  isTradable: { type: Boolean, default: true },
  isVisible: { type: Boolean, default: true },
  
  // Market data source
  dataSource: { type: String, default: 'metaapi' },
  externalSymbol: { type: String, default: '' },
  
  // Sync info
  lastSyncAt: { type: Date, default: null },
  syncedFromApi: { type: Boolean, default: false },
  
  // Additional info
  baseCurrency: { type: String, default: '' },
  quoteCurrency: { type: String, default: '' },
  marginCurrency: { type: String, default: 'INR' },
  profitCurrency: { type: String, default: 'INR' }
  
}, { timestamps: true });

symbolSchema.index({ category: 1 });
symbolSchema.index({ isActive: 1 });

const Symbol = mongoose.model('Symbol', symbolSchema);

module.exports = Symbol;
