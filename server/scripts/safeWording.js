/**
 * Same wording fix, for the copy that lives in MongoDB: blog posts, FAQs, the
 * prop settings description and the email templates.
 *
 * Phrase-level replacements only — nothing that changes an offer or a number.
 * The "evaluation fee is credited back on the first payout" claim in
 * how-payouts-work is deliberately NOT touched: that is a refund promise, and
 * whether it is true is a business fact the owner has to confirm.
 *
 * Run from /var/www/dhanfunded/server: node scripts/safeWording.js
 */
const m = require('mongoose');
require('dotenv').config();

const SWAPS = [
  // capital -> simulated account
  ['We give you up to ₹50 Lakhs in simulated capital — with real profit sharing on your performance.',
   'You get a simulated account of up to ₹50 Lakh, with a performance-based reward share under the programme terms.'],
  ['We give you up to ₹50 Lakhs in simulated capital — with <strong>real profit sharing</strong> on your performance.',
   'You get a simulated account of up to <strong>₹50 Lakh</strong>, with a performance-based reward share under the programme terms.'],
  ['Trade with our capital. Pass the challenge and get funded.',
   'Trade a simulated account. Pass the evaluation and get a funded simulated account.'],
  ['access to firm capital instead of forcing them to risk their own savings',
   'access to a simulated account instead of forcing them to risk their own savings'],
  ['Trading your own money feels different from trading firm capital.',
   'Trading your own money feels different from trading a simulated account.'],
  ['on firm capital with INR payouts', 'in a simulated account with INR payouts'],
  ['the firm provides the capital', 'the platform provides the simulated account'],
  ['Funded capital flips this.', 'A funded simulated account flips this.'],
  ['our capital', 'a simulated account'],
  ['firm capital', 'a simulated account'],
  // returns / income / earnings -> reward
  ['and now we are talking about a real income', 'and now we are talking about a meaningful reward'],
  ['Your earnings reflect your skill and hard work.', 'Your reward reflects your skill and discipline.'],
  // profit sharing -> reward share
  ['profit-sharing of up to 80% of simulated profits', 'a reward share of up to 80% of simulated profits'],
  ['every subsequent payout is pure profit share', 'every subsequent payout is your reward share'],
  ['they share the pr', 'they share the pr'], // no-op guard, keeps excerpt intact
];

const COLLECTIONS = ['blogposts', 'faqs', 'propsettings', 'emailtemplates'];

(async () => {
  await m.connect(process.env.MONGODB_URI);
  let changedDocs = 0;
  let changedFields = 0;
  for (const col of COLLECTIONS) {
    const c = m.connection.db.collection(col);
    const rows = await c.find({}).toArray();
    for (const r of rows) {
      const set = {};
      for (const [k, v] of Object.entries(r)) {
        if (k === '_id') continue;
        if (typeof v === 'string') {
          let out = v;
          for (const [a, b] of SWAPS) if (a !== b) out = out.split(a).join(b);
          if (out !== v) { set[k] = out; changedFields++; }
        } else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
          const out = v.map((x) => {
            let o = x;
            for (const [a, b] of SWAPS) if (a !== b) o = o.split(a).join(b);
            return o;
          });
          if (JSON.stringify(out) !== JSON.stringify(v)) { set[k] = out; changedFields++; }
        }
      }
      if (Object.keys(set).length) {
        await c.updateOne({ _id: r._id }, { $set: set });
        changedDocs++;
        console.log(col.padEnd(16), String(r.slug || r._id).slice(0, 34).padEnd(36), '->', Object.keys(set).join(', '));
      }
    }
  }
  console.log('documents updated:', changedDocs, '| fields updated:', changedFields);
  await m.disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
