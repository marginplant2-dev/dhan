const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  // Method Type
  type: {
    type: String,
    enum: ['bank_transfer', 'upi', 'crypto', 'card'],
    required: true
  },
  
  // Display Name
  name: { type: String, required: true },
  
  // Is Active
  isActive: { type: Boolean, default: true },
  
  // For Deposits, Withdrawals, or Both
  allowDeposit: { type: Boolean, default: true },
  allowWithdraw: { type: Boolean, default: true },
  
  // Limits
  minAmount: { type: Number, default: 10 },
  maxAmount: { type: Number, default: 100000 },
  
  // Processing Time (in hours)
  processingTime: { type: String, default: '1-24 hours' },
  
  // Fee (percentage or fixed)
  feeType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  feeAmount: { type: Number, default: 0 },
  
  // Bank Details (for admin bank accounts)
  bankDetails: {
    bankName: { type: String },
    accountNumber: { type: String },
    ifscCode: { type: String },
    accountHolderName: { type: String },
    branchName: { type: String }
  },
  
  // UPI Details
  upiDetails: {
    upiId: { type: String },
    qrCodeImage: { type: String }
  },
  
  // Crypto Details
  cryptoDetails: {
    cryptoType: { type: String }, // BTC, ETH, USDT, etc.
    network: { type: String }, // ERC20, TRC20, BEP20
    walletAddress: { type: String },
    qrCodeImage: { type: String }
  },
  
  // Instructions for users
  instructions: { type: String, default: '' },
  
  // Display Order
  displayOrder: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);
