const mongoose = require('mongoose');

// Hedging Position Schema - Multiple positions per symbol
const hedgingPositionSchema = new mongoose.Schema({
  oderId: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  symbol: { type: String, required: true },
  side: { type: String, enum: ['buy', 'sell'], required: true },
  volume: { type: Number, required: true },
  entryPrice: { type: Number, required: true },
  currentPrice: { type: Number, default: 0 },
  stopLoss: { type: Number, default: null },
  takeProfit: { type: Number, default: null },
  leverage: { type: Number, default: 100 },
  marginUsed: { type: Number, default: 0 },
  swap: { type: Number, default: 0 },
  commission: { type: Number, default: 0 },
  openCommission: { type: Number, default: 0 },
  closeCommission: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  orderType: { type: String, enum: ['market', 'limit', 'stop'], default: 'market' },
  status: { type: String, enum: ['open', 'closed', 'pending', 'cancelled'], default: 'open' },
  openTime: { type: Date, default: Date.now },
  closeTime: { type: Date, default: null },
  closePrice: { type: Number, default: null },
  metaApiPositionId: { type: String, default: null }, // For MetaAPI integration
  // Added fields to avoid DB lookups during high-frequency PnL calculation
  exchange: { type: String, default: null },
  segment: { type: String, default: null },
  contractSize: { type: Number, default: 100000 },
  digits: { type: Number, default: 5 },
  pipSize: { type: Number, default: 0.0001 },
  pipValue: { type: Number, default: 10 },
  isJPYPair: { type: Boolean, default: false },
  // Pending order fields (MT5-style limit/stop orders)
  triggerPrice: { type: Number, default: null }, // Price at which pending order triggers
  pendingOrderType: { type: String, enum: ['limit', 'stop', null], default: null },
  activatedAt: { type: Date, default: null } // When pending order was activated
}, { timestamps: true });

// Netting Position Schema - One position per symbol (uses volume/lots like Hedging)
const nettingPositionSchema = new mongoose.Schema({
  oderId: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  symbol: { type: String, required: true },
  side: { type: String, enum: ['buy', 'sell'], required: true },
  volume: { type: Number, required: true }, // Lots for F&O, quantity for EQ
  quantity: { type: Number, default: null }, // Actual quantity (lots × lotSize)
  lotSize: { type: Number, default: 1 }, // Exchange lot size (1 for EQ, varies for F&O)
  avgPrice: { type: Number, required: true },
  currentPrice: { type: Number, default: 0 },
  stopLoss: { type: Number, default: null },
  takeProfit: { type: Number, default: null },
  leverage: { type: Number, default: 100 }, // Leverage for margin calculation
  session: { type: String, enum: ['intraday', 'carryforward'], default: 'intraday' },
  exchange: { type: String, default: 'NSE' }, // NSE, NFO, MCX, BFO
  segment: { type: String, default: '' }, // NSE, NFO-FUT, NFO-OPT, MCX-FUT, etc.
  marginUsed: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  swap: { type: Number, default: 0 },
  status: { type: String, enum: ['open', 'closed', 'pending', 'cancelled'], default: 'open' },
  openTime: { type: Date, default: Date.now },
  closeTime: { type: Date, default: null },
  closePrice: { type: Number, default: null },
  openCommission: { type: Number, default: 0 },
  closeCommission: { type: Number, default: 0 },
  commission: { type: Number, default: 0 },
  openCommissionInr: { type: Number, default: 0 }, // Original INR amount (avoids rate fluctuation)
  closeCommissionInr: { type: Number, default: 0 },
  commissionInr: { type: Number, default: 0 }, // Total round-trip INR
  // F&O option contract metadata (for automatic expiry settlement)
  instrumentExpiry: { type: Date, default: null },
  optionStrike: { type: Number, default: null },
  optionType: { type: String, default: null }, // CE | PE
  underlyingQuoteSymbol: { type: String, default: null }, // subscribed symbol used for underlying LTP at settlement
  // Pending order fields (MT5-style limit/stop orders)
  orderType: { type: String, enum: ['market', 'limit', 'stop'], default: 'market' },
  triggerPrice: { type: Number, default: null },
  pendingOrderType: { type: String, enum: ['limit', 'stop', null], default: null },
  activatedAt: { type: Date, default: null }
}, { timestamps: true });

// Compound index for netting - one position per user per symbol
nettingPositionSchema.index({ userId: 1, symbol: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });

// Performance indexes for 3000+ users
hedgingPositionSchema.index({ userId: 1, status: 1 });
hedgingPositionSchema.index({ userId: 1, symbol: 1, status: 1 });
hedgingPositionSchema.index({ status: 1, openTime: -1 });

nettingPositionSchema.index({ userId: 1, status: 1 });
nettingPositionSchema.index({ status: 1, openTime: -1 });
nettingPositionSchema.index({ status: 1, instrumentExpiry: 1 });

// Binary Trade Schema - Time-based UP/DOWN
const binaryTradeSchema = new mongoose.Schema({
  tradeId: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  symbol: { type: String, required: true },
  direction: { type: String, enum: ['up', 'down'], required: true },
  amount: { type: Number, required: true },
  entryPrice: { type: Number, required: true },
  exitPrice: { type: Number, default: null },
  expiry: { type: Number, required: true }, // seconds
  expiryTime: { type: Date, required: true },
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  result: { type: String, enum: ['win', 'lose', 'tie', null], default: null },
  payout: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null }
}, { timestamps: true });

// Performance indexes for binary trades
binaryTradeSchema.index({ userId: 1, status: 1 });
binaryTradeSchema.index({ tradeId: 1, userId: 1 });
binaryTradeSchema.index({ status: 1, expiryTime: 1 });

const HedgingPosition = mongoose.model('HedgingPosition', hedgingPositionSchema);
const NettingPosition = mongoose.model('NettingPosition', nettingPositionSchema);
const BinaryTrade = mongoose.model('BinaryTrade', binaryTradeSchema);

module.exports = { HedgingPosition, NettingPosition, BinaryTrade };
