const mongoose = require('mongoose');

const adminPaymentDetailSchema = new mongoose.Schema({
  // Admin who owns this payment detail (null = SuperAdmin/global)
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  
  type: {
    type: String,
    enum: ['bank', 'upi', 'crypto'],
    required: true
  },
  
  // Bank Details
  bankName: { type: String },
  accountNumber: { type: String },
  ifsc: { type: String },
  accountHolder: { type: String },
  
  // UPI Details
  upiId: { type: String },
  name: { type: String },
  qrImage: { type: String },
  
  // Crypto Details
  network: { type: String },
  address: { type: String },
  
  isActive: { type: Boolean, default: true },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('AdminPaymentDetail', adminPaymentDetailSchema);
