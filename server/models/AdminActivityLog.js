const mongoose = require('mongoose');

const adminActivityLogSchema = new mongoose.Schema({
  adminId: {
    type: String,
    required: true,
    index: true
  },
  oderId: {
    type: String,
    required: true,
    index: true
  },
  
  // Admin Role
  role: {
    type: String,
    enum: ['super_admin', 'sub_admin', 'broker', 'bank_user', 'admin'],
    required: true,
    index: true
  },

  // Activity Type
  activityType: {
    type: String,
    enum: [
      'login', 'logout', 'register',
      'user_created', 'user_updated', 'user_blocked', 'user_unblocked',
      'trade_placed', 'trade_closed', 'trade_modified',
      'deposit_approved', 'deposit_rejected',
      'withdrawal_approved', 'withdrawal_rejected',
      'wallet_credit', 'wallet_debit',
      'fund_request', 'fund_approved', 'fund_rejected',
      'password_change', 'profile_update', 'settings_change',
      'kyc_approved', 'kyc_rejected',
      'failed_login',
      'impersonate_user', 'impersonate_admin', 'user_assigned',
      // Phase 6 — scoped setting overrides
      'scoped_segment_write', 'scoped_segment_clear',
      'scoped_reorder_write',  'scoped_reorder_clear',
      'scoped_risk_write',     'scoped_risk_clear'
    ],
    required: true,
    index: true
  },
  
  // Activity Details
  description: {
    type: String,
    required: true
  },
  
  // Additional Data (JSON for flexible storage)
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Request Info
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  device: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet', 'unknown'],
    default: 'unknown'
  },
  
  // OS Info
  os: {
    type: String,
    default: 'Unknown'
  },
  
  // Browser Info
  browser: {
    type: String,
    default: 'Unknown'
  },
  
  // Status
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'success'
  },
  
  // Session Duration (in seconds) - for logout events
  sessionDuration: {
    type: Number,
    default: null
  },
  
  // Login session ID - to link login/logout events
  sessionId: {
    type: String,
    default: null
  },
  
  // Timestamp
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
adminActivityLogSchema.index({ adminId: 1, timestamp: -1 });
adminActivityLogSchema.index({ oderId: 1, timestamp: -1 });
adminActivityLogSchema.index({ role: 1, timestamp: -1 });
adminActivityLogSchema.index({ activityType: 1, timestamp: -1 });
adminActivityLogSchema.index({ timestamp: -1 });

// Static method to log activity
adminActivityLogSchema.statics.logActivity = async function(data) {
  try {
    const log = new this(data);
    await log.save();
    return log;
  } catch (error) {
    console.error('Error logging admin activity:', error);
    return null;
  }
};

module.exports = mongoose.model('AdminActivityLog', adminActivityLogSchema);
