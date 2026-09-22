'use strict';

/**
 * Pure unit test for the FIFO leg-consumption math used by
 * NettingEngine._consumeOpenLegsFIFO. The function itself is async and writes
 * to Mongo, which we don't want to spin up here, so this file replicates the
 * math against an in-memory leg array. If you change the algorithm in
 * server/engines/NettingEngine.js, mirror the change here or this will go
 * stale.
 *
 * Run with: node server/tests/nettingFifoLegConsumption.test.js
 *
 * Background: when an opposite-side trade reduces a netting position's
 * aggregate volume, the open Trade legs that built that position must be
 * walked oldest-first and have their volumes consumed so the Active Trades
 * view stays consistent with parent.volume. See
 * /Users/tarundewangan/.claude/plans/harmonic-stirring-turtle.md (Phase 1.5).
 */

const EPS = 1e-9;

// Mirror of NettingEngine._consumeOpenLegsFIFO body, operating on a local
// array of plain objects instead of Mongoose docs.
function consumeFIFO(legs, closingVolume, avgPriceAtClose, now = new Date('2026-04-08T12:00:00Z')) {
  if (!(closingVolume > 0)) return;
  let remaining = closingVolume;
  // Sort oldest-first (mongoose query already does this with sort({ executedAt: 1 }))
  const sorted = [...legs].sort((a, b) => new Date(a.executedAt) - new Date(b.executedAt));
  for (const leg of sorted) {
    if (remaining <= EPS) break;
    const legVol = Number(leg.volume) || 0;
    if (legVol <= EPS) continue;

    const take = Math.min(legVol, remaining);
    const newLegVol = legVol - take;

    if (newLegVol <= EPS) {
      leg.volume = 0;
      leg.type = 'consumed';
      leg.closePrice = avgPriceAtClose;
      leg.closedAt = now;
      leg.closedBy = 'aggregate_close';
      leg.profit = 0;
    } else {
      leg.volume = newLegVol;
      if (leg.quantity != null && legVol > 0) {
        leg.quantity = Number(leg.quantity) * (newLegVol / legVol);
      }
    }

    remaining -= take;
  }
  return remaining;
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  }
}
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL: ${msg}\n  expected: ${e}\n  actual:   ${a}`);
    failed += 1;
  }
}

// 1) Single-lot FIFO: 3 legs of 1 lot each, consume 1 → oldest leg consumed
{
  const legs = [
    { id: 'A', volume: 1, executedAt: '2026-04-08T10:00:00Z', entryPrice: 4000 },
    { id: 'B', volume: 1, executedAt: '2026-04-08T10:01:00Z', entryPrice: 4002 },
    { id: 'C', volume: 1, executedAt: '2026-04-08T10:02:00Z', entryPrice: 4004 }
  ];
  consumeFIFO(legs, 1, 4002);
  assertEq(legs[0].type, 'consumed', '1) leg A should be consumed');
  assertEq(legs[0].volume, 0, '1) leg A volume should be 0');
  assertEq(legs[0].closePrice, 4002, '1) leg A closePrice should be parent avg');
  assertEq(legs[0].closedBy, 'aggregate_close', '1) leg A closedBy should be aggregate_close');
  assertEq(legs[0].profit, 0, '1) leg A profit should stay 0');
  assertEq(legs[1].volume, 1, '1) leg B untouched');
  assertEq(legs[2].volume, 1, '1) leg C untouched');
  // Sum invariant
  const sumAfter = legs.reduce((s, l) => s + (l.volume || 0), 0);
  assertEq(sumAfter, 2, '1) sum of remaining open volumes = 2');
}

// 2) Cross-leg FIFO: 5 lots in 3 legs, consume 5 lots straddling all three legs
{
  const legs = [
    { id: 'A', volume: 1, executedAt: '2026-04-08T10:00:00Z', entryPrice: 4000 },
    { id: 'B', volume: 1, executedAt: '2026-04-08T10:01:00Z', entryPrice: 4002 },
    { id: 'C', volume: 1, executedAt: '2026-04-08T10:02:00Z', entryPrice: 4004 },
    { id: 'D', volume: 2, executedAt: '2026-04-08T10:03:00Z', entryPrice: 4010 },
    { id: 'E', volume: 2, executedAt: '2026-04-08T10:04:00Z', entryPrice: 4012 }
  ];
  consumeFIFO(legs, 5, 4006);
  assertEq(legs[0].type, 'consumed', '2) A consumed');
  assertEq(legs[1].type, 'consumed', '2) B consumed');
  assertEq(legs[2].type, 'consumed', '2) C consumed');
  assertEq(legs[3].type, 'consumed', '2) D consumed (was 2 lots, all eaten)');
  assertEq(legs[4].volume, 2, '2) E should have lost 0 lots — wait, 1+1+1+2 = 5, exact match');
  // Wait — 1+1+1+2 = 5, so E is untouched. Correct.
}

// 3) Partial leg consumption: 3 lots in 1 leg, consume 1 → leg stays open with 2 lots
{
  const legs = [
    { id: 'A', volume: 3, quantity: 300, executedAt: '2026-04-08T10:00:00Z', entryPrice: 4000 }
  ];
  consumeFIFO(legs, 1, 4000);
  assertEq(legs[0].volume, 2, '3) leg A should have 2 lots remaining');
  assertEq(legs[0].type, undefined, '3) leg A should remain open (no type change)');
  assert(Math.abs(legs[0].quantity - 200) < 1e-9, '3) leg A quantity should scale to 200');
}

// 4) The user's exact scenario: buy 10 (in one leg), sell 1 → 9 lots, leg still open with 9
{
  const legs = [
    { id: 'big', volume: 10, quantity: 10, executedAt: '2026-04-08T10:00:00Z', entryPrice: 4000 }
  ];
  consumeFIFO(legs, 1, 4000);
  assertEq(legs[0].volume, 9, '4) buy-10 sell-1: leg drops to 9 lots');
  assertEq(legs[0].type, undefined, '4) leg stays open');
  assert(Math.abs(legs[0].quantity - 9) < 1e-9, '4) quantity scales to 9');
}

// 5) Full close: legs sum to 5, consume 5 → all consumed
{
  const legs = [
    { id: 'A', volume: 2, executedAt: '2026-04-08T10:00:00Z', entryPrice: 4000 },
    { id: 'B', volume: 3, executedAt: '2026-04-08T10:01:00Z', entryPrice: 4010 }
  ];
  consumeFIFO(legs, 5, 4006);
  assertEq(legs[0].type, 'consumed', '5) A consumed');
  assertEq(legs[1].type, 'consumed', '5) B consumed');
  assertEq(legs[0].volume, 0, '5) A volume 0');
  assertEq(legs[1].volume, 0, '5) B volume 0');
}

// 6) Sort order matters: legs in random order should still be consumed by executedAt asc
{
  const legs = [
    { id: 'newest', volume: 1, executedAt: '2026-04-08T10:05:00Z', entryPrice: 4020 },
    { id: 'oldest', volume: 1, executedAt: '2026-04-08T10:00:00Z', entryPrice: 4000 },
    { id: 'middle', volume: 1, executedAt: '2026-04-08T10:02:00Z', entryPrice: 4010 }
  ];
  consumeFIFO(legs, 1, 4010);
  // Find the leg by id
  const oldest = legs.find((l) => l.id === 'oldest');
  const middle = legs.find((l) => l.id === 'middle');
  const newest = legs.find((l) => l.id === 'newest');
  assertEq(oldest.type, 'consumed', '6) oldest by executedAt should be consumed even when array order is scrambled');
  assertEq(middle.volume, 1, '6) middle untouched');
  assertEq(newest.volume, 1, '6) newest untouched');
}

// 7) Floating-point partial: 0.1 + 0.2 = 0.30000000000000004 — epsilon should absorb this
{
  const legs = [
    { id: 'A', volume: 0.1, executedAt: '2026-04-08T10:00:00Z', entryPrice: 4000 },
    { id: 'B', volume: 0.2, executedAt: '2026-04-08T10:01:00Z', entryPrice: 4010 }
  ];
  // Consume 0.30000000000000004 — this is the JS sum of 0.1 + 0.2
  consumeFIFO(legs, 0.1 + 0.2, 4007);
  assertEq(legs[0].type, 'consumed', '7) leg A floating-point consumed');
  assertEq(legs[1].type, 'consumed', '7) leg B floating-point consumed');
}

// 8) Consume zero → no-op
{
  const legs = [
    { id: 'A', volume: 1, executedAt: '2026-04-08T10:00:00Z', entryPrice: 4000 }
  ];
  consumeFIFO(legs, 0, 4000);
  assertEq(legs[0].volume, 1, '8) consuming 0 should be a no-op');
  assertEq(legs[0].type, undefined, '8) leg stays open');
}

// 9) Over-consume: trying to consume more than the legs hold returns leftover (caller should warn)
{
  const legs = [
    { id: 'A', volume: 2, executedAt: '2026-04-08T10:00:00Z', entryPrice: 4000 }
  ];
  const leftover = consumeFIFO(legs, 5, 4000);
  assertEq(legs[0].type, 'consumed', '9) leg A consumed');
  assert(leftover > 2.99 && leftover < 3.01, '9) over-consume returns ~3 leftover');
}

if (failed === 0) {
  console.log('OK nettingFifoLegConsumption.test.js — all assertions passed');
  process.exit(0);
} else {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
