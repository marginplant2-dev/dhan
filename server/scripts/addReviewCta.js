/**
 * Put a Trustpilot review button into the two emails that land at the happiest
 * moment: payout processed, and evaluation passed.
 *
 * Asking right after a payout is the only invitation that reliably works, and
 * it goes to every recipient of those emails — Trustpilot's guidelines forbid
 * inviting only the customers you expect to be happy.
 *
 * Idempotent: re-running does nothing once the block is present.
 *
 * Run from /var/www/dhanfunded/server: node scripts/addReviewCta.js
 */
const m = require('mongoose');
require('dotenv').config();

const REVIEW_URL = 'https://www.trustpilot.com/evaluate/dhanfunded.com';
const MARK = 'data-pf-review-cta';

const BLOCK = `<tr><td ${MARK}="1" style="padding:24px 28px 0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFBFD;border:1px solid #E8EAF0;border-radius:12px;">
<tr><td style="padding:20px 22px;text-align:center;">
<p style="margin:0 0 4px 0;font-size:15px;font-weight:700;color:#0D0F1A;">How was your experience?</p>
<p style="margin:0 0 14px 0;font-size:13px;color:#6B7080;line-height:1.6;">A minute of your time helps other Indian traders decide. Honest feedback either way.</p>
<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td style="border-radius:10px;background:#00B67A;">
<a href="${REVIEW_URL}" style="display:inline-block;padding:12px 30px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">Leave a review on Trustpilot</a>
</td></tr></table>
</td></tr></table></td></tr>
`;

const TEXT_LINE = `\n\nHow was your experience? Leave a review: ${REVIEW_URL}\n`;

const SLUGS = ['payout_processed', 'challenge_passed'];

function insert(html) {
  if (html.includes(MARK)) return null;                   // already added
  // Place it above the footer (the row carrying the top border), else at the
  // end of the card table.
  const footer = html.search(/<tr><td[^>]*border-top:1px solid/i);
  if (footer !== -1) return html.slice(0, footer) + BLOCK + html.slice(footer);
  const endCard = html.lastIndexOf('</table></td></tr></table>');
  if (endCard !== -1) return html.slice(0, endCard) + BLOCK + html.slice(endCard);
  return null;
}

(async () => {
  await m.connect(process.env.MONGODB_URI);
  const col = m.connection.db.collection('emailtemplates');
  for (const slug of SLUGS) {
    const doc = await col.findOne({ slug });
    if (!doc) { console.log(slug.padEnd(20), 'not found'); continue; }
    const html = insert(String(doc.htmlBody || ''));
    if (!html) { console.log(slug.padEnd(20), 'already has the review block — skipped'); continue; }
    const text = String(doc.textBody || '');
    await col.updateOne(
      { _id: doc._id },
      { $set: { htmlBody: html, textBody: text.includes(REVIEW_URL) ? text : text + TEXT_LINE } }
    );
    console.log(slug.padEnd(20), 'review button added (html', doc.htmlBody.length, '->', html.length + ')');
  }
  await m.disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
