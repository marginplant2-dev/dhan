const express = require('express');
const EmailTemplate = require('../models/EmailTemplate');
const EmailAppSettings = require('../models/EmailAppSettings');
const { protect, adminOnly } = require('./auth');
const emailService = require('../services/email.service');
const emailTemplateService = require('../services/emailTemplate.service');
const emailOtpService = require('../services/emailOtp.service');

const router = express.Router();
router.use(protect, adminOnly);

const SLUG_RE = /^[a-z0-9_]+$/;

async function getOrCreateSettings() {
  let doc = await EmailAppSettings.findOne();
  if (!doc) doc = await EmailAppSettings.create({});
  return doc;
}

router.get('/status', async (req, res) => {
  try {
    const smtpConfigured = emailService.isSmtpConfigured();
    const smtpProfile = emailService.getSmtpStatusForAdmin();
    const settings = await getOrCreateSettings();
    const signupOtpEffective = await emailOtpService.requireSignupOtp();
    res.json({
      success: true,
      smtpConfigured,
      smtpProfile,
      signupOtpEmailEnabled: settings.signupOtpEmailEnabled !== false,
      signupOtpEffective,
      requireSignupOtpEnvOff: process.env.REQUIRE_SIGNUP_OTP === 'false'
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.patch('/settings', async (req, res) => {
  try {
    const { signupOtpEmailEnabled } = req.body;
    const doc = await getOrCreateSettings();
    if (typeof signupOtpEmailEnabled === 'boolean') {
      doc.signupOtpEmailEnabled = signupOtpEmailEnabled;
      await doc.save();
    }
    res.json({
      success: true,
      settings: {
        signupOtpEmailEnabled: doc.signupOtpEmailEnabled !== false
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/verify-smtp', async (req, res) => {
  try {
    await emailService.verifySmtpConnection();
    res.json({ success: true, message: 'SMTP connection OK' });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message || 'SMTP verify failed' });
  }
});

router.post('/test-send', async (req, res) => {
  try {
    const { slug, to, variables } = req.body;
    if (!slug || !SLUG_RE.test(String(slug))) {
      return res.status(400).json({ success: false, error: 'Invalid template slug' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!to || !emailRegex.test(to)) {
      return res.status(400).json({ success: false, error: 'Valid recipient email required' });
    }
    if (!emailService.isSmtpConfigured()) {
      return res.status(503).json({ success: false, error: 'SMTP is not configured' });
    }
    const doc = await EmailTemplate.findOne({ slug: String(slug).toLowerCase() });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    const base = emailTemplateService.sampleVariablesForSlug(slug);
    const vars = { ...base, ...(variables && typeof variables === 'object' ? variables : {}) };
    const rendered = emailTemplateService.renderTemplateDoc(doc, vars);
    if (!rendered || (!rendered.html && !rendered.text)) {
      return res.status(400).json({ success: false, error: 'Template body is empty' });
    }
    await emailService.sendMail({
      to: String(to).toLowerCase().trim(),
      subject: `[TEST] ${rendered.subject}`,
      text: rendered.text,
      html: rendered.html || rendered.text
    });
    res.json({ success: true, message: 'Test email sent' });
  } catch (e) {
    console.error('test-send:', e);
    const msg = e?.message || String(e);
    res.status(500).json({ success: false, error: msg });
  }
});

router.get('/', async (req, res) => {
  try {
    const templates = await EmailTemplate.find()
      .sort({ order: 1 })
      .select('slug name description variableKeys enabled subject order')
      .lean();
    res.json({ success: true, templates });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug).toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return res.status(400).json({ success: false, error: 'Invalid slug' });
    }
    const doc = await EmailTemplate.findOne({ slug }).lean();
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.json({ success: true, template: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug).toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return res.status(400).json({ success: false, error: 'Invalid slug' });
    }
    const { name, description, subject, htmlBody, textBody, variableKeys, enabled } = req.body;
    const doc = await EmailTemplate.findOne({ slug });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    if (name !== undefined) doc.name = name;
    if (description !== undefined) doc.description = description;
    if (subject !== undefined) doc.subject = subject;
    if (htmlBody !== undefined) doc.htmlBody = htmlBody;
    if (textBody !== undefined) doc.textBody = textBody;
    if (variableKeys !== undefined) doc.variableKeys = variableKeys;
    if (enabled !== undefined) doc.enabled = enabled;
    await doc.save();
    res.json({ success: true, template: doc.toObject() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug).toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return res.status(400).json({ success: false, error: 'Invalid slug' });
    }
    const r = await EmailTemplate.deleteOne({ slug });
    if (r.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/seed', async (req, res) => {
  try {
    const n = await emailTemplateService.seedMissingTemplates();
    res.json({
      success: true,
      created: n,
      message: n ? `Added ${n} missing template(s)` : 'All defaults already exist'
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/reset', async (req, res) => {
  try {
    if (req.body?.confirm !== 'RESET_ALL_EMAIL_TEMPLATES') {
      return res.status(400).json({
        success: false,
        error: 'Send JSON body { "confirm": "RESET_ALL_EMAIL_TEMPLATES" } to wipe and restore defaults.'
      });
    }
    const count = await emailTemplateService.resetAndSeed();
    res.json({ success: true, restored: count });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
