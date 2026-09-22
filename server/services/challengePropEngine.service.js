/**
 * ChallengePropEngine — isolated trading engine for prop-challenge accounts.
 *
 * Every operation here debits/credits ONLY the ChallengeAccount's virtual
 * sub-wallet (walletBalance / walletEquity / walletMargin / walletFreeMargin).
 * The user's User.wallet is never touched by this engine. Real INR only
 * leaves the platform when a payout request is approved by an admin.
 *
 * Contract:
 *   - openPosition(challengeAccountId, orderData)   → validates rules,
 *     debits walletMargin, creates ChallengePosition
 *   - closePosition(positionId, closePrice, reason) → realises P&L into
 *     walletBalance, releases margin, runs drawdown / profit-target checks
 *   - refreshEquity(challengeAccountId, livePrices) → recomputes
 *     walletEquity from open positions' floating P&L, fires drawdown check
 */

const ChallengeAccount = require('../models/ChallengeAccount');
const ChallengePosition = require('../models/ChallengePosition');
const NettingSegment = require('../models/NettingSegment');
const NettingScriptOverride = require('../models/NettingScriptOverride');
const UserSegmentSettings = require('../models/UserSegmentSettings');
const propTradingEngine = require('./propTradingEngine');

function genPositionId() {
  return `CHP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/**
 * Effective contract units for a position, i.e. the number we must
 * multiply the per-unit price diff by to get INR P&L.
 *
 * Priority:
 *   1. `quantity` if it's already been computed and stored
 *      (full contract count = lots × lotSize).
 *   2. `volume × lotSize` when both are present.
 *   3. `volume` as a last resort (equivalent to the legacy 1:1 behaviour
 *      that existed before this helper — keeps main-wallet-style symbols
 *      with a 1:1 contract size working).
 *
 * Used by openPosition (margin math), closePosition (realised PnL) and
 * refreshEquity (floating PnL) so every code path agrees on the same
 * multiplier. Previously each path used only `volume`, which meant F&O
 * positions booked PnL of only the price diff × lots — missing the
 * lot-size multiplier entirely (e.g. NIFTY options 1 lot = 65 units).
 */
function pnlUnits(pos) {
  const qty = Number(pos?.quantity);
  if (Number.isFinite(qty) && qty > 0) return qty;
  const vol = Number(pos?.volume) || 0;
  const lot = Number(pos?.lotSize);
  if (Number.isFinite(lot) && lot > 0) return vol * lot;
  return vol;
}

// True when `price` is so far from a position's entry that it can only be a
// corrupted feed tick (e.g. the NIFTY index feed briefly returning the raw
// ~24,000 level against a ~233-scaled entry). Used to block anomalous closes
// AND to skip anomalous ticks in mark-to-market so a glitch can't book a fake
// P&L or trip a false drawdown breach. Options get a wider up-band and no
// down-band because a premium can legitimately collapse toward zero.
function isAnomalousPrice(entryPrice, price, symbol) {
  const entry = Number(entryPrice);
  const p = Number(price);
  if (!(entry > 0) || !(p > 0)) return false; // not enough info to judge
  const sym = String(symbol || '').replace(/\s+/g, '').toUpperCase();
  const isOption = /(CE|PE)$/.test(sym);
  const ratio = p / entry;
  const tooHigh = isOption ? ratio > 20 : ratio > 5;
  const tooLow = !isOption && ratio < 0.2;
  return tooHigh || tooLow;
}

/**
 * Resolve the NettingSegment name from exchange + symbol (mirrors NettingEngine logic).
 */
function resolveSegmentName(exchange, symbol) {
  const ex = String(exchange || '').toUpperCase();
  const sym = String(symbol || '').toUpperCase();
  const isOptions = sym.endsWith('CE') || sym.endsWith('PE');
  const isFutures = sym.endsWith('FUT') || sym.includes('FUT');

  if (ex === 'NSE') return isOptions ? 'NSE_OPT' : isFutures ? 'NSE_FUT' : 'NSE_EQ';
  if (ex === 'BSE') return isOptions ? 'BSE_OPT' : isFutures ? 'BSE_FUT' : 'BSE_EQ';
  if (ex === 'MCX') return isOptions ? 'MCX_OPT' : 'MCX_FUT';
  if (ex === 'NFO') return isOptions ? 'NSE_OPT' : 'NSE_FUT';
  if (ex === 'BFO') return isOptions ? 'BSE_OPT' : 'BSE_FUT';
  if (ex === 'FOREX') return 'FOREX';
  if (ex === 'INDICES') return 'INDICES';
  if (ex === 'COMMODITIES' || ex === 'COMEX') return 'COMMODITIES';
  if (ex === 'STOCKS') return 'STOCKS';
  if (ex === 'DELTA') return 'CRYPTO_PERPETUAL';
  // Fallback: try to infer from symbol
  if (isOptions) return 'NSE_OPT';
  if (isFutures) return 'NSE_FUT';
  return null;
}

/**
 * Resolve the admin-configured spread (in instrument price units) for this
 * user + symbol on a challenge trade. Mirrors NettingEngine's resolution:
 * per-user override > script override > segment default (via
 * UserSegmentSettings.getEffectiveSettingsForUser, netting mode).
 *
 * Why this exists: prop-challenge trades go through this engine, NOT
 * NettingEngine — so until now NO spread (segment OR per-user) was ever applied
 * to challenge entries. The admin's Spread settings had zero effect. This
 * closes that gap. Returns { pips: 0 } when nothing is configured (no-op).
 */
async function resolveUserSpread(account, orderData) {
  try {
    const segName = resolveSegmentName(orderData.exchange, orderData.symbol);
    if (!segName) return { pips: 0, type: 'fixed' };
    const seg = await NettingSegment.findOne({ name: segName }).select('_id');
    if (!seg) return { pips: 0, type: 'fixed' };
    const eff = await UserSegmentSettings.getEffectiveSettingsForUser(
      account.userId, seg._id, orderData.symbol, 'netting'
    );
    return {
      pips: Math.max(0, Number(eff?.spreadPips) || 0),
      type: String(eff?.spreadType || 'fixed').toLowerCase()
    };
  } catch (e) {
    console.error('[ChallengePropEngine] resolveUserSpread error:', e.message);
    return { pips: 0, type: 'fixed' };
  }
}

/**
 * Compute margin using admin segment settings (same logic as NettingEngine).
 * Returns margin in INR for Indian segments.
 * Falls back to simple (price × qty) / leverage if no segment settings found.
 */
async function computeSegmentMargin(orderData, volume, effectiveQty, entryPrice, leverage) {
  const segName = resolveSegmentName(orderData.exchange, orderData.symbol);
  if (!segName) return (entryPrice * effectiveQty) / leverage;

  const seg = await NettingSegment.findOne({ name: segName }).lean();
  if (!seg) return (entryPrice * effectiveQty) / leverage;

  // Look up per-script override (e.g. NIFTY, BANKNIFTY, SENSEX can each
  // have their own optionSellIntraday). Match by base symbol extracted
  // from the full trading symbol (NIFTY2650524100PE → NIFTY).
  const sym = String(orderData.symbol || '').toUpperCase();
  let scriptOverride = null;
  const baseMatch = sym.match(/^([A-Z&]+(?:-[A-Z&]+)?)(?=\d|$)/);
  const baseSymbol = baseMatch ? baseMatch[1] : sym;
  const symVariants = [sym];
  if (baseSymbol !== sym) symVariants.push(baseSymbol);
  if (symVariants.length > 0) {
    const matches = await NettingScriptOverride.find({
      segmentId: seg._id,
      symbol: { $in: symVariants }
    }).lean();
    if (matches.length > 0) {
      // Prefer longer (more specific) match
      matches.sort((a, b) => b.symbol.length - a.symbol.length);
      scriptOverride = matches[0];
    }
  }

  const isOptions = sym.endsWith('CE') || sym.endsWith('PE') ||
    ['NSE_OPT', 'BSE_OPT', 'MCX_OPT', 'CRYPTO_OPTIONS'].includes(segName);
  const side = String(orderData.side || '').toLowerCase();

  // Determine raw margin value — script override takes precedence over segment
  let rawMarginValue = null;
  let calcMode = scriptOverride?.marginCalcMode || seg.marginCalcMode || 'fixed';
  if (isOptions) {
    if (side === 'buy') {
      rawMarginValue = scriptOverride?.optionBuyIntraday ?? seg.optionBuyIntraday;
      // Option BUY: if no specific buy margin set, charge premium only
      // (real brokers charge premium for buying options, not full margin)
      if (!(Number(rawMarginValue) > 0)) {
        return effectiveQty * entryPrice;
      }
    } else {
      rawMarginValue = scriptOverride?.optionSellIntraday ?? seg.optionSellIntraday;
    }
  }
  // Fallback to base intraday margin if option-specific not set (SELL / non-option)
  if (!(Number(rawMarginValue) > 0)) {
    rawMarginValue =
      scriptOverride?.intradayHolding ??
      scriptOverride?.intradayMargin ??
      seg.intradayMargin ??
      seg.intradayHolding;
  }

  // If still no admin margin configured, simple formula
  if (!(Number(rawMarginValue) > 0)) {
    return (entryPrice * effectiveQty) / leverage;
  }

  // Apply margin calc mode (same as NettingEngine.nettingFixedMarginAmount)
  const r = Number(rawMarginValue);
  switch (calcMode) {
    case 'percent': {
      const cappedPct = Math.min(r, 100);
      return effectiveQty * entryPrice * (cappedPct / 100);
    }
    case 'times': {
      const effectiveMultiplier = r * (leverage / 100);
      return (effectiveQty * entryPrice) / effectiveMultiplier;
    }
    case 'fixed':
    default:
      return r * volume; // per-lot fixed margin × lots
  }
}

/**
 * Compute open/close commission from admin segment settings (mirrors NettingEngine).
 * Returns commission in INR. chargePhase = 'open' | 'close'.
 *
 * Resolves through UserSegmentSettings.getEffectiveSettingsForUser (netting
 * mode) — same as resolveUserSpread — so a PER-USER brokerage override wins over
 * script override and segment default. Before this, prop trades read only the
 * segment + script layers, so user-wise brokerage set on NIFTY/index options
 * (or any symbol) had zero effect on the actual trade.
 */
async function computeCommission(account, orderData, volume, effectiveQty, entryPrice, chargePhase) {
  const segName = resolveSegmentName(orderData.exchange, orderData.symbol);
  if (!segName) return 0;

  const seg = await NettingSegment.findOne({ name: segName }).select('_id');
  if (!seg) return 0;

  // user > script > segment merge (commission, commissionType, chargeOn,
  // optionBuy/SellCommission all resolved here).
  let eff;
  try {
    eff = await UserSegmentSettings.getEffectiveSettingsForUser(
      account?.userId, seg._id, orderData.symbol, 'netting'
    );
  } catch (e) {
    console.error('[ChallengePropEngine] computeCommission resolve error:', e.message);
    return 0;
  }
  if (!eff) return 0;

  const chargeOn = eff.chargeOn || 'open';
  const shouldCharge =
    (chargePhase === 'open'  && (chargeOn === 'open' || chargeOn === 'both')) ||
    (chargePhase === 'close' && (chargeOn === 'close' || chargeOn === 'both'));
  if (!shouldCharge) return 0;

  // Pick commission rate (option-side-specific or base)
  const sym = String(orderData.symbol || '').toUpperCase();
  const isOptions = sym.endsWith('CE') || sym.endsWith('PE') ||
    ['NSE_OPT', 'BSE_OPT', 'MCX_OPT', 'CRYPTO_OPTIONS'].includes(segName);
  const side = String(orderData.side || '').toLowerCase();
  let rate = 0;
  if (isOptions) {
    rate = side === 'buy'
      ? Number(eff.optionBuyCommission) || 0
      : Number(eff.optionSellCommission) || 0;
  }
  if (!rate) rate = Number(eff.commission) || 0;
  if (!rate) return 0;

  // Calculate using commissionType (same as NettingEngine.calculateCommission)
  const commType = eff.commissionType || 'per_lot';
  const typeNorm = String(commType).toLowerCase().replace(/-/g, '_');
  switch (typeNorm) {
    case 'per_lot':      return rate * volume;
    case 'per_crore':    return (effectiveQty * entryPrice / 10000000) * rate;
    case 'percentage':   return (effectiveQty * entryPrice * rate) / 100;
    case 'fixed':        return rate;
    default:             return rate * volume;
  }
}

/**
 * Recompute wallet aggregates from balance + open positions.
 */
function recomputeWallet(account, openPositions) {
  const balance = Number(account.walletBalance) || 0;
  const credit = Number(account.walletCredit) || 0;
  let floatingPnl = 0;
  let margin = 0;
  for (const pos of openPositions) {
    floatingPnl += Number(pos.profit) || 0;
    margin += Number(pos.marginUsed) || 0;
  }
  const equity = balance + credit + floatingPnl;
  const freeMargin = Math.max(0, equity - margin);
  const marginLevel = margin > 0 ? (equity / margin) * 100 : 0;

  account.walletMargin = margin;
  account.walletEquity = equity;
  account.walletFreeMargin = freeMargin;
  account.walletMarginLevel = marginLevel;
  return account;
}

/**
 * Pure MT5 pending-order rules (no DB / no side effects) so they can be
 * unit-tested directly.
 *
 * pendingPlacementError: returns null if the trigger is validly placed vs the
 * live market, else a human-readable error. Placement is only enforced when
 * both bid & ask are known (>0); otherwise returns null (can't validate).
 *   BUY  LIMIT: trigger below Ask   | SELL LIMIT: trigger above Bid
 *   BUY  STOP : trigger above Ask   | SELL STOP : trigger below Bid
 */
function pendingPlacementError(type, side, trigger, bid, ask) {
  const t = String(type || '').toLowerCase();
  const s = String(side || '').toLowerCase();
  const trg = Number(trigger);
  const a = Number(ask);
  const b = Number(bid);
  if (!(a > 0 && b > 0) || !(trg > 0)) return null;
  if (t === 'limit') {
    if (s === 'buy' && trg >= a) return `Buy Limit price (₹${trg}) must be BELOW the current Ask ₹${a.toFixed(2)}. Use a Stop order to buy above the market.`;
    if (s === 'sell' && trg <= b) return `Sell Limit price (₹${trg}) must be ABOVE the current Bid ₹${b.toFixed(2)}. Use a Stop order to sell below the market.`;
  } else if (t === 'stop') {
    if (s === 'buy' && trg <= a) return `Buy Stop price (₹${trg}) must be ABOVE the current Ask ₹${a.toFixed(2)}. Use a Limit order to buy below the market.`;
    if (s === 'sell' && trg >= b) return `Sell Stop price (₹${trg}) must be BELOW the current Bid ₹${b.toFixed(2)}. Use a Limit order to sell above the market.`;
  }
  return null;
}

/**
 * isPendingTriggerHit: true when the live market has reached the pending
 * order's trigger and it should fill.
 *   BUY  LIMIT: fills when Ask <= trigger   | SELL LIMIT: fills when Bid >= trigger
 *   BUY  STOP : fills when Ask >= trigger   | SELL STOP : fills when Bid <= trigger
 */
function isPendingTriggerHit(type, side, trigger, bid, ask) {
  const t = String(type || '').toLowerCase();
  const s = String(side || '').toLowerCase();
  const trg = Number(trigger);
  const a = Number(ask);
  const b = Number(bid);
  if (!(trg > 0)) return false;
  if (t === 'limit') {
    if (s === 'buy') return a > 0 && a <= trg;
    if (s === 'sell') return b > 0 && b >= trg;
  } else if (t === 'stop') {
    if (s === 'buy') return a > 0 && a >= trg;
    if (s === 'sell') return b > 0 && b <= trg;
  }
  return false;
}

/**
 * Validate a SL/TP pair against the fill/trigger price. Returns null if valid,
 * else an error message. BUY: SL below, TP above. SELL: SL above, TP below.
 */
function sltpErrorVsPrice(side, price, sl, tp) {
  const s = String(side || '').toLowerCase();
  const p = Number(price);
  const slN = sl != null && sl !== '' ? Number(sl) : null;
  const tpN = tp != null && tp !== '' ? Number(tp) : null;
  if (!(p > 0)) return null;
  if (s === 'buy') {
    if (slN != null && slN >= p) return `Stop Loss must be BELOW the order price ₹${p} for a BUY.`;
    if (tpN != null && tpN <= p) return `Take Profit must be ABOVE the order price ₹${p} for a BUY.`;
  } else if (s === 'sell') {
    if (slN != null && slN <= p) return `Stop Loss must be ABOVE the order price ₹${p} for a SELL.`;
    if (tpN != null && tpN >= p) return `Take Profit must be BELOW the order price ₹${p} for a SELL.`;
  }
  return null;
}

/**
 * Best-effort live bid/ask for pending-order trigger validation & activation.
 * Prefers the marketData the client sent, then falls back to the Zerodha
 * price cache. Returns {bid, ask} (0 when unknown).
 */
function getLiveBidAsk(symbol, marketData) {
  const md = marketData || {};
  let bid = Number(md.bid) || 0;
  let ask = Number(md.ask) || 0;
  if (!(bid > 0) || !(ask > 0)) {
    try {
      const ZerodhaService = require('./zerodha.service');
      const all = typeof ZerodhaService.getAllPrices === 'function' ? ZerodhaService.getAllPrices() : {};
      const lp = all[symbol] || {};
      const rb = Number(lp.bid) || 0;
      const ra = Number(lp.ask) || 0;
      const last = Number(lp.lastPrice) || Number(lp.last_price) || Number(lp.ltp) || Number(lp.last) || 0;
      if (rb > 0 && ra > 0) { bid = rb; ask = ra; }
      else if (last > 0) { bid = bid || last; ask = ask || last; }
    } catch (_) { /* zerodha optional */ }
  }
  return { bid, ask };
}

// Indian equity / index F&O segments stop accepting new orders at 15:15 IST
// (15-min cutoff before the official 15:30 close) and don't trade outside
// 09:15-15:15 on weekdays. MCX (commodities) keeps its longer window. Other
// segments (FOREX/CRYPTO etc.) are 24/7 and skip this gate entirely.
function isIndianMarketOpenForNewOrders(exchange) {
  const ex = String(exchange || '').toUpperCase();
  const INDIAN = new Set(['NSE', 'NFO', 'BSE', 'BFO', 'CDS']);
  if (!INDIAN.has(ex)) return { allowed: true };

  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) {
    return { allowed: false, reason: 'Indian market is closed on weekends. New orders are not allowed.' };
  }
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  const open = 9 * 60 + 15;   // 09:15 IST
  const cutoff = 15 * 60 + 15; // 15:15 IST — order entry stops here
  if (minutes < open) {
    return { allowed: false, reason: 'Indian market opens at 09:15 IST. New orders cannot be placed yet.' };
  }
  if (minutes >= cutoff) {
    return { allowed: false, reason: 'Indian market order cutoff is 15:15 IST. All open positions are auto-squared-off at 15:15.' };
  }
  return { allowed: true };
}

async function openPosition(challengeAccountId, orderData) {
  const account = await ChallengeAccount.findById(challengeAccountId).populate('challengeId');
  if (!account) return { success: false, error: 'Challenge account not found' };
  if (!['ACTIVE', 'FUNDED'].includes(account.status)) {
    return { success: false, error: `Account is ${account.status}` };
  }

  // Block new orders on Indian segments outside 09:15-15:15 IST.
  const marketCheck = isIndianMarketOpenForNewOrders(orderData.exchange || orderData.segment);
  if (!marketCheck.allowed) {
    return { success: false, error: marketCheck.reason, code: 'MARKET_CLOSED' };
  }

  // Run the full rule-based validator (extends to maxLeverage,
  // takeProfitMandatory, etc. — all rules live in propTradingEngine).
  const validation = await propTradingEngine.validateTradeOpen(challengeAccountId, {
    symbol: orderData.symbol,
    segment: orderData.segment || orderData.exchange,
    quantity: orderData.volume || orderData.quantity,
    leverage: orderData.leverage,
    sl: orderData.stopLoss,
    stopLoss: orderData.stopLoss,
    tp: orderData.takeProfit,
    takeProfit: orderData.takeProfit
  });
  if (!validation.valid) {
    return { success: false, error: validation.error, code: validation.code };
  }

  // Margin math — uses admin NettingSegment settings (same as real brokers
  // like Upstox). Option SELL uses the configured fixed/percent margin,
  // option BUY uses premium, futures use intradayMargin. Falls back to
  // (price × qty) / leverage only if admin hasn't configured any margin.
  const volume = Number(orderData.volume || orderData.quantity) || 0;
  let entryPrice = Number(orderData.entryPrice || orderData.price) || 0;
  const leverage = Number(orderData.leverage) || 100;
  const lotSize = Number(orderData.lotSize) > 0 ? Number(orderData.lotSize) : 1;
  // Effective contract count for PnL — mirrors the same formula
  // used below in closePosition / refreshEquity so margin reserved and
  // PnL booked always agree on "units traded".
  const effectiveQty =
    Number(orderData.quantity) > 0 ? Number(orderData.quantity) : volume * lotSize;
  if (!volume || !entryPrice) {
    return { success: false, error: 'Missing volume or entry price' };
  }

  // Limit / Stop orders are PENDING — they must NOT fill until the market
  // reaches the trigger price. (Previously every order, including limit/stop,
  // was booked instantly as an open position at the requested price, so a
  // limit set at 200 executed even while the market traded at 230.)
  const orderTypeLc = String(orderData.orderType || 'market').toLowerCase();
  const isPendingOrder = orderTypeLc === 'limit' || orderTypeLc === 'stop';

  // Reject SL/TP already on the WRONG side of the live close price so the order
  // doesn't auto-close on the very next tick. A BUY closes at the BID, a SELL at
  // the ASK — the same prices refreshEquity() triggers on. SL below / TP above
  // for BUY; SL above / TP below for SELL.
  // Skipped for pending orders — those are validated against the TRIGGER price
  // below (the live price is irrelevant until the order fills).
  if (!isPendingOrder) {
    const sl = orderData.stopLoss != null && orderData.stopLoss !== '' ? Number(orderData.stopLoss) : null;
    const tp = orderData.takeProfit != null && orderData.takeProfit !== '' ? Number(orderData.takeProfit) : null;
    if (sl != null || tp != null) {
      const sideLc = String(orderData.side || '').toLowerCase();
      const ZerodhaService = require('./zerodha.service');
      const allPrices = typeof ZerodhaService.getAllPrices === 'function' ? ZerodhaService.getAllPrices() : {};
      const lp = allPrices[orderData.symbol] || {};
      const lastLike = Number(lp.lastPrice) || Number(lp.last_price) || Number(lp.ltp) || Number(lp.last) || 0;
      const closePx = sideLc === 'buy'
        ? (Number(lp.bid) || lastLike || entryPrice)
        : (Number(lp.ask) || lastLike || entryPrice);
      if (closePx > 0) {
        const px = closePx.toFixed(2);
        if (sideLc === 'buy') {
          if (sl != null && sl >= closePx) return { success: false, error: `Stop Loss must be BELOW the current price ₹${px} for a BUY — otherwise it triggers instantly.` };
          if (tp != null && tp <= closePx) return { success: false, error: `Take Profit must be ABOVE the current price ₹${px} for a BUY — otherwise it triggers instantly.` };
        } else if (sideLc === 'sell') {
          if (sl != null && sl <= closePx) return { success: false, error: `Stop Loss must be ABOVE the current price ₹${px} for a SELL — otherwise it triggers instantly.` };
          if (tp != null && tp >= closePx) return { success: false, error: `Take Profit must be BELOW the current price ₹${px} for a SELL — otherwise it triggers instantly.` };
        }
      }
    }
  }

  // ── Admin spread enforcement (per-user > script > segment), mirroring
  // NettingEngine. BUY pays more, SELL receives less vs the quoted price.
  // Only applies where admin configured spreadPips > 0 for this user/segment —
  // otherwise it's a pure no-op. Challenge orders carry no live bid/ask, so the
  // 'floating' type uses the configured floor (same as NettingEngine fallback).
  // The spread-adjusted price flows into margin, commission and the booked
  // position so the trader pays the spread exactly like a real fill.
  const rawEntryPrice = entryPrice;
  const { pips: spreadPips, type: spreadType } = await resolveUserSpread(account, orderData);
  if (spreadPips > 0) {
    entryPrice = orderData.side === 'buy'
      ? entryPrice + spreadPips
      : Math.max(0, entryPrice - spreadPips);
    console.log(`[ChallengePropEngine] Spread (${spreadType}) ${String(orderData.side).toUpperCase()} ${orderData.symbol}: ${rawEntryPrice} → ${entryPrice} (±${spreadPips} px units)`);
  }

  const marginRequired = await computeSegmentMargin(orderData, volume, effectiveQty, entryPrice, leverage);
  const openCommission = await computeCommission(account, orderData, volume, effectiveQty, entryPrice, 'open');
  const totalRequired = marginRequired + openCommission;

  if (account.walletFreeMargin < totalRequired) {
    return {
      success: false,
      error: `Insufficient free margin on challenge account. Available ₹${account.walletFreeMargin.toFixed(2)}, required ₹${totalRequired.toFixed(2)}` +
        (openCommission > 0 ? ` (Margin ₹${marginRequired.toFixed(2)} + Commission ₹${openCommission.toFixed(2)})` : '')
    };
  }

  // ── Limit/Stop → place a PENDING order (does NOT fill now) ──────────────
  // The order sits at status 'pending' until refreshEquity() sees the live
  // market reach its trigger price, then it activates into an open position.
  // This is the core fix for "limit set at 200 filled while price was 230".
  if (isPendingOrder) {
    const sideLc = String(orderData.side || '').toLowerCase();
    const trigger = rawEntryPrice; // user's limit/stop price (pre-spread)
    const { bid, ask } = getLiveBidAsk(orderData.symbol, orderData.marketData);

    // MT5 placement rules relative to the live market (buy-limit below ask, etc.)
    const placementErr = pendingPlacementError(orderTypeLc, sideLc, trigger, bid, ask);
    if (placementErr) return { success: false, error: placementErr };

    // Validate SL/TP against the TRIGGER (fill) price — not the live price,
    // which is irrelevant until the order fills.
    const sltpErr = sltpErrorVsPrice(sideLc, trigger, orderData.stopLoss, orderData.takeProfit);
    if (sltpErr) return { success: false, error: sltpErr };

    // Reserve margin only — commission is charged when the order fills.
    if (account.walletFreeMargin < marginRequired) {
      return { success: false, error: `Insufficient free margin to place order. Available ₹${account.walletFreeMargin.toFixed(2)}, required ₹${marginRequired.toFixed(2)}` };
    }

    const pending = await ChallengePosition.create({
      challengeAccountId: account._id,
      userId: account.userId,
      positionId: genPositionId(),
      symbol: orderData.symbol,
      side: orderData.side,
      volume,
      quantity: effectiveQty,
      lotSize,
      entryPrice,               // spread-adjusted fill price (applied when it triggers)
      currentPrice: entryPrice,
      triggerPrice: trigger,    // live market must reach this before it fills
      pendingOrderType: orderTypeLc,
      stopLoss: orderData.stopLoss || null,
      takeProfit: orderData.takeProfit || null,
      leverage,
      marginUsed: marginRequired,
      exchange: orderData.exchange || 'NSE',
      segment: orderData.segment || '',
      session: orderData.session || 'intraday',
      orderType: orderTypeLc,
      status: 'pending'
    });

    const freshP = await ChallengeAccount.findById(account._id);
    // Reserve margin for open + pending positions so a pending order can't be
    // over-leveraged (recomputeWallet only sums the positions it's handed).
    const reservedP = await ChallengePosition.find({ challengeAccountId: account._id, status: { $in: ['open', 'pending'] } });
    recomputeWallet(freshP, reservedP);
    freshP.currentBalance = freshP.walletBalance;
    await freshP.save();

    console.log(`[ChallengePropEngine] PENDING ${orderTypeLc.toUpperCase()} ${sideLc.toUpperCase()} ${orderData.symbol} @ trigger ₹${trigger} (live bid ${bid}/ask ${ask})`);
    return { success: true, position: pending, account: freshP, isPendingOrder: true };
  }

  // Debit commission from balance (like NettingEngine)
  if (openCommission > 0) {
    account.walletBalance = Number(account.walletBalance) - openCommission;
  }

  const position = await ChallengePosition.create({
    challengeAccountId: account._id,
    userId: account.userId,
    positionId: genPositionId(),
    symbol: orderData.symbol,
    side: orderData.side,
    volume,
    quantity: effectiveQty,
    lotSize,
    entryPrice,
    currentPrice: entryPrice,
    stopLoss: orderData.stopLoss || null,
    takeProfit: orderData.takeProfit || null,
    leverage,
    marginUsed: marginRequired,
    commission: openCommission,
    openCommission: openCommission,
    commissionInr: openCommission,
    openCommissionInr: openCommission,
    exchange: orderData.exchange || 'NSE',
    segment: orderData.segment || '',
    session: orderData.session || 'intraday',
    orderType: orderData.orderType || 'market',
    status: 'open'
  });

  // Update the account's trade counters via propTradingEngine.
  await propTradingEngine.onTradeOpened(account._id);

  // Re-read to get fresh counters, then recompute wallet aggregates.
  // Re-apply the openCommission debit on the fresh object — onTradeOpened()
  // re-fetches and saves the account from DB, so the in-memory walletBalance
  // mutation done above is lost. Without this, position.openCommission is
  // stored but never actually deducted from balance, and closed-trade
  // position.profit (which subtracts openCommission) ends up ₹openComm
  // more negative than the realised balance change.
  const fresh = await ChallengeAccount.findById(account._id);
  if (openCommission > 0) {
    fresh.walletBalance = Number(fresh.walletBalance) - openCommission;
  }
  // Include pending orders so their reserved margin isn't "released" on this recompute.
  const openPositions = await ChallengePosition.find({ challengeAccountId: account._id, status: { $in: ['open', 'pending'] } });
  recomputeWallet(fresh, openPositions);
  fresh.currentBalance = fresh.walletBalance;
  await fresh.save();

  return { success: true, position, account: fresh };
}

async function closePosition(positionId, closePrice, reason = 'user', options = {}) {
  const position = await ChallengePosition.findOne({ positionId, status: 'open' });
  if (!position) return { success: false, error: 'Position not found or already closed' };

  const account = await ChallengeAccount.findById(position.challengeAccountId);
  if (!account) return { success: false, error: 'Challenge account not found' };

  const entry = Number(position.entryPrice);
  let close = Number(closePrice);
  if (!(close > 0)) return { success: false, error: 'Invalid close price' };

  // ── Authoritative price ──────────────────────────────────────────────
  // The browser resolves the close price from a Zerodha tick cache it keeps in
  // localStorage (up to 7 days) and RETAINS a stale depth bid — so closes were
  // booked at a frozen value (e.g. 122.70) far from the live LTP the user saw.
  // Prefer the SERVER's own fresh, correctly-keyed price (same symbol key) and
  // fall back to the client value only when the server has no fresh tick. We
  // close on LTP to match the platform's display (Indian instruments show
  // bid=ask=LTP), with the depth side-price as a fallback. `reason` from an
  // internal auto-close (sl/tp/expiry/market-close) already carries an exact
  // price, so only re-price genuine user-initiated closes.
  // `skipPriceGuard` (internal intrinsic-settlement callers) bypass all of this
  // and book the exact price passed in.
  if (!options.skipPriceGuard) {
    // Build candidate close prices, server-preferred, and pick the first one
    // that is SANE vs the entry. This fixes two feed defects at once:
    //   • staleness — client value 122.70 (frozen depth bid) is skipped for the
    //     server's fresh LTP 150; and
    //   • scaling glitch — if the SERVER tick is the anomalous one (~24,000) we
    //     fall through to the sane client value instead of blocking the user.
    // Only user-initiated closes are re-priced; auto-closes (sl/tp/expiry/
    // market-close) already carry an exact deterministic trigger price.
    const candidates = [];
    if (reason === 'user') {
      try {
        const ZerodhaService = require('./zerodha.service');
        const lp = (typeof ZerodhaService.getAllPrices === 'function' ? ZerodhaService.getAllPrices() : {})[position.symbol] || {};
        const fresh = !lp.timestamp || (Date.now() - Number(lp.timestamp) < 120000); // within 2 min
        const ltp = Number(lp.lastPrice) || Number(lp.last_price) || Number(lp.ltp) || Number(lp.last) || 0;
        const sidePx = position.side === 'buy' ? (Number(lp.bid) || 0) : (Number(lp.ask) || 0);
        const serverPx = ltp > 0 ? ltp : sidePx; // LTP matches the platform's display
        if (fresh && serverPx > 0) candidates.push(serverPx);
      } catch (_) { /* server price unavailable */ }
    }
    candidates.push(close); // client-supplied value is the fallback

    const sane = candidates.find((c) => !isAnomalousPrice(entry, c, position.symbol));
    if (sane == null) {
      console.warn(`[closePosition] BLOCKED anomalous price for ${position.symbol} pos=${positionId}: entry=${entry} candidates=${candidates.join(',')}`);
      return {
        success: false,
        error: 'Price feed anomaly: the close price is far outside a sane range for this position, so the close was blocked to prevent an invalid P&L. Please try again in a moment.'
      };
    }
    if (sane !== close) console.log(`[closePosition] re-priced ${position.symbol} pos=${positionId}: client=${close} → ${sane}`);
    close = sane;
  }

  // ── Partial close ────────────────────────────────────────────────────
  // options.closeVolume < the position's volume closes only that many lots and
  // leaves the remainder OPEN. We realise P&L on the closed chunk, write a
  // separate CLOSED record for it (so trade history + accounting stay correct),
  // and shrink the original open position. If closeVolume is absent, null, or
  // >= the full volume, this is a normal full close (unchanged behaviour).
  const totalVol = Number(position.volume) || 0;
  let closeVol = options.closeVolume != null ? Number(options.closeVolume) : totalVol;
  if (!(closeVol > 0)) closeVol = totalVol;
  closeVol = Math.min(closeVol, totalVol);
  const isPartial = totalVol > 0 && closeVol < totalVol - 1e-9;
  const ratio = totalVol > 0 ? (closeVol / totalVol) : 1; // fraction being closed

  // Realised P&L in INR = per-unit price diff × contract count of the CLOSED
  // chunk. Contract count respects lotSize (e.g. NIFTY options 1 lot = 65
  // units) via pnlUnits(), scaled by the closed fraction.
  const priceDiff = position.side === 'buy'
    ? close - Number(position.entryPrice)
    : Number(position.entryPrice) - close;
  const unitsClosed = pnlUnits(position) * ratio;
  const realisedPnl = priceDiff * unitsClosed;

  // Close commission (proportional to the closed volume).
  const closeComm = await computeCommission(account, {
    exchange: position.exchange,
    symbol: position.symbol,
    side: position.side
  }, closeVol, unitsClosed, close, 'close');

  const openCommTotal = Number(position.openCommission) || 0;
  const openCommClosed = openCommTotal * ratio; // open comm attributable to the closed chunk
  const totalComm = openCommClosed + closeComm;
  const netPnl = realisedPnl - totalComm;

  // `closedRecord` is the document representing the CLOSED chunk (returned to
  // callers for the socket broadcast + response).
  let closedRecord;
  if (isPartial) {
    // 1) Write a CLOSED record for the closed portion (clone all fields off the
    //    live position so every required schema field is carried over).
    const closedDoc = position.toObject();
    delete closedDoc._id;
    delete closedDoc.id;
    closedDoc.positionId = `${position.positionId}-P${Date.now()}`;
    closedDoc.volume = closeVol;
    if (Number.isFinite(Number(position.quantity)) && Number(position.quantity) > 0) {
      closedDoc.quantity = Number(position.quantity) * ratio;
    }
    closedDoc.status = 'closed';
    closedDoc.closePrice = close;
    closedDoc.closeTime = new Date();
    closedDoc.closedBy = reason;
    closedDoc.realisedPnl = realisedPnl;
    closedDoc.profit = netPnl;
    closedDoc.openCommission = openCommClosed;
    closedDoc.closeCommission = closeComm;
    closedDoc.closeCommissionInr = closeComm;
    closedDoc.commission = totalComm;
    closedDoc.commissionInr = totalComm;
    closedRecord = await ChallengePosition.create(closedDoc);

    // 2) Shrink the ORIGINAL position and keep it OPEN.
    position.volume = totalVol - closeVol;
    if (Number.isFinite(Number(position.quantity)) && Number(position.quantity) > 0) {
      position.quantity = Number(position.quantity) * (1 - ratio);
    }
    position.openCommission = openCommTotal * (1 - ratio);
    await position.save();
  } else {
    position.status = 'closed';
    position.closePrice = close;
    position.closeTime = new Date();
    position.closedBy = reason;
    position.realisedPnl = realisedPnl;           // gross (for audit)
    position.profit = netPnl;                      // net after ALL commission (for display)
    position.closeCommission = closeComm;
    position.closeCommissionInr = closeComm;
    position.commission = totalComm;
    position.commissionInr = totalComm;
    await position.save();
    closedRecord = position;
  }

  // Settle on the sub-wallet: balance gets the PnL minus close commission
  // (open commission was already deducted at trade-open time), margin released.
  account.walletBalance = Number(account.walletBalance) + realisedPnl - closeComm;
  // Include pending orders so their reserved margin is preserved on recompute.
  const openPositions = await ChallengePosition.find({ challengeAccountId: account._id, status: { $in: ['open', 'pending'] } });
  recomputeWallet(account, openPositions);

  account.currentBalance = account.walletBalance;
  account.currentEquity = account.walletEquity;
  await account.save();

  // Pass NET P&L to the engine so dailyPnlMap, totalProfitLoss, and the
  // consistency / max-one-day-profit rules all reflect true after-commission
  // returns — not inflated gross numbers.
  // balanceAlreadySettled: the block above already booked realisedPnl into
  // walletBalance and synced currentBalance/currentEquity. Without this flag,
  // onTradeClosed would add netPnl a SECOND time → balance inflated by the
  // trade's P&L (the recurring daily balance/profit/DD corruption bug).
  const result = await propTradingEngine.onTradeClosed(account._id, netPnl, { balanceAlreadySettled: true });

  return {
    success: true,
    position: closedRecord,
    partial: isPartial,
    closedVolume: closeVol,
    remainingVolume: isPartial ? (totalVol - closeVol) : 0,
    account: result?.account || account,
    failed: result?.failed || false,
    phaseCompleted: result?.phaseCompleted || false,
    funded: result?.funded || false,
    reason: result?.reason
  };
}

/**
 * Activate any PENDING limit/stop orders whose trigger price has been reached
 * by the live market. Fills at the order's stored (spread-adjusted) entryPrice,
 * charges the open commission, and flips the order to an open position.
 *
 * MT5 trigger conventions:
 *   BUY  LIMIT: fills when Ask <= trigger   | SELL LIMIT: fills when Bid >= trigger
 *   BUY  STOP : fills when Ask >= trigger   | SELL STOP : fills when Bid <= trigger
 *
 * Returns the number of orders activated (so refreshEquity knows to re-read
 * the account, whose trade counters onTradeOpened() just mutated).
 */
async function activatePendingOrders(challengeAccountId, livePrices) {
  const pendings = await ChallengePosition.find({ challengeAccountId, status: 'pending' });
  if (pendings.length === 0) return 0;

  let activated = 0;
  for (const pos of pendings) {
    const lp = livePrices?.[pos.symbol];
    if (!lp) continue;
    const last = Number(lp.last) || Number(lp.lastPrice) || Number(lp.last_price) || 0;
    const askPx = Number(lp.ask) > 0 ? Number(lp.ask) : last;
    const bidPx = Number(lp.bid) > 0 ? Number(lp.bid) : last;
    const trigger = Number(pos.triggerPrice);
    if (!(trigger > 0)) continue;
    const side = String(pos.side || '').toLowerCase();
    const type = String(pos.pendingOrderType || pos.orderType || '').toLowerCase();

    if (!isPendingTriggerHit(type, side, trigger, bidPx, askPx)) continue;

    // Charge open commission now (mirrors the market-order open path). Fill at
    // the stored spread-adjusted entryPrice captured at placement.
    const account = await ChallengeAccount.findById(challengeAccountId);
    if (!account) break;
    const od = { symbol: pos.symbol, side: pos.side, exchange: pos.exchange, segment: pos.segment, orderType: type };
    let openCommission = 0;
    try {
      openCommission = await computeCommission(account, od, pos.volume, pnlUnits(pos), pos.entryPrice, 'open');
    } catch (_) { openCommission = 0; }

    pos.status = 'open';
    pos.activatedAt = new Date();
    pos.openTime = new Date();
    pos.commission = openCommission;
    pos.openCommission = openCommission;
    pos.commissionInr = openCommission;
    pos.openCommissionInr = openCommission;
    await pos.save();

    // Persist the commission debit to DB BEFORE onTradeOpened() (which re-reads
    // and re-saves the account) so the debit isn't lost.
    if (openCommission > 0) {
      account.walletBalance = Number(account.walletBalance) - openCommission;
      await account.save();
    }
    try { await propTradingEngine.onTradeOpened(account._id); } catch (_) { /* counter update best-effort */ }

    activated++;
    console.log(`[ChallengePropEngine] PENDING ACTIVATED ${type.toUpperCase()} ${side.toUpperCase()} ${pos.symbol} @ ${pos.entryPrice} (trigger ${trigger}, bid ${bidPx}/ask ${askPx})`);
  }
  return activated;
}

/**
 * Recompute floating P&L on open challenge positions using the given live
 * price map (symbol -> { bid, ask, last }). Then refresh the sub-wallet
 * aggregates and run the drawdown-breach check. Intended to be called from
 * the same tick loop that updates main-wallet positions.
 */
async function refreshEquity(challengeAccountId, livePrices) {
  const account = await ChallengeAccount.findById(challengeAccountId).populate('challengeId');
  if (!account) return null;

  // Phase 0 — activate pending limit/stop orders whose trigger price is hit.
  const activatedCount = await activatePendingOrders(challengeAccountId, livePrices);

  let openPositions = await ChallengePosition.find({ challengeAccountId, status: 'open' });

  // Phase 1 — SL/TP trigger evaluation. Trigger conventions match MT5 / the
  // netting engine's _checkPerFillSLTP:
  //   BUY  position marks-to-market at bid. SL hit when bid <= sl, TP when bid >= tp.
  //   SELL position marks-to-market at ask. SL hit when ask >= sl, TP when ask <= tp.
  // The position is closed at the SL/TP level itself (not the crossing
  // price) so realised PnL is deterministic and fair.
  const triggered = [];
  for (const pos of openPositions) {
    const lp = livePrices?.[pos.symbol];
    if (!lp) continue;
    const bid = Number(lp.bid);
    const ask = Number(lp.ask);
    const sl = pos.stopLoss != null ? Number(pos.stopLoss) : null;
    const tp = pos.takeProfit != null ? Number(pos.takeProfit) : null;
    const side = String(pos.side || '').toLowerCase();
    // Don't let a corrupted tick falsely trigger SL/TP on this position.
    const markPx = side === 'buy' ? bid : ask;
    if (isAnomalousPrice(pos.entryPrice, markPx, pos.symbol)) continue;

    let triggerPrice = null;
    let reason = null;
    if (side === 'buy') {
      if (sl != null && bid > 0 && bid <= sl) { triggerPrice = sl; reason = 'sl'; }
      else if (tp != null && bid > 0 && bid >= tp) { triggerPrice = tp; reason = 'tp'; }
    } else if (side === 'sell') {
      if (sl != null && ask > 0 && ask >= sl) { triggerPrice = sl; reason = 'sl'; }
      else if (tp != null && ask > 0 && ask <= tp) { triggerPrice = tp; reason = 'tp'; }
    }
    if (triggerPrice != null && reason) {
      triggered.push({ positionId: pos.positionId, symbol: pos.symbol, triggerPrice, reason });
    }
  }

  for (const t of triggered) {
    try {
      await closePosition(t.positionId, t.triggerPrice, t.reason);
      console.log(
        `[Challenge SL/TP] ${t.reason.toUpperCase()} hit on ${t.symbol} (${t.positionId}): closed @ ${t.triggerPrice}`
      );
    } catch (err) {
      console.error('[Challenge SL/TP] close error for', t.positionId, err.message);
    }
  }

  // If any positions closed, re-fetch the remaining open list so the
  // mark-to-market + wallet recompute below reflects the closures.
  if (triggered.length > 0) {
    openPositions = await ChallengePosition.find({ challengeAccountId, status: 'open' });
  }

  // Phase 2 — mark-to-market the still-open positions. Floating P&L
  // uses the same pnlUnits() helper as realised P&L so the number the
  // user sees before/after close never jumps.
  //
  // Also build a markPriceMap (positionId → mark price) keyed to THIS
  // tick. If a breach fires below, the auto-close path uses this map
  // directly instead of re-reading pos.currentPrice from the DB — that
  // re-read can race with a concurrent refreshEquity tick that updated
  // pos.currentPrice to a (possibly recovered) value, leaving realised
  // loss < the floating dip that caused the breach.
  const markPriceMap = new Map();
  for (const pos of openPositions) {
    const lp = livePrices?.[pos.symbol];
    if (!lp) continue;
    const currentPrice = pos.side === 'buy' ? (lp.bid ?? lp.last ?? pos.currentPrice) : (lp.ask ?? lp.last ?? pos.currentPrice);
    // Skip a corrupted tick so floating P&L / equity can't spike and trip a
    // false drawdown breach — keep the last known good currentPrice/profit.
    if (isAnomalousPrice(pos.entryPrice, currentPrice, pos.symbol)) {
      console.warn(`[refreshEquity] skipped anomalous tick for ${pos.symbol}: entry=${pos.entryPrice} px=${currentPrice}`);
      continue;
    }
    pos.currentPrice = Number(currentPrice);
    const priceDiff = pos.side === 'buy'
      ? Number(currentPrice) - Number(pos.entryPrice)
      : Number(pos.entryPrice) - Number(currentPrice);
    pos.profit = priceDiff * pnlUnits(pos);
    markPriceMap.set(String(pos.positionId), Number(currentPrice));
    await pos.save();
  }

  // Re-read the account — closePosition() (SL/TP) and activatePendingOrders()
  // above already mutated walletBalance/counters/etc. The `account` variable
  // held the pre-mutation snapshot, so re-read if either changed the account.
  const fresh = (triggered.length > 0 || activatedCount > 0)
    ? await ChallengeAccount.findById(challengeAccountId).populate('challengeId')
    : account;
  if (!fresh) return null;

  // Include pending orders so their reserved margin isn't released on recompute.
  const pendingForMargin = await ChallengePosition.find({ challengeAccountId, status: 'pending' });
  recomputeWallet(fresh, [...openPositions, ...pendingForMargin]);
  fresh.currentBalance = fresh.walletBalance;
  fresh.currentEquity = fresh.walletEquity;
  await fresh.save();

  // Use propTradingEngine's drawdown check (it also handles auto-fail).
  // Pass the per-position markPriceMap captured above so any auto-close
  // uses the EXACT mark that triggered the breach — not a re-read from
  // DB that a concurrent tick may have overwritten with a recovered price.
  return await propTradingEngine.updateRealTimeEquity(challengeAccountId, fresh.walletEquity, markPriceMap);
}

/**
 * Cancel a still-pending limit/stop order before it triggers. Releases the
 * reserved margin back to the sub-wallet. No P&L, no commission (commission is
 * only charged when a pending order activates).
 */
async function cancelPendingOrder(positionId, userId = null) {
  const query = { positionId, status: 'pending' };
  if (userId) query.userId = String(userId);
  const pos = await ChallengePosition.findOne(query);
  if (!pos) return { success: false, error: 'Pending order not found or already processed' };

  pos.status = 'cancelled';
  pos.closeTime = new Date();
  pos.closedBy = 'user';
  await pos.save();

  const account = await ChallengeAccount.findById(pos.challengeAccountId);
  if (account) {
    // Recompute against the remaining open + pending positions so the
    // cancelled order's reserved margin is freed.
    const reserved = await ChallengePosition.find({ challengeAccountId: account._id, status: { $in: ['open', 'pending'] } });
    recomputeWallet(account, reserved);
    account.currentBalance = account.walletBalance;
    account.currentEquity = account.walletEquity;
    await account.save();
  }

  return { success: true, position: pos, account };
}

module.exports = {
  openPosition,
  closePosition,
  refreshEquity,
  activatePendingOrders,
  cancelPendingOrder,
  // Pure rule helpers (exported for unit tests)
  pendingPlacementError,
  isPendingTriggerHit,
  sltpErrorVsPrice,
  computeCommission
};
