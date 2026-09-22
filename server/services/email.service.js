const nodemailer = require('nodemailer');
const emailTemplateService = require('./emailTemplate.service');

function trimEnv(v) {
  if (v == null || v === undefined) return '';
  let s = String(v).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** Parsed SMTP settings (trimmed). Use for health checks without exposing secrets. */
function getSmtpConfig() {
  const host = trimEnv(process.env.SMTP_HOST);
  const user = trimEnv(process.env.SMTP_USER);
  const pass = trimEnv(process.env.SMTP_PASS);
  const rawPort = trimEnv(process.env.SMTP_PORT);
  const portNum = Number(rawPort || 465);
  const port = Number.isFinite(portNum) && portNum > 0 ? portNum : 465;

  const sec = trimEnv(process.env.SMTP_SECURE).toLowerCase();
  let secure;
  if (sec === 'true') secure = true;
  else if (sec === 'false') secure = false;
  else secure = port === 465;

  return { host, user, pass, port, secure };
}

function isSmtpConfigured() {
  const { host, user, pass } = getSmtpConfig();
  return !!(host && user && pass);
}

function formatSmtpError(err) {
  const bits = [];
  if (err?.message) bits.push(err.message);
  if (err?.response) bits.push(String(err.response).trim());
  if (err?.responseCode != null) bits.push(`SMTP ${err.responseCode}`);
  if (err?.command) bits.push(`(${err.command})`);
  return bits.filter(Boolean).join(' — ') || 'SMTP error';
}

function createTransport() {
  const { host, user, pass, port, secure } = getSmtpConfig();
  if (!host || !user || !pass) return null;

  const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false';

  const options = {
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 25_000,
    greetingTimeout: 25_000,
    socketTimeout: 45_000,
    tls: {
      rejectUnauthorized,
      minVersion: 'TLSv1.2',
      servername: host
    }
  };

  // Port 587 (and similar submission ports): STARTTLS — must not use implicit TLS (secure: false).
  if (!secure && (port === 587 || port === 2587)) {
    options.requireTLS = true;
  }

  if (process.env.SMTP_DEBUG === 'true') {
    options.debug = true;
    options.logger = true;
  }

  return nodemailer.createTransport(options);
}

function fromAddress() {
  const name = trimEnv(process.env.SMTP_FROM_NAME) || 'DhanFunded';
  const addr = trimEnv(process.env.SMTP_FROM) || trimEnv(process.env.SMTP_USER);
  return `"${name}" <${addr}>`;
}

async function sendMail({ to, subject, text, html }) {
  const transporter = createTransport();
  if (!transporter) {
    throw new Error('SMTP is not configured');
  }
  try {
    await transporter.sendMail({
      from: fromAddress(),
      to,
      subject,
      text: text || undefined,
      html: html || text || undefined
    });
  } catch (err) {
    throw new Error(formatSmtpError(err));
  }
}

async function verifySmtpConnection() {
  const transporter = createTransport();
  if (!transporter) {
    throw new Error('SMTP is not configured');
  }
  try {
    await transporter.verify();
  } catch (err) {
    const cfg = getSmtpConfig();
    let hint = '';
    if (cfg.port === 587 && cfg.secure) {
      hint = ' For port 587 use STARTTLS: set SMTP_SECURE=false in .env.';
    } else if (cfg.port === 465 && !cfg.secure) {
      hint = ' For port 465 use implicit SSL: set SMTP_SECURE=true in .env.';
    }
    throw new Error(formatSmtpError(err) + hint);
  }
}

function getSmtpStatusForAdmin() {
  const { host, user, port, secure } = getSmtpConfig();
  const mask =
    user && user.includes('@')
      ? `${user.slice(0, 2)}***@${user.split('@')[1]}`
      : user
        ? '***'
        : '';
  return {
    host: host || null,
    port,
    secure,
    userHint: mask,
    configured: isSmtpConfigured()
  };
}

/**
 * Variables every branded template expects. The OTP mails used to pass only
 * the code, so a template using {{bannerUrl}} / {{siteUrl}} / {{supportEmail}}
 * rendered a broken image and empty links. brandName is filled by the
 * renderer itself (DEFAULT_BRAND), so it is not repeated here.
 */
/**
 * The base URL for links we mail to a recipient. A user who belongs to an
 * admin with a READY custom domain gets that domain; everyone else — and
 * everyone at all while the feature is off — gets the platform URL, so a
 * disconnected domain stops appearing in mail immediately.
 */
async function siteUrlForRecipient(to) {
  const fallback = (process.env.PUBLIC_SITE_URL || 'https://dhanfunded.com').replace(/\/$/, '');
  try {
    const { domainsEnabled, siteUrlForUser } = require('./tenantDomain');
    if (!domainsEnabled() || !to) return fallback;
    const User = require('../models/User');
    const recipient = await User.findOne({ email: String(to).toLowerCase().trim() })
      .select('parentAdminId').lean();
    return await siteUrlForUser(recipient);
  } catch {
    return fallback;
  }
}

function commonTemplateVars() {
  const siteUrl = (process.env.PUBLIC_SITE_URL || 'https://dhanfunded.com').replace(/\/$/, '');
  return {
    siteUrl,
    loginUrl: `${siteUrl}/login`,
    // Templates render this inside a 64x64 rounded tile, so it must be the
    // square mark, not the wide wordmark.
    bannerUrl: `${siteUrl}/brand/logo-mark-v2.png`,
    supportEmail: process.env.SUPPORT_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || 'support@dhanfunded.com',
    year: String(new Date().getFullYear())
  };
}

async function sendSignupOtpEmail(to, code) {
  const vars = { ...commonTemplateVars(), code, otp: code, expiryMinutes: '10' };
  const rendered = await emailTemplateService.getRenderedForSend('signup_otp', vars);
  if (rendered) {
    await sendMail({
      to,
      subject: rendered.subject,
      text: rendered.text || `Your signup verification code is: ${code}`,
      html: rendered.html || rendered.text
    });
    return;
  }
  const subject = 'Your DhanFunded verification code';
  const text = `Your signup verification code is: ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.`;
  const html = `
    <p>Your signup verification code is:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>
    <p>This code expires in <strong>10 minutes</strong>.</p>
    <p>If you did not request this, you can ignore this email.</p>
  `;
  await sendMail({ to, subject, text, html });
}

async function sendPasswordResetOtpEmail(to, code) {
  const vars = { ...commonTemplateVars(), code, otp: code, expiryMinutes: '15' };
  const rendered = await emailTemplateService.getRenderedForSend('password_reset', vars);
  if (rendered) {
    await sendMail({
      to,
      subject: rendered.subject,
      text: rendered.text || `Your password reset code is: ${code}`,
      html: rendered.html || rendered.text
    });
    return;
  }
  const subject = 'Your DhanFunded password reset code';
  const text = `Your password reset code is: ${code}\n\nIt expires in 15 minutes. If you did not request this, ignore this email.`;
  const html = `
    <p>Your password reset code is:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>
    <p>This code expires in <strong>15 minutes</strong>.</p>
    <p>If you did not request a reset, ignore this email.</p>
  `;
  await sendMail({ to, subject, text, html });
}

async function sendWelcomeEmail(to, { name, userId } = {}) {
  // Try the admin-managed template first so marketing can edit copy from the
  // panel; fall back to a hard-coded design if the template isn't seeded yet.
  const safeName = String(name || '').trim() || 'Trader';
  const safeUserId = String(userId || '').trim();
  const siteUrl = await siteUrlForRecipient(to);
  // Variable bag must match the keys the DB template uses ({{userName}},
  // {{userId}}, {{loginUrl}}, {{siteUrl}}, {{bannerUrl}}, {{year}}). We pass
  // BOTH `name` and `userName` so older templates and the new one both render.
  const vars = {
    userName: safeName,
    name: safeName,
    userId: safeUserId,
    loginUrl: `${siteUrl}/login`,
    siteUrl,
    supportEmail: process.env.SUPPORT_EMAIL || 'support@dhanfunded.com',
    // The templates render this in a 64x64 rounded tile, so it must be the
    // SQUARE mark — favicon.png is exactly that, and already deployed.
    bannerUrl: `${siteUrl}/brand/logo-mark-v2.png`,
    year: String(new Date().getFullYear())
  };

  try {
    const rendered = await emailTemplateService.getRenderedForSend('welcome', vars);
    if (rendered) {
      await sendMail({ to, subject: rendered.subject, text: rendered.text, html: rendered.html || rendered.text });
      return;
    }
  } catch (_) {
    /* fall through to hard-coded copy */
  }

  // The DB template renders bannerUrl in a 64x64 tile (square mark); this
  // fallback HTML puts it in a 600x200 header, so it wants the wide wordmark.
  const bannerUrl = `${siteUrl}/brand/email-banner.png`;
  const subject = `Welcome to DhanFunded, ${safeName} — your funded journey starts now`;

  const text = [
    `Hi ${safeName},`,
    '',
    'Welcome aboard! Your DhanFunded account is live and ready.',
    'You now have access to India\'s most trader-friendly prop firm — get funded, trade NIFTY, BANKNIFTY, SENSEX & more, and keep up to 80% of the profit.',
    '',
    safeUserId ? `Your User ID: ${safeUserId}` : null,
    '',
    '═══ LIMITED-TIME OFFER ═══',
    'Use code WELCOME10 at checkout for 10% OFF on your first challenge.',
    '',
    '═══ PICK YOUR CHALLENGE ═══',
    '',
    '🚀 INSTANT — No evaluation, trade from day one',
    '   • Profit Target: 8%   |   Daily DD: 3%   |   Max DD: 6%',
    '   • Account sizes from ₹1,00,000 to ₹25,00,000',
    '   • Starts at ₹6,000 (₹5,400 with WELCOME10)',
    '',
    '⚡ 1-STEP — Single phase, most popular',
    '   • Profit Target: 10%   |   Daily DD: 4%   |   Max DD: 8%',
    '   • News trading allowed | Fee credited back on first payout',
    '   • Starts at ₹4,600 (₹4,140 with WELCOME10)',
    '',
    '🎯 2-STEP — Lowest entry, two phases',
    '   • Phase 1: 8% target | Phase 2: 5% target',
    '   • Cheapest way to get funded — starts at ₹3,000',
    '',
    '═══ WHAT YOU GET ═══',
    '  • Up to 80% profit split on funded accounts',
    '  • Bi-weekly payouts straight to your bank (after KYC)',
    '  • Trade NSE / NFO / BSE / BFO / MCX',
    '  • Real-time charts, fast order execution',
    '  • WhatsApp support that actually replies',
    '',
    '═══ NEXT STEP ═══',
    `1. Login → ${siteUrl}/login`,
    '2. Pick a challenge & apply WELCOME10',
    '3. Fund your wallet, hit the target, get paid',
    '',
    '─── Need help? ───',
    'Email:    support@dhanfunded.com',
    'WhatsApp: +91 8367045119',
    'Telegram: @dhanfunded',
    '',
    'Trade safe — see you on the charts!',
    '— The DhanFunded team'
  ].filter(Boolean).join('\n');

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Welcome to DhanFunded</title>
</head>
<body style="margin:0;padding:0;background:#EBF1F4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0A2130;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EBF1F4;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(13,15,26,0.08);">

    <tr><td style="padding:0;background:linear-gradient(135deg,#0B8F62 0%,#0E7C8C 100%);">
      <a href="${siteUrl}" style="display:block;text-decoration:none;color:#fff;">
        <img src="${bannerUrl}" alt="DhanFunded" width="600" height="200" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
        <div style="padding:32px 28px;text-align:center;">
          <h1 style="margin:0 0 8px 0;font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#fff;">Welcome aboard, ${safeName}!</h1>
          <p style="margin:0;font-size:15px;line-height:1.55;color:rgba(255,255,255,0.92);">Your funded-trader journey starts today. Trade India's biggest markets with our capital — and keep up to 80% of the profit.</p>
        </div>
      </a>
    </td></tr>

    ${safeUserId ? `
    <tr><td style="padding:20px 28px 0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7FBF9;border:1px solid #DCE9E2;border-radius:10px;">
        <tr><td style="padding:14px 18px;font-size:14px;color:#4B6357;">
          <strong style="color:#0A2130;">Your User ID:</strong>
          <span style="font-family:'Courier New',monospace;background:#fff;padding:3px 10px;border-radius:4px;border:1px solid #DCE9E2;color:#0B8F62;font-weight:700;margin-left:8px;">${safeUserId}</span>
        </td></tr>
      </table>
    </td></tr>` : ''}

    <tr><td style="padding:24px 28px 0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#FFF7ED 0%,#FED7AA 100%);border:2px dashed #F59E0B;border-radius:12px;">
        <tr><td style="padding:18px 20px;text-align:center;">
          <p style="margin:0 0 6px 0;font-size:11px;font-weight:800;letter-spacing:2px;color:#B45309;text-transform:uppercase;">🎉 Limited-Time Offer</p>
          <p style="margin:0 0 8px 0;font-size:20px;font-weight:800;color:#0A2130;">Get 10% OFF your first challenge</p>
          <p style="margin:0;font-size:13px;color:#78350F;">Use code <span style="background:#0A2130;color:#FBBF24;padding:4px 12px;border-radius:6px;font-family:'Courier New',monospace;font-weight:800;letter-spacing:1px;">WELCOME10</span> at checkout</p>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:28px 28px 0 28px;">
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:800;color:#0A2130;letter-spacing:-0.01em;">Pick your challenge</h2>
      <p style="margin:0 0 16px 0;font-size:14px;color:#6B7080;">Three paths, one goal — get funded.</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;background:#F7FBF9;border:1px solid #DCE9E2;border-radius:10px;border-left:4px solid #10B981;">
        <tr><td style="padding:16px 18px;">
          <p style="margin:0 0 4px 0;font-size:11px;font-weight:800;color:#10B981;letter-spacing:1.5px;">🚀 INSTANT · NO EVALUATION</p>
          <p style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:#0A2130;">Trade from day one</p>
          <p style="margin:0 0 6px 0;font-size:13px;color:#4B6357;line-height:1.55;">Profit Target <strong>8%</strong> · Daily DD <strong>3%</strong> · Max DD <strong>6%</strong></p>
          <p style="margin:0;font-size:13px;color:#6B7080;">Accounts ₹1L–₹25L · From <strong style="color:#10B981;">₹5,400 with WELCOME10</strong></p>
        </td></tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;background:#F7FBF9;border:1px solid #DCE9E2;border-radius:10px;border-left:4px solid #0B8F62;">
        <tr><td style="padding:16px 18px;">
          <p style="margin:0 0 4px 0;font-size:11px;font-weight:800;color:#0B8F62;letter-spacing:1.5px;">⚡ 1-STEP · MOST POPULAR</p>
          <p style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:#0A2130;">One phase, full freedom</p>
          <p style="margin:0 0 6px 0;font-size:13px;color:#4B6357;line-height:1.55;">Profit Target <strong>10%</strong> · Daily DD <strong>4%</strong> · Max DD <strong>8%</strong> · News trading <strong>allowed</strong></p>
          <p style="margin:0;font-size:13px;color:#6B7080;">Fee credited back on first payout · From <strong style="color:#10B981;">₹4,140 with WELCOME10</strong></p>
        </td></tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7FBF9;border:1px solid #DCE9E2;border-radius:10px;border-left:4px solid #8B5CF6;">
        <tr><td style="padding:16px 18px;">
          <p style="margin:0 0 4px 0;font-size:11px;font-weight:800;color:#8B5CF6;letter-spacing:1.5px;">🎯 2-STEP · LOWEST ENTRY</p>
          <p style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:#0A2130;">Two phases, easier targets</p>
          <p style="margin:0 0 6px 0;font-size:13px;color:#4B6357;line-height:1.55;">Phase 1: <strong>8%</strong> target · Phase 2: <strong>5%</strong> target · Daily DD <strong>4%</strong></p>
          <p style="margin:0;font-size:13px;color:#6B7080;">Cheapest way to get funded · From <strong style="color:#10B981;">₹2,700 with WELCOME10</strong></p>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:28px 28px 0 28px;">
      <h2 style="margin:0 0 14px 0;font-size:20px;font-weight:800;color:#0A2130;letter-spacing:-0.01em;">What you get</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:6px 0;font-size:14px;color:#4B6357;line-height:1.6;"><strong style="color:#10B981;">✓</strong>&nbsp;&nbsp;Up to <strong>80% profit split</strong> on funded accounts</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#4B6357;line-height:1.6;"><strong style="color:#10B981;">✓</strong>&nbsp;&nbsp;Bi-weekly payouts straight to your bank (after KYC)</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#4B6357;line-height:1.6;"><strong style="color:#10B981;">✓</strong>&nbsp;&nbsp;Trade <strong>NSE / NFO / BSE / BFO / MCX</strong> — NIFTY, BANKNIFTY, SENSEX, TCS &amp; more</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#4B6357;line-height:1.6;"><strong style="color:#10B981;">✓</strong>&nbsp;&nbsp;Real-time charts &amp; fast order execution via Zerodha integration</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#4B6357;line-height:1.6;"><strong style="color:#10B981;">✓</strong>&nbsp;&nbsp;Auto square-off at 15:15 IST — no overnight surprises</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#4B6357;line-height:1.6;"><strong style="color:#10B981;">✓</strong>&nbsp;&nbsp;WhatsApp support that actually replies</td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:28px;text-align:center;">
      <a href="${siteUrl}/login" style="display:inline-block;background:linear-gradient(135deg,#0B8F62 0%,#0E7C8C 100%);color:#fff;text-decoration:none;padding:14px 36px;border-radius:999px;font-weight:700;font-size:15px;box-shadow:0 6px 20px rgba(43,78,255,0.35);">Login &amp; Start Trading →</a>
      <p style="margin:14px 0 0 0;font-size:12px;color:#9FB5AB;">Use code <strong style="color:#F59E0B;">WELCOME10</strong> at checkout for 10% off your first challenge</p>
    </td></tr>

    <tr><td style="padding:0 28px 28px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0C0C1D;border-radius:12px;">
        <tr><td style="padding:22px 24px;">
          <p style="margin:0 0 12px 0;font-size:13px;font-weight:800;color:#fff;letter-spacing:1px;text-transform:uppercase;">Need help? We're here.</p>
          <p style="margin:0 0 6px 0;font-size:13px;color:#9FB5AB;line-height:1.7;">📧&nbsp; <a href="mailto:support@dhanfunded.com" style="color:#49E8F0;text-decoration:none;">support@dhanfunded.com</a></p>
          <p style="margin:0 0 6px 0;font-size:13px;color:#9FB5AB;line-height:1.7;">📞&nbsp; <a href="tel:+918367045119" style="color:#49E8F0;text-decoration:none;">+91 8367045119</a> &nbsp;·&nbsp; Mon–Sat 10 AM – 6 PM IST</p>
          <p style="margin:0 0 6px 0;font-size:13px;color:#9FB5AB;line-height:1.7;">💬&nbsp; <a href="https://wa.me/918367045119" style="color:#49E8F0;text-decoration:none;">WhatsApp +91 8367045119</a></p>
          <p style="margin:0;font-size:13px;color:#9FB5AB;line-height:1.7;">📱&nbsp; <a href="https://t.me/dhanfunded" style="color:#49E8F0;text-decoration:none;">Telegram @dhanfunded</a></p>
        </td></tr>
      </table>
    </td></tr>

  </table>

  <p style="margin:18px 0 0 0;text-align:center;font-size:11px;color:#9FB5AB;">© ${vars.year} DhanFunded. All rights reserved.<br>You're receiving this because you registered an account at <a href="${siteUrl}" style="color:#9FB5AB;">${siteUrl.replace(/^https?:\/\//, '')}</a>.</p>

</td></tr>
</table>
</body>
</html>
  `.trim();

  await sendMail({ to, subject, text, html });
}

/**
 * Fire-and-forget admin notification. Routes pending-approval events
 * (challenge buys, user withdrawals, IB withdrawals) to the support inbox
 * with a colour-coded email so the team sees them in their normal mail
 * client without polling the admin panel. Errors are swallowed — never
 * block the user request on SMTP issues.
 *
 * @param {Object} opts
 * @param {'challenge_buy'|'user_withdrawal'|'user_deposit'|'ib_withdrawal'} opts.type
 * @param {string} opts.title       — short headline ("New challenge buy", etc.)
 * @param {string} [opts.subtitle]  — secondary line under headline
 * @param {Object} [opts.user]      — { name, email, phone, oderId }
 * @param {Array<{label:string,value:string}>} [opts.fields] — table rows
 * @param {string} [opts.actionUrl] — link to admin panel for approval
 * @param {string} [opts.actionLabel='Open in Admin Panel']
 */
async function sendAdminNotification({ type, title, subtitle, user, fields = [], actionUrl, actionLabel = 'Open in Admin Panel' } = {}) {
  if (!isSmtpConfigured()) return;
  const supportInbox = (process.env.ADMIN_NOTIFICATION_INBOX || process.env.CONTACT_INBOX || process.env.SMTP_USER || '').trim();
  if (!supportInbox) return;

  const ACCENTS = {
    challenge_buy:    { color: '#10B981', icon: '🚀', tag: 'CHALLENGE PURCHASE' },
    user_withdrawal:  { color: '#F59E0B', icon: '💸', tag: 'USER WITHDRAWAL' },
    user_deposit:     { color: '#0B8F62', icon: '💰', tag: 'USER DEPOSIT' },
    ib_withdrawal:    { color: '#8B5CF6', icon: '🤝', tag: 'IB WITHDRAWAL' }
  };
  const accent = ACCENTS[type] || { color: '#0B8F62', icon: '🔔', tag: 'ADMIN NOTIFICATION' };

  const safeTitle = String(title || 'Admin notification').trim();
  const safeSubtitle = subtitle ? String(subtitle).trim() : '';
  const adminUrl = actionUrl || (process.env.ADMIN_URL || 'https://admin.dhanfunded.com');

  const userBlock = user ? [
    user.name && { label: 'User', value: String(user.name) },
    user.oderId && { label: 'User ID', value: String(user.oderId) },
    user.email && { label: 'Email', value: String(user.email) },
    user.phone && { label: 'Phone', value: String(user.phone) }
  ].filter(Boolean) : [];

  const allFields = [...userBlock, ...fields].filter(Boolean);

  const text = [
    `[${accent.tag}] ${safeTitle}`,
    safeSubtitle ? safeSubtitle : null,
    '',
    ...allFields.map(f => `${f.label}: ${f.value}`),
    '',
    `Open admin panel: ${adminUrl}`
  ].filter(Boolean).join('\n');

  const fieldsHtml = allFields.map((f) => `
    <tr>
      <td style="padding:8px 12px;background:#F7FBF9;border:1px solid #DCE9E2;font-size:13px;color:#6B7080;width:140px;">${f.label}</td>
      <td style="padding:8px 12px;border:1px solid #DCE9E2;font-size:13px;color:#0A2130;font-weight:600;">${String(f.value).replace(/[<>]/g, (c) => c === '<' ? '&lt;' : '&gt;')}</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#0A2130;background:#EBF1F4;padding:24px;">
      <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(13,15,26,0.08);">
        <div style="background:linear-gradient(135deg,${accent.color} 0%,${accent.color}dd 100%);padding:20px 24px;color:#fff;">
          <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:2px;color:rgba(255,255,255,0.85);text-transform:uppercase;">${accent.icon} ${accent.tag}</p>
          <h1 style="margin:6px 0 0 0;font-size:20px;font-weight:700;line-height:1.3;">${safeTitle}</h1>
          ${safeSubtitle ? `<p style="margin:6px 0 0 0;font-size:13px;color:rgba(255,255,255,0.92);">${safeSubtitle}</p>` : ''}
        </div>
        <div style="padding:20px 24px;">
          <table style="width:100%;border-collapse:collapse;">${fieldsHtml}</table>
          <div style="text-align:center;margin-top:22px;">
            <a href="${adminUrl}" style="display:inline-block;background:${accent.color};color:#fff;text-decoration:none;padding:11px 28px;border-radius:999px;font-weight:700;font-size:13px;">${actionLabel}</a>
          </div>
          <p style="margin:18px 0 0 0;font-size:11px;color:#9FB5AB;text-align:center;">Automated notification · ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
        </div>
      </div>
    </div>
  `;

  try {
    await sendMail({
      to: supportInbox,
      subject: `[${accent.tag}] ${safeTitle}`,
      text,
      html
    });
  } catch (err) {
    console.error('[AdminNotification] send failed:', err.message);
  }
}

/**
 * Generic sender for any admin-managed template (by slug). Injects the common
 * brand variables (siteUrl / loginUrl / dashboardUrl / bannerUrl / supportEmail
 * / year) so every template renders consistently, merges the caller's vars, and
 * sends. Fire-and-forget safe: returns false (never throws) when SMTP is off,
 * the recipient is missing, or the template is absent/disabled — so a failed
 * email can never break the request flow that triggered it.
 */
async function sendTemplatedEmail(slug, to, vars = {}) {
  try {
    if (!isSmtpConfigured() || !to) return false;
    const siteUrl = await siteUrlForRecipient(to);
    const merged = {
      siteUrl,
      loginUrl: `${siteUrl}/login`,
      dashboardUrl: `${siteUrl}/app/market`,
      bannerUrl: `${siteUrl}/brand/logo-mark-v2.png`,
      supportEmail: process.env.SMTP_FROM || process.env.SMTP_USER || 'support@dhanfunded.com',
      reviewUrl: siteUrl,
      year: String(new Date().getFullYear()),
      ...vars
    };
    const rendered = await emailTemplateService.getRenderedForSend(slug, merged);
    if (!rendered) return false;
    await sendMail({ to, subject: rendered.subject, text: rendered.text, html: rendered.html || rendered.text });
    return true;
  } catch (e) {
    console.error(`[email] sendTemplatedEmail(${slug}) failed:`, e.message);
    return false;
  }
}

module.exports = {
  commonTemplateVars,
  isSmtpConfigured,
  createTransport,
  verifySmtpConnection,
  sendMail,
  sendSignupOtpEmail,
  sendPasswordResetOtpEmail,
  sendWelcomeEmail,
  sendTemplatedEmail,
  sendAdminNotification,
  getSmtpConfig,
  getSmtpStatusForAdmin
};
