/**
 * Regression test: per-user brokerage override must apply to PROP-CHALLENGE
 * option trades (they run through challengePropEngine, not NettingEngine).
 *
 * Bug: computeCommission() read only segment + script layers, never the
 * per-user UserSegmentSettings layer — so a user-wise brokerage set on a
 * NIFTY/index option had zero effect on the actual trade.
 *
 * Run on the server (needs MONGODB_URI): node tests/testUserOptionBrokerage.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
// getEffectiveSettingsForUser resolves through several models via mongoose.model(name);
// the live server loads them all at startup — register them here too.
require('../models/User');
require('../models/Segment');
require('../models/HedgingSegment');
require('../models/ScriptOverride');
require('../models/HedgingScriptOverride');
require('../models/NettingScriptOverride');
const NettingSegment = require('../models/NettingSegment');
const UserSegmentSettings = require('../models/UserSegmentSettings');
const { computeCommission } = require('../services/challengePropEngine.service');

let ok = 0, fail = 0;
const assert = (name, cond, extra = '') => {
  if (cond) { ok++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB Connected\n');

  const seg = await NettingSegment.findOne({ name: 'NSE_OPT' }).select('_id');
  if (!seg) { console.error('NSE_OPT NettingSegment not found — cannot run'); process.exit(1); }

  const userId = new mongoose.Types.ObjectId();       // throwaway user (read path needs no User doc)
  const RATE = 77;                                     // distinctive per-lot rate
  const order = { exchange: 'NSE', symbol: 'NIFTY2650524100CE', side: 'buy' };
  const account = { userId };

  // Baseline BEFORE any user override (proves the override — not a coincidence — is what shows up)
  const before = await computeCommission(account, order, 2, 130, 200, 'open');

  const row = await UserSegmentSettings.create({
    userId, oderId: `TEST_BROKERAGE_${Date.now()}`,
    segmentId: seg._id, segmentName: 'NSE_OPT',
    symbol: 'NIFTY', tradeMode: 'netting', layer: 'user_explicit',
    optionBuyCommission: RATE, optionSellCommission: 11,
    commissionType: 'per_lot', chargeOn: 'both',
  });

  try {
    // BUY open: per-lot RATE × 2 lots
    const buyOpen = await computeCommission(account, order, 2, 130, 200, 'open');
    assert('BUY open picks user optionBuyCommission (77 × 2 = 154)', buyOpen === RATE * 2, `got ${buyOpen} (before=${before})`);

    // chargeOn 'both' → close also charged
    const buyClose = await computeCommission(account, order, 2, 130, 200, 'close');
    assert('BUY close charged too (chargeOn=both) = 154', buyClose === RATE * 2, `got ${buyClose}`);

    // SELL uses the per-side sell rate (11 × 3 = 33), not the buy rate
    const sellOpen = await computeCommission(account, { ...order, side: 'sell', symbol: 'NIFTY2650524100PE' }, 3, 195, 180, 'open');
    assert('SELL open picks user optionSellCommission (11 × 3 = 33)', sellOpen === 11 * 3, `got ${sellOpen}`);

    // A DIFFERENT user (no override) must NOT get this user's rate
    const other = await computeCommission({ userId: new mongoose.Types.ObjectId() }, order, 2, 130, 200, 'open');
    assert('Other user does NOT inherit this override', other === before, `got ${other}, baseline ${before}`);
  } finally {
    await UserSegmentSettings.deleteOne({ _id: row._id });
    console.log('\n🧹 temp override removed');
  }

  console.log(`\n${fail === 0 ? '🎉 PASS' : '💥 FAIL'} — ${ok} passed, ${fail} failed`);
  await mongoose.disconnect();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
