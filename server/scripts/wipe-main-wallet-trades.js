/**
 * wipe-main-wallet-trades.js
 *
 * One-shot cleanup script. Deletes every legacy MAIN-wallet trading record
 * because the platform is now prop-only (all user trading happens on
 * ChallengeAccount virtual sub-wallets via ChallengePosition).
 *
 * What it deletes:
 *   - Trade                  (all docs — main-wallet open & closed trade rows)
 *   - NettingPosition        (all docs — aggregated netting positions)
 *   - HedgingPosition        (all docs — hedging positions)
 *   - PendingOrder           (all docs — pending limit/stop orders)
 *
 * What it does NOT touch:
 *   - ChallengePosition      (challenge sub-wallet positions — keep these)
 *   - ChallengeAccount       (the accounts themselves — keep these)
 *   - Transaction            (wallet ledger — deposits/withdrawals stay)
 *   - Users / Wallets        (user data + main wallet balances — keep these)
 *
 * Run with:
 *   node server/scripts/wipe-main-wallet-trades.js
 *
 * Add --dry to preview counts without deleting:
 *   node server/scripts/wipe-main-wallet-trades.js --dry
 */

require('dotenv').config();
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry');

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI not set in .env');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');
  console.log(DRY_RUN ? '=== DRY RUN — no documents will be deleted ===' : '=== LIVE RUN — deletions will be committed ===');

  const Trade = require('../models/Trade');
  const { NettingPosition, HedgingPosition } = require('../models/Position');

  // PendingOrder may or may not exist as its own model; try to load both.
  let PendingOrder = null;
  try { PendingOrder = require('../models/PendingOrder'); } catch (_) { /* optional */ }

  const counts = {};

  counts.trades = await Trade.countDocuments({});
  counts.netting = await NettingPosition.countDocuments({});
  counts.hedging = await HedgingPosition.countDocuments({});
  counts.pending = PendingOrder ? await PendingOrder.countDocuments({}) : 0;

  console.log('\nDocuments to remove:');
  console.log(`  Trade              : ${counts.trades}`);
  console.log(`  NettingPosition    : ${counts.netting}`);
  console.log(`  HedgingPosition    : ${counts.hedging}`);
  console.log(`  PendingOrder       : ${counts.pending}${PendingOrder ? '' : ' (model not present)'}`);

  if (DRY_RUN) {
    console.log('\nDry run complete. Pass no flag to actually delete.');
    await mongoose.disconnect();
    return;
  }

  const t = await Trade.deleteMany({});
  const n = await NettingPosition.deleteMany({});
  const h = await HedgingPosition.deleteMany({});
  const p = PendingOrder ? await PendingOrder.deleteMany({}) : { deletedCount: 0 };

  console.log('\nDeleted:');
  console.log(`  Trade              : ${t.deletedCount}`);
  console.log(`  NettingPosition    : ${n.deletedCount}`);
  console.log(`  HedgingPosition    : ${h.deletedCount}`);
  console.log(`  PendingOrder       : ${p.deletedCount}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
