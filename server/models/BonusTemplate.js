'use strict';

const mongoose = require('mongoose');

/**
 * BonusTemplate — Fix 21.
 *
 * Reusable bonus rule defined by admin in Bonus Management. Mirrors MT5's
 * bonus templates: admin defines a "template" once (e.g., "First Deposit
 * 100% up to ₹25,000"), then either grants it manually to a user via the
 * Add/Deduct tab or it gets auto-applied on the matching deposit trigger
 * (auto-trigger is a follow-up — Phase 1 is manual grant only).
 *
 * Granting a template creates a UserBonus instance and adds the resulting
 * INR amount to user.wallet.credit (the same field Fix 20 wired into the
 * footer + equity calculation).
 *
 * INR-only by design — matches the Fix 20 product decision that all
 * bonus-related UX and storage display happens in INR.
 */
const bonusTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },

  // Bonus event/trigger type — determines when this template applies
  // (when auto-trigger ships in Phase 2). For Phase 1 it's just a label
  // shown on the template card.
  type: {
    type: String,
    enum: ['first_deposit', 'regular_deposit', 'reload', 'special'],
    default: 'first_deposit',
    required: true
  },

  // Calculation mode — percentage of deposit OR fixed flat amount
  bonusType: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'percentage',
    required: true
  },

  // For percentage: 100 = 100% of deposit. For fixed: ₹X flat.
  bonusValue: { type: Number, required: true, min: 0 },

  // Deposit thresholds (INR)
  minDeposit: { type: Number, default: 0, min: 0 },
  maxBonus: { type: Number, default: null, min: 0 },         // optional cap on bonus amount
  maxWithdrawal: { type: Number, default: null, min: 0 },    // optional cap on related withdrawal

  // Wager: trade volume multiple required to "unlock" the bonus
  // (Phase 3 will track actual progress; Phase 1 stores it as a snapshot)
  wagerRequirement: { type: Number, default: 30, min: 0 },

  // How long the bonus stays active after grant (days)
  duration: { type: Number, default: 30, min: 1 },

  // Optional template-wide caps
  usageLimit: { type: Number, default: null, min: 0 },        // null = unlimited
  endDate: { type: Date, default: null },                     // template stops being grantable after this

  // Status / lifecycle
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },

  // Free-form description shown on the template card
  description: { type: String, default: '', trim: true },

  // Running counter — incremented every time this template is granted
  usedCount: { type: Number, default: 0 },

  // Audit
  createdBy: { type: String, default: null }                  // admin oderId who created it
}, { timestamps: true });

// `timestamps: true` auto-maintains createdAt and updatedAt — no pre-save
// hook needed. The legacy `pre('save', function(next) { ... })` callback
// API breaks in Mongoose 9.x with "next is not a function".

bonusTemplateSchema.index({ status: 1, type: 1 });

module.exports = mongoose.model('BonusTemplate', bonusTemplateSchema);
