'use strict';

/**
 * Pure unit test for the per-fill close math used by
 * NettingEngine.closePositionLeg. The function itself is async and writes to
 * Mongo, so we mirror the math in pure functions and assert on those.
 *
 * If you change the algorithm in server/engines/NettingEngine.js, mirror the
 * change here or this test will go stale.
 *
 * Run with: node server/tests/closePositionLegMath.test.js
 *
 * Background — see decision D in plans/harmonic-stirring-turtle.md:
 *  - Per-fill close (this code path) uses the LEG's own entry for realized PnL
 *    (NOT the parent's avg). This makes per-fill SL/TP behave intuitively:
 *    setting TP at "leg.entry + 10" actually banks ~10 per unit on close.
 *  - The parent's avgPrice is recomputed from the remaining legs:
 *      newAvg = (oldVol * oldAvg − legVol * legEntry) / (oldVol − legVol)
 *  - Margin and quantity are released proportionally.
 *  - If the closed leg was the last open volume → parent.status = 'closed'.
 */

// Mirror of NettingEngine.calculatePnL — only the FOREX/general path (not the
// Indian-instrument special case which uses different units). Good enough to
// validate the leg-entry-based PnL.
function calcLegPnLForex(side, legEntry, closePrice, legVol, contractSize = 100000) {
  const priceDiff = side === 'buy' ? (closePrice - legEntry) : (legEntry - closePrice);
  return priceDiff * contractSize * legVol;
}

// Mirror of the avg recomputation in closePositionLeg.
function recomputeParentAfterLegClose({ oldVol, oldQty, oldAvg, oldMargin }, leg) {
  const legVol = leg.volume;
  const legEntry = leg.entryPrice;
  const newVol = oldVol - legVol;
  const isLastLeg = newVol <= 1e-9;

  const marginToRelease = oldVol > 0 ? (legVol / oldVol) * oldMargin : oldMargin;
  let newMargin = oldMargin - marginToRelease;
  if (newMargin < 0) newMargin = 0;

  if (isLastLeg) {
    return {
      status: 'closed',
      volume: 0,
      quantity: 0,
      avgPrice: oldAvg, // unchanged when fully closing
      marginUsed: 0,
      marginReleased: marginToRelease
    };
  }

  const newAvg = (oldVol * oldAvg - legVol * legEntry) / newVol;
  const newQty = oldQty > 0 ? oldQty * (newVol / oldVol) : oldQty;
  return {
    status: 'open',
    volume: newVol,
    quantity: newQty,
    avgPrice: newAvg,
    marginUsed: newMargin,
    marginReleased: marginToRelease
  };
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  }
}
function assertClose(actual, expected, msg, eps = 1e-6) {
  if (Math.abs(actual - expected) > eps) {
    console.error(`FAIL: ${msg}\n  expected ≈ ${expected}\n  actual   = ${actual}`);
    failed += 1;
  }
}

// ============================================================================
// 1) Two-leg case: close the older leg, parent's avg drifts to the younger
//    leg's entry. The closed leg's PnL uses ITS OWN entry (not parent.avg).
// ============================================================================
{
  // Initial state: BUY 2 lots @ avg 100 (= leg A: 1@100, leg B: 1@100)
  // Wait, both at 100 → avg = 100. Make them different.
  // Leg A: 1 lot @ 100, Leg B: 1 lot @ 110 → parent avg = 105, vol = 2
  const parent = { oldVol: 2, oldQty: 2, oldAvg: 105, oldMargin: 200 };
  const legA = { volume: 1, entryPrice: 100 };

  // Close leg A at price 120 (BUY position)
  const closePrice = 120;
  const realizedPnL = calcLegPnLForex('buy', legA.entryPrice, closePrice, legA.volume, 100000);
  assertClose(realizedPnL, (120 - 100) * 100000 * 1, '1) leg A realized PnL uses leg.entry');

  const next = recomputeParentAfterLegClose(parent, legA);
  assertClose(next.volume, 1, '1) parent.volume drops by 1');
  assertClose(next.avgPrice, 110, '1) parent.avgPrice drifts to remaining leg B entry (110)');
  assertClose(next.marginReleased, 100, '1) margin released = (1/2) * 200 = 100');
  assertClose(next.marginUsed, 100, '1) parent.marginUsed drops to 100');
  assertClose(next.quantity, 1, '1) parent.quantity scales to 1');
  assert(next.status === 'open', '1) parent stays open');
}

