const mongoose = require('mongoose');

const kycSchema = new mongoose.Schema({
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
  
  // Document Type
  documentType: {
    type: String,
    enum: ['aadhaar', 'pan', 'passport', 'driving_license', 'voter_id'],
    required: true
  },
  
  // Document Details
  documentNumber: {
    type: String,
    required: true
  },
  
  // Document Images (base64 or file paths)
  frontImage: {
    type: String,
    required: true
  },
  backImage: {
    type: String
  },
  selfieImage: {
    type: String
  },
  
  // Personal Details
  fullName: {
    type: String,
    required: true
  },
  dateOfBirth: {
    type: Date
  },
  address: {
    type: String
  },
  
  // Verification Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'resubmit'],
    default: 'pending',
    index: true
  },
  
  // Admin Review
  reviewedBy: {
    type: String
  },
  reviewedAt: {
    type: Date
  },
  rejectionReason: {
    type: String
  },
  adminNotes: {
    type: String
  },
  
  // Timestamps
  submittedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
kycSchema.index({ status: 1, submittedAt: -1 });
kycSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('KYC', kycSchema);
