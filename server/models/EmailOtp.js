const mongoose = require('mongoose');

const emailOtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    purpose: { type: String, enum: ['signup', 'password_reset'], required: true, index: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
emailOtpSchema.index({ email: 1, purpose: 1, createdAt: -1 });

module.exports = mongoose.model('EmailOtp', emailOtpSchema);
