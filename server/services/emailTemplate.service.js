const EmailTemplate = require('../models/EmailTemplate');

const DEFAULT_BRAND = 'DhanFunded';

const BRAND_DISCLAIMER = 'Simulated trading environment. Not financial advice. Trading involves risk. T&Cs apply.';

/**
 * Build a branded, email-client-safe HTML card (tables + inline CSS) that
 * matches the welcome email's look. Used to seed the prop-lifecycle templates
 * below so they all share one consistent design. Admins can still edit the
 * seeded HTML from the panel afterwards.
 *
 * opts: { accent, eyebrow, eyebrowColor, heading, intro(html), rows[{label,value}],
 *         callout(html), ctaUrl, ctaLabel, outro(html), disclaimer }
 */
function buildCard(opts = {}) {
  const {
    accent = '#0B8F62', eyebrow = '', eyebrowColor = '#FBBF24', heading = '',
    intro = '', rows = [], callout = '', ctaUrl = '{{loginUrl}}', ctaLabel = '',
    outro = '', disclaimer = BRAND_DISCLAIMER
  } = opts;

  const detailsBlock = rows.length ? `
<tr><td style="padding:22px 28px 0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7FBF9;border:1px solid #DCE9E2;border-radius:10px;border-left:4px solid ${accent};">
${rows.map((r, i) => `<tr><td style="padding:11px 18px;font-size:13px;color:#6B7080;${i ? 'border-top:1px solid #EBF1F4;' : ''}">${r.label}</td><td style="padding:11px 18px;font-size:13px;font-weight:700;color:#0A2130;text-align:right;${i ? 'border-top:1px solid #EBF1F4;' : ''}">${r.value}</td></tr>`).join('')}
</table></td></tr>` : '';
  const calloutBlock = callout ? `<tr><td style="padding:22px 28px 0 28px;">${callout}</td></tr>` : '';
  const ctaBlock = ctaLabel ? `
<tr><td style="padding:28px 28px 4px 28px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:${accent};">
<a href="${ctaUrl}" style="display:inline-block;padding:14px 40px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${ctaLabel}</a>
</td></tr></table></td></tr>` : '';
  const introBlock = intro ? `<tr><td style="padding:28px 28px 0 28px;font-size:15px;line-height:1.65;color:#2B2F3A;">${intro}</td></tr>` : '';
  const outroBlock = outro ? `<tr><td style="padding:22px 28px 0 28px;font-size:14px;line-height:1.65;color:#4B6357;">${outro}</td></tr>` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#EBF1F4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0A2130;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EBF1F4;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(13,15,26,0.08);">
<tr><td style="padding:0;background:linear-gradient(135deg,#0C0C1D 0%,#1E1E3F 50%,${accent} 100%);">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px 28px 8px 28px;text-align:center;">
<img src="{{bannerUrl}}" alt="{{brandName}}" width="64" height="64" style="display:inline-block;width:64px;height:64px;border-radius:16px;background:rgba(255,255,255,0.08);padding:6px;border:0;outline:none;" />
</td></tr>
${eyebrow ? `<tr><td style="padding:4px 28px 0 28px;text-align:center;"><p style="margin:0;font-size:11px;font-weight:800;letter-spacing:2.5px;color:${eyebrowColor};text-transform:uppercase;">${eyebrow}</p></td></tr>` : ''}
<tr><td style="padding:8px 28px 30px 28px;text-align:center;">
<h1 style="margin:0;font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#fff;line-height:1.2;">${heading}</h1>
</td></tr></table></td></tr>
${introBlock}
${detailsBlock}
${calloutBlock}
${ctaBlock}
${outroBlock}
<tr><td style="padding:30px 28px 10px 28px;">
<p style="margin:0;font-size:14px;color:#4B6357;">Trade smart. Stay disciplined.</p>
<p style="margin:6px 0 0 0;font-size:14px;font-weight:700;color:#0A2130;">Team {{brandName}}</p>
</td></tr>
<tr><td style="padding:18px 28px 30px 28px;border-top:1px solid #EBF1F4;">
<p style="margin:0 0 6px 0;font-size:12px;color:#9499A8;">Need help? <a href="mailto:{{supportEmail}}" style="color:${accent};text-decoration:none;">{{supportEmail}}</a> &middot; <a href="{{siteUrl}}" style="color:${accent};text-decoration:none;">{{siteUrl}}</a></p>
<p style="margin:0;font-size:11px;color:#B6BAC6;line-height:1.5;">${disclaimer}</p>
<p style="margin:8px 0 0 0;font-size:11px;color:#C7CAD4;">© {{year}} {{brandName}}. All rights reserved.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

const DEFAULT_TEMPLATES = [
  {
    slug: 'signup_otp',
    name: 'Signup verification (OTP)',
    description: 'Sent when a user requests a verification code during registration.',
    subject: 'Your {{brandName}} verification code',
    variableKeys: ['code', 'otp', 'expiryMinutes', 'brandName'],
    order: 1,
    htmlBody: `<p>Your signup verification code is:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px;">{{code}}</p>
<p>This code expires in <strong>{{expiryMinutes}} minutes</strong>.</p>
<p>If you did not request this, you can ignore this email.</p>`,
    textBody:
      'Your signup verification code is: {{code}}\n\nIt expires in {{expiryMinutes}} minutes. If you did not request this, ignore this email.'
  },
  {
    slug: 'password_reset',
    name: 'Password reset (OTP)',
    description: 'Sent when a user requests a password reset code.',
    subject: 'Your {{brandName}} password reset code',
    variableKeys: ['code', 'otp', 'expiryMinutes', 'brandName'],
    order: 2,
    htmlBody: `<p>Your password reset code is:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px;">{{code}}</p>
<p>This code expires in <strong>{{expiryMinutes}} minutes</strong>.</p>
<p>If you did not request a reset, ignore this email.</p>`,
    textBody:
      'Your password reset code is: {{code}}\n\nIt expires in {{expiryMinutes}} minutes. If you did not request a reset, ignore this email.'
  },
  {
    slug: 'welcome',
    name: 'Welcome email',
    description: 'Sent right after successful signup. Colourful branded card with logo, the prop-firm pitch and key perks.',
    subject: 'Welcome to {{brandName}}, {{userName}} — your funded trading journey starts now 🚀',
    variableKeys: ['userName', 'userId', 'loginUrl', 'siteUrl', 'bannerUrl', 'brandName', 'supportEmail', 'year'],
    order: 3,
    htmlBody: buildCard({
      accent: '#0B8F62',
      eyebrow: "🇮🇳 India's Prop Trading Firm",
      heading: 'Welcome aboard, {{userName}}! 🎉',
      intro: '<strong>{{brandName}}</strong> is a prop firm for trading <strong>NIFTY, BANKNIFTY &amp; SENSEX</strong>.<br/><br/>We give you up to <strong style="color:#0B8F62;">₹50 Lakhs</strong> in simulated capital — with <strong>real profit sharing</strong> on your performance.',
      rows: [
        { label: 'Your User ID', value: '{{userId}}' }
      ],
      callout: '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#ECFDF5 0%,#D1FAE5 100%);border:1px solid #A7F3D0;border-radius:12px;"><tr><td style="padding:18px 22px;"><p style="margin:0 0 8px 0;font-size:11px;font-weight:800;letter-spacing:2px;color:#047857;text-transform:uppercase;">Why traders choose us</p><p style="margin:0;font-size:14px;color:#065F46;line-height:2;">✅&nbsp;&nbsp;<strong>Same-Day</strong> Account Activation</p><p style="margin:0;font-size:14px;color:#065F46;line-height:2;">✅&nbsp;&nbsp;<strong>80%</strong> Revenue Share</p><p style="margin:0;font-size:14px;color:#065F46;line-height:2;">✅&nbsp;&nbsp;<strong>Bi-Weekly</strong> Withdrawals</p><p style="margin:0;font-size:14px;color:#065F46;line-height:2;">✅&nbsp;&nbsp;<strong>Instant / 1-Step / 2-Step</strong> Accounts Available</p></td></tr></table>',
      ctaUrl: '{{loginUrl}}',
      ctaLabel: 'Log In & Start Trading →',
      outro: 'You can log in here: <a href="{{loginUrl}}" style="color:#0B8F62;text-decoration:none;">{{loginUrl}}</a>'
    }),
    textBody: `Hi {{userName}},

{{brandName}} is a prop firm for trading NIFTY, BANKNIFTY & SENSEX.
We give you up to ₹50 Lakhs in simulated capital — with real profit sharing on your performance.

Your User ID: {{userId}}

✅ Same-Day Account Activation
✅ 80% Revenue Share
✅ Bi-Weekly Withdrawals
✅ Instant / 1-Step / 2-Step Accounts Available

You can log in here: {{loginUrl}}

Need help? {{supportEmail}}
— Team {{brandName}}`
  },
  {
    slug: 'account_banned',
    name: 'Account banned',
    description: 'Notify user that their account has been restricted.',
    subject: 'Your {{brandName}} account has been suspended',
    variableKeys: ['userName', 'reason', 'brandName', 'supportEmail'],
    order: 4,
    htmlBody:
      '<p>Hi {{userName}},</p><p>Your account has been suspended.</p><p><strong>Reason:</strong> {{reason}}</p><p>Contact: {{supportEmail}}</p>',
    textBody: 'Hi {{userName}},\n\nYour account has been suspended.\nReason: {{reason}}\nSupport: {{supportEmail}}'
  },
  {
    slug: 'account_unbanned',
    name: 'Account restored',
    description: 'Notify user that their account is active again.',
    subject: 'Your {{brandName}} account is active again',
    variableKeys: ['userName', 'brandName', 'loginUrl'],
    order: 5,
    htmlBody: '<p>Hi {{userName}},</p><p>Your account has been restored. You can log in at <a href="{{loginUrl}}">{{loginUrl}}</a>.</p>',
    textBody: 'Hi {{userName}},\n\nYour account has been restored.\nLogin: {{loginUrl}}'
  },
  {
    slug: 'deposit_approved',
    name: 'Deposit approved',
    description: 'Sent when a deposit request is approved.',
    subject: 'Deposit confirmed — {{brandName}}',
    variableKeys: ['userName', 'amount', 'currency', 'brandName'],
    order: 6,
    htmlBody:
      '<p>Hi {{userName}},</p><p>Your deposit of <strong>{{amount}} {{currency}}</strong> has been credited.</p>',
    textBody: 'Hi {{userName}},\n\nYour deposit of {{amount}} {{currency}} has been credited.'
  },
  {
    slug: 'withdrawal_approved',
    name: 'Withdrawal approved',
    description: 'Sent when a withdrawal is processed.',
    subject: 'Withdrawal processed — {{brandName}}',
    variableKeys: ['userName', 'amount', 'currency', 'brandName'],
    order: 7,
    htmlBody:
      '<p>Hi {{userName}},</p><p>Your withdrawal of <strong>{{amount}} {{currency}}</strong> has been processed.</p>',
    textBody: 'Hi {{userName}},\n\nYour withdrawal of {{amount}} {{currency}} has been processed.'
  },
  {
    slug: 'challenge_pending',
    name: 'Challenge — purchase received (approval pending)',
    description: 'Sent right after a user buys/requests a challenge. Lets them know the account is being set up.',
    subject: 'Your account purchase is received — approval in progress ⏳',
    variableKeys: ['userName', 'challengeName', 'accountSize', 'brandName', 'siteUrl', 'dashboardUrl', 'supportEmail', 'bannerUrl', 'year'],
    order: 8,
    htmlBody: buildCard({
      accent: '#F59E0B', eyebrow: 'Order Received', heading: 'Approval in progress ⏳',
      intro: 'Hi <strong>{{userName}}</strong>,<br/><br/>Thank you for purchasing your {{brandName}} evaluation account! We’ve received your order and our team is reviewing &amp; setting up your simulated trading account.',
      rows: [
        { label: 'Challenge', value: '{{challengeName}}' },
        { label: 'Account Size', value: '₹{{accountSize}}' },
        { label: 'Estimated activation', value: '24–48 hours' }
      ],
      outro: 'Please don’t make multiple purchases during this period. You’ll get a confirmation email the moment your account is active.',
      ctaUrl: '{{dashboardUrl}}', ctaLabel: 'View My Challenges'
    }),
    textBody: 'Hi {{userName}},\n\nThank you for purchasing your {{brandName}} evaluation account! We have received your order and your account is being reviewed and set up.\n\nChallenge: {{challengeName}}\nAccount Size: Rs {{accountSize}}\nEstimated activation: 24-48 hours\n\nPlease do not make multiple purchases during this period.\n\nTrade smart. Stay disciplined.\nTeam {{brandName}}'
  },
  {
    slug: 'challenge_active',
    name: 'Challenge — account active (after approval)',
    description: 'Sent when admin approves a challenge purchase and the account goes live.',
    subject: '🚨 Your funded account is LIVE — {{accountType}}',
    variableKeys: ['userName', 'accountType', 'accountSize', 'profitTarget', 'maxDrawdown', 'dailyDrawdown', 'minTradingDays', 'brandName', 'dashboardUrl', 'siteUrl', 'supportEmail', 'bannerUrl', 'year'],
    order: 9,
    htmlBody: buildCard({
      accent: '#10B981', eyebrow: 'Account Activated', heading: 'Your account is LIVE 🔥',
      intro: 'Hi <strong>{{userName}}</strong>,<br/><br/>THIS IS IT — your evaluation account is live. Real rules, real profit split on the other side. Most traders only talk about this. You actually showed up.',
      rows: [
        { label: 'Account Type', value: '{{accountType}}' },
        { label: 'Account Size', value: '₹{{accountSize}}' },
        { label: 'Profit Target', value: '{{profitTarget}}%' },
        { label: 'Max Drawdown', value: '{{maxDrawdown}}%' },
        { label: 'Daily Drawdown Limit', value: '{{dailyDrawdown}}%' },
        { label: 'Min Trading Days', value: '{{minTradingDays}} days' }
      ],
      outro: 'Remember — discipline wins, not aggression. Trade your plan, respect the rules, treat this like a business. We’re rooting for you. 🔥',
      ctaUrl: '{{dashboardUrl}}', ctaLabel: 'Open My Dashboard'
    }),
    textBody: 'Hi {{userName}},\n\nTHIS IS IT. Your account is live.\n\nAccount Type: {{accountType}}\nAccount Size: Rs {{accountSize}}\nProfit Target: {{profitTarget}}%\nMax Drawdown: {{maxDrawdown}}%\nDaily Drawdown Limit: {{dailyDrawdown}}%\nMin Trading Days: {{minTradingDays}} days\n\nLogin: {{dashboardUrl}}\n\nDiscipline wins. Trade your plan, respect the rules.\n\nTeam {{brandName}}'
  },
  {
    slug: 'challenge_breached',
    name: 'Challenge — account breached (+ coupon)',
    description: 'Sent when an evaluation account breaches a drawdown rule and is closed. Includes a comeback coupon.',
    subject: 'Your account has been breached — but this isn’t the end 💪',
    variableKeys: ['userName', 'couponCode', 'couponDiscount', 'couponValidityDays', 'brandName', 'siteUrl', 'dashboardUrl', 'supportEmail', 'bannerUrl', 'year'],
    order: 10,
    htmlBody: buildCard({
      accent: '#EF4444', eyebrow: 'Evaluation Closed', heading: 'This isn’t the end 💪',
      intro: 'Hi <strong>{{userName}}</strong>,<br/><br/>We noticed your evaluation account breached the drawdown rules and has been closed. Every great trader has faced setbacks — what separates the best is what they do next.<br/><br/><strong>Common reasons for breaches:</strong> overtrading in volatile sessions · ignoring the daily drawdown limit · holding overnight without a plan · revenge trading after a loss.',
      callout: '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#FFF7ED 0%,#FED7AA 100%);border:2px dashed #F59E0B;border-radius:12px;"><tr><td style="padding:20px 22px;text-align:center;"><p style="margin:0 0 6px 0;font-size:11px;font-weight:800;letter-spacing:2px;color:#B45309;text-transform:uppercase;">🎁 Comeback Offer</p><p style="margin:0 0 10px 0;font-size:20px;font-weight:800;color:#0A2130;">{{couponDiscount}}% OFF your next evaluation</p><p style="margin:0;font-size:13px;color:#78350F;">Use code <span style="background:#0A2130;color:#FBBF24;padding:5px 14px;border-radius:6px;font-family:Courier New,monospace;font-weight:800;letter-spacing:1.5px;font-size:14px;">{{couponCode}}</span></p><p style="margin:8px 0 0 0;font-size:11px;color:#92400E;">Valid for {{couponValidityDays}} days. Don’t let this setback define your journey — let it refine it.</p></td></tr></table>',
      ctaUrl: '{{dashboardUrl}}', ctaLabel: 'Restart Your Journey'
    }),
    textBody: 'Hi {{userName}},\n\nYour evaluation account breached the drawdown rules and has been closed. Take a step back, review your trades, and come back stronger.\n\nComeback offer: use code {{couponCode}} for {{couponDiscount}}% OFF your next evaluation (valid {{couponValidityDays}} days).\n\nRestart: {{dashboardUrl}}\n\nTeam {{brandName}}'
  },
  {
    slug: 'challenge_passed',
    name: 'Challenge — evaluation passed',
    description: 'Sent when a user passes the evaluation.',
    subject: 'Congratulations! You’ve passed the evaluation 🏆',
    variableKeys: ['userName', 'accountType', 'profitAchieved', 'maxDrawdownUsed', 'tradingDaysCompleted', 'brandName', 'siteUrl', 'dashboardUrl', 'supportEmail', 'bannerUrl', 'year'],
    order: 11,
    htmlBody: buildCard({
      accent: '#10B981', eyebrow: 'Evaluation Passed', heading: 'You did it! 🏆',
      intro: 'Hi <strong>{{userName}}</strong>,<br/><br/>We’re incredibly proud to tell you that you’ve <strong>passed your {{brandName}} evaluation.</strong> This is a massive achievement and proof of your discipline and skill.',
      rows: [
        { label: 'Account Type', value: '{{accountType}}' },
        { label: 'Profit Achieved', value: '{{profitAchieved}}%' },
        { label: 'Max Drawdown Used', value: '{{maxDrawdownUsed}}%' },
        { label: 'Trading Days Completed', value: '{{tradingDaysCompleted}} days' }
      ],
      outro: '<strong>What happens next:</strong> our team will review your performance and share your funded account details, profit split &amp; withdrawal terms within 24–48 hours. Welcome to the funded side.',
      ctaUrl: '{{dashboardUrl}}', ctaLabel: 'View My Results'
    }),
    textBody: 'Hi {{userName}},\n\nYOU DID IT! You have successfully passed your {{brandName}} evaluation.\n\nAccount Type: {{accountType}}\nProfit Achieved: {{profitAchieved}}%\nMax Drawdown Used: {{maxDrawdownUsed}}%\nTrading Days Completed: {{tradingDaysCompleted}} days\n\nYour funded account details will be shared within 24-48 hours.\n\nTeam {{brandName}}'
  },
  {
    slug: 'withdrawal_received',
    name: 'Withdrawal — request received',
    description: 'Sent when a user submits a withdrawal/payout request (before it is processed).',
    subject: 'Your withdrawal request has been received 📩',
    variableKeys: ['userName', 'amount', 'requestDate', 'brandName', 'siteUrl', 'dashboardUrl', 'supportEmail', 'bannerUrl', 'year'],
    order: 12,
    htmlBody: buildCard({
      accent: '#0B8F62', eyebrow: 'Withdrawal Requested', heading: 'Request received 📩',
      intro: 'Hi <strong>{{userName}}</strong>,<br/><br/>We’ve successfully received your withdrawal request and our team is now processing it.',
      rows: [
        { label: 'Requested Amount', value: '₹{{amount}}' },
        { label: 'Request Date', value: '{{requestDate}}' },
        { label: 'Estimated Processing Time', value: '3–5 business days' }
      ],
      outro: 'Our finance team will verify your request and confirm your KYC &amp; bank details. If anything else is needed, we’ll reach out to you here. Your earnings reflect your skill and hard work.',
      ctaUrl: '{{dashboardUrl}}', ctaLabel: 'View My Account'
    }),
    textBody: 'Hi {{userName}},\n\nWe have received your withdrawal request and are processing it.\n\nRequested Amount: Rs {{amount}}\nRequest Date: {{requestDate}}\nEstimated Processing Time: 3-5 business days\n\nTeam {{brandName}}'
  },
  {
    slug: 'payout_processed',
    name: 'Payout — processed successfully',
    description: 'Sent when a payout/withdrawal is processed and money is on the way.',
    subject: 'Your payout has been processed successfully! 💰',
    variableKeys: ['userName', 'amount', 'paymentDate', 'paymentMethod', 'referenceId', 'reviewUrl', 'brandName', 'siteUrl', 'dashboardUrl', 'supportEmail', 'bannerUrl', 'year'],
    order: 13,
    htmlBody: buildCard({
      accent: '#10B981', eyebrow: 'Payout Sent', heading: 'You’ve earned this 💰',
      intro: 'Hi <strong>{{userName}}</strong>,<br/><br/>We’re happy to confirm that your payout has been <strong>successfully processed!</strong> Your discipline, patience and skill made this possible.',
      rows: [
        { label: 'Amount Paid', value: '₹{{amount}}' },
        { label: 'Payment Date', value: '{{paymentDate}}' },
        { label: 'Payment Method', value: '{{paymentMethod}}' },
        { label: 'Reference ID', value: '{{referenceId}}' }
      ],
      outro: 'Please allow 1–2 business days for the amount to reflect, depending on your bank. A quick review on Google/Trustpilot would mean the world to us and help the Indian trading community.',
      ctaUrl: '{{reviewUrl}}', ctaLabel: 'Leave a Review'
    }),
    textBody: 'Hi {{userName}},\n\nYour payout has been processed successfully!\n\nAmount Paid: Rs {{amount}}\nPayment Date: {{paymentDate}}\nPayment Method: {{paymentMethod}}\nReference ID: {{referenceId}}\n\nPlease allow 1-2 business days for the amount to reflect.\n\nTeam {{brandName}}'
  }
];

function interpolate(str, vars) {
  if (!str) return '';
  const merged = { brandName: DEFAULT_BRAND, ...vars };
  return str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = merged[key];
    return v !== undefined && v !== null ? String(v) : '';
  });
}

