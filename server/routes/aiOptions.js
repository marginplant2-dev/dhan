/**
 * AI Options — plans, access, analysis, and the payment queue behind it.
 *
 * The money path is deliberately the same one Challenge Resets already use: a
 * pending Transaction carrying the UPI reference and the payment screenshot,
 * which an admin approves. Approval is the only thing that grants access.
 */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AiOptionsPlan = require('../models/AiOptionsPlan');
const AiSubscription = require('../models/AiSubscription');
const AiOptionsConfig = require('../models/AiOptionsConfig');
const aiOptions = require('../services/aiOptions.service');
const { resolveAdminFromRequest } = require('../middleware/adminPermission');

const JWT_SECRET = process.env.JWT_SECRET || 'BharatFundedTrade-secret-key-2024';

async function verifyUserToken(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer') ? h.split(' ')[1] : null;
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const user = await User.findById(jwt.verify(token, JWT_SECRET).id).lean();
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

async function verifyAdminToken(req, res, next) {
  try {
    const admin = await resolveAdminFromRequest(req);
    if (!admin) return res.status(401).json({ success: false, message: 'Unauthorized' });
    req.admin = admin;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
}

const planList = () => AiOptionsPlan.find({ active: true }).sort({ sortOrder: 1, price: 1 }).lean();

// ==================== USER ====================

/** Everything the page needs on load: indices, plans, and my access state. */
router.get('/config', verifyUserToken, async (req, res) => {
  try {
    const [plans, sub] = await Promise.all([
      planList(),
      AiSubscription.activeFor(req.user._id),
    ]);
    const pending = await Transaction.findOne({
      type: 'ai_subscription', status: 'pending', oderId: req.user.oderId || String(req.user._id),
    }).select('amount createdAt').lean();

    res.json({
      success: true,
      indices: Object.entries(aiOptions.INDICES).map(([key, v]) => ({
        key, label: v.label, exchange: v.exchange,
      })),
      refreshMs: aiOptions.REFRESH_MS,
      plans,
      subscription: sub ? { planName: sub.planName, expiresAt: sub.expiresAt } : null,
      pendingRequest: pending || null,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** Expiry dropdown. Open to any signed-in user — it is just a list of dates. */
router.get('/expiries', verifyUserToken, async (req, res) => {
  try {
    res.json({ success: true, expiries: await aiOptions.getExpiries(req.query.index) });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

/** The analysis itself — subscribers only. */
router.get('/suggestions', verifyUserToken, async (req, res) => {
  try {
    const sub = await AiSubscription.activeFor(req.user._id);
    if (!sub) {
      return res.status(402).json({
        success: false, locked: true,
        message: 'An AI Options subscription is required to see the analysis.',
      });
    }
    const data = await aiOptions.getSuggestions(req.query.index, req.query.expiry);
    res.json({ success: true, ...data, subscription: { expiresAt: sub.expiresAt } });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

/** Buy a plan: records the payment for an admin to verify. Grants nothing yet. */
router.post('/subscribe', verifyUserToken, async (req, res) => {
  try {
    const { planId, adminUpiId, transactionRef, screenshotBase64, note } = req.body || {};
    if (!planId) return res.status(400).json({ success: false, message: 'planId required' });
    if (!adminUpiId) return res.status(400).json({ success: false, message: 'adminUpiId required' });
    // The screen collects a screenshot rather than a typed reference, so the
    // image is the proof this request stands on.
    if (!screenshotBase64 && !(transactionRef && String(transactionRef).trim())) {
      return res.status(400).json({ success: false, message: 'A payment screenshot is required' });
    }

    const plan = await AiOptionsPlan.findOne({ _id: planId, active: true }).lean();
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    const oderId = req.user.oderId || String(req.user._id);
    const dupe = await Transaction.findOne({ type: 'ai_subscription', status: 'pending', oderId });
    if (dupe) {
      return res.status(409).json({ success: false, message: 'You already have a subscription request awaiting approval.' });
    }

    const tx = await Transaction.create({
      oderId,
      type: 'ai_subscription',
      accountType: 'main',
      amount: plan.price,
      currency: 'INR',
      method: 'upi',
      status: 'pending',
      userName: req.user.name || '',
      userNote: note || '',
      proofImage: screenshotBase64 || '',
      paymentDetails: {
        kind: 'ai_subscription',
        upiId: adminUpiId,
        utrNumber: transactionRef ? String(transactionRef).trim() : '',
        aiPlanId: String(plan._id),
        aiPlanName: plan.name,
        aiPlanDays: plan.days,
      },
    });

    try {
      require('../services/email.service').sendAdminNotification({
        type: 'ai_subscription',
        title: `AI Options subscription from ${req.user.name || oderId}`,
        subtitle: `${plan.name} · ₹${Number(plan.price).toLocaleString('en-IN')} · awaiting approval`,
        user: { name: req.user.name, email: req.user.email, oderId },
        fields: [
          { label: 'Plan', value: `${plan.name} (${plan.days} days)` },
          { label: 'Amount', value: `₹${Number(plan.price).toLocaleString('en-IN')}` },
          { label: 'UPI ID', value: adminUpiId },
          { label: 'UTR / Ref', value: transactionRef ? String(transactionRef).trim() : 'screenshot only' },
        ],
        actionUrl: `${process.env.ADMIN_URL || 'https://admin.dhanfunded.com'}/admin/funds/ai-subscriptions`,
        actionLabel: 'Review & Approve',
      }).catch(() => {});
    } catch { /* notification is best-effort */ }

    res.status(201).json({
      success: true,
      message: 'Request submitted. Access opens as soon as the payment is verified.',
      transactionId: tx._id,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ==================== ADMIN: plans ====================

router.get('/admin/plans', verifyAdminToken, async (req, res) => {
  try {
    res.json({ success: true, plans: await AiOptionsPlan.find().sort({ sortOrder: 1, price: 1 }).lean() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/admin/plans', verifyAdminToken, async (req, res) => {
  try {
    const { name, price, days, description, features, popular, active, sortOrder } = req.body || {};
    if (!name || !(Number(price) >= 0) || !(Number(days) > 0)) {
      return res.status(400).json({ success: false, message: 'name, price and days are required' });
    }
    const plan = await AiOptionsPlan.create({
      name, price: Number(price), days: Number(days),
      description: description || '',
      features: Array.isArray(features) ? features : [],
      popular: !!popular, active: active !== false, sortOrder: Number(sortOrder) || 0,
    });
    res.status(201).json({ success: true, plan });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.put('/admin/plans/:id', verifyAdminToken, async (req, res) => {
  try {
    const set = {};
    for (const k of ['name', 'description', 'popular', 'active', 'features']) {
      if (k in (req.body || {})) set[k] = req.body[k];
    }
    for (const k of ['price', 'days', 'sortOrder']) {
      if (k in (req.body || {})) set[k] = Number(req.body[k]);
    }
    const plan = await AiOptionsPlan.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    res.json({ success: true, plan });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.delete('/admin/plans/:id', verifyAdminToken, async (req, res) => {
  try {
    await AiOptionsPlan.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ==================== ADMIN: the Gemini credential ====================

/** Status only — the key itself never leaves the server. */
router.get('/admin/gemini', verifyAdminToken, async (req, res) => {
  try {
    const cfg = await AiOptionsConfig.getSingleton();
    const fromEnv = !cfg.geminiApiKey && !!process.env.GEMINI_API_KEY;
    res.json({
      success: true,
      configured: !!(cfg.geminiApiKey || process.env.GEMINI_API_KEY),
      fromEnv,
      maskedKey: AiOptionsConfig.mask(cfg.geminiApiKey),
      model: cfg.geminiModel,
      lastVerifiedAt: cfg.lastVerifiedAt,
      lastError: cfg.lastError,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * Save a key only after it has answered a real call. A key that fails is not
 * stored, so the saved credential is always one that worked at least once.
 */
router.post('/admin/gemini', verifyAdminToken, async (req, res) => {
  const { apiKey, model } = req.body || {};
  if (!apiKey || !String(apiKey).trim()) {
    return res.status(400).json({ success: false, message: 'API key is required' });
  }
  const useModel = (model && String(model).trim()) || aiOptions.DEFAULT_MODEL;
  try {
    await aiOptions.verifyGemini(String(apiKey).trim(), useModel);
  } catch (e) {
    return res.status(400).json({ success: false, verified: false, message: e.message });
  }
  try {
    const cfg = await AiOptionsConfig.getSingleton();
    cfg.geminiApiKey = String(apiKey).trim();
    cfg.geminiModel = useModel;
    cfg.lastVerifiedAt = new Date();
    cfg.lastError = '';
    await cfg.save();
    aiOptions.invalidateConfigCache();
    res.json({
      success: true, verified: true, model: useModel,
      maskedKey: AiOptionsConfig.mask(cfg.geminiApiKey), lastVerifiedAt: cfg.lastVerifiedAt,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * What this key can call right now. Takes an unsaved key so the admin can see
 * the choices before committing one.
 */
router.post('/admin/gemini/models', verifyAdminToken, async (req, res) => {
  try {
    const cfg = await AiOptionsConfig.getSingleton();
    const key = (req.body?.apiKey && String(req.body.apiKey).trim())
      || cfg.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!key) return res.status(400).json({ success: false, message: 'Enter an API key first' });
    const models = await aiOptions.listGeminiModels(key);
    res.json({ success: true, models });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

/** Re-test whatever is currently saved. */
router.post('/admin/gemini/test', verifyAdminToken, async (req, res) => {
  try {
    const cfg = await AiOptionsConfig.getSingleton();
    const key = cfg.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!key) return res.status(400).json({ success: false, verified: false, message: 'No API key saved yet' });
    try {
      await aiOptions.verifyGemini(key, cfg.geminiModel);
      cfg.lastVerifiedAt = new Date(); cfg.lastError = '';
      await cfg.save();
      return res.json({ success: true, verified: true, lastVerifiedAt: cfg.lastVerifiedAt });
    } catch (e) {
      cfg.lastError = e.message; await cfg.save();
      return res.status(400).json({ success: false, verified: false, message: e.message });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ==================== ADMIN: the payment queue ====================

router.get('/admin/requests', verifyAdminToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = { type: 'ai_subscription' };
    if (status && status !== 'all') filter.status = status;

    const [rows, total, pending, approved, rejected] = await Promise.all([
      Transaction.find(filter).select('-proofImage').sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit)).limit(Number(limit)).lean(),
      Transaction.countDocuments(filter),
      Transaction.countDocuments({ type: 'ai_subscription', status: 'pending' }),
      Transaction.countDocuments({ type: 'ai_subscription', status: 'approved' }),
      Transaction.countDocuments({ type: 'ai_subscription', status: 'rejected' }),
    ]);

    // Attach the buyer so the queue can show a name, not just an oderId.
    const users = await User.find({ oderId: { $in: rows.map((r) => r.oderId) } })
      .select('oderId name email phone').lean();
    const byOder = Object.fromEntries(users.map((u) => [u.oderId, u]));
    // Screenshots stay out of the list; the panel fetches one on "View".
    const withProof = new Set((await Transaction.find({ _id: { $in: rows.map((r) => r._id) }, proofImage: { $nin: ['', null] } })
      .select('_id').lean()).map((r) => String(r._id)));

    res.json({
      success: true,
      requests: rows.map((r) => ({ ...r, user: byOder[r.oderId] || null, hasProof: withProof.has(String(r._id)) })),
      total, stats: { pending, approved, rejected },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * Approving is what creates access. If the user still has time left, the new
 * days are added to it rather than overwriting — nobody loses paid days by
 * renewing early.
 */
router.post('/admin/requests/:id/approve', verifyAdminToken, async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx || tx.type !== 'ai_subscription') {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    if (tx.status === 'approved') {
      return res.status(409).json({ success: false, message: 'Already approved' });
    }

    const user = await User.findOne({ oderId: tx.oderId }).lean()
      || await User.findById(tx.oderId).lean();
    if (!user) return res.status(404).json({ success: false, message: 'Buyer not found' });

    const days = Number(tx.paymentDetails?.aiPlanDays) || 30;
    const current = await AiSubscription.activeFor(user._id);
    const from = current ? new Date(current.expiresAt) : new Date();

    const sub = await AiSubscription.create({
      userId: user._id,
      oderId: tx.oderId,
      planId: tx.paymentDetails?.aiPlanId || undefined,
      planName: tx.paymentDetails?.aiPlanName || '',
      amount: tx.amount,
      days,
      startsAt: new Date(),
      expiresAt: new Date(from.getTime() + days * 86400000),
      transactionId: tx._id,
    });

    tx.status = 'approved';
    tx.processedBy = req.admin?.name || 'admin';
    tx.processedAt = new Date();
    await tx.save();

    res.json({ success: true, transaction: tx, subscription: sub });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/admin/requests/:id/reject', verifyAdminToken, async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx || tx.type !== 'ai_subscription') {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    tx.status = 'rejected';
    tx.rejectionReason = req.body?.reason || '';
    tx.processedBy = req.admin?.name || 'admin';
    tx.processedAt = new Date();
    await tx.save();
    res.json({ success: true, transaction: tx });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

module.exports = router;
