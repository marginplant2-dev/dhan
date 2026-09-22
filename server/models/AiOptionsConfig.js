const mongoose = require('mongoose');

/**
 * Singleton holding the Gemini credential for AI Options, the same way
 * ZerodhaSettings holds the broker credential.
 *
 * The key is never sent back to any client — the admin screen only ever sees
 * the masked form and the last verification result.
 */
const aiOptionsConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  geminiApiKey: { type: String, default: '' },
  geminiModel: { type: String, default: 'gemini-flash-latest' },
  // Result of the last live call, so the admin screen can show green or why not.
  lastVerifiedAt: { type: Date, default: null },
  lastError: { type: String, default: '' },
}, { timestamps: true });

aiOptionsConfigSchema.statics.getSingleton = async function () {
  return (await this.findOne({ key: 'global' })) || this.create({ key: 'global' });
};

/** Masked for display: enough to recognise the key, not enough to use it. */
aiOptionsConfigSchema.statics.mask = function (key) {
  const k = String(key || '');
  if (k.length < 12) return k ? '••••' : '';
  return `${k.slice(0, 6)}${'•'.repeat(8)}${k.slice(-4)}`;
};

module.exports = mongoose.model('AiOptionsConfig', aiOptionsConfigSchema);
