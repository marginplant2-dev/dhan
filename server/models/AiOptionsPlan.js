const mongoose = require('mongoose');

/**
 * A priced AI Options access plan. The admin creates these in
 * Admin → Settings → AI Options Plans; nothing about the price lives in code.
 */
const aiOptionsPlanSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },   // INR, one-time for `days`
  days: { type: Number, required: true, min: 1 },    // access length
  description: { type: String, default: '' },
  features: { type: [String], default: [] },
  // Shown with a "Popular" ribbon on the plans screen.
  popular: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

aiOptionsPlanSchema.index({ active: 1, sortOrder: 1 });

module.exports = mongoose.model('AiOptionsPlan', aiOptionsPlanSchema);
