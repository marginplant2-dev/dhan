/**
 * Global + per-user risk rules from RiskSettings / UserRiskSettings.
 * - Ledger balance close %: when (balance - equity) / balance * 100 >= threshold, flatten all open positions.
 * - Profit / loss trade hold: block user-initiated closes until position age >= min seconds (sign by unrealized P/L at close).
 */

const User = require('../models/User');
const UserRiskSettings = require('../models/UserRiskSettings');
const { HedgingPosition, NettingPosition } = require('../models/Position');
const { isInstrumentExpiryTodayIST } = require('./nettingExpiryDay');

let hedgingEngineRef = null;
let nettingEngineRef = null;

const ledgerLiquidating = new Set();
const stopOutLiquidating = new Set();

function setRiskEngines(hedgingEngine, nettingEngine) {
  hedgingEngineRef = hedgingEngine;
  nettingEngineRef = nettingEngine;
}

/** Loss of equity vs ledger balance as % of balance (0 if not applicable). */
function drawdownPercentOfBalance(balance, equity) {
  const b = Number(balance);
  const e = Number(equity);
  if (!Number.isFinite(b) || b <= 0 || !Number.isFinite(e)) return 0;
  return ((b - e) / b) * 100;
}

function assertTradeHoldInternal(openTime, unrealizedPnLAtClose, risk) {
  const profitHold = Number(risk.profitTradeHoldMinSeconds) || 0;
  const lossHold = Number(risk.lossTradeHoldMinSeconds) || 0;
  if (profitHold <= 0 && lossHold <= 0) return;
  if (!openTime) return;

  const ageSec = (Date.now() - new Date(openTime).getTime()) / 1000;
  if (ageSec < 0) return;

  if (unrealizedPnLAtClose > 0 && profitHold > 0 && ageSec < profitHold) {
    const rem = Math.ceil(profitHold - ageSec);
    throw new Error(`Profit trades must be held at least ${profitHold}s (${rem}s remaining)`);
  }
  if (unrealizedPnLAtClose < 0 && lossHold > 0 && ageSec < lossHold) {
    const rem = Math.ceil(lossHold - ageSec);
    throw new Error(`Loss trades must be held at least ${lossHold}s (${rem}s remaining)`);
  }
}

/**
 * @param {string} userOderId - User.oderId
 * @param {Date|undefined} openTime
 * @param {number} unrealizedPnLAtClose - Gross P/L at close price (before close commission), same sign as UI
 * @param {{ instrumentExpiry?: Date|string|null, segmentSettingsSnapshot?: Record<string, unknown>|null }} [context]
 *        When expiry is today (IST) and netting segment snapshot has expiry profit/loss hold above zero, those override global holds for that side.
 */
async function assertTradeHoldAllowed(userOderId, openTime, unrealizedPnLAtClose, context = {}) {
  const user = await User.findOne({ oderId: userOderId });
  if (!user) return;
  const risk = await UserRiskSettings.getEffectiveSettings(user._id.toString());
  const merged = { ...risk };
  const exp = context.instrumentExpiry;
  const snap = context.segmentSettingsSnapshot;
  if (exp && snap && isInstrumentExpiryTodayIST(exp)) {
    const ph = Number(snap.expiryProfitHoldMinSeconds) || 0;
    const lh = Number(snap.expiryLossHoldMinSeconds) || 0;
    if (ph > 0) merged.profitTradeHoldMinSeconds = ph;
    if (lh > 0) merged.lossTradeHoldMinSeconds = lh;
  }
  assertTradeHoldInternal(openTime, unrealizedPnLAtClose, merged);
}

/**
 * Resolve bid/ask for liquidation (exit long at bid, short at ask).
 * @returns {{ bid: number, ask: number }|null}
 */
function pickExitPrice(position, bundle) {
  if (!bundle) return null;
  const bid = Number(bundle.bid);
  const ask = Number(bundle.ask);
  if (bid > 0 && ask > 0) return { bid, ask };
  const last = Number(bundle.lastPrice || bundle.last || bundle.mark_price || 0);
  if (last > 0) return { bid: last, ask: last };
  return null;
}

