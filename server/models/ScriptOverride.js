const mongoose = require('mongoose');

// Script Override Schema - Individual symbol overrides for segment settings
// When a script has override settings, these take precedence over segment defaults
const scriptOverrideSchema = new mongoose.Schema({
  // Reference to segment
  segmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Segment',
    required: true
  },
  segmentName: {
    type: String,
    required: true
  },
  
  // Script/Symbol identification
  symbol: {
    type: String,
    required: true
  },
  tradingSymbol: {
    type: String,
    required: true
  },
  instrumentToken: {
    type: Number,
    required: false
  },
  
  // Lot size from Zerodha API (synced automatically)
  lotSize: {
    type: Number,
    default: 1,
    min: 1
  },
  
  // Limit Type override: 'lot' = lot-based, 'price' = price/value-based
  // If null, use segment default
  limitType: {
    type: String,
    enum: ['lot', 'price', null],
    default: null
  },
  // Max value for price-based limit (used when limitType = 'price')
  maxValue: {
    type: Number,
    default: null,
    min: 0
  },
  
  // Override settings (same as segment settings)
  // If a field is null/undefined, use segment default
  maxExchangeLots: {
    type: Number,
    default: null,
    min: 1
  },
  maxLots: {
    type: Number,
    default: null,
    min: 1
  },
  minLots: {
    type: Number,
    default: null,
    min: 1
  },
  orderLots: {
    type: Number,
    default: null,
    min: 1
  },
  commissionType: {
    type: String,
    enum: ['per_lot', 'per_crore', 'percentage', 'fixed', null],
    default: null
  },
  commission: {
    type: Number,
    default: null,
    min: 0
  },
  exposureIntraday: {
    type: Number,
    default: null,
    min: 0
  },
  exposureCarryForward: {
    type: Number,
    default: null,
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
  
  // ============== LIMIT POINTS SETTINGS ==============
  limitAwayPoints: {
    type: Number,
    default: null,
    min: 0
  },
  
  // ============== SPREAD / COMMISSION / SWAP (Forex & MT5-style) ==============
  spreadType: {
    type: String,
    default: null
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
  openCommission: {
    type: Number,
    default: null,
    min: 0
  },
  closeCommission: {
    type: Number,
    default: null,
    min: 0
  },
  swapType: {
    type: String,
    default: null
  },
  swapLong: {
    type: Number,
    default: null
  },
  swapShort: {
    type: Number,
    default: null
  },
  tripleSwapDay: {
    type: Number,
    default: null,
    min: 0,
    max: 6
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
    default: null
  },
  blockFractionLot: {
    type: Boolean,
    default: null
  },
  
  // ============== RISK MANAGEMENT SETTINGS ==============
  ledgerBalanceClose: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  profitTradeHoldMinSeconds: {
    type: Number,
    default: null,
    min: 0
  },
  lossTradeHoldMinSeconds: {
    type: Number,
    default: null,
    min: 0
  },
  blockLimitAboveBelowHighLow: {
    type: Boolean,
    default: null
  },
  blockLimitBetweenHighLow: {
    type: Boolean,
    default: null
  },
  exitOnlyMode: {
    type: Boolean,
    default: null
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

// Compound unique index - one override per symbol per segment
scriptOverrideSchema.index({ segmentId: 1, symbol: 1 }, { unique: true });

// Update timestamp on save
scriptOverrideSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Static method to get effective settings for a script
// Merges segment defaults with script overrides
scriptOverrideSchema.statics.getEffectiveSettings = async function(segmentId, symbol) {
  const Segment = mongoose.model('Segment');
  
  // Get segment defaults
  const segment = await Segment.findById(segmentId);
  if (!segment) {
    throw new Error('Segment not found');
  }
  
  // Get script override if exists
  const override = await this.findOne({ segmentId, symbol });
  
  // Merge settings - override takes precedence if not null
  const effectiveSettings = {
    segment: segment.name,
    symbol: symbol,
    lotSize: override?.lotSize || 1,
    // Lot Settings
    limitType: override?.limitType ?? segment.limitType ?? 'lot',
    maxValue: override?.maxValue ?? segment.maxValue ?? 0,
    maxExchangeLots: override?.maxExchangeLots ?? segment.maxExchangeLots,
    maxLots: override?.maxLots ?? segment.maxLots,
    minLots: override?.minLots ?? segment.minLots,
    orderLots: override?.orderLots ?? segment.orderLots,
    // Brokerage Settings
    commissionType: override?.commissionType ?? segment.commissionType,
    commission: override?.commission ?? segment.commission,
    exposureIntraday: override?.exposureIntraday ?? segment.exposureIntraday,
    exposureCarryForward: override?.exposureCarryForward ?? segment.exposureCarryForward,
    // Qty Settings
    maxQtyHolding: override?.maxQtyHolding ?? segment.maxQtyHolding,
    perOrderQty: override?.perOrderQty ?? segment.perOrderQty,
    // Fixed Margin Settings
    intradayHolding: override?.intradayHolding ?? segment.intradayHolding,
    overnightHolding: override?.overnightHolding ?? segment.overnightHolding,
    optionBuyIntraday: override?.optionBuyIntraday ?? segment.optionBuyIntraday,
    optionBuyOvernight: override?.optionBuyOvernight ?? segment.optionBuyOvernight,
    optionSellIntraday: override?.optionSellIntraday ?? segment.optionSellIntraday,
    optionSellOvernight: override?.optionSellOvernight ?? segment.optionSellOvernight,
    // Options Settings
    buyingStrikeFar: override?.buyingStrikeFar ?? segment.buyingStrikeFar,
    sellingStrikeFar: override?.sellingStrikeFar ?? segment.sellingStrikeFar,
    // Limit Points Settings
    limitAwayPoints: override?.limitAwayPoints ?? segment.limitAwayPoints,
    // Spread / Commission / Swap
    spreadType: override?.spreadType ?? segment.spreadType,
    spreadPips: override?.spreadPips ?? segment.spreadPips,
    markupPips: override?.markupPips ?? segment.markupPips,
    openCommission: override?.openCommission ?? segment.openCommission,
    closeCommission: override?.closeCommission ?? segment.closeCommission,
    swapType: override?.swapType ?? segment.swapType,
    swapLong: override?.swapLong ?? segment.swapLong,
    swapShort: override?.swapShort ?? segment.swapShort,
    tripleSwapDay: override?.tripleSwapDay ?? segment.tripleSwapDay,
    // Block Settings
    isActive: override?.isActive ?? segment.isActive,
    tradingEnabled: override?.tradingEnabled ?? segment.tradingEnabled,
    blockOptions: override?.blockOptions ?? segment.blockOptions,
    blockFractionLot: override?.blockFractionLot ?? segment.blockFractionLot,
    hasOverride: !!override
  };
  
  return effectiveSettings;
};

module.exports = mongoose.model('ScriptOverride', scriptOverrideSchema);
