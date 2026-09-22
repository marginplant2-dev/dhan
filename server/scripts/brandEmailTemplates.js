/**
 * Give the six plain email templates the same branded card the rich ones use
 * (welcome / challenge_* / payout_processed): dark gradient header with the
 * square logo tile, white body card, support + disclaimer footer.
 *
 * Every existing variable is kept ({{code}}, {{expiryMinutes}}, {{userName}},
 * {{reason}}, {{amount}}, {{currency}}, {{loginUrl}}) so nothing that already
 * fills these templates breaks. textBody is kept as the plain-text fallback.
 *
 * Run from /var/www/dhanfunded/server: node brand_templates.js
 */
const m = require('mongoose');
require('dotenv').config();

const head = (title, kicker) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F2F8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0D0F1A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F8;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(13,15,26,0.08);">
<tr><td style="padding:30px 28px 26px 28px;background:linear-gradient(135deg,#0C0C1D 0%,#1E1E3F 50%,#2B4EFF 100%);text-align:center;">
<img src="{{bannerUrl}}" alt="{{brandName}}" width="64" height="64" style="display:inline-block;width:64px;height:64px;border-radius:16px;background:rgba(255,255,255,0.08);padding:6px;border:0;outline:none;" />
<p style="margin:12px 0 0 0;font-size:11px;font-weight:800;letter-spacing:2.5px;color:#FBBF24;text-transform:uppercase;">${kicker}</p>
<h1 style="margin:8px 0 0 0;font-size:24px;font-weight:800;letter-spacing:-0.02em;color:#fff;line-height:1.25;">${title}</h1>
</td></tr>`;

const foot = `<tr><td style="padding:26px 28px 30px 28px;border-top:1px solid #F0F2F8;">
<p style="margin:0 0 6px 0;font-size:12px;color:#9499A8;">Need help? <a href="mailto:{{supportEmail}}" style="color:#2B4EFF;text-decoration:none;">{{supportEmail}}</a> &middot; <a href="{{siteUrl}}" style="color:#2B4EFF;text-decoration:none;">{{siteUrl}}</a></p>
<p style="margin:0;font-size:11px;color:#B6BAC6;line-height:1.5;">Simulated trading environment. Not financial advice. Trading involves risk. T&amp;Cs apply.</p>
<p style="margin:8px 0 0 0;font-size:11px;color:#C7CAD4;">&copy; {{year}} {{brandName}}. All rights reserved.</p>
</td></tr></table></td></tr></table></body></html>`;

const para = (html) => `<tr><td style="padding:26px 28px 0 28px;font-size:15px;line-height:1.7;color:#2B2F3A;">${html}</td></tr>`;

const codeBox = `<tr><td style="padding:22px 28px 0 28px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="background:#FAFBFD;border:1px solid #E8EAF0;border-radius:12px;">
<tr><td style="padding:18px 40px;font-size:34px;font-weight:800;letter-spacing:10px;color:#0D0F1A;font-family:SFMono-Regular,Consolas,monospace;">{{code}}</td></tr>
</table>
<p style="margin:12px 0 0 0;font-size:13px;color:#6B7080;">Expires in <strong>{{expiryMinutes}} minutes</strong></p>
</td></tr>`;

const button = (label) => `<tr><td style="padding:26px 28px 4px 28px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#2B4EFF;">
<a href="{{loginUrl}}" style="display:inline-block;padding:14px 38px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
</td></tr></table></td></tr>`;

const amountBox = (label) => `<tr><td style="padding:22px 28px 0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#ECFDF5 0%,#D1FAE5 100%);border:1px solid #A7F3D0;border-radius:12px;">
<tr><td style="padding:18px 22px;text-align:center;">
<p style="margin:0;font-size:11px;font-weight:800;letter-spacing:2px;color:#047857;text-transform:uppercase;">${label}</p>
<p style="margin:6px 0 0 0;font-size:28px;font-weight:800;color:#065F46;">{{amount}} {{currency}}</p>
</td></tr></table></td></tr>`;

const COMMON_VARS = ['brandName', 'siteUrl', 'supportEmail', 'bannerUrl', 'year'];

const TEMPLATES = {
  signup_otp: {
    html: head('Verify your email', 'Account verification') +
      para('Use this code to finish creating your <strong>{{brandName}}</strong> account.') +
      codeBox +
      para('<span style="font-size:13px;color:#6B7080;">If you did not request this, you can ignore this email — no account is created without the code.</span>') +
      foot,
    vars: ['code', 'otp', 'expiryMinutes', ...COMMON_VARS],
  },
  password_reset: {
    html: head('Reset your password', 'Password reset') +
      para('Enter this code on the reset page to set a new <strong>{{brandName}}</strong> password.') +
      codeBox +
      para('<span style="font-size:13px;color:#6B7080;">If you did not ask to reset your password, ignore this email — your current password keeps working.</span>') +
      foot,
    vars: ['code', 'otp', 'expiryMinutes', ...COMMON_VARS],
  },
  account_banned: {
    html: head('Your account is suspended', 'Account status') +
      para('Hi {{userName}},<br><br>Your <strong>{{brandName}}</strong> account has been suspended.') +
      `<tr><td style="padding:22px 28px 0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;border-left:4px solid #DC2626;">