async function liquidateAllForUser(userOderId, io, priceResolver) {
  if (!hedgingEngineRef || !nettingEngineRef) return;
  if (ledgerLiquidating.has(userOderId)) return;
  ledgerLiquidating.add(userOderId);
  try {
    const hedgingOpen = await HedgingPosition.find({ userId: userOderId, status: 'open' });
    for (const p of hedgingOpen) {
      const bundle = priceResolver ? priceResolver(p.symbol) : null;
      const px = pickExitPrice(p, bundle);
      const closePrice = px ? (p.side === 'buy' ? px.bid : px.ask) : Number(p.currentPrice || p.entryPrice);
      if (!closePrice || closePrice <= 0) continue;
      try {
        await hedgingEngineRef.closePosition(userOderId, p.oderId || p._id, null, closePrice, {
          skipTradeHold: true
        });
      } catch (err) {
        console.error(`[Risk] Ledger close hedging ${p.oderId}:`, err.message);
      }
    }

    const nettingOpen = await NettingPosition.find({ userId: userOderId, status: 'open' });
    for (const p of nettingOpen) {
      const bundle = priceResolver ? priceResolver(p.symbol) : null;
      const px = pickExitPrice(p, bundle);
      const closePrice = px ? (p.side === 'buy' ? px.bid : px.ask) : Number(p.currentPrice || p.avgPrice);
      if (!closePrice || closePrice <= 0) continue;
      try {
        await nettingEngineRef.closePosition(userOderId, p.symbol, p.volume, closePrice, {
          skipTradeHold: true
        });
      } catch (err) {
        console.error(`[Risk] Ledger close netting ${p.symbol}:`, err.message);
      }
    }

    if (io) {
      io.to(userOderId).emit('ledgerLiquidation', {
        reason: 'ledger_balance_close',
        message: 'Open positions were closed: account drawdown reached the configured limit.'
      });
      try {
        const h = await hedgingEngineRef.getPositions(userOderId);
        const n = await nettingEngineRef.getPositions(userOderId);
        io.to(userOderId).emit('positionUpdate', { mode: 'hedging', positions: h });
        io.to(userOderId).emit('positionUpdate', { mode: 'netting', positions: n });
      } catch (_) {
        /* non-fatal */
      }
    }
  } finally {
    ledgerLiquidating.delete(userOderId);
  }
}

/**
 * After wallet.equity is updated from open P/L, close all if drawdown exceeds global/user threshold.
 */
async function maybeLiquidateUser(userOderId, io, priceResolver) {
  const user = await User.findOne({ oderId: userOderId });
  if (!user || !user.wallet) return;

  const risk = await UserRiskSettings.getEffectiveSettings(user._id.toString());
  const threshold = Number(risk.ledgerBalanceClose) || 0;
  if (threshold <= 0) return;

  const dd = drawdownPercentOfBalance(user.wallet.balance, user.wallet.equity);
  if (dd < threshold) return;

  console.warn(
    `[Risk] Ledger balance close triggered for ${userOderId}: drawdown ${dd.toFixed(2)}% (limit ${threshold}%, balance ${user.wallet.balance}, equity ${user.wallet.equity})`
  );
  await liquidateAllForUser(userOderId, io, priceResolver);
}

/**
 * Equity = balance + credit + sum(open hedging profit) + sum(open netting profit).
 * Margin = sum(open hedging marginUsed) + sum(open netting marginUsed).
 * Call after updating position marks so mixed-mode users are not double-counted or overwritten.
 * 
 * MT5 equivalent: recalculate equity AND margin from live positions on every tick.
 * Previously only equity was recalculated — margin could become stale after server restart,
 * causing stop-out to skip entirely (margin=0 → "no positions").
 */
async function reconcileWalletEquityForUser(userOderId) {
  const user = await User.findOne({ oderId: userOderId });
  if (!user) return;
  const h = await HedgingPosition.find({ userId: userOderId, status: 'open' });
  const n = await NettingPosition.find({ userId: userOderId, status: 'open' });
  
  let unrealized = 0;
  let totalMargin = 0;
  
  for (const p of h) {
    unrealized += p.profit || 0;
    totalMargin += p.marginUsed || 0;
  }
  for (const p of n) {
    unrealized += p.profit || 0;
    totalMargin += p.marginUsed || 0;
  }
  
  // Recalculate margin from actual positions (prevents stale margin after restart)
  user.wallet.margin = totalMargin;
  user.updateEquity(unrealized);
  await user.save();
}

