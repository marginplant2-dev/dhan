const mongoose = require('mongoose');

const userActivityLogSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  oderId: {
    type: String,
    required: true,
    index: true
  },
  
  // Activity Type
  activityType: {
    type: String,
    enum: [
      'login', 'logout', 'register',
      'deposit_request', 'deposit_approved', 'deposit_rejected',
      'withdrawal_request', 'withdrawal_approved', 'withdrawal_rejected',
      'trade_open', 'trade_close', 'order_placed', 'order_cancelled',
      'kyc_submitted', 'kyc_approved', 'kyc_rejected',
      'password_change', 'profile_update', 'wallet_credit', 'wallet_debit',
      'session_start', 'session_end', 'failed_login'
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
  
  // Location (optional)
  location: {
    country: String,
    city: String
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
userActivityLogSchema.index({ userId: 1, timestamp: -1 });
userActivityLogSchema.index({ oderId: 1, timestamp: -1 });
userActivityLogSchema.index({ activityType: 1, timestamp: -1 });
userActivityLogSchema.index({ timestamp: -1 });

// Static method to log activity
userActivityLogSchema.statics.logActivity = async function(data) {
  try {
    const log = new this(data);
    await log.save();
    return log;
  } catch (error) {
    console.error('Error logging activity:', error);
    return null;
  }
};

module.exports = mongoose.model('UserActivityLog', userActivityLogSchema);
