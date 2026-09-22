const mongoose = require('mongoose');

// Trade History Schema - All executed trades
const tradeSchema = new mongoose.Schema({
  tradeId: { type: String, required: true, unique: true },
  oderId: { type: String, index: true }, // Reference to position
  userId: { type: String, required: true, index: true },
  mode: { type: String, enum: ['hedging', 'netting', 'binary'], required: true },
  symbol: { type: String, required: true },
  side: { type: String, enum: ['buy', 'sell', 'up', 'down'], required: true },
  
  // Volume/Quantity
  volume: { type: Number, default: null }, // For hedging (lots)
  quantity: { type: Number, default: null }, // For netting (units)
  amount: { type: Number, default: null }, // For binary ($)
  
  // Prices
  entryPrice: { type: Number, required: true },
  closePrice: { type: Number, default: null },
  originalPrice: { type: Number, default: null }, // Original price before reorder delay
  
  // Reorder (delayed execution)
  reorderDelay: { type: Number, default: 0 }, // Delay in seconds applied
  
  // SL/TP
  stopLoss: { type: Number, default: null },
  takeProfit: { type: Number, default: null },
  
  // Trade details
  leverage: { type: Number, default: null },
  session: { type: String, default: null }, // For netting: intraday/carryforward
  lotSize: { type: Number, default: 1 }, // Exchange lot size for F&O
  exchange: { type: String, default: null }, // NSE, NFO, MCX, BFO
  segment: { type: String, default: null }, // NSE, NFO-FUT, NFO-OPT, etc.
  expiry: { type: Number, default: null }, // For binary
  
  // Type of trade action
  // 'consumed' = a netting leg whose volume was eaten by an opposite-side
  // aggregate close (FIFO). The leg's volume goes to 0 and it's removed from
  // the Active Trades view; realized PnL is booked at the aggregate level
  // against parent.avgPrice (NOT this leg's entry), so the leg's own `profit`
  // field stays 0. See Phase 1.5 in docs/plans.
  type: {
    type: String,
    enum: ['open', 'close', 'partial_close', 'consumed', 'modify', 'binary', 'cancelled'],
    required: true
  },
  
  // Results
  profit: { type: Number, default: 0 },
  commission: { type: Number, default: 0 },
  commissionInr: { type: Number, default: 0 }, // Original INR amount for display
  charges: { type: Number, default: 0 },
  swap: { type: Number, default: 0 },
  result: { type: String, default: null }, // For binary: win/lose/tie
  
  // Who closed the trade
  // 'aggregate_close' = the leg was FIFO-consumed by an opposite-side trade
  // that reduced the parent netting position. Distinct from 'system' (which
  // implies an automated risk action) so the History tab can render it
  // differently.
  closedBy: { type: String, enum: ['user', 'admin', 'system', 'sl', 'tp', 'stop_out', 'aggregate_close', null], default: null },

  // History grouping (Fix 18). When a single close action produces multiple
  // Trade docs (e.g., a full close that FIFO-consumes 3 legs, OR a position-
  // level SL that fires N per-fill closes), all the resulting docs share a
  // groupId. Exactly ONE doc per group is marked `isHistoryParent: true` —
  // that's the row shown in the flat History list. The others are children,
  // fetched on demand via GET /api/trades/group/:userId/:groupId when the
  // user expands the parent row.
  // Atomic closes (user clicks ✕ on one leg, per-fill SL/TP, single-leg
  // partial close) leave both fields null/false → the row appears as a
  // standalone entry in the flat list, no expand affordance.
  groupId: { type: String, default: null, index: true },
  isHistoryParent: { type: Boolean, default: false },
  remark: { type: String, default: null }, // Close reason label: 'User', 'Admin', 'SL', 'TP', 'Stop Out', 'Auto Square-Off', 'Expiry'
  
  // Timestamps
  executedAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null }
}, { timestamps: true });

// Indexes for efficient queries
tradeSchema.index({ userId: 1, executedAt: -1 });
tradeSchema.index({ userId: 1, mode: 1 });
tradeSchema.index({ symbol: 1, executedAt: -1 });

const Trade = mongoose.model('Trade', tradeSchema);

module.exports = Trade;
