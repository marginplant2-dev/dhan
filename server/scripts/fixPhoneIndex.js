/**
 * One-off migration: fix the legacy NON-sparse unique index on User.phone.
 *
 * Symptom it fixes:
 *   Google OAuth error: E11000 duplicate key error ... index: phone_1
 *   dup key: { phone: null }
 *
 * Cause: the live `phone_1` index was created as a plain unique index (before
 * the schema gained sparse/partial). A unique index treats a missing/null
 * phone as the value `null`, so the 2nd phone-less user (e.g. a Google
 * sign-up) collides. Changing the Mongoose schema does NOT rebuild an existing
 * index, so we drop it and recreate it as a PARTIAL unique index that only
 * enforces uniqueness for actual string phone numbers.
 *
 * Run once on each deployment:
 *   cd server && node scripts/fixPhoneIndex.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not set in environment');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const coll = mongoose.connection.collection('users');

  const before = await coll.indexes();
  console.log('Indexes before:', before.map((i) => i.name).join(', '));

  // Drop the legacy phone index (any name variant) if present.
  for (const idx of before) {
    const keys = Object.keys(idx.key || {});
    if (keys.length === 1 && keys[0] === 'phone' && !idx.partialFilterExpression) {
      try {
        await coll.dropIndex(idx.name);
        console.log(`Dropped legacy index "${idx.name}"`);
      } catch (e) {
        console.log(`dropIndex "${idx.name}" skipped:`, e.message);
      }
    }
  }

  // Recreate as a partial-unique index (only real string phones are unique).
  await coll.createIndex(
    { phone: 1 },
    { unique: true, partialFilterExpression: { phone: { $type: 'string' } }, name: 'phone_1' }
  );
  console.log('✅ Created partial-unique index phone_1 (string phones only)');

  const after = await coll.indexes();
  console.log(
    'Indexes after:',
    after.map((i) => `${i.name}${i.partialFilterExpression ? ' (partial)' : ''}`).join(', ')
  );

  await mongoose.disconnect();
  console.log('Done.');
  process.exit(0);
})().catch((e) => {
  console.error('❌ Migration failed:', e);
  process.exit(1);
});
