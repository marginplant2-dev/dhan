const mongoose = require('mongoose');

/**
 * Wallet Schema
 * Multi-wallet system: main, trading, IB
 */
const walletSchema = new mongoose.Schema({
  // Owner
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  oderId: { type: String, required: true },
  
  // Wallet Type
  type: { 
    type: String, 
    enum: ['main', 'trading', 'ib'],
    required: true 
  },
  
  // Balance
  balance: { type: Number, default: 0 },
  
  // Totals
  totalDeposited: { type: Number, default: 0 },
  totalWithdrawn: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 }, // For IB wallets
  
  // Pending
  pendingDeposit: { type: Number, default: 0 },
  pendingWithdrawal: { type: Number, default: 0 },
  
  // Frozen (held for pending operations)
  frozenBalance: { type: Number, default: 0 },
  
  // Currency
  currency: { type: String, default: 'INR' },
  
  // Status
  isActive: { type: Boolean, default: true },
  
  // Last activity
  lastTransactionAt: { type: Date, default: null }
}, { timestamps: true });

// Compound unique index
walletSchema.index({ userId: 1, type: 1 }, { unique: true });
walletSchema.index({ oderId: 1, type: 1 });

// Get available balance (excluding frozen)
walletSchema.methods.getAvailableBalance = function() {
  return Math.max(0, this.balance - this.frozenBalance);
};

// Credit funds
walletSchema.methods.credit = async function(amount, description, session = null) {
  if (amount <= 0) throw new Error('Amount must be positive');
  
  this.balance += amount;
  this.totalEarned += amount;
  this.lastTransactionAt = new Date();
  
  const saveOptions = session ? { session } : {};
  await this.save(saveOptions);
  
  // Create transaction record
  const WalletTransaction = mongoose.model('WalletTransaction');
  await WalletTransaction.create([{
    walletId: this._id,
    userId: this.userId,
    oderId: this.oderId,
    walletType: this.type,
    type: 'credit',
    amount,
    balanceAfter: this.balance,
    description,
    status: 'completed'
  }], { session });
  
  return this;
};

// Debit funds
walletSchema.methods.debit = async function(amount, description, session = null) {
  if (amount <= 0) throw new Error('Amount must be positive');
  if (this.getAvailableBalance() < amount) {
    throw new Error('Insufficient balance');
  }
  
  this.balance -= amount;
  this.lastTransactionAt = new Date();
  
  const saveOptions = session ? { session } : {};
  await this.save(saveOptions);
  
  // Create transaction record
  const WalletTransaction = mongoose.model('WalletTransaction');
  await WalletTransaction.create([{
    walletId: this._id,
    userId: this.userId,
    oderId: this.oderId,
    walletType: this.type,
    type: 'debit',
    amount,
    balanceAfter: this.balance,
    description,
    status: 'completed'
  }], { session });
  
  return this;
};

// Freeze funds
walletSchema.methods.freeze = async function(amount) {
  if (this.getAvailableBalance() < amount) {
    throw new Error('Insufficient available balance to freeze');
  }
  this.frozenBalance += amount;
  await this.save();
  return this;
};

// Unfreeze funds
walletSchema.methods.unfreeze = async function(amount) {
  this.frozenBalance = Math.max(0, this.frozenBalance - amount);
  await this.save();
  return this;
};

// Static: Get or create wallet
walletSchema.statics.getOrCreate = async function(userId, oderId, type) {
  let wallet = await this.findOne({ userId, type });
  
  if (!wallet) {
    wallet = await this.create({ userId, oderId, type });
  }
  
  return wallet;
};

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;
