const mongoose = require('mongoose');
const User = require('./User');
const ZerodhaSettings = require('./ZerodhaSettings');
const { istCalendarDaysFromTodayTo } = require('../services/indianFnOExpiryFilter');

const FNO_INSTRUMENT_CATEGORIES = new Set([
  'NSE FUT',
  'NSE OPT',
  'MCX FUT',
  'MCX OPT',
  'BSE FUT',
  'BSE OPT'
]);

function parseExpiryRaw(raw) {
  if (raw == null || raw === '') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when saved row is Indian F&O with expiry strictly before today (IST calendar). */
function isExpiredFnOUserInstrument(category, expiryRaw) {
  if (!FNO_INSTRUMENT_CATEGORIES.has(category)) return false;
  const d = parseExpiryRaw(expiryRaw);
  if (!d) return false;
  return istCalendarDaysFromTodayTo(d) < 0;
}

// User Instruments Schema
// Stores instruments added by users to their watchlist/instrument panel
// Persists across sessions and devices
const userInstrumentsSchema = new mongoose.Schema({
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
  
  // Segment/Category (e.g., 'NSE EQ', 'NSE FUT', 'MCX FUT')
  category: {
    type: String,
    required: true
  },
  
  // Instrument details
  symbol: {
    type: String,
    required: true
  },
  name: {
    type: String,
    default: ''
  },
  exchange: {
    type: String,
    default: ''
  },
  token: {
    type: Number,
    default: null
  },
  lotSize: {
    type: Number,
    default: 1
  },
  tickSize: {
    type: Number,
    default: 0.05
  },
  expiry: {
    type: String,
    default: null
  },
  instrumentType: {
    type: String,
    default: ''
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index - one entry per user per category per symbol
userInstrumentsSchema.index({ userId: 1, category: 1, symbol: 1 }, { unique: true });
userInstrumentsSchema.index({ oderId: 1, category: 1 });

// Migrate legacy "Crypto" bucket into "Crypto Perpetual" (dedupe by symbol)
userInstrumentsSchema.statics.migrateLegacyCryptoCategory = async function (userId) {
  const legacy = await this.find({ userId, category: 'Crypto' });
  for (const doc of legacy) {
    const dup = await this.findOne({ userId, category: 'Crypto Perpetual', symbol: doc.symbol });
    if (dup) {
      await this.deleteOne({ _id: doc._id });
    } else {
      await this.updateOne({ _id: doc._id }, { $set: { category: 'Crypto Perpetual' } });
    }
  }
};

// Static method to get all instruments for a user
userInstrumentsSchema.statics.getInstrumentsForUser = async function (userId) {
  await this.migrateLegacyCryptoCategory(userId);
  const instruments = await this.find({ userId }).sort({ category: 1, symbol: 1 });

  const expiredRows = instruments.filter((row) =>
    isExpiredFnOUserInstrument(row.category, row.expiry)
  );
  const expiredIds = expiredRows.map((row) => row._id);
  const expiredSymbolsUpper = new Set(
    expiredRows.map((r) => String(r.symbol || '').toUpperCase()).filter(Boolean)
  );

  if (expiredIds.length > 0) {
    await this.deleteMany({ _id: { $in: expiredIds } });
  }

  let watchlistPruned = false;
  const u = await User.findById(userId).select('preferences.watchlist');
  const wl = Array.isArray(u?.preferences?.watchlist) ? u.preferences.watchlist : [];
  if (wl.length > 0) {
    const removeUpper = new Set(expiredSymbolsUpper);
    try {
      const settings = await ZerodhaSettings.getSettings();
      const subs = settings.subscribedInstruments || [];
      const subBySym = new Map(subs.map((s) => [String(s.symbol || '').toUpperCase(), s]));
      for (const sym of wl) {
        const sub = subBySym.get(String(sym).toUpperCase());
        if (!sub?.expiry) continue;
        const d = parseExpiryRaw(sub.expiry);
        if (d && istCalendarDaysFromTodayTo(d) < 0) {
          removeUpper.add(String(sym).toUpperCase());
        }
      }
    } catch (_) {
      /* optional */
    }
    if (removeUpper.size > 0) {
      const newWl = wl.filter((s) => !removeUpper.has(String(s).toUpperCase()));
      if (newWl.length !== wl.length) {
        await User.updateOne({ _id: userId }, { $set: { 'preferences.watchlist': newWl } });
        watchlistPruned = true;
      }
    }
  }

  const kept =
    expiredIds.length > 0
      ? await this.find({ userId }).sort({ category: 1, symbol: 1 })
      : instruments;

  // Group by category
  const grouped = {};
  for (const inst of kept) {
    if (!grouped[inst.category]) {
      grouped[inst.category] = [];
    }
    grouped[inst.category].push({
      symbol: inst.symbol,
      name: inst.name,
      exchange: inst.exchange,
      token: inst.token,
      lotSize: inst.lotSize,
      tickSize: inst.tickSize,
      expiry: inst.expiry,
      instrumentType: inst.instrumentType
    });
  }

  return { grouped, watchlistPruned };
};

// Static method to add instrument for user
userInstrumentsSchema.statics.addInstrument = async function (userId, oderId, category, instrument) {
  if (category === 'Crypto') category = 'Crypto Perpetual';
  const data = {
    userId,
    oderId,
    category,
    symbol: instrument.symbol,
    name: instrument.name || instrument.symbol,
    exchange: instrument.exchange || '',
    token: instrument.token || null,
    lotSize: instrument.lotSize || 1,
    tickSize: instrument.tickSize || 0.05,
    expiry: instrument.expiry || null,
    instrumentType: instrument.instrumentType || ''
  };
  
  return this.findOneAndUpdate(
    { userId, category, symbol: instrument.symbol },
    data,
    { upsert: true, new: true }
  );
};

// Static method to remove instrument for user
userInstrumentsSchema.statics.removeInstrument = async function (userId, category, symbol) {
  const cat = category === 'Crypto' ? 'Crypto Perpetual' : category;
  return this.findOneAndDelete({ userId, category: cat, symbol });
};

// Static method to clear all instruments for a user in a category
userInstrumentsSchema.statics.clearCategory = async function(userId, category) {
  return this.deleteMany({ userId, category });
};

module.exports = mongoose.model('UserInstruments', userInstrumentsSchema);
