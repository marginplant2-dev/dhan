/**
 * Ganesh Chaturthi offer mail for the GANESH25 coupon.
 *
 * The copy is built FROM the coupon document (discount and validUntil), so the
 * email can never promise a discount or a deadline the platform will not
 * honour. Branded with the same shell as the automated mails.
 *
 *   node scripts/festivalOffer.js --preview you@example.com   (one test copy)
 *   node scripts/festivalOffer.js --send                      (every user)
 *
 * --send goes to every user with an email address, not a hand-picked list,
 * and pauses between messages so the mailbox is not rate-limited.
 */
const m = require('mongoose');
require('dotenv').config();

// --code <COUPON> picks the coupon; the discount and end date are read from it.
const CODE = process.argv.includes('--code')
  ? String(process.argv[process.argv.indexOf('--code') + 1] || '').trim().toUpperCase()
  : 'GANESH25';
// --window "18-24 September": the human-readable run of the offer, printed
// under the title. The authoritative end date still comes from the coupon.
const OFFER_WINDOW = process.argv.includes('--window')
  ? String(process.argv[process.argv.indexOf('--window') + 1] || '').trim()
  : '';
const DELAY_MS = 1500;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildHtml({ name, brand, discount, until, code, endsOn, window: offerWindow, photo = true }) {
  const hi = name ? `Hi ${esc(name)},<br><br>` : '';
  const programmes = [
    ['2-Step', 'Two phases, the widest room'],
    ['1-Step', 'One phase, straight through'],
    ['Instant', 'Skip the evaluation'],
  ];

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${discount}% off your evaluation</title></head>
<body style="margin:0;padding:0;background:#EEF0F7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0D0F1A;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${discount}% off every DhanFunded evaluation with code ${code} — ends ${endsOn}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF0F7;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 28px rgba(13,15,26,0.10);">

<!-- header -->
<tr><td style="padding:34px 28px 30px 28px;background:linear-gradient(135deg,#0C0C1D 0%,#1E1E3F 55%,#2B4EFF 100%);text-align:center;">
<img src="${brand.bannerUrl}" alt="DhanFunded" width="60" height="60" style="display:inline-block;width:60px;height:60px;border-radius:15px;background:rgba(255,255,255,0.08);padding:6px;border:0;outline:none;" />
<p style="margin:14px 0 0 0;font-size:10.5px;font-weight:800;letter-spacing:2.4px;color:#FBBF24;text-transform:uppercase;">Ganesh Chaturthi offer${offerWindow ? ` &middot; ${offerWindow}` : ''}</p>
<h1 style="margin:10px 0 0 0;font-size:30px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;line-height:1.2;">${discount}% off your<br>evaluation fee</h1>
<p style="margin:12px 0 0 0;font-size:13.5px;color:#C7CBE0;">On every programme &middot; ends ${endsOn}</p>
</td></tr>

${photo ? `<tr><td style="padding:0;">
<img src="${brand.siteUrl}/brand/ganesh-offer.jpg" alt="Ganesh Chaturthi" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr>` : ''}

<!-- intro -->
<tr><td style="padding:30px 30px 0 30px;font-size:15.5px;line-height:1.75;color:#2B2F3A;">
${hi}Ganpati Bappa Morya! To mark the festival, the one-time evaluation fee is <strong>${discount}% lower</strong> on every programme we run.
</td></tr>

<!-- coupon -->
<tr><td style="padding:24px 30px 0 30px;" align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFBFD;border:2px dashed #2B4EFF;border-radius:14px;">
<tr><td style="padding:22px 22px;text-align:center;">
<p style="margin:0 0 8px 0;font-size:10.5px;font-weight:800;letter-spacing:2px;color:#6B7080;text-transform:uppercase;">Use this code at checkout</p>
<p style="margin:0;font-size:32px;font-weight:800;letter-spacing:6px;color:#0D0F1A;font-family:SFMono-Regular,Consolas,monospace;">${code}</p>
<p style="margin:12px 0 0 0;font-size:13px;color:#6B7080;">Valid until <strong style="color:#0D0F1A;">${until}</strong></p>
</td></tr></table></td></tr>

<!-- programmes -->
<tr><td style="padding:26px 30px 0 30px;">
<p style="margin:0 0 12px 0;font-size:10.5px;font-weight:800;letter-spacing:1.8px;color:#9499A8;text-transform:uppercase;">The code works on all three</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>${programmes.map(([t, d]) => `<td width="33%" valign="top" style="padding:0 5px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FC;border-radius:10px;"><tr><td style="padding:14px 12px;text-align:center;">
<p style="margin:0;font-size:14px;font-weight:800;color:#0D0F1A;">${t}</p>
<p style="margin:5px 0 0 0;font-size:11.5px;color:#6B7080;line-height:1.45;">${d}</p>
</td></tr></table></td>`).join('')}</tr>
</table></td></tr>

<!-- CTA -->
<tr><td style="padding:28px 30px 4px 30px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:11px;background:#2B4EFF;">
<a href="${brand.siteUrl}/app/challenges" style="display:inline-block;padding:15px 42px;font-size:15.5px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:11px;">Start an evaluation</a>
</td></tr></table></td></tr>

<!-- what does not change -->
<tr><td style="padding:26px 30px 0 30px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FC;border-radius:12px;">
<tr><td style="padding:18px 20px;">
<p style="margin:0 0 10px 0;font-size:13px;font-weight:800;color:#0D0F1A;">Only the fee changes</p>
<p style="margin:0;font-size:13px;line-height:1.75;color:#4B5165;">
The profit target, the daily and overall loss limits and your share of the profit are exactly what they were &mdash; all of them published on the site before you pay a rupee. Nothing about this offer changes a rule.
</p>
</td></tr></table></td></tr>

<!-- trust -->
<tr><td style="padding:20px 30px 0 30px;text-align:center;">
<p style="margin:0;font-size:12.5px;color:#6B7080;">Rated <strong style="color:#0D0F1A;">4.4 out of 5</strong> on <a href="https://www.trustpilot.com/review/dhanfunded.com" style="color:#2B4EFF;text-decoration:none;">Trustpilot</a></p>
</td></tr>

<!-- footer -->
<tr><td style="padding:26px 30px 30px 30px;border-top:1px solid #F0F2F8;margin-top:22px;">
<p style="margin:18px 0 6px 0;font-size:12px;color:#9499A8;">Questions? <a href="mailto:${brand.supportEmail}" style="color:#2B4EFF;text-decoration:none;">${brand.supportEmail}</a> &middot; <a href="${brand.siteUrl}" style="color:#2B4EFF;text-decoration:none;">${brand.siteUrl}</a></p>
<p style="margin:0;font-size:11px;color:#B6BAC6;line-height:1.5;">Simulated trading environment. Not financial advice. The evaluation fee is at risk if a rule is breached. T&amp;Cs apply.</p>
<p style="margin:8px 0 0 0;font-size:11px;color:#B6BAC6;">Would rather not receive offer emails? Reply with STOP and we will remove you from this list.</p>
<p style="margin:8px 0 0 0;font-size:11px;color:#C7CAD4;">&copy; ${brand.year} DhanFunded. All rights reserved.</p>
</td></tr></table></td></tr></table></body></html>`;
}

const buildText = ({ name, discount, until, code, brand, window: offerWindow }) =>
  `${name ? `Hi ${name},\n\n` : ''}Ganpati Bappa Morya! For Ganesh Chaturthi the one-time evaluation fee is ${discount}% lower on every programme${offerWindow ? ` (${offerWindow})` : ''}.\n\n` +
  `Code: ${code}\nValid until: ${until}\n\nWorks on 2-Step, 1-Step and Instant Funding.\n\n` +
  `Start here: ${brand.siteUrl}/app/challenges\n\n` +
  `Only the fee changes. The profit target, the loss limits and your profit share stay exactly as published.\n\n` +
  `Rated 4.4 out of 5 on Trustpilot: https://www.trustpilot.com/review/dhanfunded.com\n\n` +
  `Questions: ${brand.supportEmail}\nSimulated trading environment. Not financial advice. T&Cs apply.\n` +
  `Would rather not receive offer emails? Reply with STOP.`;

(async () => {
  const preview = process.argv.includes('--preview') ? process.argv[process.argv.indexOf('--preview') + 1] : null;
  const doSend = process.argv.includes('--send');
  const listFile = process.argv.includes('--list') ? process.argv[process.argv.indexOf('--list') + 1] : null;
  // --no-photo: the plain version, without the festival banner image.
  const photo = !process.argv.includes('--no-photo');
  if (!preview && !doSend && !listFile) {
    console.error('Use --preview <email> | --send | --list <file>'); process.exit(1);
  }

  await m.connect(process.env.MONGODB_URI);
  const es = require('../services/email.service');
  const brand = es.commonTemplateVars();

  const coupon = await m.connection.db.collection('globalcoupons').findOne({ code: CODE });
  if (!coupon) throw new Error(`coupon ${CODE} not found`);
  if (coupon.status !== 'active') throw new Error(`coupon ${CODE} is not active (${coupon.status})`);
  const discount = coupon.discountPercent;
  const until = new Date(coupon.validUntil).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric',
  });
  // A countdown in the subject drifts: a mail read tomorrow would claim a day
  // that no longer exists. The date is true whenever it is opened.
  const endsOn = new Date(coupon.validUntil).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long',
  });
  const days = Math.floor((new Date(coupon.validUntil) - Date.now()) / 86400000);
  const subject = `Ganesh Chaturthi offer — ${discount}% off your evaluation (ends ${endsOn})`;
  console.log(`coupon ${CODE}: ${discount}% | valid until ${until} (${days} days left)`);

  if (preview) {
    const vars = { name: 'Vibhooti', brand, discount, until, code: CODE, endsOn, photo, window: OFFER_WINDOW };
    await es.sendMail({ to: preview, subject, text: buildText(vars), html: buildHtml(vars) });
    console.log('preview sent to', preview);
    await m.disconnect();
    return;
  }

  const User = require('../models/User');
  let users;
  if (listFile) {
    // An address list from outside the platform. Anyone who is already a user
    // has had this mail today, so they are dropped rather than mailed twice.
    const fs = require('fs');
    const raw = fs.readFileSync(listFile, 'utf8').split(/\r?\n/).map((l) => l.trim().toLowerCase());
    const emails = [...new Set(raw.filter((l) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l)))];
    const already = new Set(
      (await User.find({ email: { $exists: true, $ne: '' } }).select('email').lean())
        .map((u) => String(u.email).trim().toLowerCase())
    );
    // --no-dedupe: send to every address on the list, platform users included.
    const fresh = process.argv.includes('--no-dedupe') ? emails : emails.filter((e) => !already.has(e));
    console.log(`list: ${raw.length} lines -> ${emails.length} unique addresses, ${emails.length - fresh.length} already users (skipped), ${fresh.length} to send`);
    users = fresh.map((email) => ({ email, name: '' }));
  } else {
    // Placeholder mailboxes (…@noemail.<host>) are not real inboxes, and admin
    // accounts are not customers.
    users = await User.find({
      email: { $exists: true, $ne: '', $not: /noemail\./i },
      role: { $ne: 'admin' },
    }).select('name email oderId').lean();
  }
  console.log('sending to', users.length, 'users...');
  let ok = 0; const failed = [];
  for (const u of users) {
    const vars = { name: u.name, brand, discount, until, code: CODE, endsOn, photo, window: OFFER_WINDOW };
    try {
      await es.sendMail({ to: u.email, subject, text: buildText(vars), html: buildHtml(vars) });
      ok++;
      if (ok % 10 === 0) console.log('  sent', ok, '/', users.length);
    } catch (e) {
      failed.push(`${u.email}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  console.log('DONE — sent:', ok, '| failed:', failed.length);
  failed.slice(0, 10).forEach((f) => console.log('  x', f));
  await m.disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
