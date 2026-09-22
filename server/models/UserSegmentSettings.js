const mongoose = require('mongoose');
// Ensures mongoose.model('NettingScriptOverride') works in getEffectiveSettingsForUser (not auto-loaded elsewhere).
require('./NettingScriptOverride');

/** Aligns with NettingEngine — same symbol may appear as BTCUSD / BTCUSDT / *.P in orders vs admin */
const MAJOR_CRYPTO_PERPET_BASES = [
  'BTC', 'ETH', 'XRP', 'LTC', 'ADA', 'DOT', 'DOGE', 'SOL', 'AVAX', 'MATIC', 'LINK', 'BCH'
];

function nettingScriptSymbolSearchVariants(symbol) {
  const u = String(symbol || '').trim().toUpperCase();
  if (!u) return [];
  const set = new Set([u]);
  for (const b of MAJOR_CRYPTO_PERPET_BASES) {
    const variants = [`${b}USD`, `${b}USDT`, `${b}USD.P`, `${b}USDT.P`];
    if (variants.includes(u)) {
      variants.forEach((v) => set.add(v));
      set.add(b);
    }
  }
  
  // Extract base prefix for Indian F&O (e.g., NIFTY23MAYFUT -> NIFTY)
  const baseMatch = u.match(/^([A-Z\&]+(?:-[A-Z\&]+)?)(?=\d|$)/);
  if (baseMatch && baseMatch[1] && baseMatch[1] !== u) {
    set.add(baseMatch[1]);
  }
  
  return [...set];
}

/** For leverage merge: null/undefined, blank string, or numeric zero = not set (fall through to next source). */
function isEffectiveLeverageScalar(v) {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') {
    const t = String(v).trim();
    if (t === '') return false;
    const n = Number(t);
    if (Number.isFinite(n) && n === 0) return false;
    return true;
  }
  if (typeof v === 'number' && v === 0) return false;
  return true;
}

function isEffectiveLeverageOptions(v) {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return String(v).trim() !== '';
  return true;
}

