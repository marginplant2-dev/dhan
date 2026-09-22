/**
 * check-suspicious-trades.js — READ-ONLY audit of recent challenge trades.
 *
 * Flags the two price-feed bugs we fixed so you can SEE them in real data and
 * verify the fix afterwards:
 *   1) ANOMALOUS EXIT — exit price far out of band vs entry (scale glitch /
 *      the ~₹46-lakh fake P&L type).
 *   2) FROZEN EXIT    — the same exit price re-used across many trades of one
 *      symbol (the stale localStorage depth-bid, e.g. 122.70 everywhere).
 *   3) HUGE P&L       — |profit| over a threshold, worth eyeballing.
 *
 * Nothing is modified. Run it before AND after deploying the fix:
 *   node scripts/check-suspicious-trades.js            # last 7 days
 *   node scripts/check-suspicious-trades.js 3          # last 3 days
 *   node scripts/check-suspicious-trades.js 7 200000   # 7 days, P&L flag > 2 lakh
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ChallengePosition = require('../models/ChallengePosition');
const ChallengeAccount = require('../models/ChallengeAccount');

const DAYS = Number(process.argv[2]) || 7;
const PNL_FLAG = Number(process.argv[3]) || 100000; // |P&L| over this = flagged

const isOption = (s) => /(CE|PE)$/.test(String(s || '').replace(/\s+/g, '').toUpperCase());
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const ist = (d) => d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  const trades = await ChallengePosition.find({ status: 'closed', closeTime: { $gte: since } })
    .sort({ closeTime: -1 }).lean();

  // account code map for readable output
  const accIds = [...new Set(trades.map(t => String(t.challengeAccountId)))];
  const accs = await ChallengeAccount.find({ _id: { $in: accIds } }).select('accountId').lean();
  const accMap = Object.fromEntries(accs.map(a => [String(a._id), a.accountId]));

  console.log(`\n===== SUSPICIOUS TRADE AUDIT — last ${DAYS} day(s) since ${ist(since)} =====`);
  console.log(`Total closed challenge trades in window: ${trades.length}\n`);

  // 1) ANOMALOUS EXIT vs entry
  const anomalies = trades.filter(t => {
    const e = Number(t.entryPrice), c = Number(t.closePrice);
    if (!(e > 0) || !(c > 0)) return false;
    const r = c / e, opt = isOption(t.symbol);
    return (opt ? r > 20 : r > 5) || (!opt && r < 0.2);
  });
  console.log(`--- 1) ANOMALOUS EXIT (exit far out of band vs entry): ${anomalies.length} ---`);
  anomalies.slice(0, 50).forEach(t => {
    const r = (Number(t.closePrice) / Number(t.entryPrice)).toFixed(2);
    console.log(`  ${ist(t.closeTime)} | ${accMap[String(t.challengeAccountId)] || '?'} | ${t.symbol} ${t.side} | entry ${t.entryPrice} → exit ${t.closePrice} (${r}x) | P&L ${inr(t.profit)} | by=${t.closedBy}`);
  });
  if (anomalies.length > 50) console.log(`  … +${anomalies.length - 50} more`);

  // 2) HUGE P&L
  const huge = trades.filter(t => Math.abs(Number(t.profit) || 0) >= PNL_FLAG);
  console.log(`\n--- 2) HUGE P&L (|profit| ≥ ${inr(PNL_FLAG)}): ${huge.length} ---`);
  huge.slice(0, 50).forEach(t => {
    console.log(`  ${ist(t.closeTime)} | ${accMap[String(t.challengeAccountId)] || '?'} | ${t.symbol} ${t.side} | entry ${t.entryPrice} → exit ${t.closePrice} | P&L ${inr(t.profit)} | by=${t.closedBy}`);
  });

  // 3) FROZEN EXIT — same exit price re-used across ≥3 trades of one symbol
  const bySymPrice = {};
  trades.forEach(t => {
    if (!(Number(t.closePrice) > 0)) return;
    const k = `${t.symbol}@@${t.closePrice}`;
    (bySymPrice[k] = bySymPrice[k] || []).push(t);
  });
  const frozen = Object.entries(bySymPrice).filter(([, arr]) => arr.length >= 3)
    .sort((a, b) => b[1].length - a[1].length);
  console.log(`\n--- 3) FROZEN EXIT (identical exit price re-used ≥3× per symbol): ${frozen.length} group(s) ---`);
  frozen.slice(0, 25).forEach(([k, arr]) => {
    const [sym, px] = k.split('@@');
    console.log(`  ${sym}: exit ${px} used ${arr.length}× (${ist(arr[arr.length - 1].closeTime)} … ${ist(arr[0].closeTime)})`);
  });

  console.log(`\n===== SUMMARY =====`);
  console.log(`  Anomalous exits : ${anomalies.length}`);
  console.log(`  Huge P&L (≥${inr(PNL_FLAG)}) : ${huge.length}`);
  console.log(`  Frozen-price groups : ${frozen.length}`);
  console.log(`\n(After deploying the fix, NEW trades should show 0 anomalous / 0 frozen groups.)\n`);

  await mongoose.disconnect();
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
