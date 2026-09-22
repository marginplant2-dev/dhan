const mongoose = require('mongoose');

// Hedging Segment Schema - For Hedging trading mode
// Supports ONLY Forex + Crypto markets (NOT Indian markets)
const hedgingSegmentSchema = new mongoose.Schema({
  // Segment identification
  name: {
    type: String,
    required: true,
    unique: true
  },
  displayName: {
    type: String,
    required: true
  },
  exchange: {
    type: String,
    required: true
  },
  segmentType: {
    type: String,
    required: true
  },
  // Market type: always 'forex' for hedging (no indian markets)
  marketType: {
    type: String,
    enum: ['forex'],
    default: 'forex'
  },
  
  // ============== LOT SETTINGS ==============
  limitType: {
    type: String,
    enum: ['lot', 'price'],
    default: 'lot'
  },
  maxValue: {
    type: Number,
    default: 0,
    min: 0
  },
  maxExchangeLots: {
    type: Number,
    default: 100,
    min: 0
  },
  maxLots: {
    type: Number,
    default: 50,
    min: 0
  },
  minLots: {
    type: Number,
    default: 0.01,
    min: 0
  },
  orderLots: {
    type: Number,
    default: 10,
    min: 0
  },
  // Max open positions (trading limits); null = use global Trade Mode setting
  maxPositionsPerSymbol: {
    type: Number,
    default: null,
    min: 1
  },
  maxTotalPositions: {
    type: Number,
    default: null,
    min: 1
  },

  // ============== BROKERAGE SETTINGS ==============
  commissionType: {
    type: String,
    enum: ['per_lot', 'per_crore', 'percentage', 'fixed'],
    default: 'per_lot'
  },
  commission: {
    type: Number,
    default: 0,
    min: 0
  },
  openCommission: {
    type: Number,
    default: 0,
    min: 0
  },
  closeCommission: {
    type: Number,
    default: 0,
    min: 0
  },

  // Note: per-segment marginCallLevel / stopOutLevel were removed — they were
  // never read at runtime. MT5 stop-out is account-wide and lives on
  // RiskSettings (global) and UserRiskSettings (per-user override). See
  // server/services/riskManagement.service.js → checkStopOut.

  // ============== SPREAD/SWAP SETTINGS (Forex-specific) ==============
  spreadType: {
    type: String,
    enum: ['fixed', 'floating', 'variable'],
    default: 'floating'
  },
  spreadPips: {
    type: Number,
    default: 0,
    min: 0
  },
  markupPips: {
    type: Number,
    default: 0,
    min: 0
  },
  swapLong: {
    type: Number,
    default: 0
  },
  swapShort: {
    type: Number,
    default: 0
  },
  swapType: {
    type: String,
    enum: ['points', 'percentage', 'money'],
    default: 'points'
  },
  tripleSwapDay: {
    type: Number,
    default: 3,
    min: 0,
    max: 6
  },
  
  // ============== HEDGING MARGIN/LEVERAGE ==============
  maxLeverage: {
    type: Number,
    default: 500,
    min: 1
  },
  defaultLeverage: {
    type: Number,
    default: 100,
    min: 1
  },
  fixedLeverage: {
    type: Number,
    default: null,
    min: 1
  },
  leverageOptions: {
    type: String,
    default: '1,5,10,20,50,100,200,500'
  },
  marginMode: {
    type: String,
    enum: ['percentage', 'fixed', 'calculated'],
    default: 'percentage'
  },
  marginRate: {
    type: Number,
    default: 100
  },
  hedgedMarginRate: {
    type: Number,
    default: 50
  },
  
  // ============== HEDGING CONTRACT SPECS ==============
  contractSize: {
    type: Number,
    default: 100000
  },
  digits: {
    type: Number,
    default: 5
  },
  pipSize: {
    type: Number,
    default: 0.0001
  },
  pipValue: {
    type: Number,
    default: 10
  },
  lotStep: {
    type: Number,
    default: 0.01
  },
  
  // ============== BLOCK SETTINGS ==============
  isActive: {
    type: Boolean,
    default: true
  },
  tradingEnabled: {
    type: Boolean,
    default: true
  },
  blockFractionLot: {
    type: Boolean,
    default: false
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
  exitOnlyMode: {
    type: Boolean,
    default: false
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
hedgingSegmentSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Static method to seed default segments for Hedging mode
// Hedging supports ONLY Forex + Crypto markets (NOT Indian)
hedgingSegmentSchema.statics.seedDefaultSegments = async function() {
  const defaultSegments = [
    // ========== FOREX SEGMENTS ==========
    {
      name: 'FOREX',
      displayName: 'Forex',
      exchange: 'FOREX',
      segmentType: 'FOREX',
      marketType: 'forex',
      limitType: 'lot',
      maxExchangeLots: 500,
      maxLots: 100,
      minLots: 0.01,
      orderLots: 50,
      commissionType: 'per_lot',
      commission: 0,
      maxLeverage: 500,
      defaultLeverage: 100,
      marginMode: 'percentage',
      marginRate: 100,
      hedgedMarginRate: 50,
      contractSize: 100000,
      digits: 5,
      pipSize: 0.0001,
      pipValue: 10,
      lotStep: 0.01,
      spreadType: 'floating',
      spreadPips: 0,
      markupPips: 0,
      swapType: 'points',
      swapLong: 0,
      swapShort: 0,
      tripleSwapDay: 3
    },
    {
      name: 'STOCKS',
      displayName: 'Stocks (International)',
      exchange: 'STOCKS',
      segmentType: 'STOCKS',
      marketType: 'forex',
      limitType: 'lot',
      maxExchangeLots: 200,
      maxLots: 50,
      minLots: 0.01,
      orderLots: 25,
      commissionType: 'per_lot',
      commission: 0,
      maxLeverage: 100,
      defaultLeverage: 20,
      marginMode: 'percentage',
      marginRate: 100,
      hedgedMarginRate: 50,
      contractSize: 1000,
      digits: 2,
      pipSize: 0.01,
      pipValue: 10,
      lotStep: 0.01,
      spreadType: 'floating',
      spreadPips: 0,
      markupPips: 0,
      swapType: 'points',
      swapLong: 0,
      swapShort: 0,
      tripleSwapDay: 3
    },
    
    // ========== CRYPTO SEGMENTS ==========
    {
      name: 'CRYPTO',
      displayName: 'Crypto (Spot)',
      exchange: 'CRYPTO',
      segmentType: 'CRYPTO',
      marketType: 'forex',
      limitType: 'lot',
      maxExchangeLots: 100,
      maxLots: 10,
      minLots: 0.01,
      orderLots: 5,
      commissionType: 'per_lot',
      commission: 0,
      maxLeverage: 100,
      defaultLeverage: 20,
      marginMode: 'percentage',
      marginRate: 100,
      hedgedMarginRate: 50,
      contractSize: 1,
      digits: 2,
      pipSize: 0.01,
      pipValue: 1,
      lotStep: 0.01,
      spreadType: 'floating',
      spreadPips: 0,
      markupPips: 0,
      swapType: 'points',
      swapLong: 0,
      swapShort: 0,
      tripleSwapDay: 3
    },
    {
      name: 'CRYPTO_PERPETUAL',
      displayName: 'Crypto Perpetual',
      exchange: 'DELTA',
      segmentType: 'PERPETUAL',
      marketType: 'forex',
      limitType: 'lot',
      maxExchangeLots: 100,
      maxLots: 10,
      minLots: 0.01,
      orderLots: 5,
      commissionType: 'per_lot',
      commission: 0,
      maxLeverage: 100,
      defaultLeverage: 20,
      marginMode: 'percentage',
      marginRate: 100,
      hedgedMarginRate: 50,
      contractSize: 1,
      digits: 2,
      pipSize: 0.01,
      pipValue: 1,
      lotStep: 0.01,
      spreadType: 'floating',
      spreadPips: 0,
      markupPips: 0,
      swapType: 'points',
      swapLong: 0,
      swapShort: 0,
      tripleSwapDay: 3
    },
    {
      name: 'CRYPTO_OPTIONS',
      displayName: 'Crypto Options',
      exchange: 'DELTA',
      segmentType: 'OPTIONS',
      marketType: 'forex',
      limitType: 'lot',
      maxExchangeLots: 100,
      maxLots: 10,
      minLots: 0.01,
      orderLots: 5,
      commissionType: 'per_lot',
      commission: 0,
      maxLeverage: 100,
      defaultLeverage: 20,
      marginMode: 'percentage',
      marginRate: 100,
      hedgedMarginRate: 50,
      contractSize: 1,
      digits: 2,
      pipSize: 0.01,
      pipValue: 1,
      lotStep: 0.01,
      spreadType: 'floating',
      spreadPips: 0,
      markupPips: 0,
      swapType: 'points',
      swapLong: 0,
      swapShort: 0,
      tripleSwapDay: 3
    },
    
    // ========== OTHER GLOBAL SEGMENTS ==========
    {
      name: 'INDICES',
      displayName: 'Indices',
      exchange: 'INDICES',
      segmentType: 'INDICES',
      marketType: 'forex',
      limitType: 'lot',
      maxExchangeLots: 200,
      maxLots: 50,
      minLots: 0.01,
      orderLots: 25,
      commissionType: 'per_lot',
      commission: 0,
      maxLeverage: 200,
      defaultLeverage: 50,
      marginMode: 'percentage',
      marginRate: 100,
      hedgedMarginRate: 50,
      contractSize: 10,
      digits: 2,
      pipSize: 0.01,
      pipValue: 1,
      lotStep: 0.01,
      spreadType: 'floating',
      spreadPips: 0,
      markupPips: 0,
      swapType: 'points',
      swapLong: 0,
      swapShort: 0,
      tripleSwapDay: 3
    },
    {
      name: 'COMMODITIES',
      displayName: 'Commodities (International)',
      exchange: 'COMEX',
      segmentType: 'COMMODITIES',
      marketType: 'forex',
      limitType: 'lot',
      maxExchangeLots: 200,
      maxLots: 50,
      minLots: 0.01,
      orderLots: 25,
      commissionType: 'per_lot',
      commission: 0,
      maxLeverage: 200,
      defaultLeverage: 50,
      marginMode: 'percentage',
      marginRate: 100,
      hedgedMarginRate: 50,
      contractSize: 100,
      digits: 2,
      pipSize: 0.01,
      pipValue: 1,
      lotStep: 0.01,
      spreadType: 'floating',
      spreadPips: 0,
      markupPips: 0,
      swapType: 'points',
      swapLong: 0,
      swapShort: 0,
      tripleSwapDay: 3
    },
  ];

  // Upsert segments (only set defaults on insert, preserve user edits)
  for (const segment of defaultSegments) {
    await this.findOneAndUpdate(
      { name: segment.name },
      { $setOnInsert: segment },
      { upsert: true, new: true }
    );
  }

  await this.deleteMany({ name: 'CRYPTO_FUTURES' });
  
  console.log(`[HedgingSegment] Default segments seeded (${defaultSegments.length} segments - Forex/Crypto only)`);
};

module.exports = mongoose.model('HedgingSegment', hedgingSegmentSchema);