// ============================================================================
// 2) Last-leg close: closing the only remaining open leg → parent.status='closed'
// ============================================================================
{
  const parent = { oldVol: 3, oldQty: 3, oldAvg: 100, oldMargin: 300 };
  const legSole = { volume: 3, entryPrice: 100 };

  const next = recomputeParentAfterLegClose(parent, legSole);
  assert(next.status === 'closed', '2) closing the last leg → parent.status = closed');
  assertClose(next.volume, 0, '2) parent.volume → 0');
  assertClose(next.marginUsed, 0, '2) parent.marginUsed → 0');
  assertClose(next.marginReleased, 300, '2) all margin released');
}

// ============================================================================
// 3) BUY position, close inner leg at TP — verify PnL convention
//    (decision D: each leg uses its OWN entry, not the avg)
// ============================================================================
{
  // 3 fills: 1@100, 1@102, 1@104 → parent avg = 102, vol = 3
  // Set TP on the middle leg (entry 102) at 110, current price 110
  const parent = { oldVol: 3, oldQty: 3, oldAvg: 102, oldMargin: 300 };
  const middleLeg = { volume: 1, entryPrice: 102 };
  const closePrice = 110;

  const realized = calcLegPnLForex('buy', middleLeg.entryPrice, closePrice, middleLeg.volume, 100000);
  // (110 - 102) * 100000 * 1 = 800000 (forex units; absolute value doesn't matter, just convention)
  assertClose(realized, 8 * 100000, '3) middle leg PnL = (110 - 102) * 100000 * 1 — uses LEG entry');

  // The "wrong" answer (using parent.avg) would also be 8*100000 here because
  // avg == middle leg entry. Use a more demonstrative case:
}
{
  // 3 fills: 1@100, 1@104, 1@108 → avg = 104. Close fill 1 (entry 100) at 110.
  // Per-fill PnL = (110 - 100) * 1 = 10 (units)
  // Parent-avg PnL = (110 - 104) * 1 = 6 (units) — DIFFERENT
  const legA = { volume: 1, entryPrice: 100 };
  const closePrice = 110;
  const perFillPnL = calcLegPnLForex('buy', legA.entryPrice, closePrice, legA.volume, 1);
  const parentAvgPnL = calcLegPnLForex('buy', 104, closePrice, legA.volume, 1);
  assertClose(perFillPnL, 10, '3b) per-fill PnL with leg.entry = 10');
  assertClose(parentAvgPnL, 6, '3b) parent-avg PnL with parent.avg = 6');
  assert(perFillPnL !== parentAvgPnL, '3b) the two conventions DIFFER when leg.entry ≠ parent.avg');

  // After closing leg A, parent should now have vol=2 with the OTHER two legs:
  //   (1@104, 1@108) → new avg = 106, NOT 104
  const parent = { oldVol: 3, oldQty: 3, oldAvg: 104, oldMargin: 300 };
  const next = recomputeParentAfterLegClose(parent, legA);
  // newAvg = (3*104 - 1*100) / 2 = (312 - 100) / 2 = 212/2 = 106
  assertClose(next.avgPrice, 106, '3b) parent.avgPrice recomputes to 106 = mean of remaining (104, 108)');
}

