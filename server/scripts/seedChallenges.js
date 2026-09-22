/**
 * Seed the three programmes — prices and rules exactly as specified.
 *
 *   node scripts/seedChallenges.js            apply (upsert by name)
 *   node scripts/seedChallenges.js --verify   read back and assert every field
 *
 * Upserts by name, so re-running is safe: it rewrites tiers, rules and funded
 * settings to the values below and leaves everything else (ids, sortOrder,
 * existing accounts) alone.
 *
 * The funded drawdowns are deliberately NOT the evaluation ones: 1-Step and
 * Instant tighten once funded, 2-Step stays where it was. Don't "simplify"
 * them into a single pair.
 */

const mongoose = require('mongoose');
require('dotenv').config();
const Challenge = require('../models/Challenge');

const L = 100000;

// Rules every programme shares, so the per-programme blocks below only carry
// what actually differs.
const COMMON_RULES = {
  maxLossPerTradePercent: 2,
  maxOneDayProfitPercentOfTarget: 40,
  tradingDaysRequired: 5,
  minTradesRequired: 1,
  maxLeverage: 100,
  minLotSize: 0.01,
  maxLotSize: 100,
  allowFractionalLots: false,
  minTradeHoldTimeSeconds: 0,
  maxTradeHoldTimeSeconds: null,
  allowNewsTrading: true,
  allowWeekendHolding: false,
  stopLossMandatory: false,
  takeProfitMandatory: false,
  maxTradesPerDay: null,
  maxTotalTrades: null,
  maxConcurrentTrades: null,
  allowedSymbols: [],
  allowedSegments: [],
  maxDailyDrawdownAmount: null,
  maxOverallDrawdownAmount: null,
  consistencyRulePercent: null,
  tradingHoursStart: null,
  tradingHoursEnd: null,
};

const COMMON_FUNDED = {
  withdrawalFrequencyDays: 14,
  maxWithdrawalPercent: 5,
  minProfitPercentForPayout: 5,
  minDaysSinceFundedForPayout: 14,
  minTradingDaysForPayout: 5,
  consistencyMaxDayPercent: 30,
  accountLifetimeDays: 30,
};

const tier = (lakhs, fee, popular = false) => ({
  fundSize: lakhs * L,
  challengeFee: fee,
  label: '',
  isPopular: popular,
});

const PROGRAMMES = [
  {
    name: '1-Step Evaluation',
    description: 'One phase at a 10% target, then a funded account with an 80% profit share.',
    stepsCount: 1,
    sortOrder: 1,
    tiers: [tier(1, 3900), tier(2, 5999), tier(5, 11000, true), tier(10, 16299), tier(25, 26000)],
    rules: {
      ...COMMON_RULES,
      profitTargetPhase1Percent: 10,
      profitTargetPhase2Percent: null,
      profitTargetInstantPercent: null,
      maxDailyDrawdownPercent: 4,
      maxOverallDrawdownPercent: 8,
      challengeExpiryDays: 45,
    },
    fundedSettings: {
      ...COMMON_FUNDED,
      profitSplitPercent: 80,
      maxDailyDrawdownPercent: 3,
      maxOverallDrawdownPercent: 6,
    },
  },
  {
    name: '2-Step Evaluation',
    description: 'Two phases at 8% then 5%, then a funded account with an 80% profit share.',
    stepsCount: 2,
    sortOrder: 2,
    tiers: [tier(1, 2700), tier(2, 4500), tier(5, 7500, true), tier(10, 12999), tier(20, 17500), tier(25, 28000)],
    rules: {
      ...COMMON_RULES,
      profitTargetPhase1Percent: 8,
      profitTargetPhase2Percent: 5,
      profitTargetInstantPercent: null,
      maxDailyDrawdownPercent: 4,
      maxOverallDrawdownPercent: 10,
      challengeExpiryDays: 60,
    },
    fundedSettings: {
      ...COMMON_FUNDED,
      profitSplitPercent: 80,
      maxDailyDrawdownPercent: 4,
      maxOverallDrawdownPercent: 10,
    },
  },
  {
    name: 'Instant Funding',
    description: 'Funded from day one at a 5% target, with a 70% profit share.',
    stepsCount: 0,
    sortOrder: 3,
    tiers: [tier(1, 4100), tier(2, 8900), tier(5, 16999, true), tier(10, 23000), tier(20, 39000)],
    rules: {
      ...COMMON_RULES,
      profitTargetPhase1Percent: null,
      profitTargetPhase2Percent: null,
      profitTargetInstantPercent: 5,
      maxDailyDrawdownPercent: 3,
      maxOverallDrawdownPercent: 6,
      challengeExpiryDays: 30,
    },
    fundedSettings: {
      ...COMMON_FUNDED,
      profitSplitPercent: 70,
      maxDailyDrawdownPercent: 3,
      maxOverallDrawdownPercent: 6,
    },
  },
];

