const mongoose = require('mongoose');

/**
 * DemoSettings — single admin-managed config doc that controls the
 * platform-wide "Try Demo" account every user can spin up from their
 * home page. Always exactly one document; the service uses an upsert
 * to load/create it.
 *
 * Demo accounts:
 *   - accountType='DEMO' on ChallengeAccount
 *   - skip every funded/challenge gate (no DD breach, no expiry,
 *     no profit-target promotion, no funded-spawn)
 *   - user can reset balance any time (cooldown configurable below)
 */
const demoSettingsSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },           // master kill-switch
  fundSize: { type: Number, default: 200000 },         // ₹2,00,000 default
  leverage: { type: Number, default: 100 },            // 1:100 default
  resetCooldownHours: { type: Number, default: 24 },   // reset balance once per N hours
  allowedSegments: [{ type: String }],                 // optional restriction; empty = any
  notes: { type: String, default: '' }                  // admin-facing notes shown on UI

  // No createdBy/updatedBy needed — admin auth is enforced at the route layer.
}, { timestamps: true });

demoSettingsSchema.statics.getSettings = async function () {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

module.exports = mongoose.model('DemoSettings', demoSettingsSchema);
