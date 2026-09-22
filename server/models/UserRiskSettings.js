const mongoose = require('mongoose');

// User-specific Risk Settings Schema - Override global settings per user
const userRiskSettingsSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    // Uniqueness moved to compound index on (userId, layer) below.
  },
  oderId: {
    type: String,
    required: true
  },

  // Layered override (matches UserSegmentSettings). Resolver walks layers in
  // precedence order; legacy rows default to 'user_explicit' so existing
  // super-admin per-user overrides keep their semantics.
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

  // ============== RISK MANAGEMENT SETTINGS ==============
  // If null, use global default
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
  
  // ============== MT5-STYLE MARGIN CONTROL ==============
  marginCallLevel: {
    type: Number,
    default: null,
    min: 0,
    max: 1000
  },
  stopOutLevel: {
    type: Number,
    default: null,
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
userRiskSettingsSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Layered unique index — one row per (user, layer). Previous single-user
// uniqueness lives here now plus the new dimension.
userRiskSettingsSchema.index({ userId: 1, layer: 1 }, { unique: true });
userRiskSettingsSchema.index({ setByAdminId: 1, layer: 1 });

// Per-user, short TTL cache. This function was hitting 3 collections on
// every trade (RiskSettings, User, UserRiskSettings) — ~300ms on Atlas.
// Cache invalidates on any risk-settings save elsewhere (post-save hook).
const _effectiveCache = new Map();  // userId → { at, value }
const EFFECTIVE_TTL_MS = 5000;

// Static method to get effective settings for a user (Mongo userId or User.oderId string)
userRiskSettingsSchema.statics.getEffectiveSettings = async function(userIdOrOderId) {
  const cacheKey = String(userIdOrOderId || '_guest');
  const hit = _effectiveCache.get(cacheKey);
  if (hit && (Date.now() - hit.at) < EFFECTIVE_TTL_MS) {
    return hit.value;
  }

  const RiskSettings = mongoose.model('RiskSettings');
  const User = mongoose.model('User');

  const globalSettings = await RiskSettings.getGlobalSettings();

  const merge = (userSettings) => ({
    ledgerBalanceClose: userSettings?.ledgerBalanceClose ?? globalSettings.ledgerBalanceClose ?? 0,
    profitTradeHoldMinSeconds: userSettings?.profitTradeHoldMinSeconds ?? globalSettings.profitTradeHoldMinSeconds ?? 0,
    lossTradeHoldMinSeconds: userSettings?.lossTradeHoldMinSeconds ?? globalSettings.lossTradeHoldMinSeconds ?? 0,
    blockLimitAboveBelowHighLow: userSettings?.blockLimitAboveBelowHighLow ?? globalSettings.blockLimitAboveBelowHighLow ?? false,
    blockLimitBetweenHighLow: userSettings?.blockLimitBetweenHighLow ?? globalSettings.blockLimitBetweenHighLow ?? false,
    exitOnlyMode: userSettings?.exitOnlyMode ?? globalSettings.exitOnlyMode ?? false,
    marginCallLevel: userSettings?.marginCallLevel ?? globalSettings.marginCallLevel ?? 100,
    stopOutLevel: userSettings?.stopOutLevel ?? globalSettings.stopOutLevel ?? 50,
    hasUserOverride: !!userSettings
  });

  let value;
  if (userIdOrOderId == null || userIdOrOderId === '') {
    value = merge(null);
  } else {
    let user = await User.findOne({ oderId: userIdOrOderId }).select('_id').lean();
    if (!user && mongoose.Types.ObjectId.isValid(userIdOrOderId)) {
      user = await User.findById(userIdOrOderId).select('_id').lean();
    }
    if (!user) {
      value = merge(null);
    } else {
      // Layered lookup — higher-priority layer wins (user_explicit > broker > sub_admin).
      const rows = await this.find({ userId: user._id }).lean();
      const LAYER_RANK = { user_explicit: 1, broker: 2, sub_admin: 3 };
      rows.sort((a, b) => (LAYER_RANK[a.layer] || 1) - (LAYER_RANK[b.layer] || 1));
      const userSettings = rows[0] || null;
      value = merge(userSettings);
    }
  }
  _effectiveCache.set(cacheKey, { at: Date.now(), value });
  return value;
};

userRiskSettingsSchema.statics.invalidateEffectiveCache = function(userIdOrOderId) {
  if (userIdOrOderId) _effectiveCache.delete(String(userIdOrOderId));
  else _effectiveCache.clear();
};

userRiskSettingsSchema.post('save', function() { _effectiveCache.clear(); });
userRiskSettingsSchema.post('findOneAndUpdate', function() { _effectiveCache.clear(); });
userRiskSettingsSchema.post('updateOne', function() { _effectiveCache.clear(); });

module.exports = mongoose.model('UserRiskSettings', userRiskSettingsSchema);
