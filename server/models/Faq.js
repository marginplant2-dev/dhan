const mongoose = require('mongoose');

// Admin-managed FAQ item. Rendered on the public /faqs page grouped by
// `category`, ordered by `order`. Replaces the formerly hardcoded list.
const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true },
    category: { type: String, required: true, trim: true, default: 'General' },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true }
  },
  { timestamps: true }
);

faqSchema.index({ category: 1, order: 1 });

module.exports = mongoose.model('Faq', faqSchema);
