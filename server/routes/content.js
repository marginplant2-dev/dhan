// Admin-managed FAQ + Blog content.
//   - publicRouter  → mounted at /api      (GET /faqs, /blog, /blog/:slug)
//   - adminRouter   → mounted at /api/admin/content (full CRUD, admin token)
// Replaces the formerly hardcoded arrays on the public /faqs and /blog pages.
const express = require('express');
const Faq = require('../models/Faq');
const BlogPost = require('../models/BlogPost');
const { resolveAdminFromRequest } = require('../middleware/adminPermission');

// ── Admin auth (mirrors propTrading.verifyAdminToken) ───────────────────
async function verifyAdminToken(req, res, next) {
  try {
    const admin = await resolveAdminFromRequest(req);
    if (!admin) return res.status(401).json({ success: false, message: 'Unauthorized' });
    req.admin = admin;
    next();
  } catch (_) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
}

const slugify = (s) => String(s || '')
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120);

/* ─────────────────────────── PUBLIC ─────────────────────────── */
const publicRouter = express.Router();

// GET /api/faqs — enabled FAQs (flat, sorted). Client groups by category.
publicRouter.get('/faqs', async (req, res) => {
  try {
    const faqs = await Faq.find({ enabled: true })
      .select('question answer category order')
      .sort({ order: 1, createdAt: 1 })
      .lean();
    res.json({ success: true, faqs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message, faqs: [] });
  }
});

// GET /api/blog — enabled posts (list view: no full body).
publicRouter.get('/blog', async (req, res) => {
  try {
    const posts = await BlogPost.find({ enabled: true })
      .select('slug title excerpt category readTime date featured order')
      .sort({ order: 1, createdAt: -1 })
      .lean();
    res.json({ success: true, posts });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message, posts: [] });
  }
});

// GET /api/blog/:slug — single enabled post (with body).
publicRouter.get('/blog/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ slug: String(req.params.slug).toLowerCase(), enabled: true }).lean();
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    res.json({ success: true, post });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ─────────────────────────── ADMIN ─────────────────────────── */
const adminRouter = express.Router();
adminRouter.use(verifyAdminToken);

// ---- FAQ CRUD ----
adminRouter.get('/faqs', async (req, res) => {
  try {
    const faqs = await Faq.find({}).sort({ category: 1, order: 1, createdAt: 1 }).lean();
    res.json({ success: true, faqs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.post('/faqs', async (req, res) => {
  try {
    const { question, answer, category, order, enabled } = req.body || {};
    if (!question || !answer) return res.status(400).json({ success: false, error: 'question and answer are required' });
    const faq = await Faq.create({
      question, answer,
      category: category || 'General',
      order: Number.isFinite(Number(order)) ? Number(order) : 0,
      enabled: enabled !== false
    });
    res.status(201).json({ success: true, faq });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.put('/faqs/:id', async (req, res) => {
  try {
    const { question, answer, category, order, enabled } = req.body || {};
    const update = {};
    if (question !== undefined) update.question = question;
    if (answer !== undefined) update.answer = answer;
    if (category !== undefined) update.category = category;
    if (order !== undefined) update.order = Number(order) || 0;
    if (enabled !== undefined) update.enabled = !!enabled;
    const faq = await Faq.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!faq) return res.status(404).json({ success: false, error: 'FAQ not found' });
    res.json({ success: true, faq });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.delete('/faqs/:id', async (req, res) => {
  try {
    const faq = await Faq.findByIdAndDelete(req.params.id);
    if (!faq) return res.status(404).json({ success: false, error: 'FAQ not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---- Blog CRUD ----
adminRouter.get('/blog', async (req, res) => {
  try {
    const posts = await BlogPost.find({}).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, posts });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.post('/blog', async (req, res) => {
  try {
    const { title, excerpt, body, category, readTime, date, order, featured, enabled } = req.body || {};
    if (!title) return res.status(400).json({ success: false, error: 'title is required' });
    let slug = slugify(req.body.slug || title);
    if (!slug) return res.status(400).json({ success: false, error: 'could not derive a slug from the title' });
    // Ensure unique slug
    if (await BlogPost.findOne({ slug })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const post = await BlogPost.create({
      slug, title,
      excerpt: excerpt || '',
      body: body || '',
      category: category || 'General',
      readTime: readTime || '5 min read',
      date: date || '',
      order: Number.isFinite(Number(order)) ? Number(order) : 0,
      featured: !!featured,
      enabled: enabled !== false
    });
    res.status(201).json({ success: true, post });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.put('/blog/:id', async (req, res) => {
  try {
    const { title, excerpt, body, category, readTime, date, order, featured, enabled, slug } = req.body || {};
    const update = {};
    if (title !== undefined) update.title = title;
    if (excerpt !== undefined) update.excerpt = excerpt;
    if (body !== undefined) update.body = body;
    if (category !== undefined) update.category = category;
    if (readTime !== undefined) update.readTime = readTime;
    if (date !== undefined) update.date = date;
    if (order !== undefined) update.order = Number(order) || 0;
    if (featured !== undefined) update.featured = !!featured;
    if (enabled !== undefined) update.enabled = !!enabled;
    if (slug !== undefined) {
      const s = slugify(slug);
      if (s) {
        const clash = await BlogPost.findOne({ slug: s, _id: { $ne: req.params.id } });
        update.slug = clash ? `${s}-${Date.now().toString(36).slice(-4)}` : s;
      }
    }
    const post = await BlogPost.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    res.json({ success: true, post });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

adminRouter.delete('/blog/:id', async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = { publicRouter, adminRouter };
