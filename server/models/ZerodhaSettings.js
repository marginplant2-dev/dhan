const mongoose = require('mongoose');

const zerodhaSettingsSchema = new mongoose.Schema({
  apiKey: { type: String, default: '' },
  apiSecret: { type: String, default: '' },
  accessToken: { type: String, default: null },
  refreshToken: { type: String, default: null },
  tokenExpiry: { type: Date, default: null },
  isConnected: { type: Boolean, default: false },
  lastConnected: { type: Date, default: null },
  
  // Segments to subscribe
  enabledSegments: {
    nseEq: { type: Boolean, default: true },
    bseEq: { type: Boolean, default: true },
    nseFut: { type: Boolean, default: true },
    nseOpt: { type: Boolean, default: true },
    mcxFut: { type: Boolean, default: true },
    mcxOpt: { type: Boolean, default: true },
    bseFut: { type: Boolean, default: false },
    bseOpt: { type: Boolean, default: false }
  },
  
  // Subscribed instruments (instrument tokens) - manually subscribed for WebSocket
  subscribedInstruments: [{
    token: { type: Number },
    symbol: { type: String },
    exchange: { type: String },
    segment: { type: String },
    name: { type: String },
    lotSize: { type: Number, default: 1 },
    tickSize: { type: Number, default: 0.05 },
    expiry: { type: Date, default: null },
    strike: { type: Number, default: null },
    instrumentType: { type: String, default: null }
  }],
  
  // Last time instruments were fetched from Zerodha
  instrumentsLastFetched: { type: Date, default: null },
  
  // Auto-sync settings
  autoSyncEnabled: { type: Boolean, default: true },
  autoRemoveExpired: { type: Boolean, default: true },
  
  // WebSocket status
  wsStatus: {
    type: String,
    enum: ['disconnected', 'connecting', 'connected', 'error'],
    default: 'disconnected'
  },
  wsLastError: { type: String, default: null },
  
  // Callback URL for OAuth
  redirectUrl: { type: String, default: process.env.ZERODHA_REDIRECT_URL || (process.env.NODE_ENV === 'production' ? 'https://api.dhanfunded.com/api/zerodha/callback' : 'http://localhost:3001/api/zerodha/callback') }
}, { timestamps: true });

// In-memory cache — the trade engines read this singleton 3-4× per order
// (instrument lookup, enrichment, fallback). On production Atlas each hit is
// ~100-200ms, so a single trade spent 300-800ms just re-fetching the same
// document. A 3-second TTL gives near-instant reads while still picking up
// admin changes within 3s. Cache is invalidated immediately on save.
let _cache = null;
let _cachedAt = 0;
const TTL_MS = 3000;

zerodhaSettingsSchema.statics.getSettings = async function() {
  const now = Date.now();
  if (_cache && (now - _cachedAt) < TTL_MS) {
    return _cache;
  }
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({ apiKey: '', apiSecret: '' });
  }
  _cache = settings;
  _cachedAt = now;
  return settings;
};

zerodhaSettingsSchema.statics.invalidateCache = function() {
  _cache = null;
  _cachedAt = 0;
};

// Any save/update invalidates the cache so callers see changes immediately
// (critical when admin subscribes a new instrument or updates segments).
zerodhaSettingsSchema.post('save', function() { _cache = null; _cachedAt = 0; });
zerodhaSettingsSchema.post('findOneAndUpdate', function() { _cache = null; _cachedAt = 0; });
zerodhaSettingsSchema.post('updateOne', function() { _cache = null; _cachedAt = 0; });

module.exports = mongoose.model('ZerodhaSettings', zerodhaSettingsSchema);
