const mongoose = require('mongoose');

/**
 * Purchase Intent / Lead — logged when a user taps "Pay via UPI" on a challenge
 * plan (i.e. shows buying intent) even if they never complete the payment. The
 * admin dashboard surfaces these so the team can call and follow up with people
 * who started a purchase but dropped off.
 *
 * One row per (user, challenge, tier); repeat taps just bump clickCount and
 * lastClickedAt so the list stays clean.
 */
const purchaseIntentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  oderId: { type: String, index: true },
  userName: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },

  challengeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Challenge', default: null },
  challengeName: { type: String, default: '' },
  tierIndex: { type: Number, default: 0 },
  accountType: { type: String, default: '' },   // e.g. '2-Step', '1-Step', 'Instant'
  fundSize: { type: Number, default: 0 },
  fee: { type: Number, default: 0 },

  clickCount: { type: Number, default: 1 },
  // 'intent' = tapped Pay but no buy-request yet; 'purchased' = completed a buy.
  status: { type: String, enum: ['intent', 'purchased'], default: 'intent' },
  purchasedAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
  lastClickedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// One lead row per user + plan + tier — repeat taps update it, not duplicate.
purchaseIntentSchema.index({ oderId: 1, challengeId: 1, tierIndex: 1 });
purchaseIntentSchema.index({ lastClickedAt: -1 });

module.exports = mongoose.model('PurchaseIntent', purchaseIntentSchema);