async function seedMissingTemplates() {
  let created = 0;
  for (const t of DEFAULT_TEMPLATES) {
    const exists = await EmailTemplate.findOne({ slug: t.slug });
    if (!exists) {
      await EmailTemplate.create({ ...t, enabled: true });
      created += 1;
    }
  }
  return created;
}

async function resetAndSeed() {
  await EmailTemplate.deleteMany({});
  await EmailTemplate.insertMany(DEFAULT_TEMPLATES.map((t) => ({ ...t, enabled: true })));
  return DEFAULT_TEMPLATES.length;
}

// A phrase present only in the CURRENT welcome copy. Used by the boot repair to
// detect (and replace) a stale welcome row — the old simple copy / the pre-fix
// pre-rebrand era. Change it if the welcome copy is reworked again.
const WELCOME_MARKER = 'in simulated capital';

// Overwrite ONE template in the DB from its code default (upsert). Surgical —
// unlike resetAndSeed() it never touches the other templates.
async function resyncTemplate(slug) {
  const def = DEFAULT_TEMPLATES.find((t) => t.slug === slug);
  if (!def) return false;
  await EmailTemplate.updateOne({ slug }, { $set: { ...def, enabled: true } }, { upsert: true });
  return true;
}

// Boot-time self-heal for the welcome email: refresh it only when it is missing
// or still the outdated version (doesn't contain WELCOME_MARKER). Idempotent —
// once the new copy is live it leaves the row alone on subsequent boots, so it
// won't clobber future intentional edits that keep the marker phrase.
async function repairWelcomeTemplate() {
  const doc = await EmailTemplate.findOne({ slug: 'welcome' });
  if (doc && String(doc.htmlBody || '').includes(WELCOME_MARKER)) return false;
  await resyncTemplate('welcome');
  return true;
}

