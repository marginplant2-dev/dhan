'use strict';

/**
 * One-shot DB cleanup migration.
 *
 * Drops the now-removed `marginCallLevel` and `stopOutLevel` fields from any
 * documents in collections whose Mongoose schemas no longer define them.
 *
 * Mongoose silently ignores extra keys on read, so leftover fields are
 * harmless — this script just reclaims a few bytes of disk per document and
 * keeps the data shape consistent with the code.
 *
 * Idempotent: safe to run multiple times. The second run reports
 * `modified=0` for every collection.
 *
 * Run with:
 *   node server/migrations/2026-04-08_drop_dead_margin_fields.js
 *
 * History:
 *  - The fields used to live on HedgingSegment, NettingSegment, and
 *    TradeModeSettings, but were never read at runtime — see Fix 9 in
 *    agent.md §13. The schemas were cleaned up in the same change. This
 *    migration removes the matching fields from existing data.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const TARGET_COLLECTIONS = ['hedgingsegments', 'nettingsegments', 'trademodesettings'];
const FIELDS_TO_UNSET = { marginCallLevel: '', stopOutLevel: '' };

(async () => {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/bharatfundedtrade';
  console.log(`[migration] Connecting to ${uri}`);
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  let totalModified = 0;
  for (const collName of TARGET_COLLECTIONS) {
    try {
      const result = await db.collection(collName).updateMany({}, { $unset: FIELDS_TO_UNSET });
      console.log(`[migration] ${collName}: matched=${result.matchedCount}, modified=${result.modifiedCount}`);
      totalModified += result.modifiedCount || 0;
    } catch (err) {
      // Collection may not exist yet on a fresh DB — that's fine, skip it.
      if (err && err.codeName === 'NamespaceNotFound') {
        console.log(`[migration] ${collName}: collection does not exist, skipped`);
        continue;
      }
      throw err;
    }
  }

  console.log(`[migration] done. total documents modified: ${totalModified}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error('[migration] FAILED:', e);
  process.exit(1);
});