<tr><td style="padding:14px 18px;font-size:14px;color:#7F1D1D;"><strong>Reason:</strong> {{reason}}</td></tr>
</table></td></tr>` +
      para('If you believe this is a mistake, reply to this email or write to <a href="mailto:{{supportEmail}}" style="color:#2B4EFF;text-decoration:none;">{{supportEmail}}</a> and the team will review it.') +
      foot,
    vars: ['userName', 'reason', ...COMMON_VARS],
  },
  account_unbanned: {
    html: head('Your account is active again', 'Account status') +
      para('Hi {{userName}},<br><br>Your <strong>{{brandName}}</strong> account has been restored. You can log in and carry on where you left off.') +
      button('Log in') +
      para('<span style="font-size:13px;color:#6B7080;">Or open <a href="{{loginUrl}}" style="color:#2B4EFF;text-decoration:none;">{{loginUrl}}</a> in your browser.</span>') +
      foot,
    vars: ['userName', 'loginUrl', ...COMMON_VARS],
  },
  deposit_approved: {
    html: head('Deposit confirmed', 'Payment received') +
      para('Hi {{userName}},<br><br>Your deposit has been credited to your <strong>{{brandName}}</strong> account.') +
      amountBox('Amount credited') +
      button('Open dashboard') +
      foot,
    vars: ['userName', 'amount', 'currency', 'loginUrl', ...COMMON_VARS],
  },
  withdrawal_approved: {
    html: head('Withdrawal processed', 'Payout') +
      para('Hi {{userName}},<br><br>Your withdrawal has been processed and sent to your registered bank account.') +
      amountBox('Amount sent') +
      para('<span style="font-size:13px;color:#6B7080;">Bank transfers usually land the same working day. If it has not arrived within 48 hours, write to <a href="mailto:{{supportEmail}}" style="color:#2B4EFF;text-decoration:none;">{{supportEmail}}</a>.</span>') +
      foot,
    vars: ['userName', 'amount', 'currency', ...COMMON_VARS],
  },
};

(async () => {
  await m.connect(process.env.MONGODB_URI);
  const col = m.connection.db.collection('emailtemplates');
  for (const [slug, t] of Object.entries(TEMPLATES)) {
    const before = await col.findOne({ slug });
    if (!before) { console.log('SKIP (not found):', slug); continue; }
    const r = await col.updateOne(
      { slug },
      { $set: { htmlBody: t.html, variableKeys: t.vars, updatedAt: new Date() } }
    );
    console.log(
      slug.padEnd(21),
      'html', String(before.htmlBody || '').length, '->', t.html.length,
      '| modified:', r.modifiedCount
    );
  }
  await m.disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
