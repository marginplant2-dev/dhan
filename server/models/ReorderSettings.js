const mongoose = require('mongoose');

// Reorder Settings Schema - Delayed trade execution with price advantage for broker
const reorderSettingsSchema = new mongoose.Schema({
  // Global default delay in seconds (applies to all users unless overridden)
  globalDelaySeconds: {
    type: Number,
    default: 0,
    min: 0,
    max: 306
  },
  
  // Enable/disable reorder feature globally
  isEnabled: {
    type: Boolean,
    default: false
  },
  
  // Per-segment delay settings
  segmentDelays: [{
    segmentName: {
      type: String,
      enum: ['FOREX', 'FOREX_MAJOR', 'FOREX_MINOR', 'CRYPTO', 'COMMODITIES', 'INDICES', 'NSE_EQ', 'NSE_FUT', 'NSE_OPT', 'BSE_FUT', 'BSE_OPT', 'MCX_FUT', 'MCX_OPT']
    },
    delaySeconds: {
      type: Number,
      default: 0,
      min: 0,
      max: 30
    },
    isEnabled: {
      type: Boolean,
      default: true
    }
  }],
  
  // Per-user delay overrides. Layered: the same userId can have one entry
  // per layer so sub-admin bulk writes don't clobber super-admin's explicit
  // per-user overrides. Resolver picks highest-priority layer at trade time.
  userDelays: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    layer: {
      type: String,
      enum: ['user_explicit', 'broker', 'sub_admin'],
      default: 'user_explicit',
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
    delaySeconds: {
      type: Number,
      default: 0,
      min: 0,
      max: 30
    },
    isEnabled: {
      type: Boolean,
      default: true
    },
    // Per-segment overrides for this user (overrides both global and user default)
    segmentOverrides: [{
      segmentName: {
        type: String,
        enum: ['FOREX', 'FOREX_MAJOR', 'FOREX_MINOR', 'CRYPTO', 'COMMODITIES', 'INDICES', 'NSE_EQ', 'NSE_FUT', 'NSE_OPT', 'BSE_FUT', 'BSE_OPT', 'MCX_FUT', 'MCX_OPT']
      },
      delaySeconds: {
        type: Number,
        default: 0,
        min: 0,
        max: 30
      },
      isEnabled: {
        type: Boolean,
        default: true
      }
    }]
  }],
  
  // Price advantage mode:
  // 'broker_advantage' - If price moves against user (up for buy, down for sell), use new price. Otherwise use original.
  // 'user_advantage' - If price moves in user's favor, use new price. Otherwise use original.
  // 'always_current' - Always use current price after delay
  priceMode: {
    type: String,
    enum: ['broker_advantage', 'user_advantage', 'always_current'],
    default: 'broker_advantage'
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware - update timestamp
reorderSettingsSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Static method to get settings (singleton pattern)
reorderSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

// Get delay for a specific user and segment
reorderSettingsSchema.statics.getDelayForTrade = async function(userId, segmentName) {
  const settings = await this.getSettings();
  
  console.log(`[ReorderSettings] getDelayForTrade - userId: ${userId}, segmentName: ${segmentName}`);
  console.log(`[ReorderSettings] Global settings - isEnabled: ${settings.isEnabled}, globalDelay: ${settings.globalDelaySeconds}, priceMode: ${settings.priceMode}`);
  
  if (!settings.isEnabled) {
    console.log(`[ReorderSettings] Reorder is disabled globally`);
    return null; // Reboorder is disabled globally
  }
  
  // Layered user override: multiple rows can exist for the same userId (one
  // per layer). Pick the highest-priority layer: user_explicit > broker > sub_admin.
  const LAYER_RANK = { user_explicit: 1, broker: 2, sub_admin: 3 };
  const userOverrides = settings.userDelays
    .filter(u => u.userId?.toString() === userId?.toString())
    .sort((a, b) => (LAYER_RANK[a.layer] || 1) - (LAYER_RANK[b.layer] || 1));
  const userOverride = userOverrides[0];
  if (userOverride && userOverride.isEnabled) {
    // Priority 1: Check user-segment specific override (highest priority)
    if (userOverride.segmentOverrides && userOverride.segmentOverrides.length > 0) {
      const userSegmentOverride = userOverride.segmentOverrides.find(s => s.segmentName === segmentName);
      if (userSegmentOverride && userSegmentOverride.isEnabled) {
        console.log(`[ReorderSettings] Using user-segment specific delay for ${segmentName}: ${userSegmentOverride.delaySeconds}s`);
        return { delaySeconds: userSegmentOverride.delaySeconds, priceMode: settings.priceMode };
      }
    }
    
    // Priority 2: User default delay (if set and > 0)
    if (userOverride.delaySeconds > 0) {
      console.log(`[ReorderSettings] Using user-specific delay: ${userOverride.delaySeconds}s`);
      return { delaySeconds: userOverride.delaySeconds, priceMode: settings.priceMode };
    }
  }
  
  // Priority 3: Check global segment-specific delay
  const segmentDelay = settings.segmentDelays.find(s => s.segmentName === segmentName);
  if (segmentDelay && segmentDelay.isEnabled && segmentDelay.delaySeconds > 0) {
    console.log(`[ReorderSettings] Using segment-specific delay for ${segmentName}: ${segmentDelay.delaySeconds}s`);
    return { delaySeconds: segmentDelay.delaySeconds, priceMode: settings.priceMode };
  }
  
  // Priority 4: Return global default
  console.log(`[ReorderSettings] Using global default delay: ${settings.globalDelaySeconds}s`);
  return { delaySeconds: settings.globalDelaySeconds, priceMode: settings.priceMode };
};

// Calculate execution price based on delay and price mode
reorderSettingsSchema.statics.calculateExecutionPrice = function(originalPrice, currentPrice, side, priceMode) {
  // side: 'BUY' or 'SELL'
  // For BUY: price going UP is bad for user (broker advantage)
  // For SELL: price going DOWN is bad for user (broker advantage)
  
  if (priceMode === 'always_current') {
    return currentPrice;
  }
  
  const isBuy = side.toUpperCase() === 'BUY';
  const priceWentUp = currentPrice > originalPrice;
  const priceWentDown = currentPrice < originalPrice;
  
  if (priceMode === 'broker_advantage') {
    // Use worse price for user (better for broker)
    if (isBuy) {
      // For BUY: higher price is worse for user
      return priceWentUp ? currentPrice : originalPrice;
    } else {
      // For SELL: lower price is worse for user
      return priceWentDown ? currentPrice : originalPrice;
    }
  } else if (priceMode === 'user_advantage') {
    // Use better price for user
    if (isBuy) {
      // For BUY: lower price is better for user
      return priceWentDown ? currentPrice : originalPrice;
    } else {
      // For SELL: higher price is better for user
      return priceWentUp ? currentPrice : originalPrice;
    }
  }
  
  return currentPrice;
};

module.exports = mongoose.model('ReorderSettings', reorderSettingsSchema);
