/**
 * One-time migration: fold any legacy USD balances/transactions into INR.
 *
 * Reads every User + Transaction doc, multiplies USD amounts by a rate,
 * merges them into the INR fields, and marks the user as migrated so
 * re-runs are idempotent.
 *
 * Usage:
 *   DRY_RUN=1 node server/scripts/migrate-usd-to-inr.js   # report only, no writes
 *   RATE=83 node server/scripts/migrate-usd-to-inr.js     # use fixed rate
 *   node server/scripts/migrate-usd-to-inr.js             # uses live rate
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

async function fetchRate() {
  if (process.env.RATE) return Number(process.env.RATE) || 83;
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 5000 });
    if (res.ok) {
      const data = await res.json();
      if (data.rates && data.rates.INR) return data.rates.INR;
    }
  } catch (_) {}
  return 83;
}

async function migrateUsers(rate) {
  const users = await User.find({ 'migrationFlags.usdToInr': { $ne: true } }).lean(false);
  let touched = 0;
  let totalUsdMoved = 0;

  for (const user of users) {
    const oldUsd = user.walletUSD || {};
    const usdBalance = Number(oldUsd.balance || 0);
    const usdDeposits = Number(oldUsd.totalDeposits || 0);
    const usdWithdrawals = Number(oldUsd.totalWithdrawals || 0);

    if (!user.walletINR) {
      user.walletINR = { balance: 0, totalDeposits: 0, totalWithdrawals: 0 };
    }
    user.walletINR.balance += usdBalance * rate;
    user.walletINR.totalDeposits += usdDeposits * rate;
    user.walletINR.totalWithdrawals += usdWithdrawals * rate;

    user.currency = 'INR';
    user.allowedCurrencyDisplay = 'INR';
    if (user.preferences) user.preferences.displayCurrency = 'INR';

    user.migrationFlags = user.migrationFlags || {};
    user.migrationFlags.usdToInr = true;
    user.migrationFlags.usdToInrRate = rate;
    user.migrationFlags.usdToInrAt = new Date();

    if (user.walletUSD) user.walletUSD = undefined;
    if (user.allowedCurrencies) user.allowedCurrencies = undefined;

    totalUsdMoved += usdBalance;
    touched += 1;

    if (!DRY_RUN) {
      await user.save().catch(err => {
        console.error(`[migrate] save failed for ${user.oderId}: ${err.message}`);
      });
    }
  }

  return { touched, totalUsdMoved };
}

async function migrateTransactions(rate) {
  const filter = { currency: 'USD' };
  const count = await Transaction.countDocuments(filter);
  if (!count) return { touched: 0 };
  if (DRY_RUN) return { touched: count };
  const result = await Transaction.updateMany(
    filter,
    [{ $set: { amount: { $multiply: ['$amount', rate] }, currency: 'INR' } }]
  );
  return { touched: result.modifiedCount };
}

(async () => {
  await connectDB();
  const rate = await fetchRate();
  console.log(`[migrate] rate=${rate} dryRun=${DRY_RUN}`);

  const userReport = await migrateUsers(rate);
  const txReport = await migrateTransactions(rate);

  console.log(`[migrate] users touched: ${userReport.touched}, total USD → INR at rate ${rate}: ${(userReport.totalUsdMoved * rate).toFixed(2)}`);
  console.log(`[migrate] transactions converted: ${txReport.touched}`);

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('[migrate] fatal:', err);
  process.exit(1);
});
