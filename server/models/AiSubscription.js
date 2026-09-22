const mongoose = require('mongoose');

/**
 * A user's AI Options access, created only when an admin approves the payment
 * transaction. Access is decided by `expiresAt`, never by a boolean flag, so a
 * subscription cannot be left switched on after it has run out.
 */
const aiSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  oderId: { type: String, default: '' },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiOptionsPlan' },
  planName: { type: String, default: '' },
  amount: { type: Number, default: 0 },
  days: { type: Number, default: 0 },
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  // Set when an admin revokes access early; expiry alone ends it otherwise.
  cancelledAt: { type: Date, default: null },
}, { timestamps: true });

aiSubscriptionSchema.index({ userId: 1, expiresAt: -1 });

/** The live subscription for a user, or null. Expiry is the only gate. */
aiSubscriptionSchema.statics.activeFor = function (userId) {
  return this.findOne({
    userId,
    cancelledAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ expiresAt: -1 }).lean();
};

module.exports = mongoose.model('AiSubscription', aiSubscriptionSchema);
