const mongoose = require('mongoose');

/**
 * Fund Request Model
 * Fund requests from Admin/Broker to their parent
 */
const fundRequestSchema = new mongoose.Schema({
  // Requester
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fromOderId: { type: String, required: true },
  fromRole: { type: String, enum: ['admin', 'broker'], required: true },
  
  // Parent (who should approve)
  toParentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toParentOderId: { type: String, required: true },
  toParentRole: { type: String, enum: ['superadmin', 'admin'], required: true },
  
  // Request details
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['INR'], default: 'INR' },
  requestType: { type: String, enum: ['deposit'], default: 'deposit' },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  
  // When approved, money is deducted from this parent's wallet
  // (For Super Admin approval of Broker request, this would be the Admin)
  deductFromParentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  deductFromParentOderId: { type: String, default: null },
  
  // Processing details
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  processedByOderId: { type: String, default: null },
  processedByRole: { type: String, enum: ['superadmin', 'admin', null], default: null },
  processedAt: { type: Date, default: null },
  
  // Reason (for rejection or notes)
  reason: { type: String, default: '' },
  adminNotes: { type: String, default: '' },
  
  // Wallet balances after transaction
  requesterBalanceAfter: { type: Number, default: null },
  parentBalanceAfter: { type: Number, default: null }
}, { timestamps: true });

// Indexes
fundRequestSchema.index({ fromUserId: 1, status: 1 });
fundRequestSchema.index({ toParentId: 1, status: 1 });
fundRequestSchema.index({ status: 1, createdAt: -1 });
fundRequestSchema.index({ fromOderId: 1 });
fundRequestSchema.index({ toParentOderId: 1 });

// Get pending requests for a parent
fundRequestSchema.statics.getPendingForParent = async function(parentId) {
  return this.find({ 
    toParentId: parentId, 
    status: 'pending' 
  }).sort({ createdAt: -1 });
};

// Get all pending requests (for Super Admin)
fundRequestSchema.statics.getAllPending = async function() {
  return this.find({ status: 'pending' }).sort({ createdAt: -1 });
};

const FundRequest = mongoose.model('FundRequest', fundRequestSchema);

module.exports = FundRequest;
