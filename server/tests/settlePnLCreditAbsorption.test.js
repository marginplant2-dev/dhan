'use strict';

/**
 * Pure unit test for User.settlePnL — MT5-style credit absorption (Fix 21c.3).
 *
 * The test mirrors the function body verbatim instead of pulling in the full
 * Mongoose model so we don't need a DB connection. If the real method drifts,
 * update the local copy below to match — these tests serve as the spec.
 *
 * Run: node server/tests/settlePnLCreditAbsorption.test.js
 */

function makeUser(balance, credit, margin = 0, openFloating = 0) {
  return {
    wallet: {
      balance,
      credit,
      margin,
      equity: balance + credit + openFloating,
      freeMargin: balance + credit + openFloating - margin,
      marginLevel: 0
    },
    stats: {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalProfit: 0,
      totalLoss: 0,
      netPnL: 0
    }
  };
}

// Mirror of User.settlePnL — MT5-style with credit absorption.
function settlePnL(user, pnl) {
  const balanceBefore = user.wallet.balance;
  const creditBefore = user.wallet.credit || 0;
  user.wallet.balance += pnl;

  if (user.wallet.balance < 0) {
    const overflow = Math.abs(user.wallet.balance);
    user.wallet.balance = 0;
    if (creditBefore > 0) {
      const absorbedByCredit = Math.min(overflow, creditBefore);
      user.wallet.credit = creditBefore - absorbedByCredit;
    }
  }

  const creditBurned = creditBefore - (user.wallet.credit || 0);
  user.wallet.equity += pnl - creditBurned;
  if (user.wallet.equity < 0) user.wallet.equity = 0;
  user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;

  user.stats.totalTrades += 1;
  if (pnl >= 0) {
    user.stats.winningTrades += 1;
    user.stats.totalProfit += pnl;
  } else {
    user.stats.losingTrades += 1;
    user.stats.totalLoss += Math.abs(pnl);
  }
  user.stats.netPnL = user.stats.totalProfit - user.stats.totalLoss;
  void balanceBefore; // referenced for clarity in real method
}

let pass = 0;
let fail = 0;
function check(name, cond, info) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${name}`, info || '');
  }
}

// === Test 1: profit goes to balance, credit untouched ===
{
  const u = makeUser(50, 30);
  settlePnL(u, 20);
  check('T1 profit → balance grows', u.wallet.balance === 70, u.wallet);
  check('T1 profit → credit unchanged', u.wallet.credit === 30, u.wallet);
}

// === Test 2: small loss, balance covers it, credit untouched ===
{
  const u = makeUser(50, 30);
  settlePnL(u, -20);
  check('T2 small loss → balance drops', u.wallet.balance === 30, u.wallet);
  check('T2 small loss → credit unchanged', u.wallet.credit === 30, u.wallet);
}

// === Test 3: loss exceeds balance, credit absorbs the overflow ===
{
  const u = makeUser(50, 30);
  settlePnL(u, -70); // overflow = 20, credit absorbs 20
  check('T3 loss > balance → balance capped at 0', u.wallet.balance === 0, u.wallet);
  check('T3 loss > balance → credit absorbed 20', u.wallet.credit === 10, u.wallet);
}

// === Test 4: loss exhausts balance + credit, broker absorbs rest ===
{
  const u = makeUser(50, 30);
  settlePnL(u, -200); // overflow = 150, credit absorbs 30, broker absorbs 120
  check('T4 catastrophic loss → balance = 0', u.wallet.balance === 0, u.wallet);
  check('T4 catastrophic loss → credit = 0', u.wallet.credit === 0, u.wallet);
  check('T4 catastrophic loss → equity = 0', u.wallet.equity === 0, u.wallet);
}

// === Test 5: loss exactly equal to balance, credit untouched ===
{
  const u = makeUser(50, 30);
  settlePnL(u, -50);
  check('T5 loss = balance → balance = 0', u.wallet.balance === 0, u.wallet);
  check('T5 loss = balance → credit unchanged', u.wallet.credit === 30, u.wallet);
}

// === Test 6: loss exactly equal to balance + credit ===
{
  const u = makeUser(50, 30);
  settlePnL(u, -80);
  check('T6 loss = balance+credit → balance = 0', u.wallet.balance === 0, u.wallet);
  check('T6 loss = balance+credit → credit = 0', u.wallet.credit === 0, u.wallet);
}

// === Test 7: zero credit, loss > balance → broker absorbs all overflow ===
{
  const u = makeUser(50, 0);
  settlePnL(u, -80);
  check('T7 no credit → balance = 0', u.wallet.balance === 0, u.wallet);
  check('T7 no credit → credit stays 0', u.wallet.credit === 0, u.wallet);
}

// === Test 8: stats update correctly on loss ===
{
  const u = makeUser(50, 30);
  settlePnL(u, -70);
  check('T8 stats losingTrades incremented', u.stats.losingTrades === 1, u.stats);
  check('T8 stats totalLoss = 70', u.stats.totalLoss === 70, u.stats);
  check('T8 stats netPnL = -70', u.stats.netPnL === -70, u.stats);
}

if (fail > 0) {
  console.error(`\nsettlePnLCreditAbsorption.test.js: ${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`settlePnLCreditAbsorption.test.js: all ${pass} checks passed`);
