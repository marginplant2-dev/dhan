const mongoose = require('mongoose');

// Netting Script Override Schema - Individual symbol overrides for Netting mode
const nettingScriptOverrideSchema = new mongoose.Schema({
  // Reference to netting segment
  segmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NettingSegment',
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
  
  // Lot size from exchange API
  lotSize: {
    type: Number,
    default: 1,
    min: 1
  },
  
  // ============== LOT SETTINGS ==============
  limitType: {
    type: String,
    enum: ['lot', 'price', null],
    default: null
  },
  maxValue: {
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
  orderLots: {
    type: Number,
    default: null,
    min: 0
  },
  
  // ============== BROKERAGE SETTINGS ==============
  // Commission amounts are entered in ₹ INR (same as NettingSegment); converted to USD in NettingEngine.
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
  chargeOn: {
    type: String,
    enum: ['open', 'close', 'both', null],
    default: null
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
  minQty: {
    type: Number,
    default: null,
    min: 0
  },
  maxQtyPerScript: {
    type: Number,
    default: null,
    min: 0
  },
  maxQtyPerSegment: {
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
  // Aligned with NettingSegment naming (admin UI); legacy intradayHolding/overnightHolding still read in merges
  intradayMargin: {
    type: Number,
    default: null,
    min: 0
  },
  overnightMargin: {
    type: Number,
    default: null,
    min: 0
  },
  /**
   * Per-script margin calculation mode override.
   * null = inherit from segment. 'fixed' | 'percent' | 'times' = override segment mode for this symbol.
   */
  marginCalcMode: {
    type: String,
    enum: ['fixed', 'percent', 'times', null],
    default: null
  },

  // ============== LEVERAGE (optional per-symbol overrides) ==============
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
  leverageOptions: {
    type: String,
    default: null
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
  
  spreadType: { type: String, default: null },
  spreadPips: { type: Number, default: null, min: 0 },
  openCommission: { type: Number, default: null, min: 0 },
  closeCommission: { type: Number, default: null, min: 0 },
  swapType: { type: String, default: null },
  swapLong: { type: Number, default: null },
  swapShort: { type: Number, default: null },
  tripleSwapDay: { type: Number, default: null, min: 0, max: 6 },
  
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
  expiryProfitHoldMinSeconds: {
    type: Number,
    default: null,
    min: 0
  },
  expiryLossHoldMinSeconds: {
    type: Number,
    default: null,
    min: 0
  },
  expiryDayIntradayMargin: {
    type: Number,
    default: null,
    min: 0
  },
  // Per-side option expiry-day margins (Fix 17). Take precedence over the
  // single `expiryDayIntradayMargin` above when set on this script override.
  expiryDayOptionBuyMargin: {
    type: Number,
    default: null,
    min: 0
  },
  expiryDayOptionSellMargin: {
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
  allowOvernight: {
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
nettingScriptOverrideSchema.index({ segmentId: 1, symbol: 1 }, { unique: true });

// Update timestamp on save
nettingScriptOverrideSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Static method to get effective settings for a script
nettingScriptOverrideSchema.statics.getEffectiveSettings = async function(segmentId, symbol) {
  const NettingSegment = mongoose.model('NettingSegment');
  
  const segment = await NettingSegment.findById(segmentId);
  if (!segment) {
    throw new Error('Netting segment not found');
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
    lotSize: override?.lotSize || 1,
    limitType: override?.limitType ?? segment.limitType ?? 'lot',
    maxValue: override?.maxValue ?? segment.maxValue ?? 0,
    maxExchangeLots: segment.maxExchangeLots,
    maxLots: override?.maxLots ?? segment.maxLots,
    minLots: override?.minLots ?? segment.minLots,
    orderLots: override?.orderLots ?? segment.orderLots,
    commissionType: override?.commissionType ?? segment.commissionType,
    commission: override?.commission ?? segment.commission,
    exposureIntraday: override?.exposureIntraday ?? segment.exposureIntraday,
    exposureCarryForward: override?.exposureCarryForward ?? segment.exposureCarryForward,
    maxQtyHolding: override?.maxQtyHolding ?? segment.maxQtyHolding,
    perOrderQty: override?.perOrderQty ?? segment.perOrderQty,
    marginCalcMode: override?.marginCalcMode ?? segment.marginCalcMode,
    intradayHolding:
      override?.intradayHolding ??
      override?.intradayMargin ??
      segment.intradayMargin ??
      segment.intradayHolding,
    overnightHolding:
      override?.overnightHolding ??
      override?.overnightMargin ??
      segment.overnightMargin ??
      segment.overnightHolding,
    optionBuyIntraday: override?.optionBuyIntraday ?? segment.optionBuyIntraday,
    optionBuyOvernight: override?.optionBuyOvernight ?? segment.optionBuyOvernight,
    optionSellIntraday: override?.optionSellIntraday ?? segment.optionSellIntraday,
    optionSellOvernight: override?.optionSellOvernight ?? segment.optionSellOvernight,
    buyingStrikeFar: override?.buyingStrikeFar ?? segment.buyingStrikeFar,
    sellingStrikeFar: override?.sellingStrikeFar ?? segment.sellingStrikeFar,
    ...(() => {
      const oPts = override?.limitAwayPoints;
      if (oPts != null && oPts > 0) {
        return { limitAwayPoints: oPts, limitAwayPercent: null };
      }
      const segPct = segment.limitAwayPercent;
      if (segPct != null && segPct > 0) {
        return { limitAwayPoints: null, limitAwayPercent: segPct };
      }
      const segPts = segment.limitAwayPoints;
      return {
        limitAwayPoints: segPts != null && segPts > 0 ? segPts : null,
        limitAwayPercent: null
      };
    })(),
    spreadType: override?.spreadType ?? segment.spreadType,
    spreadPips: override?.spreadPips ?? segment.spreadPips,
    openCommission: override?.openCommission ?? segment.openCommission,
    closeCommission: override?.closeCommission ?? segment.closeCommission,
    swapType: override?.swapType ?? segment.swapType,
    swapLong: override?.swapLong ?? segment.swapLong,
    swapShort: override?.swapShort ?? segment.swapShort,
    tripleSwapDay: override?.tripleSwapDay ?? segment.tripleSwapDay,
    isActive: override?.isActive ?? segment.isActive,
    tradingEnabled: override?.tradingEnabled ?? segment.tradingEnabled,
    blockOptions: override?.blockOptions ?? segment.blockOptions,
    blockFractionLot: override?.blockFractionLot ?? segment.blockFractionLot,
    exitOnlyMode: override?.exitOnlyMode ?? segment.exitOnlyMode ?? false,
    allowOvernight: override?.allowOvernight ?? segment.allowOvernight ?? true,
    hasOverride: !!override
  };
  
  return effectiveSettings;
};

module.exports = mongoose.model('NettingScriptOverride', nettingScriptOverrideSchema);
