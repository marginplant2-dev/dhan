const mongoose = require('mongoose');

// Hedging Script Override Schema - Individual symbol overrides for Hedging mode
const hedgingScriptOverrideSchema = new mongoose.Schema({
  // Reference to hedging segment
  segmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HedgingSegment',
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
  
  // ============== LOT SETTINGS ==============
  maxExchangeLots: {
    type: Number,
    default: null,
    min: 0
  },
  maxLots: {
    type: Number,
    default: null,
    min: 0
  },
  minLots: {
    type: Number,
    default: null,
    min: 0
  },
  lotStep: {
    type: Number,
    default: null,
    min: 0
  },
  
  // ============== BROKERAGE SETTINGS ==============
  commissionType: {
    type: String,
    enum: ['per_lot', 'percentage', 'fixed', null],
    default: null
  },
  commission: {
    type: Number,
    default: null,
    min: 0
  },
  
  // ============== SPREAD/SWAP SETTINGS ==============
  spreadType: {
    type: String,
    enum: ['fixed', 'floating', 'variable', null],
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
    enum: ['points', 'percentage', 'money', null],
    default: null
  },
  tripleSwapDay: {
    type: Number,
    default: null,
    min: 0,
    max: 6
  },
  
  // ============== LEVERAGE SETTINGS ==============
  maxLeverage: {
    type: Number,
    default: null,
    min: 1
  },
  defaultLeverage: {
    type: Number,
    default: null,
    min: 1
  },
  fixedLeverage: {
    type: Number,
    default: null,
    min: 1
  },
  marginMode: {
    type: String,
    enum: ['percentage', 'fixed', 'calculated', null],
    default: null
  },
  marginRate: {
    type: Number,
    default: null
  },
  hedgedMarginRate: {
    type: Number,
    default: null
  },
  
  // ============== CONTRACT SPECS ==============
  contractSize: {
    type: Number,
    default: null
  },
  digits: {
    type: Number,
    default: null
  },
  pipSize: {
    type: Number,
    default: null
  },
  pipValue: {
    type: Number,
    default: null
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

// Compound unique index
hedgingScriptOverrideSchema.index({ segmentId: 1, symbol: 1 }, { unique: true });

// Update timestamp on save
hedgingScriptOverrideSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Static method to get effective settings for a script
hedgingScriptOverrideSchema.statics.getEffectiveSettings = async function(segmentId, symbol) {
  const HedgingSegment = mongoose.model('HedgingSegment');
  
  const segment = await HedgingSegment.findById(segmentId);
  if (!segment) {
    throw new Error('Hedging segment not found');
  }
  
  const u = String(symbol || '').trim().toUpperCase();
  const symVariants = [u];
  const bMatch = u.match(/^([A-Z\&]+(?:-[A-Z\&]+)?)(?=\d|$)/);
  if (bMatch && bMatch[1] && bMatch[1] !== u) symVariants.push(bMatch[1]);
  
  const MAJOR_CRYPTO_PERPET_BASES = ['BTC', 'ETH', 'XRP', 'LTC', 'ADA', 'DOT', 'DOGE', 'SOL', 'AVAX', 'MATIC', 'LINK', 'BCH'];
  for (const b of MAJOR_CRYPTO_PERPET_BASES) {
    if (u === `${b}USD` || u === `${b}USDT` || u === `${b}USD.P` || u === `${b}USDT.P`) {
      symVariants.push(`${b}USD`, `${b}USDT`, `${b}USD.P`, `${b}USDT.P`, b);
      break;
    }
  }

  let override = null;
  if (symVariants.length > 1) {
    const matches = await this.find({ segmentId, symbol: { $in: symVariants } });
    if (matches.length > 0) {
      matches.sort((a, b) => b.symbol.length - a.symbol.length);
      override = matches[0];
    }
  } else {
    override = await this.findOne({ segmentId, symbol: symVariants[0] });
  }
  
  // Merge settings - override takes precedence if not null
  const effectiveSettings = {
    segment: segment.name,
    symbol: symbol,
    // Lot settings
    maxExchangeLots: override?.maxExchangeLots ?? segment.maxExchangeLots,
    maxLots: override?.maxLots ?? segment.maxLots,
    minLots: override?.minLots ?? segment.minLots,
    lotStep: override?.lotStep ?? segment.lotStep,
    // Brokerage
    commissionType: override?.commissionType ?? segment.commissionType,
    commission: override?.commission ?? segment.commission,
    // Spread/Swap
    spreadType: override?.spreadType ?? segment.spreadType,
    spreadPips: override?.spreadPips ?? segment.spreadPips,
    markupPips: override?.markupPips ?? segment.markupPips,
    swapLong: override?.swapLong ?? segment.swapLong,
    swapShort: override?.swapShort ?? segment.swapShort,
    swapType: override?.swapType ?? segment.swapType,
    tripleSwapDay: override?.tripleSwapDay ?? segment.tripleSwapDay,
    // Leverage
    maxLeverage: override?.maxLeverage ?? segment.maxLeverage,
    defaultLeverage: override?.defaultLeverage ?? segment.defaultLeverage,
    fixedLeverage: override?.fixedLeverage ?? segment.fixedLeverage,
    marginMode: override?.marginMode ?? segment.marginMode,
    marginRate: override?.marginRate ?? segment.marginRate,
    hedgedMarginRate: override?.hedgedMarginRate ?? segment.hedgedMarginRate,
    // Contract specs
    contractSize: override?.contractSize ?? segment.contractSize,
    digits: override?.digits ?? segment.digits,
    pipSize: override?.pipSize ?? segment.pipSize,
    pipValue: override?.pipValue ?? segment.pipValue,
    // Block settings
    isActive: override?.isActive ?? segment.isActive,
    tradingEnabled: override?.tradingEnabled ?? segment.tradingEnabled,
    blockFractionLot: override?.blockFractionLot ?? segment.blockFractionLot,
    // Risk
    ledgerBalanceClose: override?.ledgerBalanceClose ?? segment.ledgerBalanceClose,
    profitTradeHoldMinSeconds: override?.profitTradeHoldMinSeconds ?? segment.profitTradeHoldMinSeconds,
    lossTradeHoldMinSeconds: override?.lossTradeHoldMinSeconds ?? segment.lossTradeHoldMinSeconds,
    exitOnlyMode: override?.exitOnlyMode ?? segment.exitOnlyMode,
    hasOverride: !!override
  };
  
  return effectiveSettings;
};

module.exports = mongoose.model('HedgingScriptOverride', hedgingScriptOverrideSchema);
