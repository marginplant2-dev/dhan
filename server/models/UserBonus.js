'use strict';

const mongoose = require('mongoose');

/**
 * UserBonus — Fix 21.
 *
 * One row per "bonus granted to a user". Created when admin grants a bonus
 * (Phase 1: manual via Add/Deduct tab; Phase 2: auto-triggered by deposit).
 *
 * The amount field is the INR amount the user was actually credited (after
 * percentage calc + maxBonus cap, if any). When this row is created the
 * server also bumps `user.wallet.credit` by `amount / liveUsdInrRate` so the
 * trading-account credit reflects the bonus.
 *
 * Cancelling a bonus (status='cancelled') subtracts the same amount back
 * from `user.wallet.credit` (clamped to 0 — defensive against admin
 * partially using their credit before cancel).
 */
const userBonusSchema = new mongoose.Schema({
  // Who got the bonus
  userId: { type: String, required: true, index: true },        // User.oderId

  // Which template this came from (null for fully-custom manual grants)
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'BonusTemplate', default: null },
  templateName: { type: String, default: '' },                  // snapshot for display

  // Snapshot of the template type at grant time
  type: {
    type: String,
    enum: ['first_deposit', 'regular_deposit', 'reload', 'special'],
    default: 'special'
  },

  // The actual ₹ amount credited
  amount: { type: Number, required: true, min: 0 },

  // The deposit that triggered this bonus (₹), if applicable. 0 for special/manual.
  depositAmount: { type: Number, default: 0, min: 0 },

  // Snapshot of wager requirement at grant time (Phase 3 tracks progress)
  wagerRequirement: { type: Number, default: 0 },
  wagerProgress: { type: Number, default: 0 },                  // running INR notional volume traded

  // Lifecycle
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'expired', 'cancelled'],
    default: 'active'
  },
  grantedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },

  // Admin notes / reason / cancel reason
  notes: { type: String, default: '' },

  // Audit
  grantedBy: { type: String, default: null },                   // admin oderId
  cancelledBy: { type: String, default: null }                  // admin oderId
}, { timestamps: true });

// `timestamps: true` auto-maintains createdAt and updatedAt — see
// BonusTemplate.js for the same fix. Mongoose 9.x dropped support for the
// legacy callback-based pre hook, which threw "next is not a function".

userBonusSchema.index({ userId: 1, status: 1 });
userBonusSchema.index({ templateId: 1 });

module.exports = mongoose.model('UserBonus', userBonusSchema);