function renderTemplateDoc(doc, vars) {
  if (!doc) return null;
  return {
    subject: interpolate(doc.subject, vars),
    text: interpolate(doc.textBody || '', vars),
    html: interpolate(doc.htmlBody || '', vars)
  };
}

/**
 * @returns {{ subject: string, text: string, html: string } | null}
 */
async function getRenderedForSend(slug, vars) {
  const doc = await EmailTemplate.findOne({ slug: String(slug).toLowerCase().trim() });
  if (!doc || !doc.enabled) return null;
  return renderTemplateDoc(doc, vars);
}

function sampleVariablesForSlug(slug) {
  const base = {
    code: '123456',
    otp: '123456',
    expiryMinutes: '10',
    brandName: DEFAULT_BRAND,
    supportEmail: 'support@example.com',
    userName: 'Demo User',
    loginUrl: 'https://example.com/login',
    reason: 'Policy review',
    amount: '1,000.00',
    currency: 'INR'
  };
  const s = String(slug).toLowerCase();
  if (s === 'password_reset') return { ...base, expiryMinutes: '15' };
  return base;
}

module.exports = {
  DEFAULT_TEMPLATES,
  interpolate,
  seedMissingTemplates,
  resetAndSeed,
  resyncTemplate,
  repairWelcomeTemplate,
  getRenderedForSend,
  renderTemplateDoc,
  sampleVariablesForSlug
};
