const mongoose = require('mongoose');

/**
 * IB Commission Record Schema
 * Tracks all commission transactions for IBs
 */
const ibCommissionSchema = new mongoose.Schema({
  // Reference to IB
  ibId: { type: mongoose.Schema.Types.ObjectId, ref: 'IB', required: true },
  
  // Source of commission
  sourceType: {
    type: String,
    enum: ['trade', 'sub_ib', 'bonus', 'adjustment', 'withdrawal', 'challenge_purchase'],
    default: 'trade'
  },

  // Trade reference (if from trade)
  tradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade', default: null },
  positionId: { type: String, default: null },

  // Challenge purchase reference (if sourceType === 'challenge_purchase')
  challengeAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChallengeAccount', default: null },
  couponCode: { type: String, default: null, uppercase: true },
  
  // Referred user who generated this commission
  referredUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referredOderId: { type: String, default: null },
  
  // Sub-IB reference (if multi-level commission)
  subIBId: { type: mongoose.Schema.Types.ObjectId, ref: 'IB', default: null },
  levelDepth: { type: Number, default: 1 }, // 1 = direct, 2+ = sub-IB levels
  
  // Commission Details
  commissionType: {
    type: String,
    enum: ['per_lot', 'revenue_percent', 'spread_share', 'multi_level', 'challenge_purchase_percent'],
    required: true
  },
  
  // Trade details for calculation reference
  tradeDetails: {
    symbol: { type: String, default: null },
    volume: { type: Number, default: null }, // Lots
    entryPrice: { type: Number, default: null },
    closePrice: { type: Number, default: null },
    profit: { type: Number, default: null },
    spread: { type: Number, default: null },
    platformCommission: { type: Number, default: null }
  },
  
  // Commission calculation
  calculationBase: { type: Number, default: 0 }, // Base amount for calculation
  rate: { type: Number, default: 0 }, // Rate used ($ per lot, %, etc.)
  amount: { type: Number, required: true }, // Final commission amount
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'credited', 'paid', 'cancelled', 'reversed'], 
    default: 'pending' 
  },
  
  // Description
  description: { type: String, default: '' },
  
  // Processing
  processedAt: { type: Date, default: null },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  
  // Idempotency key to prevent double processing
  idempotencyKey: { type: String, unique: true, sparse: true },
  
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes (idempotencyKey already indexed via unique: true)
ibCommissionSchema.index({ ibId: 1, createdAt: -1 });
ibCommissionSchema.index({ tradeId: 1 });
ibCommissionSchema.index({ referredUserId: 1 });
ibCommissionSchema.index({ status: 1 });
ibCommissionSchema.index({ createdAt: -1 });
ibCommissionSchema.index({ challengeAccountId: 1 });

// Generate idempotency key
ibCommissionSchema.statics.generateIdempotencyKey = function(ibId, tradeId, type) {
  return `${ibId}_${tradeId}_${type}_${Date.now()}`;
};

const IBCommission = mongoose.model('IBCommission', ibCommissionSchema);

module.exports = IBCommission;
