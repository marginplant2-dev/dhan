const mongoose = require('mongoose');

// Admin-managed blog post. Rendered on /blog (list) and /blog/:slug (detail).
// `body` is plain text; paragraphs are separated by a blank line and the public
// page splits on that. Replaces the formerly hardcoded posts array.
const blogPostSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true },
    excerpt: { type: String, default: '' },
    body: { type: String, default: '' }, // paragraphs separated by blank lines
    category: { type: String, default: 'General', trim: true },
    readTime: { type: String, default: '5 min read' },
    date: { type: String, default: '' }, // human-friendly display date, e.g. "June 6, 2026"
    order: { type: Number, default: 0 }, // lower = shown first
    featured: { type: Boolean, default: false }, // first card spans full width on list
    enabled: { type: Boolean, default: true }
  },
  { timestamps: true }
);

blogPostSchema.index({ enabled: 1, order: 1 });

module.exports = mongoose.model('BlogPost', blogPostSchema);
