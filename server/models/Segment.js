const mongoose = require('mongoose');

// Unified Segment Schema for ALL Market Segments (Indian + Forex + Crypto + Commodities + Indices)
const segmentSchema = new mongoose.Schema({
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
  // Market type: 'indian' or 'forex' (for routing to correct engine)
  marketType: {
    type: String,
    enum: ['indian', 'forex'],
    default: 'indian'
  },
  zerodhaExchange: {
    type: String,
    default: null
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
    default: 1,
    min: 0
  },
  orderLots: {
    type: Number,
    default: 10,
    min: 0
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
  exposureIntraday: {
    type: Number,
    default: 1,
    min: 0
  },
  exposureCarryForward: {
    type: Number,
    default: 1,
    min: 0
  },
  
  // ============== QTY SETTINGS ==============
  maxQtyHolding: {
    type: Number,
    default: null,
    min: 0
  },
  perOrderQty: {
    type: Number,
    default: null,
    min: 0
  },
  
  // ============== FIXED MARGIN SETTINGS ==============
  intradayHolding: {
    type: Number,
    default: null,
    min: 0
  },
  overnightHolding: {
    type: Number,
    default: null,
    min: 0
  },
  optionBuyIntraday: {
    type: Number,
    default: null,
    min: 0
  },
  optionBuyOvernight: {
    type: Number,
    default: null,
    min: 0
  },
  optionSellIntraday: {
    type: Number,
    default: null,
    min: 0
  },
  optionSellOvernight: {
    type: Number,
    default: null,
    min: 0
  },
  
  // ============== OPTIONS SETTINGS ==============
  buyingStrikeFarPercent: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  sellingStrikeFarPercent: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  buyingStrikeFar: {
    type: Number,
    default: null,
    min: 0
  },
  sellingStrikeFar: {
    type: Number,
    default: null,
    min: 0
  },
  
  // ============== LIMIT AWAY (netting; synced to NettingSegment) ==============
  limitAwayPercent: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  limitAwayPoints: {
    type: Number,
    default: null,
    min: 0
  },
  
  // ============== SPREAD/SWAP SETTINGS (Forex-specific) ==============
  spreadType: {
    type: String,
    enum: ['fixed', 'floating', 'variable'],
    default: 'floating'
  },
  spreadPips: {
    type: Number,
    default: null,
    min: 0
  },
  markupPips: {
    type: Number,
    default: null,
    min: 0
  },
  swapLong: {
    type: Number,
    default: null
  },
  swapShort: {
    type: Number,
    default: null
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
  blockOptions: {
    type: Boolean,
    default: false
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
  allowOvernight: {
    type: Boolean,
    default: true
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
segmentSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Static method to seed default segments
segmentSchema.statics.seedDefaultSegments = async function() {
  const defaultSegments = [
    // ========== INDIAN MARKET SEGMENTS ==========
    {
      name: 'NSE_EQ',
      displayName: 'NSE EQ',
      exchange: 'NSE',
      segmentType: 'EQUITY',
      marketType: 'indian',
      zerodhaExchange: 'NSE',
      limitType: 'price',
      maxValue: 100000,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0,
      exposureIntraday: 1,
      exposureCarryForward: 1
    },
    {
      name: 'NSE_FUT',
      displayName: 'NSE FUT',
      exchange: 'NSE',
      segmentType: 'FUTURES',
      marketType: 'indian',
      zerodhaExchange: 'NFO',
      limitType: 'lot',
      maxValue: 0,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0,
      exposureIntraday: 5,
      exposureCarryForward: 2
    },
    {
      name: 'NSE_OPT',
      displayName: 'NSE OPT',
      exchange: 'NSE',
      segmentType: 'OPTIONS',
      marketType: 'indian',
      zerodhaExchange: 'NFO',
      limitType: 'lot',
      maxValue: 0,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0,
      exposureIntraday: 5,
      exposureCarryForward: 2
    },
    {
      name: 'BSE_EQ',
      displayName: 'BSE EQ',
      exchange: 'BSE',
      segmentType: 'EQUITY',
      marketType: 'indian',
      zerodhaExchange: 'BSE',
      limitType: 'price',
      maxValue: 100000,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0,
      exposureIntraday: 1,
      exposureCarryForward: 1
    },
    {
      name: 'BSE_FUT',
      displayName: 'BSE FUT',
      exchange: 'BSE',
      segmentType: 'FUTURES',
      marketType: 'indian',
      zerodhaExchange: 'BFO',
      limitType: 'lot',
      maxValue: 0,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0,
      exposureIntraday: 5,
      exposureCarryForward: 2
    },
    {
      name: 'BSE_OPT',
      displayName: 'BSE OPT',
      exchange: 'BSE',
      segmentType: 'OPTIONS',
      marketType: 'indian',
      zerodhaExchange: 'BFO',
      limitType: 'lot',
      maxValue: 0,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0,
      exposureIntraday: 5,
      exposureCarryForward: 2
    },
    {
      name: 'MCX_FUT',
      displayName: 'MCX FUT',
      exchange: 'MCX',
      segmentType: 'FUTURES',
      marketType: 'indian',
      zerodhaExchange: 'MCX',
      limitType: 'lot',
      maxValue: 0,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0,
      exposureIntraday: 5,
      exposureCarryForward: 2
    },
    {
      name: 'MCX_OPT',
      displayName: 'MCX OPT',
      exchange: 'MCX',
      segmentType: 'OPTIONS',
      marketType: 'indian',
      zerodhaExchange: 'MCX',
      limitType: 'lot',
      maxValue: 0,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0,
      exposureIntraday: 5,
      exposureCarryForward: 2
    },
    
    // ========== FOREX / GLOBAL MARKET SEGMENTS ==========
    // These match exactly what users see on the trading panel
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
      displayName: 'Stocks',
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
    {
      name: 'CRYPTO',
      displayName: 'Crypto',
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
      displayName: 'Commodities',
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

  // Remove old/deprecated segments that are not in the valid list
  const validNames = defaultSegments.map(s => s.name);
  await this.deleteMany({ name: { $nin: validNames } });

  // Upsert valid segments (only set defaults on insert, preserve user edits)
  for (const segment of defaultSegments) {
    await this.findOneAndUpdate(
      { name: segment.name },
      { $setOnInsert: segment },
      { upsert: true, new: true }
    );
  }

  const UserSegmentSettings = require('./UserSegmentSettings');
  const cryptoPerpetual = await this.findOne({ name: 'CRYPTO_PERPETUAL' });
  if (cryptoPerpetual) {
    await UserSegmentSettings.updateMany(
      { segmentName: 'CRYPTO_FUTURES' },
      { $set: { segmentName: 'CRYPTO_PERPETUAL', segmentId: cryptoPerpetual._id } }
    );
  }

  const { migrateIndianSegmentDisplayNames } = require('../utils/segmentDisplayNames');
  await migrateIndianSegmentDisplayNames(this);

  console.log(`Default segments seeded (${validNames.length} segments, old ones cleaned up)`);
};

module.exports = mongoose.model('Segment', segmentSchema);