async function connect() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Set MONGODB_URI before running this.');
  await mongoose.connect(uri);
}

async function apply() {
  for (const p of PROGRAMMES) {
    const doc = await Challenge.findOneAndUpdate(
      { name: p.name },
      { $set: { ...p, currency: 'INR', isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const fees = doc.tiers.map((t) => `${t.fundSize / L}L:₹${t.challengeFee}`).join('  ');
    console.log(`${doc.name.padEnd(20)} steps=${doc.stepsCount}  ${fees}`);
  }
}

async function verify() {
  let bad = 0;
  const complain = (m) => { console.error('  ✗ ' + m); bad++; };

  for (const p of PROGRAMMES) {
    const doc = await Challenge.findOne({ name: p.name });
    if (!doc) { complain(`${p.name} missing`); continue; }
    console.log(p.name);

    if (doc.stepsCount !== p.stepsCount) complain(`stepsCount ${doc.stepsCount} ≠ ${p.stepsCount}`);
    if (doc.tiers.length !== p.tiers.length) complain(`${doc.tiers.length} tiers ≠ ${p.tiers.length}`);
    p.tiers.forEach((t, i) => {
      const got = doc.tiers[i];
      if (!got) return complain(`tier ${i} missing`);
      if (got.fundSize !== t.fundSize) complain(`tier ${i} fundSize ${got.fundSize} ≠ ${t.fundSize}`);
      if (got.challengeFee !== t.challengeFee) complain(`tier ${i} fee ${got.challengeFee} ≠ ${t.challengeFee}`);
      if (!!got.isPopular !== t.isPopular) complain(`tier ${i} isPopular ${got.isPopular} ≠ ${t.isPopular}`);
    });
    for (const [k, want] of Object.entries(p.rules)) {
      const got = doc.rules[k];
      const same = Array.isArray(want) ? (got || []).length === want.length : String(got) === String(want);
      if (!same) complain(`rules.${k} = ${got} ≠ ${want}`);
    }
    for (const [k, want] of Object.entries(p.fundedSettings)) {
      if (String(doc.fundedSettings[k]) !== String(want)) {
        complain(`fundedSettings.${k} = ${doc.fundedSettings[k]} ≠ ${want}`);
      }
    }
  }

  // The reset fee is derived, never stored: half the fee snapshotted at
  // purchase, so a coupon-discounted purchase still resets at the full half.
  const twoStep = PROGRAMMES.find((p) => p.stepsCount === 2);
  const fiveLakh = twoStep.tiers.find((t) => t.fundSize === 5 * L);
  if (Math.round(fiveLakh.challengeFee * 0.5) !== 3750) complain('₹5L 2-Step reset fee ≠ ₹3,750');

  console.log(bad ? `\n${bad} mismatch(es)` : '\nAll programmes match the spec.');
  return bad;
}

(async () => {
  await connect();
  const bad = process.argv.includes('--verify') ? await verify() : (await apply(), 0);
  await mongoose.disconnect();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
