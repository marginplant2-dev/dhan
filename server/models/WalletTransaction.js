const mongoose = require('mongoose');

/**
 * Wallet Transaction Schema
 * Tracks all wallet movements for audit trail
 */
const walletTransactionSchema = new mongoose.Schema({
  // Wallet reference
  walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  oderId: { type: String, required: true },
  walletType: { type: String, enum: ['main', 'trading', 'ib'], required: true },
  
  // Transaction type
  type: { 
    type: String, 
    enum: ['credit', 'debit', 'transfer_in', 'transfer_out', 'deposit', 'withdrawal', 'commission', 'fee', 'refund', 'adjustment'], 
    required: true 
  },
  
  // Amount
  amount: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  
  // Source/Destination for transfers
  sourceWalletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', default: null },
  destinationWalletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', default: null },
  
  // Related entities
  relatedTradeId: { type: String, default: null },
  relatedPositionId: { type: String, default: null },
  relatedIBId: { type: mongoose.Schema.Types.ObjectId, ref: 'IB', default: null },
  
  // Description
  description: { type: String, default: '' },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'cancelled', 'reversed'], 
    default: 'pending' 
  },
  
  // Admin actions
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  processedAt: { type: Date, default: null },
  
  // Idempotency
  idempotencyKey: { type: String, unique: true, sparse: true },
  
  // Metadata
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

// Indexes (idempotencyKey already indexed via unique: true)
walletTransactionSchema.index({ walletId: 1, createdAt: -1 });
walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ oderId: 1, createdAt: -1 });
walletTransactionSchema.index({ type: 1, status: 1 });
walletTransactionSchema.index({ createdAt: -1 });

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);

module.exports = WalletTransaction;
