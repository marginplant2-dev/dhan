/**
 * Rebrand an existing database: PropFunded -> DhanFunded, propfunded.in -> dhanfunded.com.
 *
 * The code defaults are already rebranded, but rows seeded BEFORE the rename
 * keep the old copy: EmailTemplate HTML, Faq/BlogPost content, AppSettings
 * (siteName/siteUrl/support email), Banner copy, coupon text. Those are only
 * seeded when missing, so a redeploy never fixes them.
 *
 * Dry run (default, writes nothing):  node scripts/rebrand.js
 * Apply:                              node scripts/rebrand.js --apply
 *
 * Self-check:                         node scripts/rebrand.js --selftest
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Longest/most specific first — 'propfunded.in' must win over 'propfunded'.
const RULES = [
  [/propfunded\.in/g, 'dhanfunded.com'],
  [/PropFunded\.in/g, 'DhanFunded.com'],
  [/PropFunded/g, 'DhanFunded'],
  [/PROPFUNDED/g, 'DHANFUNDED'],
  [/propfunded/g, 'dhanfunded'],
];

function rebrandString(s) {
  return RULES.reduce((out, [re, to]) => out.replace(re, to), s);
}

// Walk any JSON-ish value, rewriting strings in place. _id and Dates are left
// alone: only plain strings carry brand copy.
function rebrandValue(v) {
  if (typeof v === 'string') return rebrandString(v);
  if (Array.isArray(v)) return v.map(rebrandValue);
  if (v && v.constructor === Object) {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = rebrandValue(val);
    return out;
  }
  return v;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Set MONGODB_URI before running this.');

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  let touched = 0;

  for (const { name } of collections) {
    const col = db.collection(name);
    const cursor = col.find({});
    for await (const doc of cursor) {
      const { _id, ...rest } = doc;
      const next = rebrandValue(rest);
      if (JSON.stringify(next) === JSON.stringify(rest)) continue;
      touched++;
      console.log(`${apply ? 'updated' : 'would update'} ${name}/${_id}`);
      if (apply) await col.replaceOne({ _id }, { _id, ...next });
    }
  }

  console.log(`\n${touched} document(s) ${apply ? 'rebranded' : 'would change'}.`);
  if (!touched) console.log('Nothing to do — database is already on the new brand.');
  else if (!apply) console.log('Re-run with --apply to write the changes.');
  await mongoose.disconnect();
}

function selftest() {
  const assert = require('assert');
  assert.strictEqual(rebrandString('Welcome to PropFunded'), 'Welcome to DhanFunded');
  assert.strictEqual(rebrandString('support@propfunded.in'), 'support@dhanfunded.com');
  assert.strictEqual(rebrandString('https://api.propfunded.in/api'), 'https://api.dhanfunded.com/api');
  assert.strictEqual(rebrandString('PROPFUNDED20'), 'DHANFUNDED20');
  assert.deepStrictEqual(
    rebrandValue({ a: 'PropFunded', b: [{ c: 'propfunded.in' }], n: 7, d: null }),
    { a: 'DhanFunded', b: [{ c: 'dhanfunded.com' }], n: 7, d: null },
  );
  // Already-rebranded copy must be a no-op (script is safe to re-run).
  assert.strictEqual(rebrandString('DhanFunded · dhanfunded.com'), 'DhanFunded · dhanfunded.com');
  console.log('rebrand selftest ok');
}

if (process.argv.includes('--selftest')) selftest();
else main().catch((e) => { console.error(e); process.exit(1); });