// User Segment Settings Schema
// Per-user overrides for segment settings
// Hierarchy: User Settings > Script Override > Segment Default
const userSegmentSettingsSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  oderId: {
    type: String,
    required: true
  },
  
  // Segment reference
  segmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Segment',
    required: true
  },
  segmentName: {
    type: String,
    required: true,
    enum: [
      // Indian Market Segments
      'NSE_EQ', 'NSE_FUT', 'NSE_OPT', 'BSE_EQ', 'BSE_FUT', 'BSE_OPT', 'MCX_FUT', 'MCX_OPT',
      // Forex/Global Segments
      'FOREX', 'STOCKS', 'CRYPTO', 'INDICES', 'COMMODITIES',
      // Delta Exchange Crypto Segments
      'CRYPTO_PERPETUAL', 'CRYPTO_OPTIONS'
    ]
  },
  
  // Optional: Script-specific override for this user
  // If null, applies to entire segment for this user
  symbol: {
    type: String,
    default: null
  },
  
  // Trade mode - separate settings for hedging vs netting
  // If null, applies to both modes (legacy behavior)
  tradeMode: {
    type: String,
    enum: ['hedging', 'netting', null],
    default: null
  },

  /**
   * Override layer — determines precedence when multiple overrides exist for
   * the same user/segment/symbol/tradeMode. Resolution order (highest first):
   *   1. 'user_explicit'  — super-admin set a per-user override
   *   2. 'broker'         — broker bulk-saved for their direct users
   *   3. 'sub_admin'      — sub-admin bulk-saved for their subtree
   * Global segment default (NettingSegment / HedgingSegment) is the fallback
   * when no layer row exists.
   *
   * Legacy rows (pre-Phase 1) default to 'user_explicit' so their semantics
   * don't change — they were always single-user overrides.
   */
  layer: {
    type: String,
    enum: ['user_explicit', 'broker', 'sub_admin'],
    default: 'user_explicit',
    index: true,
  },
  setByAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  setByRole: {
    type: String,
    enum: ['super_admin', 'sub_admin', 'broker', null],
    default: null,
  },

  // Limit Type override: 'lot' = lot-based, 'price' = price/value-based
  // If null, use segment/script default
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
  // If a field is null/undefined, use segment/script default
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
  // Contract specs (hedging / MT5-style)
  contractSize: { type: Number, default: null, min: 0 },
  digits: { type: Number, default: null, min: 0 },
  pipSize: { type: Number, default: null, min: 0 },
  pipValue: { type: Number, default: null },
  lotStep: { type: Number, default: null, min: 0 },
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
  // Per-side option brokerage (OPT segments). Without these the schema silently
  // stripped them on save, so per-user option brokerage never persisted — the
  // resolver at getEffectiveSettingsForUser reads userSetting.optionBuy/SellCommission.
  optionBuyCommission: {
    type: Number,
    default: null,
    min: 0
  },
  optionSellCommission: {
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
  
  // Lot size override for this user (for specific script)
  lotSize: {
    type: Number,
    default: null,
    min: 1
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
  /**
   * Per-user margin calculation mode override for netting.
   * null = inherit from script override or segment. 'fixed' | 'percent' | 'times' = override.
   */
  marginCalcMode: {
    type: String,
    enum: ['fixed', 'percent', 'times', null],
    default: null
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
  
  // ============== LIMIT AWAY (netting) ==============
  limitAwayPoints: {
    type: Number,
    default: null,
    min: 0
  },
  /** Per-user segment override: % from market (script-level uses points only) */
  limitAwayPercent: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  
  // ============== SPREAD SETTINGS ==============
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
  
  // ============== COMMISSION SETTINGS ==============
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
  
  // ============== SWAP SETTINGS ==============
  swapType: {
    type: String,
    enum: ['points', 'percentage', 'money', null],
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
  
  // ============== LEVERAGE SETTINGS ==============
  maxLeverage: {
    type: Number,
    default: null,
    min: 0
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
  marginMode: {
    type: String,
    enum: ['percentage', 'fixed', 'calculated', null],
    default: null
  },
  marginRate: {
    type: Number,
    default: null,
    min: 0
  },
  hedgedMarginRate: {
    type: Number,
    default: null,
    min: 0,
    max: 100
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
  // Per-side option expiry-day margins (Fix 17). User-level overrides take
  // precedence over script + segment values for the same field.
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

// Compound index for efficient lookups
// One setting per user per segment per symbol per tradeMode
// Each layer can coexist for the same (user, segment, symbol, tradeMode) —
// that's the whole point of layered overrides. The resolver walks layers in
// precedence order. Legacy code paths that upsert without a `layer` fall into
// the default 'user_explicit' bucket, preserving existing behavior.
userSegmentSettingsSchema.index(
  { userId: 1, segmentId: 1, symbol: 1, tradeMode: 1, layer: 1 },
  { unique: true }
);
// Fast scope lookup — "show me every row this admin created".
userSegmentSettingsSchema.index({ setByAdminId: 1, layer: 1 });
userSegmentSettingsSchema.index({ oderId: 1, segmentName: 1, tradeMode: 1 });

// Update timestamp on save
userSegmentSettingsSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Static method to get effective settings for a user + segment + symbol + tradeMode
// Priority: User Settings (mode-specific) > User Settings (general) > Script Override > Segment Default
// Hedging: HedgingSegment + HedgingScriptOverride. Netting: NettingSegment (+ NettingScriptOverride) first, else Segment + ScriptOverride.
userSegmentSettingsSchema.statics.getEffectiveSettingsForUser = async function(userId, segmentId, symbol = null, tradeMode = null) {
  const User = mongoose.model('User');
  let uid = null;
  if (userId != null && userId !== '') {
    if (userId instanceof mongoose.Types.ObjectId) {
      uid = userId;
    } else {
      const s = String(userId);
      if (mongoose.Types.ObjectId.isValid(s) && String(new mongoose.Types.ObjectId(s)) === s) {
        uid = new mongoose.Types.ObjectId(s);
      } else {
        const u = await User.findOne({ oderId: s }).select('_id');
        uid = u?._id || null;
      }
    }
  }

  const Segment = mongoose.model('Segment');
  const HedgingSegment = mongoose.model('HedgingSegment');
  const ScriptOverride = mongoose.model('ScriptOverride');
  const HedgingScriptOverride = mongoose.model('HedgingScriptOverride');

  let segment;
  let scriptOverride = null;

  if (tradeMode === 'hedging') {
    segment = await HedgingSegment.findById(segmentId);
    if (symbol) {
      const symVariants = nettingScriptSymbolSearchVariants(symbol);
      if (symVariants.length > 1) {
        const matches = await HedgingScriptOverride.find({ segmentId, symbol: { $in: symVariants } });
        if (matches.length > 0) {
          matches.sort((a, b) => b.symbol.length - a.symbol.length);
          scriptOverride = matches[0];
        }
      } else {
        scriptOverride = await HedgingScriptOverride.findOne({ segmentId, symbol: symVariants[0] });
      }
    }
  } else {
    const NettingSegment = mongoose.model('NettingSegment');
    const NettingScriptOverride = mongoose.model('NettingScriptOverride');
    segment = await NettingSegment.findById(segmentId);
    if (segment) {
      if (symbol) {
        const symVariants = nettingScriptSymbolSearchVariants(symbol);
        if (symVariants.length > 1) {
          const matches = await NettingScriptOverride.find({ segmentId, symbol: { $in: symVariants } });
          if (matches.length > 0) {
            matches.sort((a, b) => b.symbol.length - a.symbol.length);
            scriptOverride = matches[0];
          }
        } else {
          scriptOverride = await NettingScriptOverride.findOne({ segmentId, symbol: symVariants[0] });
        }
      }
    } else {
      segment = await Segment.findById(segmentId);
      if (symbol) {
        const symVariants = nettingScriptSymbolSearchVariants(symbol);
        if (symVariants.length > 1) {
          const matches = await ScriptOverride.find({ segmentId, symbol: { $in: symVariants } });
          if (matches.length > 0) {
            matches.sort((a, b) => b.symbol.length - a.symbol.length);
            scriptOverride = matches[0];
          }
        } else {
          scriptOverride = await ScriptOverride.findOne({ segmentId, symbol: symVariants[0] });
        }
      }
    }
  }

  if (!segment) {
    throw new Error(tradeMode === 'hedging' ? 'Hedging segment not found' : 'Segment not found');
  }

  // Hedging UI edits `Segment`; netting uses `NettingSegment` (parallel row same `name`).
  // For netting, lot/cap fields must come from NettingSegment first — otherwise Segment's schema
  // default (e.g. minLots: 1) overrides crypto/forex 0.01 mins and breaks the trade ticket.
  let parallelSegment = null;
  if (tradeMode !== 'hedging' && segment?.name && segment.constructor?.modelName === 'NettingSegment') {
    parallelSegment = await Segment.findOne({ name: segment.name }).lean();
  }

  const preferNettingDoc =
    tradeMode === 'netting' && segment?.constructor?.modelName === 'NettingSegment';

  // Spread / swap / markup: blank or 0 on NettingSegment = not set → use parallel Segment (hedging row).
  // Reuses leverage scalar rule (0, '', null do not block fallthrough). String enums: empty = not set.
  const isUnsetSpreadSwapString = (v) =>
    v === undefined || v === null || (typeof v === 'string' && String(v).trim() === '');
  const firstUserScriptSpreadNum = (key) => {
    const u = userSetting?.[key];
    const s = scriptOverride?.[key];
    if (!preferNettingDoc) {
      if (u !== undefined && u !== null) return u;
      if (s !== undefined && s !== null) return s;
      return undefined;
    }
    if (isEffectiveLeverageScalar(u)) return u;
    if (isEffectiveLeverageScalar(s)) return s;
    return undefined;
  };
  const firstUserScriptSpreadStr = (key) => {
    const u = userSetting?.[key];
    const s = scriptOverride?.[key];
    if (!preferNettingDoc) {
      if (u !== undefined && u !== null && String(u).trim() !== '') return u;
      if (s !== undefined && s !== null && String(s).trim() !== '') return s;
      return undefined;
    }
    if (!isUnsetSpreadSwapString(u)) return u;
    if (!isUnsetSpreadSwapString(s)) return s;
    return undefined;
  };
  const pickSpreadSwapSegments = (key, asString = false) => {
    // Netting admin: 0 / blank = inherit parallel Segment. Hedging: 0 on segment is a real value (e.g. no fixed spread).
    const fromNettingChain = (doc) => {
      if (!doc) return undefined;
      const v = doc[key];
      if (asString) return isUnsetSpreadSwapString(v) ? undefined : v;
      return isEffectiveLeverageScalar(v) ? v : undefined;
    };
    const fromHedgingDoc = (doc) => {
      if (!doc) return undefined;
      const v = doc[key];
      if (asString) return isUnsetSpreadSwapString(v) ? undefined : v;
      if (v !== undefined && v !== null) return v;
      return undefined;
    };
    if (preferNettingDoc) {
      let v = fromNettingChain(segment);
      if (v !== undefined) return v;
      return fromNettingChain(parallelSegment);
    }
    let v = fromHedgingDoc(parallelSegment);
    if (v !== undefined) return v;
    return fromHedgingDoc(segment);
  };

  const pickLotCapBase = (key) => {
    if (preferNettingDoc) {
      const nv = segment[key];
      if (nv !== undefined && nv !== null) return nv;
      const pv = parallelSegment?.[key];
      if (pv !== undefined && pv !== null) return pv;
      return undefined;
    }
    const pv2 = parallelSegment?.[key];
    if (pv2 !== undefined && pv2 !== null) return pv2;
    return segment[key];
  };

  // Get user-specific settings
  // Priority: mode-specific > symbol-specific > segment-level
  let userSetting = null;

  const userSymbolQuery =
    symbol != null && String(symbol).trim() !== ''
      ? (() => {
          const v = nettingScriptSymbolSearchVariants(symbol);
          return v.length > 1 ? { $in: v } : v[0];
        })()
      : null;

  // Layer precedence: user_explicit (1) beats broker (2) beats sub_admin (3).
  // When multiple rows match the same (userId, segmentId, symbol, tradeMode)
  // key but differ by layer, pick the one with the lowest rank.
  const LAYER_RANK = { user_explicit: 1, broker: 2, sub_admin: 3 };
  const pickTopLayer = async (query) => {
    const rows = await this.find(query);
    if (!rows.length) return null;
    rows.sort((a, b) => (LAYER_RANK[a.layer] || 1) - (LAYER_RANK[b.layer] || 1));
    return rows[0];
  };

  if (uid) {
    // 1. Check for mode-specific + symbol-specific setting
    if (userSymbolQuery && tradeMode) {
      userSetting = await pickTopLayer({ userId: uid, segmentId, symbol: userSymbolQuery, tradeMode });
    }
    // 2. Check for mode-specific + segment-level setting
    if (!userSetting && tradeMode) {
      userSetting = await pickTopLayer({ userId: uid, segmentId, symbol: null, tradeMode });
    }
    // 3. Check for symbol-specific setting (any mode)
    if (!userSetting && userSymbolQuery) {
      userSetting = await pickTopLayer({ userId: uid, segmentId, symbol: userSymbolQuery, tradeMode: null });
    }
    // 4. Check for segment-level setting (any mode)
    if (!userSetting) {
      userSetting = await pickTopLayer({ userId: uid, segmentId, symbol: null, tradeMode: null });
    }
  }

  const pickTopLayerLean = async (query) => {
    const rows = await this.find(query).lean();
    if (!rows.length) return null;
    rows.sort((a, b) => (LAYER_RANK[a.layer] || 1) - (LAYER_RANK[b.layer] || 1));
    return rows[0];
  };

  // User symbol vs segment-wide rows (reuse for limit-away points + options strike merge)
  let symPick = null;
  let segPick = null;
  if (uid && userSymbolQuery) {
    if (tradeMode) {
      symPick = await pickTopLayerLean({ userId: uid, segmentId, symbol: userSymbolQuery, tradeMode });
    }
    if (!symPick) {
      symPick = await pickTopLayerLean({ userId: uid, segmentId, symbol: userSymbolQuery, tradeMode: null });
    }
  }
  if (uid) {
    if (tradeMode) {
      segPick = await pickTopLayerLean({ userId: uid, segmentId, symbol: null, tradeMode });
    }
    if (!segPick) {
      segPick = await pickTopLayerLean({ userId: uid, segmentId, symbol: null, tradeMode: null });
    }
  }

  const limitAwayUserSymbolPts =
    symPick?.limitAwayPoints != null && symPick.limitAwayPoints > 0 ? symPick.limitAwayPoints : null;
  const limitAwayUserSegmentPts =
    segPick?.limitAwayPoints != null && segPick.limitAwayPoints > 0 ? segPick.limitAwayPoints : null;

  // ── Resolve marginCalcMode through override chain ──
  // Priority: user setting → script override → segment (with backward compat for fixedMarginAsPercent)
  const resolvedMarginCalcMode = (() => {
    // 1. User override (most specific)
    if (userSetting?.marginCalcMode) return userSetting.marginCalcMode;
    // 2. Script override
    if (scriptOverride?.marginCalcMode) return scriptOverride.marginCalcMode;
    // 3. Segment-level (netting doc preferred)
    if (preferNettingDoc) {
      // New field takes priority
      if (segment.marginCalcMode) return segment.marginCalcMode;
      // Backward compat: old boolean → new enum
      if (segment.fixedMarginAsPercent === true) return 'percent';
    }
    return 'fixed'; // default
  })();

  // Legacy per-field booleans — kept for backward compatibility with engine code
  // They are derived from the resolved marginCalcMode
  const segFixedMarginAsPercent = resolvedMarginCalcMode === 'percent';

  const intradayFromUserOrScript =
    (userSetting?.intradayHolding != null && userSetting.intradayHolding > 0) ||
    (scriptOverride?.intradayMargin != null && scriptOverride.intradayMargin > 0) ||
    (scriptOverride?.intradayHolding != null && scriptOverride.intradayHolding > 0);
  const overnightFromUserOrScript =
    (userSetting?.overnightHolding != null && userSetting.overnightHolding > 0) ||
    (scriptOverride?.overnightMargin != null && scriptOverride.overnightMargin > 0) ||
    (scriptOverride?.overnightHolding != null && scriptOverride.overnightHolding > 0);
  const optBuyIUserScript =
    (userSetting?.optionBuyIntraday != null && userSetting.optionBuyIntraday > 0) ||
    (scriptOverride?.optionBuyIntraday != null && scriptOverride.optionBuyIntraday > 0);
  const optBuyOUserScript =
    (userSetting?.optionBuyOvernight != null && userSetting.optionBuyOvernight > 0) ||
    (scriptOverride?.optionBuyOvernight != null && scriptOverride.optionBuyOvernight > 0);
  const optSellIUserScript =
    (userSetting?.optionSellIntraday != null && userSetting.optionSellIntraday > 0) ||
    (scriptOverride?.optionSellIntraday != null && scriptOverride.optionSellIntraday > 0);
  const optSellOUserScript =
    (userSetting?.optionSellOvernight != null && userSetting.optionSellOvernight > 0) ||
    (scriptOverride?.optionSellOvernight != null && scriptOverride.optionSellOvernight > 0);

  const segIntraday = pickLotCapBase('intradayMargin');
  const segOvernight = pickLotCapBase('overnightMargin');
  const fixedMarginIntradayAsPercent =
    segFixedMarginAsPercent &&
    !intradayFromUserOrScript &&
    segIntraday != null &&
    segIntraday > 0;
  const fixedMarginOvernightAsPercent =
    segFixedMarginAsPercent &&
    !overnightFromUserOrScript &&
    segOvernight != null &&
    segOvernight > 0;
  const segOptBuyI = pickLotCapBase('optionBuyIntraday');
  const segOptBuyO = pickLotCapBase('optionBuyOvernight');
  const segOptSellI = pickLotCapBase('optionSellIntraday');
  const segOptSellO = pickLotCapBase('optionSellOvernight');
  const fixedMarginOptionBuyIntradayAsPercent =
    segFixedMarginAsPercent && !optBuyIUserScript && segOptBuyI != null && segOptBuyI > 0;
  const fixedMarginOptionBuyOvernightAsPercent =
    segFixedMarginAsPercent && !optBuyOUserScript && segOptBuyO != null && segOptBuyO > 0;
  const fixedMarginOptionSellIntradayAsPercent =
    segFixedMarginAsPercent && !optSellIUserScript && segOptSellI != null && segOptSellI > 0;
  const fixedMarginOptionSellOvernightAsPercent =
    segFixedMarginAsPercent && !optSellOUserScript && segOptSellO != null && segOptSellO > 0;

  const segExpiryMarginAsPercent =
    preferNettingDoc === true && segment.expiryDayMarginAsPercent === true;
  const expIUserScript =
    (userSetting?.expiryDayIntradayMargin != null && userSetting.expiryDayIntradayMargin > 0) ||
    (scriptOverride?.expiryDayIntradayMargin != null && scriptOverride.expiryDayIntradayMargin > 0);
  const segExpI = pickLotCapBase('expiryDayIntradayMargin');
  const fixedExpiryDayIntradayAsPercent =
    segExpiryMarginAsPercent && !expIUserScript && segExpI != null && segExpI > 0;

  // Per-side option expiry-day margin (Fix 17). Same as-percent semantics
  // as the single field above — if the segment is in % mode AND the value
  // came from the segment row (not user/script override), it's a percent.
  const expBuyUserScript =
    (userSetting?.expiryDayOptionBuyMargin != null && userSetting.expiryDayOptionBuyMargin > 0) ||
    (scriptOverride?.expiryDayOptionBuyMargin != null && scriptOverride.expiryDayOptionBuyMargin > 0);
  const expSellUserScript =
    (userSetting?.expiryDayOptionSellMargin != null && userSetting.expiryDayOptionSellMargin > 0) ||
    (scriptOverride?.expiryDayOptionSellMargin != null && scriptOverride.expiryDayOptionSellMargin > 0);
  const segExpOptBuy = pickLotCapBase('expiryDayOptionBuyMargin');
  const segExpOptSell = pickLotCapBase('expiryDayOptionSellMargin');
  const fixedExpiryDayOptionBuyAsPercent =
    segExpiryMarginAsPercent && !expBuyUserScript && segExpOptBuy != null && segExpOptBuy > 0;
  const fixedExpiryDayOptionSellAsPercent =
    segExpiryMarginAsPercent && !expSellUserScript && segExpOptSell != null && segExpOptSell > 0;

  // Leverage: user/script > NettingSegment > legacy Segment in netting mode (same idea as pickLotCapBase).
  // Blank / 0 = not set at each layer. For fixedLeverage only: do NOT inherit from parallel Segment —
  // hedging Segment rows often still carry fixedLeverage while Netting admin left it blank; that wrongly
  // showed "Fixed" on the netting ticket (1:500 / 1:300) even when netting row had no fixed leverage.
  const nettingFirstLeverage = (key) => {
    const isOpts = key === 'leverageOptions';
    const pickFrom = (obj) => {
      if (!obj) return undefined;
      const v = obj[key];
      if (isOpts) return isEffectiveLeverageOptions(v) ? v : undefined;
      return isEffectiveLeverageScalar(v) ? v : undefined;
    };
    let v = pickFrom(userSetting);
    if (v !== undefined) return v;
    v = pickFrom(scriptOverride);
    if (v !== undefined) return v;
    if (preferNettingDoc) {
      v = pickFrom(segment);
      if (v !== undefined) return v;
      if (key === 'fixedLeverage') return undefined;
      v = pickFrom(parallelSegment);
      return v;
    }
    v = pickFrom(parallelSegment);
    if (v !== undefined) return v;
    return pickFrom(segment);
  };

  /**
   * Netting brokerage: default merge was user → script → segment. A NettingScriptOverride row with a stale
   * non-zero commission overrode COMMODITIES segment commission 0 (admin "no fee"). User row still wins first.
   * If netting segment commission is explicitly 0, keep 0 and ignore script unless user overrides.
   */
  const resolveNettingCommissionValue = () => {
    const rawUser = userSetting?.commission;
    if (
      rawUser !== undefined &&
      rawUser !== null &&
      !(typeof rawUser === 'string' && String(rawUser).trim() === '')
    ) {
      const n = Number(rawUser);
      if (Number.isFinite(n)) return n;
    }
    const rawSeg = segment?.commission;
    const segNum = Number(rawSeg);
    if (rawSeg !== undefined && rawSeg !== null && Number.isFinite(segNum) && segNum === 0) return 0;
    const rawScr = scriptOverride?.commission;
    if (rawScr !== undefined && rawScr !== null) {
      const cn = Number(rawScr);
      if (Number.isFinite(cn) && cn > 0) return cn;
    }
    if (rawSeg !== undefined && rawSeg !== null && Number.isFinite(segNum)) return segNum;
    return 0;
  };

  /**
   * Netting block flags: script rows default tradingEnabled/isActive to true in Mongoose, so
   * `user ?? script ?? segment` re-enabled trading when the NettingSegment had trading off.
   * Segment explicitly off is a global kill switch (user/script cannot turn trading back on).
   * Then user explicit boolean; then script false; else segment default.
   */
  const resolveNettingBlockFlag = (key) => {
    if (segment?.[key] === false) return false;
    const u = userSetting?.[key];
    if (u === true || u === false) return u;
    if (scriptOverride?.[key] === false) return false;
    return segment?.[key] !== false;
  };

  // Merge settings - user > script > segment
  const effectiveSettings = {
    segment: segment.name,
    name: segment.name,                  // Fix 24: _isOptionsSegmentSettings reads .name
    segmentType: segment.segmentType,    // Fix 24: fallback detection by segmentType
    symbol: symbol,
    lotSize: userSetting?.lotSize ?? scriptOverride?.lotSize ?? 1,
    // Lot Settings
    limitType: userSetting?.limitType ?? scriptOverride?.limitType ?? pickLotCapBase('limitType') ?? 'lot',
    maxValue: userSetting?.maxValue ?? scriptOverride?.maxValue ?? pickLotCapBase('maxValue') ?? 0,
    // Netting: max exchange lots = segment only (no script/user override). Hedging: user > script > segment.
    maxExchangeLots: preferNettingDoc
      ? pickLotCapBase('maxExchangeLots') ?? null
      : userSetting?.maxExchangeLots ?? scriptOverride?.maxExchangeLots ?? segment.maxExchangeLots ?? null,
    maxLots: userSetting?.maxLots ?? scriptOverride?.maxLots ?? pickLotCapBase('maxLots'),
    minLots: userSetting?.minLots ?? scriptOverride?.minLots ?? pickLotCapBase('minLots'),
    orderLots: userSetting?.orderLots ?? scriptOverride?.orderLots ?? pickLotCapBase('orderLots'),
    maxPositionsPerSymbol: userSetting?.maxPositionsPerSymbol ?? scriptOverride?.maxPositionsPerSymbol ?? segment.maxPositionsPerSymbol ?? null,
    maxTotalPositions: userSetting?.maxTotalPositions ?? scriptOverride?.maxTotalPositions ?? segment.maxTotalPositions ?? null,
    // Brokerage Settings
    commissionType: userSetting?.commissionType ?? scriptOverride?.commissionType ?? segment.commissionType,
    commission: preferNettingDoc
      ? resolveNettingCommissionValue()
      : userSetting?.commission ?? scriptOverride?.commission ?? segment.commission,
    // Per-side option brokerage (Fix 22/24). Only meaningful for OPT segments;
    // non-OPT segments use the single `commission` field above. The engine's
    // _pickCommissionRate reads these to choose buy vs sell rate.
    optionBuyCommission: userSetting?.optionBuyCommission ?? scriptOverride?.optionBuyCommission ?? segment.optionBuyCommission ?? 0,
    optionSellCommission: userSetting?.optionSellCommission ?? scriptOverride?.optionSellCommission ?? segment.optionSellCommission ?? 0,
    chargeOn: userSetting?.chargeOn ?? scriptOverride?.chargeOn ?? segment.chargeOn ?? 'open',
    exposureIntraday: userSetting?.exposureIntraday ?? scriptOverride?.exposureIntraday ?? segment.exposureIntraday,
    exposureCarryForward: userSetting?.exposureCarryForward ?? scriptOverride?.exposureCarryForward ?? segment.exposureCarryForward,
    // Qty Settings
    maxQtyHolding:
      userSetting?.maxQtyHolding ??
      scriptOverride?.maxQtyHolding ??
      pickLotCapBase('maxQtyHolding'),
    perOrderQty:
      userSetting?.perOrderQty ??
      scriptOverride?.perOrderQty ??
      pickLotCapBase('perOrderQty'),
    minQty:
      userSetting?.minQty ??
      scriptOverride?.minQty ??
      pickLotCapBase('minQty'),
    maxQtyPerScript:
      userSetting?.maxQtyPerScript ??
      scriptOverride?.maxQtyPerScript ??
      pickLotCapBase('maxQtyPerScript'),
    // maxQtyPerSegment removed — segment-wide qty cap caused mismatch with per-script overrides
    // Fixed Margin Settings (engine uses intradayHolding / overnightHolding; NettingSegment stores *Margin)
    marginCalcMode:
      userSetting?.marginCalcMode ??
      scriptOverride?.marginCalcMode ??
      pickLotCapBase('marginCalcMode') ??
      segment.marginCalcMode,
    intradayHolding:
      userSetting?.intradayHolding ??
      scriptOverride?.intradayMargin ??
      scriptOverride?.intradayHolding ??
      pickLotCapBase('intradayMargin') ??
      segment.intradayHolding,
    overnightHolding:
      userSetting?.overnightHolding ??
      scriptOverride?.overnightMargin ??
      scriptOverride?.overnightHolding ??
      pickLotCapBase('overnightMargin') ??
      segment.overnightHolding,
    optionBuyIntraday: userSetting?.optionBuyIntraday ?? scriptOverride?.optionBuyIntraday ?? segment.optionBuyIntraday,
    optionBuyOvernight: userSetting?.optionBuyOvernight ?? scriptOverride?.optionBuyOvernight ?? segment.optionBuyOvernight,
    optionSellIntraday: userSetting?.optionSellIntraday ?? scriptOverride?.optionSellIntraday ?? segment.optionSellIntraday,
    optionSellOvernight: userSetting?.optionSellOvernight ?? scriptOverride?.optionSellOvernight ?? segment.optionSellOvernight,
    // Options strike: user(sym pts) > script pts > user(seg pts) > user(sym %) > user(seg %) > segment % > legacy segment pts
    ...(() => {
      const buyPts = () => {
        const a = symPick?.buyingStrikeFar;
        if (a != null && a > 0) return { far: a, pct: null };
        const b = scriptOverride?.buyingStrikeFar;
        if (b != null && b > 0) return { far: b, pct: null };
        const c = segPick?.buyingStrikeFar;
        if (c != null && c > 0) return { far: c, pct: null };
        const p1 = symPick?.buyingStrikeFarPercent;
        if (p1 != null && p1 > 0) return { far: null, pct: p1 };
        const p2 = segPick?.buyingStrikeFarPercent;
        if (p2 != null && p2 > 0) return { far: null, pct: p2 };
        const segP = pickLotCapBase('buyingStrikeFarPercent');
        if (segP != null && segP > 0) return { far: null, pct: segP };
        const leg = pickLotCapBase('buyingStrikeFar');
        if (leg != null && leg > 0) return { far: leg, pct: null };
        return { far: null, pct: null };
      };
      const sellPts = () => {
        const a = symPick?.sellingStrikeFar;
        if (a != null && a > 0) return { far: a, pct: null };
        const b = scriptOverride?.sellingStrikeFar;
        if (b != null && b > 0) return { far: b, pct: null };
        const c = segPick?.sellingStrikeFar;
        if (c != null && c > 0) return { far: c, pct: null };
        const p1 = symPick?.sellingStrikeFarPercent;
        if (p1 != null && p1 > 0) return { far: null, pct: p1 };
        const p2 = segPick?.sellingStrikeFarPercent;
        if (p2 != null && p2 > 0) return { far: null, pct: p2 };
        const segP = pickLotCapBase('sellingStrikeFarPercent');
        if (segP != null && segP > 0) return { far: null, pct: segP };
        const leg = pickLotCapBase('sellingStrikeFar');
        if (leg != null && leg > 0) return { far: leg, pct: null };
        return { far: null, pct: null };
      };
      const buy = buyPts();
      const sell = sellPts();
      return {
        buyingStrikeFar: buy.far,
        buyingStrikeFarPercent: buy.pct,
        sellingStrikeFar: sell.far,
        sellingStrikeFarPercent: sell.pct
      };
    })(),
    // Limit away: user(symbol pts) > script(symbol pts) > user(segment pts) > user % > segment % > segment pts
    ...(() => {
      if (limitAwayUserSymbolPts != null) {
        return { limitAwayPoints: limitAwayUserSymbolPts, limitAwayPercent: null };
      }
      const scriptPts = scriptOverride?.limitAwayPoints;
      if (scriptPts != null && scriptPts > 0) {
        return { limitAwayPoints: scriptPts, limitAwayPercent: null };
      }
      if (limitAwayUserSegmentPts != null) {
        return { limitAwayPoints: limitAwayUserSegmentPts, limitAwayPercent: null };
      }
      const userPct = userSetting?.limitAwayPercent;
      const segPct = pickLotCapBase('limitAwayPercent');
      if (userPct != null && userPct > 0) {
        return { limitAwayPoints: null, limitAwayPercent: userPct };
      }
      if (segPct != null && segPct > 0) {
        return { limitAwayPoints: null, limitAwayPercent: segPct };
      }
      const segPts = pickLotCapBase('limitAwayPoints');
      return {
        limitAwayPoints: segPts != null && segPts > 0 ? segPts : null,
        limitAwayPercent: null
      };
    })(),
    // Contract Specs (HedgingSegment / Segment: contract size, digits, pip, lot step)
    contractSize: userSetting?.contractSize ?? scriptOverride?.contractSize ?? parallelSegment?.contractSize ?? segment.contractSize,
    digits: userSetting?.digits ?? scriptOverride?.digits ?? parallelSegment?.digits ?? segment.digits,
    pipSize: userSetting?.pipSize ?? scriptOverride?.pipSize ?? parallelSegment?.pipSize ?? segment.pipSize,
    pipValue: userSetting?.pipValue ?? scriptOverride?.pipValue ?? parallelSegment?.pipValue ?? segment.pipValue,
    lotStep: userSetting?.lotStep ?? scriptOverride?.lotStep ?? pickLotCapBase('lotStep'),
    // Spread / swap: 0 or blank on netting row = inherit from parallel Segment; user/script use same unset rules.
    spreadType:
      firstUserScriptSpreadStr('spreadType') ??
      pickSpreadSwapSegments('spreadType', true) ??
      segment.spreadType ??
      'floating',
    spreadPips: firstUserScriptSpreadNum('spreadPips') ?? pickSpreadSwapSegments('spreadPips') ?? null,
    markupPips: firstUserScriptSpreadNum('markupPips') ?? pickSpreadSwapSegments('markupPips') ?? null,
    // Commission Settings
    openCommission: userSetting?.openCommission ?? scriptOverride?.openCommission ?? segment.openCommission,
    closeCommission: userSetting?.closeCommission ?? scriptOverride?.closeCommission ?? segment.closeCommission,
    swapType:
      firstUserScriptSpreadStr('swapType') ??
      pickSpreadSwapSegments('swapType', true) ??
      segment.swapType ??
      'points',
    swapLong: firstUserScriptSpreadNum('swapLong') ?? pickSpreadSwapSegments('swapLong') ?? null,
    swapShort: firstUserScriptSpreadNum('swapShort') ?? pickSpreadSwapSegments('swapShort') ?? null,
    tripleSwapDay: firstUserScriptSpreadNum('tripleSwapDay') ?? pickSpreadSwapSegments('tripleSwapDay') ?? null,
    // Margin & Leverage (critical for hedging: margin mode, hedged margin %)
    marginMode: userSetting?.marginMode ?? scriptOverride?.marginMode ?? parallelSegment?.marginMode ?? segment.marginMode ?? 'percentage',
    marginRate: userSetting?.marginRate ?? scriptOverride?.marginRate ?? parallelSegment?.marginRate ?? segment.marginRate ?? 100,
    hedgedMarginRate: userSetting?.hedgedMarginRate ?? scriptOverride?.hedgedMarginRate ?? parallelSegment?.hedgedMarginRate ?? segment.hedgedMarginRate ?? 50,
    // Leverage Settings
    maxLeverage: nettingFirstLeverage('maxLeverage'),
    defaultLeverage: nettingFirstLeverage('defaultLeverage'),
    fixedLeverage: nettingFirstLeverage('fixedLeverage') ?? null,
    leverageOptions: nettingFirstLeverage('leverageOptions'),
    // Block Settings
    isActive: preferNettingDoc
      ? resolveNettingBlockFlag('isActive')
      : userSetting?.isActive ?? scriptOverride?.isActive ?? segment.isActive,
    tradingEnabled: preferNettingDoc
      ? resolveNettingBlockFlag('tradingEnabled')
      : userSetting?.tradingEnabled ?? scriptOverride?.tradingEnabled ?? segment.tradingEnabled,
    blockOptions: userSetting?.blockOptions ?? scriptOverride?.blockOptions ?? segment.blockOptions,
    blockFractionLot: userSetting?.blockFractionLot ?? scriptOverride?.blockFractionLot ?? segment.blockFractionLot,
    // Risk Management Settings
    ledgerBalanceClose: userSetting?.ledgerBalanceClose ?? scriptOverride?.ledgerBalanceClose ?? segment.ledgerBalanceClose ?? 0,
    profitTradeHoldMinSeconds: userSetting?.profitTradeHoldMinSeconds ?? scriptOverride?.profitTradeHoldMinSeconds ?? segment.profitTradeHoldMinSeconds ?? 0,
    lossTradeHoldMinSeconds: userSetting?.lossTradeHoldMinSeconds ?? scriptOverride?.lossTradeHoldMinSeconds ?? segment.lossTradeHoldMinSeconds ?? 0,
    expiryProfitHoldMinSeconds:
      userSetting?.expiryProfitHoldMinSeconds ??
      scriptOverride?.expiryProfitHoldMinSeconds ??
      segment.expiryProfitHoldMinSeconds ??
      0,
    expiryLossHoldMinSeconds:
      userSetting?.expiryLossHoldMinSeconds ??
      scriptOverride?.expiryLossHoldMinSeconds ??
      segment.expiryLossHoldMinSeconds ??
      0,
    expiryDayIntradayMargin:
      userSetting?.expiryDayIntradayMargin ??
      scriptOverride?.expiryDayIntradayMargin ??
      pickLotCapBase('expiryDayIntradayMargin') ??
      null,
    // Per-side option expiry-day margin (Fix 17). Same precedence chain as
    // the single field above. The reader in NettingEngine.resolveExpiryDay-
    // MarginAmount checks the option side first when isOptionsInstrument
    // is true, then falls back to expiryDayIntradayMargin.
    expiryDayOptionBuyMargin:
      userSetting?.expiryDayOptionBuyMargin ??
      scriptOverride?.expiryDayOptionBuyMargin ??
      pickLotCapBase('expiryDayOptionBuyMargin') ??
      null,
    expiryDayOptionSellMargin:
      userSetting?.expiryDayOptionSellMargin ??
      scriptOverride?.expiryDayOptionSellMargin ??
      pickLotCapBase('expiryDayOptionSellMargin') ??
      null,
    fixedExpiryDayIntradayAsPercent,
    fixedExpiryDayOptionBuyAsPercent,
    fixedExpiryDayOptionSellAsPercent,
    blockLimitAboveBelowHighLow: userSetting?.blockLimitAboveBelowHighLow ?? scriptOverride?.blockLimitAboveBelowHighLow ?? segment.blockLimitAboveBelowHighLow ?? false,
    blockLimitBetweenHighLow: userSetting?.blockLimitBetweenHighLow ?? scriptOverride?.blockLimitBetweenHighLow ?? segment.blockLimitBetweenHighLow ?? false,
    exitOnlyMode: userSetting?.exitOnlyMode ?? scriptOverride?.exitOnlyMode ?? segment.exitOnlyMode ?? false,
    allowOvernight: userSetting?.allowOvernight ?? scriptOverride?.allowOvernight ?? segment.allowOvernight ?? true,
    hasUserOverride: !!userSetting,
    hasScriptOverride: !!scriptOverride,
    // When true, engine applies intraday/overnight/option fixed margin as % of (qty × price) for values taken from segment defaults only.
    fixedMarginIntradayAsPercent,
    fixedMarginOvernightAsPercent,
    fixedMarginOptionBuyIntradayAsPercent,
    fixedMarginOptionBuyOvernightAsPercent,
    fixedMarginOptionSellIntradayAsPercent,
    fixedMarginOptionSellOvernightAsPercent,
    fixedExpiryDayIntradayAsPercent,
    // New unified margin calculation mode: 'fixed' | 'percent' | 'times'
    marginCalcMode: resolvedMarginCalcMode
  };
  
  return effectiveSettings;
};

// Static method to apply settings to multiple users
userSegmentSettingsSchema.statics.applyToMultipleUsers = async function(userIds, segmentId, segmentName, settings, symbol = null, tradeMode = null) {
  const User = mongoose.model('User');
  const results = [];
  
  for (const userId of userIds) {
    // Get user's oderId
    const user = await User.findById(userId).select('oderId');
    if (!user) continue;
    
    const settingData = {
      userId,
      oderId: user.oderId,
      segmentId,
      segmentName,
      symbol: symbol ? symbol.toUpperCase() : null,
      tradeMode: tradeMode || null,
      ...settings,
      updatedAt: Date.now()
    };
    
    const result = await this.findOneAndUpdate(
      { userId, segmentId, symbol: symbol ? symbol.toUpperCase() : null, tradeMode: tradeMode || null },
      settingData,
      { upsert: true, new: true }
    );
    
    results.push(result);
  }
  
  return results;
};

/**
 * Clone all user-segment override rows from source user onto each target (netting or hedging scope).
 * Includes segment-level and script-level (symbol) rows. Skips target === source.
 */
userSegmentSettingsSchema.statics.copyFromUserToUsers = async function(sourceUserId, targetUserIds, tradeMode = 'netting') {
  const User = mongoose.model('User');
  const srcId = new mongoose.Types.ObjectId(String(sourceUserId));

  const query = { userId: srcId };
  if (tradeMode === 'hedging') {
    query.tradeMode = 'hedging';
  } else {
    query.$or = [
      { tradeMode: null },
      { tradeMode: { $exists: false } },
      { tradeMode: 'netting' }
    ];
  }

  const sourceRows = await this.find(query).lean();
  const uniqueTargets = [...new Set((targetUserIds || []).map(String))].filter((id) => id !== String(sourceUserId));

  const OMIT = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'userId', 'oderId']);
  let upserts = 0;

  for (const tid of uniqueTargets) {
    const user = await User.findById(tid).select('oderId');
    if (!user || user.oderId == null || user.oderId === '') continue;

    const targetOid = new mongoose.Types.ObjectId(tid);

    for (const row of sourceRows) {
      const payload = {};
      for (const [k, v] of Object.entries(row)) {
        if (OMIT.has(k)) continue;
        payload[k] = v;
      }
      payload.userId = targetOid;
      payload.oderId = user.oderId;
      payload.updatedAt = new Date();

      const symbol = row.symbol != null && row.symbol !== '' ? String(row.symbol).toUpperCase() : null;
      const tm = row.tradeMode === 'hedging' || row.tradeMode === 'netting' ? row.tradeMode : null;

      await this.findOneAndUpdate(
        { userId: targetOid, segmentId: row.segmentId, symbol, tradeMode: tm },
        { $set: payload },
        { upsert: true, new: true }
      );
      upserts++;
    }
  }

  return {
    sourceRowCount: sourceRows.length,
    targetUserCount: uniqueTargets.length,
    upserts
  };
};

module.exports = mongoose.model('UserSegmentSettings', userSegmentSettingsSchema);
