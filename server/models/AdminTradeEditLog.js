const mongoose = require('mongoose');

const adminTradeEditLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
    index: true
  },
  adminName: {
    type: String,
    required: true
  },
  adminRole: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  userName: {
    type: String,
    required: true
  },
  tradeId: {
    type: String,
    required: true,
    index: true
  },
  action: {
    type: String,
    enum: ['EDIT_SL_TP', 'FORCE_CLOSE', 'CANCEL_PENDING', 'EDIT_PRICE_VOLUME', 'REOPEN', 'DELETE_TRADE'],
    required: true
  },
  remark: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: -1
  }
}, { timestamps: true });

// Useful compound index for admin fetching
adminTradeEditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('AdminTradeEditLog', adminTradeEditLogSchema);