/**
 * MT5-style Stop Out: Close positions when margin level falls below stop out level.
 * Margin Level = (Equity / Margin) × 100%
 * Stop Out Level: Default 50% (configurable in global RiskSettings)
 * 
 * When margin level <= stop out level:
 * 1. Close position with largest loss first
 * 2. Repeat until margin level > stop out level or no positions left
 */
async function checkStopOut(userOderId, io, priceResolver) {
  if (!hedgingEngineRef || !nettingEngineRef) return;
  if (stopOutLiquidating.has(userOderId)) return;
  
  stopOutLiquidating.add(userOderId);
  try {
    const user = await User.findOne({ oderId: userOderId });
    if (!user || !user.wallet) return;
    
    // Get stop out level — use the canonical resolver so user-specific overrides
    // are actually applied. The previous code did
    //   UserRiskSettings.findOne({ oderId: userOderId })
    // but the schema field is `userId` (an ObjectId), not `oderId`, so the query
    // ALWAYS returned null and admin's per-user margin-call/stop-out settings were
    // silently ignored. getEffectiveSettings() resolves user → ObjectId internally.
    const UserRiskSettings = require('../models/UserRiskSettings');
    const effective = await UserRiskSettings.getEffectiveSettings(userOderId);
    const stopOutLevel = effective.stopOutLevel;
    const marginCallLevel = effective.marginCallLevel;
  
  // Calculate current margin level — recalculate from positions if wallet.margin is stale
  let { margin, equity } = user.wallet;
  
  // If wallet.margin is 0, double-check if there are actually open positions
  // (margin may be stale after server restart or corruption)
  const hedgingOpen = await HedgingPosition.find({ userId: userOderId, status: 'open' });
  const nettingOpen = await NettingPosition.find({ userId: userOderId, status: 'open' });

  if (margin <= 0) {
    if (hedgingOpen.length === 0 && nettingOpen.length === 0) {
      return; // Genuinely no positions — no stop out needed
    }
    // Recalculate margin from positions
    let recalcMargin = 0;
    for (const p of hedgingOpen) recalcMargin += p.marginUsed || 0;
    for (const p of nettingOpen) recalcMargin += p.marginUsed || 0;
    margin = recalcMargin;
    if (margin <= 0) margin = 0.01; // Prevent division by zero, force stop-out check
    // Fix the stale margin in wallet
    user.wallet.margin = margin;
    await user.save();
  }
  
  // ============ COMMISSION-AWARE EQUITY ============
  // Estimate close commissions for all open positions.
  // The stop-out calculation must account for the commission cost of closing,
  // otherwise the actual close can push the balance negative.
  // Use openCommission as a reasonable estimate for closeCommission
  // (same formula, same settings at open time).
  let estimatedCloseCommissions = 0;
  for (const p of hedgingOpen) estimatedCloseCommissions += p.openCommission || 0;
  for (const p of nettingOpen) estimatedCloseCommissions += p.openCommission || 0;
  
  // Adjusted equity = real equity minus estimated close costs
  const adjustedEquity = equity - estimatedCloseCommissions;
  const marginLevel = margin > 0 ? (adjustedEquity / margin) * 100 : 0;
  
  // Emit margin call warning if below margin call level
  if (marginLevel <= marginCallLevel && marginLevel > stopOutLevel) {
    if (io) {
      io.to(userOderId).emit('marginCall', {
        marginLevel: marginLevel.toFixed(2),
        marginCallLevel,
        message: `Warning: Margin level at ${marginLevel.toFixed(2)}%. Margin call triggered at ${marginCallLevel}%.`
      });
    }
    console.warn(`[Risk] Margin Call for ${userOderId}: ${marginLevel.toFixed(2)}% (threshold: ${marginCallLevel}%)`);
  }
  
  // Custom Risk Controls: Max Daily Loss Hit
  // Note: maxDailyLoss is not currently a field in either RiskSettings or
  // UserRiskSettings, so this branch is dead until that schema lands. Keep the
  // code path correct (using user.wallet.balance, not an undefined `balance`)
  // so it doesn't crash the moment the field is added.
  const maxDailyLoss = effective.maxDailyLoss ?? null;
  if (maxDailyLoss && margin > 0) {
    const dailyLossAchieved = (user.wallet.balance || 0) - equity;
    if (dailyLossAchieved >= maxDailyLoss) {
      console.warn(`[Risk] Max Daily Loss Hit for ${userOderId}. Loss: ${dailyLossAchieved}, Max Allowed: ${maxDailyLoss}`);
      await liquidateAllForUser(userOderId, io, priceResolver);
      return;
    }
  }
  
  // Stop out: Close positions if margin level <= stop out level
  if (marginLevel <= stopOutLevel) {
    console.warn(`[Risk] Stop Out triggered for ${userOderId}: ${marginLevel.toFixed(2)}% (threshold: ${stopOutLevel}%), estCloseComm: ${estimatedCloseCommissions.toFixed(4)}`);
    
    // Get all open positions and sort by loss (largest loss first)
    const allPositions = [
      ...hedgingOpen.map(p => ({ ...p.toObject(), engine: 'hedging' })),
      ...nettingOpen.map(p => ({ ...p.toObject(), engine: 'netting' }))
    ].sort((a, b) => (a.profit || 0) - (b.profit || 0)); // Sort by profit ascending (largest loss first)
    
    // Level evaluation: Full Stop vs Partial Stop
    // partialStopOutLevel is not yet a schema field — read it off `effective` so
    // it picks up either a user override or the global default once added.
    const partialStopLevel = effective.partialStopOutLevel ?? null;
    const isPartialStop = partialStopLevel && marginLevel <= partialStopLevel && marginLevel > stopOutLevel;
    
    // Close positions one by one until margin level > stop out level
    for (const pos of allPositions) {
      // Re-check margin level after each close
      const freshUser = await User.findOne({ oderId: userOderId });
      if (!freshUser || freshUser.wallet.margin <= 0) break;
      
      const currentMarginLevel = (freshUser.wallet.equity / freshUser.wallet.margin) * 100;
      const targetLevel = isPartialStop ? partialStopLevel : stopOutLevel;
      if (currentMarginLevel > targetLevel) break;
      
      // Get exit price
      const bundle = priceResolver ? priceResolver(pos.symbol) : null;
      const px = pickExitPrice(pos, bundle);
      const closePrice = px ? (pos.side === 'buy' ? px.bid : px.ask) : Number(pos.currentPrice || pos.avgPrice || pos.entryPrice);
      
      if (!closePrice || closePrice <= 0) continue;
      
      try {
        let volumeToClose = pos.volume;
        if (isPartialStop) {
           volumeToClose = pos.volume > 1 ? Math.floor(pos.volume / 2) : pos.volume;
        }
        
        if (pos.engine === 'hedging') {
          // Hedging only supports full close directly by position ID in current MT5 implementation, partial reduces it if API supports it later
          await hedgingEngineRef.closePosition(userOderId, pos.oderId || pos._id, null, closePrice, {
            skipTradeHold: true,
            closeReason: isPartialStop ? 'partial_stop_out' : 'stop_out'
          });
        } else {
          // Netting allows fractional volume closures seamlessly
          await nettingEngineRef.closePosition(userOderId, pos.symbol, volumeToClose, closePrice, {
            skipTradeHold: true,
            closeReason: isPartialStop ? 'partial_stop_out' : 'stop_out'
          });
        }
        console.log(`[Risk] ${isPartialStop ? 'Partial ' : ''}Stop Out closed position: ${pos.symbol} (P/L: ${(pos.profit || 0).toFixed(2)})`);
      } catch (err) {
        console.error(`[Risk] Stop Out close error for ${pos.symbol}:`, err.message);
      }
    }
    
    // Notify user
    if (io) {
      io.to(userOderId).emit('stopOut', {
        marginLevel: marginLevel.toFixed(2),
        stopOutLevel,
        message: `Stop Out: Positions closed due to margin level falling to ${marginLevel.toFixed(2)}%.`
      });
      
      // Send updated positions
      try {
        const h = await hedgingEngineRef.getPositions(userOderId);
        const n = await nettingEngineRef.getPositions(userOderId);
        io.to(userOderId).emit('positionUpdate', { mode: 'hedging', positions: h });
        io.to(userOderId).emit('positionUpdate', { mode: 'netting', positions: n });
      } catch (_) {}
    }
  }
  } finally {
    stopOutLiquidating.delete(userOderId);
  }
}

module.exports = {
  setRiskEngines,
  drawdownPercentOfBalance,
  assertTradeHoldAllowed,
  assertTradeHoldInternal,
  maybeLiquidateUser,
  liquidateAllForUser,
  reconcileWalletEquityForUser,
  checkStopOut
};
