const mongoose = require('mongoose');

/**
 * ChallengePosition — positions opened on a prop-trading challenge account's
 * isolated virtual sub-wallet. Deliberately separate from NettingPosition /
 * HedgingPosition so that main-wallet trading and challenge trading never
 * share state, and drawdown / profit-target math on a challenge account
 * can be computed in isolation.
 */
const challengePositionSchema = new mongoose.Schema({
  // Scoping
  challengeAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChallengeAccount', required: true, index: true },
  userId: { type: String, required: true, index: true },

  // Trade identity
  positionId: { type: String, required: true, unique: true },
  symbol: { type: String, required: true },
  side: { type: String, enum: ['buy', 'sell'], required: true },

  // Sizing
  volume: { type: Number, required: true },
  quantity: { type: Number, default: null },
  lotSize: { type: Number, default: 1 },

  // Prices
  entryPrice: { type: Number, required: true },
  currentPrice: { type: Number, default: 0 },
  closePrice: { type: Number, default: null },
  stopLoss: { type: Number, default: null },
  takeProfit: { type: Number, default: null },
  // Pending (limit/stop) order trigger — the price the market must reach
  // before the order fills. Only set while status === 'pending'.
  triggerPrice: { type: Number, default: null },
  pendingOrderType: { type: String, enum: ['limit', 'stop', null], default: null },

  // Margin / leverage
  leverage: { type: Number, default: 100 },
  marginUsed: { type: Number, default: 0 },

  // Economics
  profit: { type: Number, default: 0 },
  swap: { type: Number, default: 0 },
  commission: { type: Number, default: 0 },
  openCommission: { type: Number, default: 0 },
  closeCommission: { type: Number, default: 0 },
  commissionInr: { type: Number, default: 0 },
  openCommissionInr: { type: Number, default: 0 },
  closeCommissionInr: { type: Number, default: 0 },

  // Meta
  exchange: { type: String, default: 'NSE' },
  segment: { type: String, default: '' },
  session: { type: String, enum: ['intraday', 'carryforward'], default: 'intraday' },
  orderType: { type: String, enum: ['market', 'limit', 'stop'], default: 'market' },

  // Lifecycle
  // pending → a placed limit/stop order awaiting its trigger price
  // open    → an active position (market order, or an activated pending order)
  // closed  → realised
  // cancelled → a pending order cancelled by the user before it triggered
  status: { type: String, enum: ['pending', 'open', 'closed', 'cancelled'], default: 'open', index: true },
  openTime: { type: Date, default: Date.now },
  activatedAt: { type: Date, default: null }, // when a pending order became open
  closeTime: { type: Date, default: null },
  closedBy: { type: String, default: 'user' }, // user | sl | tp | stop_out | auto_square_off | admin
  remark: { type: String, default: '' }
}, { timestamps: true });

challengePositionSchema.index({ challengeAccountId: 1, status: 1 });
challengePositionSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('ChallengePosition', challengePositionSchema);