// ============================================================================
// 4) SELL position symmetry — same math but priceDiff is reversed
// ============================================================================
{
  // SELL 2 lots, leg @ 200 closes at 190 → realized = (200 - 190) * 1 = 10 profit
  const realized = calcLegPnLForex('sell', 200, 190, 1, 1);
  assertClose(realized, 10, '4) SELL leg PnL = (legEntry - closePrice) * vol');

  const parent = { oldVol: 2, oldQty: 2, oldAvg: 195, oldMargin: 200 };
  const leg = { volume: 1, entryPrice: 200 };
  const next = recomputeParentAfterLegClose(parent, leg);
  // newAvg = (2*195 - 1*200) / 1 = (390 - 200) / 1 = 190
  assertClose(next.avgPrice, 190, '4) SELL parent avg recomputes to 190');
}

// ============================================================================
// 5) Sum invariant: across many partial closes, sum of realized + remaining
//    notional should track parent.volume changes correctly.
// ============================================================================
{
  // 4 fills of 1 lot each at entries 10, 20, 30, 40 → avg = 25, vol = 4
  let parent = { oldVol: 4, oldQty: 4, oldAvg: 25, oldMargin: 400 };

  // Close leg @ 10 (entry 10)
  let next = recomputeParentAfterLegClose(parent, { volume: 1, entryPrice: 10 });
  assertClose(next.avgPrice, (4 * 25 - 1 * 10) / 3, '5) after closing leg-10, avg = 90/3 = 30');
  assertClose(next.avgPrice, 30, '5) avg = 30 (mean of 20,30,40)');
  parent = { oldVol: next.volume, oldQty: next.quantity, oldAvg: next.avgPrice, oldMargin: next.marginUsed };

  // Close leg @ 20 (entry 20)
  next = recomputeParentAfterLegClose(parent, { volume: 1, entryPrice: 20 });
  assertClose(next.avgPrice, (3 * 30 - 1 * 20) / 2, '5) after closing leg-20, avg = 70/2 = 35');
  assertClose(next.avgPrice, 35, '5) avg = 35 (mean of 30,40)');
  parent = { oldVol: next.volume, oldQty: next.quantity, oldAvg: next.avgPrice, oldMargin: next.marginUsed };

  // Close leg @ 30 (entry 30)
  next = recomputeParentAfterLegClose(parent, { volume: 1, entryPrice: 30 });
  assertClose(next.avgPrice, 40, '5) after closing leg-30, avg = remaining = 40');

  parent = { oldVol: next.volume, oldQty: next.quantity, oldAvg: next.avgPrice, oldMargin: next.marginUsed };

  // Close leg @ 40 (last one)
  next = recomputeParentAfterLegClose(parent, { volume: 1, entryPrice: 40 });
  assert(next.status === 'closed', '5) closing the last leg flips parent.status to closed');
}

// ============================================================================
// 6) Margin proportionality
// ============================================================================
{
  // 5 lots, 1000 margin total → closing 2 lots releases 400 margin
  const parent = { oldVol: 5, oldQty: 5, oldAvg: 100, oldMargin: 1000 };
  const next = recomputeParentAfterLegClose(parent, { volume: 2, entryPrice: 100 });
  assertClose(next.marginReleased, 400, '6) margin release = (2/5) * 1000 = 400');
  assertClose(next.marginUsed, 600, '6) parent.marginUsed = 1000 - 400 = 600');
}

// ============================================================================
// 7) Floating-point safety: very small leg.volume should not break invariants
// ============================================================================
{
  const parent = { oldVol: 1, oldQty: 1, oldAvg: 100, oldMargin: 100 };
  const next = recomputeParentAfterLegClose(parent, { volume: 1 - 1e-12, entryPrice: 100 });
  // Volume after = 1e-12, well within the 1e-9 epsilon → should be treated as fully closed
  assert(next.status === 'closed' || next.volume <= 1e-9, '7) tiny remainder treated as fully closed (within EPS)');
}

if (failed === 0) {
  console.log('OK closePositionLegMath.test.js — all assertions passed');
  process.exit(0);
} else {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
