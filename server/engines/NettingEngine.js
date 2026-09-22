/**
 * NettingEngine - Indian Market Style Trading (NSE)
 * 
 * Key Features:
 * - Only ONE net position per symbol
 * - Buy & Sell adjust the same position
 * - Positions are lot-based (same as Hedging mode)
 * - Average price recalculation on add
 * - Intraday auto square-off
 * - Carry forward with full margin
 * - Wallet integration with margin management
 * - Market status validation
 */

const { NettingPosition } = require('../models/Position');
const Trade = require('../models/Trade');
const TradeModeSettings = require('../models/Settings');
const User = require('../models/User');
const ZerodhaSettings = require('../models/ZerodhaSettings');
const MarketControl = require('../models/MarketControl');
const UserSegmentSettings = require('../models/UserSegmentSettings');
const Segment = require('../models/Segment');
const NettingSegment = require('../models/NettingSegment');
const ReorderSettings = require('../models/ReorderSettings');
const UserRiskSettings = require('../models/UserRiskSettings');
const perfTimer = require('../utils/perfTimer');
const zerodhaService = require('../services/zerodha.service');
const mt5 = require('../utils/mt5Calculations');
const pnlSharingService = require('../services/pnlSharing.service');
const { getUsdInrRate, getCachedUsdInrRate } = require('../services/currencyRateService');

// MetaAPI/brokers often use BTCUSDT; UI often shows BTCUSD — must share one netting row + CRYPTO_PERPETUAL caps
const MAJOR_CRYPTO_PERPET_BASES = [
  'BTC', 'ETH', 'XRP', 'LTC', 'ADA', 'DOT', 'DOGE', 'SOL', 'AVAX', 'MATIC', 'LINK', 'BCH'
];

// Zerodha stores option contracts under the trading-root `name` (e.g. NIFTY) but the
// underlying index is stored under a different `name` (e.g. NIFTY 50). When we look up
// the spot for an option, we MUST translate the option-root to the index-name — otherwise
// the resolver finds another option of the same root and uses its premium as "underlying".
const OPTION_ROOT_TO_INDEX_NAME = {
  NIFTY: 'NIFTY 50',
  BANKNIFTY: 'NIFTY BANK',
  FINNIFTY: 'NIFTY FIN SERVICE',
  MIDCPNIFTY: 'NIFTY MID SELECT',
  SENSEX: 'SENSEX',
  BANKEX: 'BANKEX',
  SENSEX50: 'SNSX50'
};

// Build a list of "current month" futures-symbol candidates for an option-root.
// e.g. for root=NIFTY in April 2026 → ['NIFTY26APRFUT', 'NIFTY26MAYFUT', 'NIFTY26JUNFUT'].
// Used as a last-resort fallback if the index ticker isn't subscribed.
function _buildCurrentFutureCandidates(root) {
  if (!root) return [];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  // IST = UTC+5:30
  const nowUtcMs = Date.now();
  const istMs = nowUtcMs + (5 * 60 + 30) * 60 * 1000;
  const ist = new Date(istMs);
  const yy = String(ist.getUTCFullYear() % 100).padStart(2, '0');
  const m = ist.getUTCMonth();
  const out = [];
  for (let i = 0; i < 3; i++) {
    const mi = (m + i) % 12;
    const yyi = String((ist.getUTCFullYear() + (m + i >= 12 ? 1 : 0)) % 100).padStart(2, '0');
    out.push(`${root}${yyi}${months[mi]}FUT`);
  }
  return out;
}

class NettingEngine {
  constructor() {
    this.positionIdCounter = Date.now();
    this.deltaExchangeStreaming = null;
    // In-memory locks for per-leg close operations (Phase 3). Prevents the
    // SL/TP price-tick monitor from racing with a manual user close on the
    // same Trade leg. Keyed by `tradeId` (the Trade doc's tradeId field).
    this._legCloseLocks = new Set();

    // Indian market exchanges that need market timing check
    // Note: DELTA, FOREX, CRYPTO are NOT included - they trade 24/7 or 24/5
    this.indianExchanges = ['NSE', 'NFO', 'MCX', 'BSE', 'BFO', 'CDS'];
    
    // Zerodha market timings (IST)
    // squareOffTime aligned to market close — Fix 17a. Zerodha's own
    // convention is 15:15 (a 15-minute buffer) but the product team chose
    // to give users the full session: auto-square-off only fires after the
    // last LTP tick at 15:30. MCX keeps its extended-hours convention.
    // Indian equity / index F&O segments stop accepting new orders at 15:15
    // (15 minutes before the official 15:30 close) and every open position is
    // squared off at 15:15 — no overnight holding on prop accounts. MCX
    // (commodities) keeps its extended-hours window.
    this.marketTimings = {
      NSE: { open: '09:15', close: '15:15', squareOffTime: '15:15' },
      NFO: { open: '09:15', close: '15:15', squareOffTime: '15:15' },
      MCX: { open: '09:00', close: '23:30', squareOffTime: '23:25' }, // MCX has extended hours
      BFO: { open: '09:15', close: '15:15', squareOffTime: '15:15' }
    };
    
    // Segments that require lot size from exchange (F&O)
    this.lotBasedSegments = ['NFO', 'MCX', 'BFO', 'NSE-FUT', 'NSE-OPT', 'MCX-FUT', 'MCX-OPT', 'BSE-FUT', 'BSE-OPT'];
  }

  setDeltaExchangeStreaming(service) {
    this.deltaExchangeStreaming = service || null;
  }

  inferDeltaExchangeSegment(symbol) {
    if (!symbol) return null;
    const u = String(symbol).toUpperCase();
    // Symbol-shape heuristics (do not depend on streaming/products) so caps & segment routing work
    // even when deltaExchangeStreaming is unset or still loading.
    if (/^[CP]-/.test(u)) {
      return {
        exchange: 'DELTA',
        segment: u.startsWith('C-') ? 'call_options' : 'put_options'
      };
    }
    if (new RegExp(`^(${MAJOR_CRYPTO_PERPET_BASES.join('|')})USD$`, 'i').test(u)) {
      return { exchange: 'DELTA', segment: 'perpetual_futures' };
    }
    if (new RegExp(`^(${MAJOR_CRYPTO_PERPET_BASES.join('|')})USDT$`, 'i').test(u)) {
      return { exchange: 'DELTA', segment: 'perpetual_futures' };
    }
    if (this.deltaExchangeStreaming?.isDeltaSymbol(symbol)) {
      if (/^[CP]-/.test(u)) {
        return {
          exchange: 'DELTA',
          segment: u.startsWith('C-') ? 'call_options' : 'put_options'
        };
      }
      return { exchange: 'DELTA', segment: 'perpetual_futures' };
    }
    return null;
  }

  /** One canonical symbol per major crypto perpetual for netting + segment totals */
  canonicalCryptoPerpetualSymbol(symbol) {
    if (!symbol) return symbol;
    const u = String(symbol).trim().toUpperCase();
    for (const b of MAJOR_CRYPTO_PERPET_BASES) {
      if (
        u === `${b}USD` ||
        u === `${b}USDT` ||
        u === `${b}USD.P` ||
        u === `${b}USDT.P`
      ) {
        return `${b}USD`;
      }
    }
    return u;
  }

  /** DB lookup variants so BTCUSDT open matches a BTCUSD order */
  cryptoPerpetualSymbolAliases(symbol) {
    const u = String(symbol || '').trim().toUpperCase();
    const canon = this.canonicalCryptoPerpetualSymbol(symbol);
    const base = MAJOR_CRYPTO_PERPET_BASES.find((b) => canon === `${b}USD`);
    if (!base) return [u];
    return [`${base}USD`, `${base}USDT`, `${base}USD.P`, `${base}USDT.P`];
  }

  /**
   * Netting fixed margin calculation with 3 modes:
   *  - 'fixed'   : absolute currency per lot/share → margin = raw × volume
   *  - 'percent' : % of order notional → margin = qty × price × min(raw, 100) / 100
   *  - 'times'   : multiplier (buying power) → margin = (qty × price) / raw
   *                 e.g. raw=100 means 100× buying power, so margin = notional / 100
   *
   * @param {number} raw        - The margin value set by admin
   * @param {string|boolean} mode - 'fixed'|'percent'|'times' or legacy boolean (true=percent, false=fixed)
   * @param {number} volume     - Number of lots (used in fixed mode)
   * @param {number} quantity   - Number of shares/units (used in percent & times modes)
   * @param {number} price      - Current trade price (used in percent & times modes)
   * @param {number} leveragePct - Leverage percentage (25, 50, 75, 100) for Times mode
   * @returns {number|null}     - Calculated margin amount, or null if inputs invalid
   */
  nettingFixedMarginAmount(raw, mode, volume, quantity, price, leveragePct = 100) {
    const r = Number(raw);
    if (!(r > 0)) return null;
    const v = Number(volume);
    const q = Number(quantity);
    const p = Number(price);
    const levPct = Number(leveragePct) || 100;

    // Backward compatibility: boolean true → 'percent', false → 'fixed'
    let calcMode = mode;
    if (typeof mode === 'boolean') {
      calcMode = mode ? 'percent' : 'fixed';
    }
    if (!calcMode) calcMode = 'fixed';

    switch (calcMode) {
      case 'percent': {
        if (!(q > 0) || !(p > 0)) return null;
        const cappedPercent = Math.min(r, 100); // Cap at 100%
        return q * p * (cappedPercent / 100);
      }
      case 'times': {
        // Times = multiplier on buying power
        // Apply leverage percentage to multiplier (25% of 500X = 125X effective)
        // margin = notional / effective_multiplier
        if (!(q > 0) || !(p > 0)) return null;
        const effectiveMultiplier = r * (levPct / 100);
        const notional = q * p;
        return notional / effectiveMultiplier;
      }
      case 'fixed':
      default: {
        if (!(v > 0)) return null;
        return r * v;
      }
    }
  }

  // Get instrument details from Zerodha subscribed instruments
  async getInstrumentDetails(symbol) {
    try {
      const settings = await ZerodhaSettings.getSettings();
      const instrument = settings.subscribedInstruments.find(i => 
        i.symbol === symbol || i.symbol?.toUpperCase() === symbol.toUpperCase()
      );
      return instrument || null;
    } catch (error) {
      console.error('Error fetching instrument details:', error);
      return null;
    }
  }

  /**
   * Normalize strike field and resolve underlying LTP from subscribed instruments (same `name` root)
   * so buyingStrikeFar / sellingStrikeFar can run for Zerodha options.
   */
  async enrichIndianInstrumentForNetting(instrument) {
    if (!instrument) return instrument;
    const out = { ...instrument };
    const strikeRaw = out.strikePrice != null ? out.strikePrice : out.strike;
    const strikeNum = strikeRaw != null ? Number(strikeRaw) : NaN;
    const it = String(out.instrumentType || '').toUpperCase();
    const seg = String(out.segment || '').toUpperCase();
    const isOpt = it === 'CE' || it === 'PE' || it === 'OPT' || seg.includes('OPT');
    if (isOpt && Number.isFinite(strikeNum) && strikeNum > 0) {
      out.strikePrice = strikeNum;
    }
    let und = Number(out.underlyingPrice || out.spotPrice || 0);
    if (isOpt && Number.isFinite(strikeNum) && strikeNum > 0 && (!Number.isFinite(und) || und <= 0)) {
      try {
        const settings = await ZerodhaSettings.getSettings();
        const root = String(out.name || '').trim().toUpperCase();
        if (root) {
          const subs = settings.subscribedInstruments || [];
          const indexName = OPTION_ROOT_TO_INDEX_NAME[root] || null;
          const isIndexEntry = (i) =>
            String(i.segment || '').toUpperCase().includes('INDICES') ||
            !String(i.instrumentType || '').toUpperCase().match(/^(CE|PE|FUT|EQ|OPT)$/);
          const sameRoot = subs.filter(
            (i) => String(i.name || '').toUpperCase() === root && i.symbol !== out.symbol
          );
          // Index instruments live under a different `name` (e.g. NIFTY → "NIFTY 50").
          // Look for them in BOTH places: by mapped index-name (NIFTY case) AND by
          // root-name + INDICES segment (SENSEX/BANKEX case where option-root and
          // index-name are the same string, so we MUST also filter by segment).
          const indexByName = indexName
            ? subs.find(
                (i) =>
                  String(i.name || '').toUpperCase() === indexName.toUpperCase() &&
                  isIndexEntry(i)
              )
            : null;
          const indexByRootSegment = sameRoot.find(isIndexEntry);
          const fut = sameRoot.find(
            (i) => String(i.instrumentType || '').toUpperCase() === 'FUT'
          );
          const eq = sameRoot.find(
            (i) => String(i.instrumentType || '').toUpperCase() === 'EQ'
          );
          // Order of preference: live index → live future → live equity. NEVER fall back
          // to another option contract — its lastPrice is the option premium, not the spot.
          // For MCX commodities (CRUDEOIL, GOLD, SILVER, NATURALGAS, …) there is no index,
          // so the resolver naturally lands on `fut` (e.g. CRUDEOIL26APRFUT) which is the
          // correct underlying for an MCX option.
          const pick = indexByName || indexByRootSegment || fut || eq || null;
          if (pick?.symbol) {
            const px = zerodhaService.getPrice(pick.symbol);
            if (px && Number(px.lastPrice) > 0) {
              und = Number(px.lastPrice);
              out.underlyingPrice = und;
            }
          }
        }
      } catch (_) {
        /* optional */
      }
    }
    // Fallback: parse underlying root from trading symbol (e.g. NIFTY26APR21000CE → NIFTY)
    // and read the Zerodha ticks cache directly. Try the real index ticker first, then a
    // dynamic current-month future, then the bare equity ticker. NEVER use the bare root
    // (e.g. "NIFTY") as a candidate — that would risk picking up an option's lastPrice if
    // any future broadens the cache lookup to partial matches.
    if (isOpt && Number.isFinite(strikeNum) && strikeNum > 0 && (!Number.isFinite(und) || und <= 0)) {
      const sym = String(out.symbol || '').toUpperCase();
      const rootMatch = sym.match(/^([A-Z]+)/);
      const rootFromSym = rootMatch ? rootMatch[1] : '';
      const candidates = [];
      if (rootFromSym) {
        const indexName = OPTION_ROOT_TO_INDEX_NAME[rootFromSym];
        if (indexName) candidates.push(indexName);
        candidates.push(..._buildCurrentFutureCandidates(rootFromSym));
        candidates.push(rootFromSym); // last-resort: bare root (only matches if EQ ticker exists)
      }
      for (const c of candidates) {
        const px = zerodhaService.getPrice(c);
        const lp = px && (Number(px.lastPrice) > 0 ? Number(px.lastPrice) : Number(px.last_price || 0));
        if (lp > 0) {
          und = lp;
          out.underlyingPrice = und;
          break;
        }
      }
    }
    return out;
  }

  /**
   * Subscribed symbol to read underlying LTP for option intrinsic settlement.
   * Preference: live INDEX (mapped name or segment === 'INDICES') → FUT → EQ.
   * NEVER falls back to another option contract — its lastPrice is the option premium,
   * not the spot, and using it would compute wildly wrong intrinsic P&L at expiry.
   */
  async resolveUnderlyingQuoteSymbolForOption(instrument) {
    if (!instrument) return null;
    const root = String(instrument.name || '').trim().toUpperCase();
    try {
      const settings = await ZerodhaSettings.getSettings();
      const subs = settings.subscribedInstruments || [];
      if (root) {
        const indexName = OPTION_ROOT_TO_INDEX_NAME[root] || null;
        const isIndexEntry = (i) =>
          String(i.segment || '').toUpperCase().includes('INDICES') ||
          !String(i.instrumentType || '').toUpperCase().match(/^(CE|PE|FUT|EQ|OPT)$/);
        const sameRoot = subs.filter(
          (i) => String(i.name || '').toUpperCase() === root && i.symbol !== instrument.symbol
        );
        const indexByName = indexName
          ? subs.find(
              (i) =>
                String(i.name || '').toUpperCase() === indexName.toUpperCase() &&
                isIndexEntry(i)
            )
          : null;
        const indexByRootSegment = sameRoot.find(isIndexEntry);
        const fut = sameRoot.find(
          (i) => String(i.instrumentType || '').toUpperCase() === 'FUT'
        );
        const eq = sameRoot.find(
          (i) => String(i.instrumentType || '').toUpperCase() === 'EQ'
        );
        const pick = indexByName || indexByRootSegment || fut || eq || null;
        if (pick?.symbol) return pick.symbol;
      }
    } catch (_) {
      /* ignore */
    }
    // Last-resort symbol-based fallback: prefer the mapped index ticker, never the bare root
    // (which could collide with an option-prefix in any partial-match cache lookup downstream).
    const sym = String(instrument.symbol || '').toUpperCase();
    const rootMatch = sym.match(/^([A-Z]+)/);
    const rootFromSym = rootMatch ? rootMatch[1] : null;
    if (rootFromSym && OPTION_ROOT_TO_INDEX_NAME[rootFromSym]) {
      return OPTION_ROOT_TO_INDEX_NAME[rootFromSym];
    }
    return rootFromSym;
  }

  /**
   * Persisted fields on NettingPosition for F&O options (expiry cash settlement).
   */
  async buildOptionPositionMetaFromInstrument(instrument) {
    if (!instrument) return {};
    const it = String(instrument.instrumentType || '').toUpperCase();
    const seg = String(instrument.segment || '').toUpperCase();
    const isOpt = it === 'CE' || it === 'PE' || it === 'OPT' || seg.includes('OPT');
    if (!isOpt) return {};
    const strikeRaw = instrument.strikePrice != null ? instrument.strikePrice : instrument.strike;
    const strikeNum = strikeRaw != null ? Number(strikeRaw) : NaN;
    const exp = instrument.expiry != null ? new Date(instrument.expiry) : null;
    let optType = it === 'CE' || it === 'PE' ? it : null;
    if (!optType) {
      const sym = String(instrument.symbol || instrument.tradingsymbol || '').toUpperCase();
      if (sym.endsWith('CE')) optType = 'CE';
      else if (sym.endsWith('PE')) optType = 'PE';
    }
    if (!Number.isFinite(strikeNum) || strikeNum <= 0 || !exp || Number.isNaN(exp.getTime())) {
      return {};
    }
    const undSym = await this.resolveUnderlyingQuoteSymbolForOption(instrument);
    if (!optType) return {};
    return {
      instrumentExpiry: exp,
      optionStrike: strikeNum,
      optionType: optType,
      underlyingQuoteSymbol: undSym || null
    };
  }

  /** Futures (and similar) expiry on NettingPosition for expiry-day margin / hold logic. */
  buildFuturesInstrumentExpiryMeta(instrument) {
    if (!instrument?.expiry) return {};
    const it = String(instrument.instrumentType || '').toUpperCase();
    const seg = String(instrument.segment || '').toUpperCase();
    const isFut = it === 'FUT' || seg.includes('FUT');
    if (!isFut) return {};
    const exp = new Date(instrument.expiry);
    if (Number.isNaN(exp.getTime())) return {};
    return { instrumentExpiry: exp };
  }

  /**
   * On IST expiry day, intraday-style fixed margin override.
   *
   * Strict FUT/OPT separation (Fix 17b clarification):
   *   - OPTION orders use ONLY the per-side fields:
   *       BUY  → segmentSettings.expiryDayOptionBuyMargin
   *       SELL → segmentSettings.expiryDayOptionSellMargin
   *     If both are blank, returns null — there is NO fallback to the
   *     futures field (the user explicitly requested this separation so
   *     the admin UI never confuses the two).
   *   - FUTURES orders use ONLY segmentSettings.expiryDayIntradayMargin.
   *
   * Returns null if no applicable override is set.
   *
   * @param {object} segmentSettings effective merged segment settings
   * @param {object} ctx              { volume, quantity, price, side, isOptionsInstrument }
   */
  resolveExpiryDayMarginAmount(segmentSettings, ctx = {}) {
    if (!segmentSettings) return null;
    const { volume, quantity, price, side, isOptionsInstrument } = ctx;

    if (isOptionsInstrument) {
      // OPTION path — strictly per-side. No cross-fallback to the futures field.
      const sideLc = String(side || '').toLowerCase();
      let sideValue = null;
      let sideAsPercent = false;
      if (sideLc === 'buy') {
        sideValue = segmentSettings.expiryDayOptionBuyMargin;
        sideAsPercent = segmentSettings.fixedExpiryDayOptionBuyAsPercent === true;
      } else if (sideLc === 'sell') {
        sideValue = segmentSettings.expiryDayOptionSellMargin;
        sideAsPercent = segmentSettings.fixedExpiryDayOptionSellAsPercent === true;
      }
      if (sideValue == null || !(Number(sideValue) > 0)) return null;
      return this.nettingFixedMarginAmount(
        sideValue,
        segmentSettings.marginCalcMode || sideAsPercent,
        volume,
        quantity,
        price
      );
    }

    // FUTURES path — strictly the single futures field.
    const v = segmentSettings.expiryDayIntradayMargin;
    if (v == null || !(Number(v) > 0)) return null;
    return this.nettingFixedMarginAmount(
      v,
      segmentSettings.marginCalcMode || (segmentSettings.fixedExpiryDayIntradayAsPercent === true),
      volume,
      quantity,
      price
    );
  }

  _istCalendarNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  }

  _positionExpiryIstDayStartMs(expiryDate) {
    const exp = new Date(expiryDate);
    const ist = new Date(exp.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return new Date(ist.getFullYear(), ist.getMonth(), ist.getDate()).getTime();
  }

  /**
   * True after exchange close on expiry day (IST), or any later calendar day.
   */
  _isNettingOptionSettlementDue(position, _now = new Date()) {
    if (!position.instrumentExpiry) return false;
    const exMs = this._positionExpiryIstDayStartMs(position.instrumentExpiry);
    const istNow = this._istCalendarNow();
    const nowDayMs = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate()).getTime();
    if (nowDayMs < exMs) return false;
    if (nowDayMs > exMs) return true;
    const ex = String(position.exchange || 'NFO').toUpperCase();
    const timing = this.marketTimings[ex] || this.marketTimings.NFO;
    const closeStr = timing.close || '15:30';
    const [h, m] = closeStr.split(':').map(Number);
    const closeMin = (Number(h) || 15) * 60 + (Number(m) || 30);
    const curMin = istNow.getHours() * 60 + istNow.getMinutes();
    return curMin >= closeMin;
  }

  _intrinsicExitPremiumPerUnit(optionType, strike, spot) {
    const k = Number(strike);
    const s = Number(spot);
    const t = String(optionType || '').toUpperCase();
    if (t === 'CE') return Math.max(0, s - k);
    if (t === 'PE') return Math.max(0, k - s);
    return 0;
  }

  /**
   * FIFO leg consumption — Phase 1.5 (+ Fix 18 grouping).
   *
   * When an aggregate close (opposite-side trade, position-level partial close,
   * stop-out, etc.) reduces a netting position's volume, walk the open Trade
   * legs in oldest-first order and consume `closingVolume` units from them so
   * that `sum(open legs volume) === parent.volume` invariant holds for the
   * Active Trades view.
   *
   * Realized PnL is settled at the aggregate level (against parent.avgPrice)
   * by the caller — this method does NOT touch the wallet, and consumed legs
   * have `profit: 0` to avoid double-counting.
   *
   * Fix 18: an optional `groupId` tags every consumed leg so the History tab
   * can show them as children of the parent close audit row. When passed,
   * `isHistoryParent` is forced to false on each consumed leg (parent flag
   * lives on the audit row created by the caller).
   *
   * Floating-point safety: legs are matched with a 1e-9 epsilon to absorb
   * rounding errors when many fractional partials are summed.
   *
   * @param {string} parentOderId  - oderId of the parent NettingPosition
   * @param {string} userId         - 6-digit oderId of the user
   * @param {number} closingVolume  - lots/volume to consume from open legs
   * @param {number} avgPriceAtClose - parent.avgPrice at the moment of close
   *                                   (recorded on each consumed leg as closePrice)
   * @param {string|null} groupId   - history grouping id (Fix 18). Optional.
   */
  async _consumeOpenLegsFIFO(parentOderId, userId, closingVolume, avgPriceAtClose, groupId = null) {
    if (!parentOderId || !(closingVolume > 0)) return;
    const EPS = 1e-9;
    const openLegs = await Trade.find({
      oderId: parentOderId,
      userId,
      mode: 'netting',
      type: 'open',
      closedAt: null
    }).sort({ executedAt: 1 });

    let remaining = closingVolume;
    const now = new Date();

    for (const leg of openLegs) {
      if (remaining <= EPS) break;
      const legVol = Number(leg.volume) || 0;
      if (legVol <= EPS) continue;

      const take = Math.min(legVol, remaining);
      const newLegVol = legVol - take;

      if (newLegVol <= EPS) {
        // Leg fully consumed
        leg.volume = 0;
        leg.type = 'consumed';
        leg.closePrice = avgPriceAtClose;
        leg.closedAt = now;
        leg.closedBy = 'aggregate_close';
        leg.profit = 0;
        leg.remark = 'Aggregate Close';
        // Fix 18: tag with the parent close action's groupId so the History
        // tab can render this leg as a child of that parent row.
        if (groupId) {
          leg.groupId = groupId;
          leg.isHistoryParent = false;
        }
      } else {
        // Leg partially consumed — stays open with reduced volume
        leg.volume = newLegVol;
        if (leg.quantity != null && legVol > 0) {
          // Scale quantity proportionally so leg.quantity / leg.volume ratio is preserved
          leg.quantity = Number(leg.quantity) * (newLegVol / legVol);
        }
      }

      try {
        await leg.save();
      } catch (err) {
        console.error('[NettingEngine] _consumeOpenLegsFIFO save error:', err.message);
      }

      remaining -= take;
    }

    if (remaining > EPS) {
      // Should never happen if the parent.volume invariant was honoured before
      // this call, but log it so we notice during testing.
      console.warn(
        `[NettingEngine] _consumeOpenLegsFIFO: ${remaining.toFixed(6)} lots not absorbed for parent ${parentOderId} (closingVolume=${closingVolume}, openLegs=${openLegs.length}). Active Trades view may diverge from parent.volume.`
      );
    }
  }

  /**
   * SL/TP placement validation — Fix 12.
   *
   * Two checks:
   *   1) Direction: SL is on the loss side of `referencePrice`, TP on the
   *      profit side. For BUY: SL < ref, TP > ref. For SELL: SL > ref, TP < ref.
   *   2) Limit-away gap: when `limitAwayPercent` or `limitAwayPoints` is set
   *      on the segment, SL/TP must be at LEAST that far from `referencePrice`.
   *      Same minimum-distance rule that's already enforced for limit/stop
   *      pending order prices in executeOrder. Prevents users from setting
   *      stops so close to current that one tick of noise fires them.
   *
   * Returns null on success or a human-readable error string on failure.
   * Pure (no DB, no awaits) — easy to call from anywhere SL/TP can be set.
   *
   * @param {string} side                 'buy' | 'sell'
   * @param {number} referencePrice       current price (or execution price for fresh orders)
   * @param {number|null|undefined} sl    proposed stopLoss (null/undefined skips SL check)
   * @param {number|null|undefined} tp    proposed takeProfit (null/undefined skips TP check)
   * @param {object|null} segmentSettings the resolved segment settings doc (limitAwayPoints/limitAwayPercent)
   * @returns {string|null}
   */
  validateSLTPPlacement(side, referencePrice, sl, tp, segmentSettings) {
    const ref = Number(referencePrice);
    if (!(ref > 0)) return null; // can't validate without a reference; skip silently
    const sideLc = String(side || '').toLowerCase();
    if (sideLc !== 'buy' && sideLc !== 'sell') return null;

    const slNum = sl == null || sl === '' ? null : Number(sl);
    const tpNum = tp == null || tp === '' ? null : Number(tp);
    if (slNum != null && !Number.isFinite(slNum)) return `Invalid stop loss value: ${sl}`;
    if (tpNum != null && !Number.isFinite(tpNum)) return `Invalid take profit value: ${tp}`;

    // ---- Direction check (always enforced) ----
    if (slNum != null && slNum > 0) {
      if (sideLc === 'buy' && slNum >= ref) {
        return `Stop Loss (${slNum}) must be BELOW the buy price (${ref}). For BUY positions, SL is below entry/current.`;
      }
      if (sideLc === 'sell' && slNum <= ref) {
        return `Stop Loss (${slNum}) must be ABOVE the sell price (${ref}). For SELL positions, SL is above entry/current.`;
      }
    }
    if (tpNum != null && tpNum > 0) {
      if (sideLc === 'buy' && tpNum <= ref) {
        return `Take Profit (${tpNum}) must be ABOVE the buy price (${ref}). For BUY positions, TP is above entry/current.`;
      }
      if (sideLc === 'sell' && tpNum >= ref) {
        return `Take Profit (${tpNum}) must be BELOW the sell price (${ref}). For SELL positions, TP is below entry/current.`;
      }
    }

    // ---- Limit-away gap (only if segment configures it) ----
    // Same precedence as the existing limit/stop validation: points first,
    // then percent fallback.
    if (segmentSettings) {
      const pts = segmentSettings.limitAwayPoints;
      const pct = segmentSettings.limitAwayPercent;
      let away = null;
      let awayLabel = '';
      if (pts != null && Number(pts) > 0) {
        away = Number(pts);
        awayLabel = `${away} points`;
      } else if (pct != null && Number(pct) > 0) {
        away = ref * (Number(pct) / 100);
        awayLabel = `${Number(pct)}% of price (≈${away.toFixed(2)})`;
      }

      if (away != null && away > 0) {
        if (slNum != null && slNum > 0) {
          if (sideLc === 'buy') {
            const maxAllowedSL = ref - away;
            if (slNum > maxAllowedSL) {
              return `Stop Loss (${slNum}) is too close to price (${ref}). Must be at least ${awayLabel} below. Maximum allowed SL: ${maxAllowedSL.toFixed(4)}.`;
            }
          } else {
            const minAllowedSL = ref + away;
            if (slNum < minAllowedSL) {
              return `Stop Loss (${slNum}) is too close to price (${ref}). Must be at least ${awayLabel} above. Minimum allowed SL: ${minAllowedSL.toFixed(4)}.`;
            }
          }
        }
        if (tpNum != null && tpNum > 0) {
          if (sideLc === 'buy') {
            const minAllowedTP = ref + away;
            if (tpNum < minAllowedTP) {
              return `Take Profit (${tpNum}) is too close to price (${ref}). Must be at least ${awayLabel} above. Minimum allowed TP: ${minAllowedTP.toFixed(4)}.`;
            }
          } else {
            const maxAllowedTP = ref - away;
            if (tpNum > maxAllowedTP) {
              return `Take Profit (${tpNum}) is too close to price (${ref}). Must be at least ${awayLabel} below. Maximum allowed TP: ${maxAllowedTP.toFixed(4)}.`;
            }
          }
        }
      }
    }

    return null; // all checks passed
  }

  async _ensureOptionSettlementMeta(position) {
    let strike = position.optionStrike;
    let optionType = position.optionType ? String(position.optionType).toUpperCase() : null;
    let expiry = position.instrumentExpiry;
    let underlyingQuoteSymbol = position.underlyingQuoteSymbol;
    if ((!strike || !optionType) && position.symbol) {
      let inst = await this.getInstrumentDetails(position.symbol);
      if (inst) inst = await this.enrichIndianInstrumentForNetting(inst);
      if (inst) {
        if (!expiry && inst.expiry) expiry = new Date(inst.expiry);
        const sr = inst.strikePrice != null ? inst.strikePrice : inst.strike;
        if (!strike && sr != null) strike = Number(sr);
        if (!optionType && inst.instrumentType) {
          const u = String(inst.instrumentType).toUpperCase();
          if (u === 'CE' || u === 'PE') optionType = u;
        }
        if (!optionType) {
          const s = String(inst.symbol || inst.tradingsymbol || '').toUpperCase();
          if (s.endsWith('CE')) optionType = 'CE';
          else if (s.endsWith('PE')) optionType = 'PE';
        }
        if (!underlyingQuoteSymbol) {
          underlyingQuoteSymbol = await this.resolveUnderlyingQuoteSymbolForOption(inst);
        }
      }
    }
    return { strike, optionType, expiry, underlyingQuoteSymbol };
  }

  async _resolveSpotForOptionSettlement(position, meta) {
    const candidates = [];
    if (meta?.underlyingQuoteSymbol) candidates.push(meta.underlyingQuoteSymbol);
    if (position.underlyingQuoteSymbol) candidates.push(position.underlyingQuoteSymbol);
    const rootMatch = String(position.symbol || '').toUpperCase().match(/^([A-Z]+)/);
    if (rootMatch) {
      const root = rootMatch[1];
      candidates.push(root, `${root}FUT`);
      // Fix 24: BSE index options (SENSEX, BANKEX) — try nearby FUT months
      // e.g., SENSEX26APRFUT, SENSEX26MAYFUT. The nearest-month future is
      // typically subscribed and its LTP is a close proxy for the spot index.
      const now = new Date();
      const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const yy = String(istNow.getFullYear()).slice(-2);
      const m0 = months[istNow.getMonth()];
      const m1 = months[(istNow.getMonth() + 1) % 12];
      candidates.push(`${root}${yy}${m0}FUT`, `${root}${yy}${m1}FUT`);
    }
    for (const c of candidates) {
      if (!c) continue;
      const px = zerodhaService.getPrice(c);
      const lp = px && (Number(px.lastPrice) > 0 ? Number(px.lastPrice) : Number(px.last_price || 0));
      if (lp > 0) return lp;
    }
    let inst = await this.getInstrumentDetails(position.symbol);
    if (inst) inst = await this.enrichIndianInstrumentForNetting(inst);
    const und = inst && Number(inst.underlyingPrice || inst.spotPrice || 0);
    if (Number.isFinite(und) && und > 0) return und;

    // Fix 24: REMOVED the fallback `position.currentPrice` — that holds the
    // OPTION PREMIUM, not the underlying spot. Using it as spot produces a
    // wildly wrong intrinsic value (strike − premium instead of strike − spot).
    // If we reach here, return null and let the caller skip this position
    // (better to skip than to settle at a wrong price).
    return null;
  }

  async _cancelExpiredNettingOptionPending(position) {
    const live = await NettingPosition.findOne({ _id: position._id, status: 'pending' });
    if (!live) return;
    const user = await this.getUser(live.userId);
    user.releaseMargin(live.marginUsed);
    live.status = 'cancelled';
    live.closeTime = new Date();
    await Promise.all([live.save(), user.save()]);
    const trade = new Trade({
      tradeId: `TRD-EXPX-${Date.now()}`,
      oderId: live.oderId,
      userId: live.userId,
      mode: 'netting',
      symbol: live.symbol,
      side: live.side,
      volume: live.volume,
      entryPrice: live.avgPrice,
      type: 'cancelled',
      executedAt: new Date()
    });
    trade.save().catch((err) => console.error('[OptionExpiry] Trade log:', err.message));
    console.log(`[OptionExpiry] Cancelled pending ${live.symbol} for user ${live.userId} (contract expired)`);
  }

  /**
   * Close an open netting option at intrinsic value (per-unit premium, same convention as calculatePnL).
   */
  async _closeOpenPositionAtSettlementPrice(position, exitPremiumPerUnit) {
    const live = await NettingPosition.findOne({ _id: position._id, status: 'open' });
    if (!live) return;
    const user = await this.getUser(live.userId);
    let instrument = await this.getInstrumentDetails(live.symbol);
    if (instrument) instrument = await this.enrichIndianInstrumentForNetting(instrument);
    const instrumentType = instrument?.instrumentType || live.optionType || '';
    const segmentSettings = await this.getSegmentSettingsForTrade(
      live.userId,
      live.symbol,
      live.exchange,
      live.segment,
      instrumentType
    );
    const price = exitPremiumPerUnit;
    let profit = this.calculatePnL(live, price);
    let closeCommission = 0;
    const closedVolume = live.volume;
    const expLs = live.lotSize || 1;
    const closedQty =
      Number(live.quantity) > 0 ? live.quantity : closedVolume * expLs;
    // Fix 22: at expiry settlement the closing action is the OPPOSITE of the
    // live position's side (closing a BUY → SELL action, closing a SELL → BUY).
    // This drives which OPT-segment per-side commission rate gets used.
    const expiryCloseSide = String(live.side || '').toLowerCase() === 'buy' ? 'sell' : 'buy';
    const expiryCloseRate = this._pickCommissionRate(segmentSettings, expiryCloseSide);
    if (segmentSettings && expiryCloseRate > 0) {
      const chargeOn = segmentSettings.chargeOn || 'open';
      const shouldChargeOnClose = chargeOn === 'close' || chargeOn === 'both';
      if (shouldChargeOnClose) {
        closeCommission = this.calculateCommission(
          segmentSettings.commissionType,
          expiryCloseRate,
          closedVolume,
          closedQty,
          price
        );

        // Convert commission from INR to USD (all charges are in INR)
        const usdInrRate = getCachedUsdInrRate();
        closeCommission = closeCommission / usdInrRate;

        profit -= closeCommission;
      }
    }
    const totalCommission = (live.openCommission || 0) + closeCommission;
    live.status = 'closed';
    live.closeTime = new Date();
    live.closePrice = price;
    live.profit = profit;
    live.closeCommission = closeCommission;
    live.commission = totalCommission;
    await live.save();
    user.releaseMargin(live.marginUsed);
    // Convert Indian P&L from INR to USD before settling to wallet
    const profitInUSD = this.convertPnLToUSD(profit, live.exchange, live.segment);
    user.settlePnL(profitInUSD);
    await user.save();
    const nettingSymbol = this.canonicalCryptoPerpetualSymbol(live.symbol);
    const closeTrade = new Trade({
      tradeId: `TRD-EXP-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      oderId: live.oderId,
      userId: live.userId,
      mode: 'netting',
      symbol: nettingSymbol,
      side: live.side === 'buy' ? 'sell' : 'buy',
      volume: closedVolume,
      quantity: closedQty,
      lotSize: expLs,
      entryPrice: live.avgPrice,
      closePrice: price,
      profit,
      commission: totalCommission,
      swap: live.swap || 0,
      session: live.session,
      exchange: live.exchange,
      segment: live.segment,
      type: 'close',
      closedBy: 'system',
      remark: 'Expiry',
      closedAt: new Date()
    });
    await closeTrade.save();
    try {
      await pnlSharingService.distributePnL({
        tradeId: closeTrade._id,
        tradeOderId: closeTrade.tradeId,
        positionId: live._id,
        positionOderId: live.oderId,
        userId: user._id,
        userOderId: live.userId,
        userName: user.name,
        symbol: nettingSymbol,
        segment: live.segment,
        exchange: live.exchange,
        side: live.side,
        volume: closedVolume,
        quantity: live.quantity,
        pnl: profit
      });
    } catch (pnlError) {
      console.error('[PnL Sharing] Option expiry:', pnlError.message);
    }
    console.log(
      `[OptionExpiry] Settled ${live.symbol} user ${live.userId} @ intrinsic ${price} P/L ${profit.toFixed(2)}`
    );
    
    // Return closed position data for notifications
    return { userId: live.userId, symbol: live.symbol, profit };
  }

  /**
   * Scheduled: cash-settle open option positions past expiry and cancel pending orders on expired series.
   * @param {Object} io - Socket.IO instance for user notifications
   */
  async settleExpiredNettingOptionPositions(io = null) {
    const settings = await this.getSettings();
    if (!settings.enabled) {
      return { skipped: true, reason: 'netting_disabled' };
    }
    const candidates = await NettingPosition.find({
      status: { $in: ['open', 'pending'] },
      instrumentExpiry: { $ne: null }
    }).limit(2000);
    let settled = 0;
    let cancelled = 0;
    const settledPositions = []; // Track settled positions for notifications
    
    for (const position of candidates) {
      if (!this._isNettingOptionSettlementDue(position)) continue;
      try {
        if (position.status === 'pending') {
          await this._cancelExpiredNettingOptionPending(position);
          cancelled++;
          
          // Notify user about cancelled pending order
          if (io) {
            io.to(position.userId).emit('expirySettlement', {
              type: 'pending_cancelled',
              symbol: position.symbol,
              message: `Your pending order on ${position.symbol} was cancelled due to contract expiry.`
            });
          }
          continue;
        }
        // Fix 24: use the option's own LTP / close price as the settlement
        // price. This is the most accurate: it's what the exchange last traded
        // at before close, and avoids the intrinsic-from-spot calculation which
        // can break if the underlying spot feed is unavailable or stale.
        // Fallback chain: Zerodha LTP → position.currentPrice → intrinsic.
        let exitPremium = null;

        // 1. Try live Zerodha price for the option symbol itself
        const optPx = zerodhaService.getPrice(position.symbol);
        const optLtp = optPx && (Number(optPx.lastPrice) > 0 ? Number(optPx.lastPrice) : Number(optPx.last_price || 0));
        if (optLtp > 0) {
          exitPremium = optLtp;
          console.log(`[OptionExpiry] ${position.symbol} → using option LTP: ₹${optLtp}`);
        }

        // 2. Fall back to the position's last streamed currentPrice (updated by tick engine)
        if (exitPremium == null || exitPremium <= 0) {
          const cp = Number(position.currentPrice);
          if (Number.isFinite(cp) && cp > 0) {
            exitPremium = cp;
            console.log(`[OptionExpiry] ${position.symbol} → using position.currentPrice: ₹${cp}`);
          }
        }

        // 3. Last resort: compute intrinsic from underlying spot
        if (exitPremium == null || exitPremium <= 0) {
          const meta = await this._ensureOptionSettlementMeta(position);
          if (meta.optionType && Number.isFinite(meta.strike)) {
            const spot = await this._resolveSpotForOptionSettlement(position, meta);
            if (Number.isFinite(spot) && spot > 0) {
              exitPremium = this._intrinsicExitPremiumPerUnit(meta.optionType, meta.strike, spot);
              console.log(`[OptionExpiry] ${position.symbol} → using intrinsic from spot ₹${spot}: ₹${exitPremium}`);
            }
          }
        }

        if (exitPremium == null || !(exitPremium >= 0)) {
          console.warn(`[OptionExpiry] Skip ${position.symbol} — no close price available`);
          continue;
        }

        const closedPosition = await this._closeOpenPositionAtSettlementPrice(position, exitPremium, io);
        settled++;
        
        // Track for notification
        if (closedPosition) {
          settledPositions.push({
            userId: position.userId,
            symbol: position.symbol,
            profit: closedPosition.profit || 0
          });
        }
      } catch (e) {
        console.error(`[OptionExpiry] ${position.symbol} user ${position.userId}:`, e.message);
      }
    }
    if (settled || cancelled) {
      console.log(`[OptionExpiry] Batch done: settled=${settled} cancelled_pending=${cancelled}`);
    }
    return { settled, cancelled, settledPositions };
  }

  // Check if symbol is from F&O segment (requires lot size)
  isLotBasedSegment(exchange, segment) {
    if (!exchange && !segment) return false;
    const ex = (exchange || '').toUpperCase();
    const seg = (segment || '').toUpperCase();
    
    // NSE EQ (equity) uses quantity, not lots
    if (ex === 'NSE' && (!seg || seg === 'NSE' || seg === 'EQ')) return false;
    if (ex === 'BSE' && (!seg || seg === 'BSE' || seg === 'EQ')) return false;
    
    // International segments that use lots (not quantity)
    const intlLotBasedExchanges = ['FOREX', 'STOCKS', 'CRYPTO', 'CRYPTO_PERPETUAL', 'CRYPTO_OPTIONS', 'INDICES', 'COMMODITIES', 'DELTA'];
    if (intlLotBasedExchanges.includes(ex) || intlLotBasedExchanges.includes(seg)) return true;
    
    // F&O segments use lot size
    return this.lotBasedSegments.some(s => 
      ex.includes(s) || seg.includes(s) || ex === 'NFO' || ex === 'MCX' || ex === 'BFO'
    );
  }

  // Get lot size for instrument
  async getLotSize(symbol) {
    const instrument = await this.getInstrumentDetails(symbol);
    if (!instrument) return 1;
    
    // For NSE EQ, lot size is always 1 (quantity based)
    if (!this.isLotBasedSegment(instrument.exchange, instrument.segment)) {
      return 1;
    }
    
    // For F&O, use exchange lot size
    return instrument.lotSize || 1;
  }

  // Calculate actual quantity from lots
  async getQuantityFromLots(symbol, lots) {
    const lotSize = await this.getLotSize(symbol);
    return lots * lotSize;
  }

  // Calculate effective max lots based on limit type (lot or price)
  // If limitType is 'price', calculate maxLots = maxValue / currentPrice
  calculateEffectiveMaxLots(limitType, maxValue, maxLots, currentPrice, lotSize = 1) {
    if (limitType === 'price' && maxValue > 0 && currentPrice > 0) {
      // Calculate max lots based on price value
      // maxValue is the max total value user can trade
      // currentPrice is the price per unit
      // For lot-based instruments: maxLots = maxValue / (currentPrice * lotSize)
      const calculatedMaxLots = Math.floor(maxValue / (currentPrice * lotSize));
      return Math.max(1, calculatedMaxLots); // At least 1 lot
    }
    return maxLots || 100; // Default to maxLots or 100
  }

  positionMatchesSegmentName(p, segmentName) {
    let ex = p?.exchange;
    let seg = p?.segment || '';
    if (!ex && p?.symbol) {
      const inferred = this.inferDeltaExchangeSegment(p.symbol);
      if (inferred) {
        ex = inferred.exchange;
        seg = seg || inferred.segment;
      }
    }
    // MetaAPI / legacy rows often omit exchange — still resolve by symbol (same as order routing)
    if (!ex && p?.symbol) {
      const posSegName = this.getSegmentNameForInstrument('', seg, '', p.symbol || '');
      return posSegName === segmentName;
    }
    if (!ex) return false;
    const posSegName = this.getSegmentNameForInstrument(ex, seg, '', p.symbol || '');
    return posSegName === segmentName;
  }

  /**
   * Segment cap: total lots (open + pending) in segment after this order.
   * - Limit/stop: current committed (all open + all pending in segment) + this order’s lots.
   * - Market: pending rows always count in full; only the OPEN row for this symbol is netted (add/reduce/reverse).
   */
  projectedSegmentVolumeTotal(
    allCommittedRows,
    segmentName,
    symbol,
    existingOpenForSymbol,
    orderVolume,
    orderSide,
    isNewPendingOrder
  ) {
    const inSeg = (p) => this.positionMatchesSegmentName(p, segmentName);
    const segRows = allCommittedRows.filter(inSeg);
    const symCanon = symbol ? this.canonicalCryptoPerpetualSymbol(symbol) : '';
    const symU = symCanon ? String(symCanon).toUpperCase() : '';

    console.log(`[NettingEngine][LOT-DEBUG] projectedSegmentVolumeTotal: segmentName=${segmentName}, totalRows=${allCommittedRows.length}, segRows=${segRows.length}, orderVolume=${orderVolume}`);
    segRows.forEach((p, i) => console.log(`[NettingEngine][LOT-DEBUG]   segRow[${i}]: symbol=${p.symbol}, volume=${p.volume}, status=${p.status}`));

    if (isNewPendingOrder) {
      const total = segRows.reduce((sum, p) => sum + (p.volume || 0), 0) + orderVolume;
      console.log(`[NettingEngine][LOT-DEBUG] projectedSegmentVolumeTotal (pending): total=${total}`);
      return total;
    }

    let sumWithoutThisOpen = 0;
    for (const p of segRows) {
      const pCanon = p.symbol ? this.canonicalCryptoPerpetualSymbol(p.symbol) : '';
      if (p.status === 'open' && symU && String(pCanon).toUpperCase() === symU) {
        continue;
      }
      sumWithoutThisOpen += p.volume || 0;
    }
    console.log(`[NettingEngine][LOT-DEBUG] projectedSegmentVolumeTotal (market): sumWithoutThisOpen=${sumWithoutThisOpen}`)

    const ex =
      existingOpenForSymbol &&
      existingOpenForSymbol.status === 'open' &&
      symU &&
      String(this.canonicalCryptoPerpetualSymbol(existingOpenForSymbol.symbol || '')).toUpperCase() === symU &&
      inSeg(existingOpenForSymbol)
        ? existingOpenForSymbol
        : null;

    if (!ex) {
      const result = sumWithoutThisOpen + orderVolume;
      console.log(`[NettingEngine][LOT-DEBUG] projectedSegmentVolumeTotal: no existing open, result=${result}`);
      return result;
    }

    const E = ex.volume || 0;
    if (orderSide === ex.side) {
      const result = sumWithoutThisOpen + E + orderVolume;
      console.log(`[NettingEngine][LOT-DEBUG] projectedSegmentVolumeTotal: same side add, E=${E}, result=${result}`);
      return result;
    }

    let newSymVol;
    if (orderVolume < E) newSymVol = E - orderVolume;
    else if (orderVolume === E) newSymVol = 0;
    else newSymVol = orderVolume - E;
    const finalResult = sumWithoutThisOpen + newSymVol;
    console.log(`[NettingEngine][LOT-DEBUG] projectedSegmentVolumeTotal: opposite side, E=${E}, newSymVol=${newSymVol}, result=${finalResult}`);
    return finalResult;
  }

  /**
   * Per-script cap: total lots on this symbol in the segment after this order (open + pending, with netting on the open row).
   * maxLots in admin applies here — caps the total lots on this specific symbol.
   */
  projectedSymbolVolumeTotal(
    allCommittedRows,
    segmentName,
    symbol,
    existingOpenForSymbol,
    orderVolume,
    orderSide,
    isNewPendingOrder
  ) {
    const inSeg = (p) => this.positionMatchesSegmentName(p, segmentName);
    const symCanon = symbol ? this.canonicalCryptoPerpetualSymbol(symbol) : '';
    const symU = symCanon ? String(symCanon).toUpperCase() : '';
    const rowMatchesSymbol = (p) => {
      const pc = p.symbol ? this.canonicalCryptoPerpetualSymbol(p.symbol) : '';
      return symU && String(pc).toUpperCase() === symU;
    };

    const symRows = allCommittedRows.filter((p) => inSeg(p) && rowMatchesSymbol(p));

    if (isNewPendingOrder) {
      return symRows.reduce((sum, p) => sum + (p.volume || 0), 0) + orderVolume;
    }

    let sumWithoutThisOpen = 0;
    for (const p of symRows) {
      const pCanon = p.symbol ? this.canonicalCryptoPerpetualSymbol(p.symbol) : '';
      if (p.status === 'open' && symU && String(pCanon).toUpperCase() === symU) {
        continue;
      }
      sumWithoutThisOpen += p.volume || 0;
    }

    const ex =
      existingOpenForSymbol &&
      existingOpenForSymbol.status === 'open' &&
      symU &&
      String(this.canonicalCryptoPerpetualSymbol(existingOpenForSymbol.symbol || '')).toUpperCase() === symU &&
      inSeg(existingOpenForSymbol)
        ? existingOpenForSymbol
        : null;

    if (!ex) {
      return sumWithoutThisOpen + orderVolume;
    }

    const E = ex.volume || 0;
    if (orderSide === ex.side) {
      return sumWithoutThisOpen + E + orderVolume;
    }

    let newSymVol;
    if (orderVolume < E) newSymVol = E - orderVolume;
    else if (orderVolume === E) newSymVol = 0;
    else newSymVol = orderVolume - E;
    return sumWithoutThisOpen + newSymVol;
  }

  /** Shares / contract units for max-qty-holding (uses quantity when set, else volume × lotSize). */
  positionQuantityUnits(p) {
    if (p == null) return 0;
    if (p.quantity != null && Number.isFinite(Number(p.quantity))) {
      return Math.max(0, Number(p.quantity));
    }
    const ls = p.lotSize != null && p.lotSize > 0 ? p.lotSize : 1;
    return (p.volume || 0) * ls;
  }

  /**
   * Segment-wide total quantity units after this order (open rows netted per symbol like projectedSegmentVolumeTotal).
   * Used for maxQtyHolding so closes/reduces are not wrongly rejected.
   */
  projectedSegmentQuantityTotal(
    allCommittedRows,
    segmentName,
    symbol,
    existingOpenForSymbol,
    orderQuantity,
    orderSide,
    isNewPendingOrder
  ) {
    const inSeg = (p) => this.positionMatchesSegmentName(p, segmentName);
    const segRows = allCommittedRows.filter(inSeg);
    const symCanon = symbol ? this.canonicalCryptoPerpetualSymbol(symbol) : '';
    const symU = symCanon ? String(symCanon).toUpperCase() : '';

    if (isNewPendingOrder) {
      return (
        segRows.reduce((sum, p) => sum + this.positionQuantityUnits(p), 0) + orderQuantity
      );
    }

    let sumWithoutThisOpen = 0;
    for (const p of segRows) {
      const pCanon = p.symbol ? this.canonicalCryptoPerpetualSymbol(p.symbol) : '';
      if (p.status === 'open' && symU && String(pCanon).toUpperCase() === symU) {
        continue;
      }
      sumWithoutThisOpen += this.positionQuantityUnits(p);
    }

    const ex =
      existingOpenForSymbol &&
      existingOpenForSymbol.status === 'open' &&
      symU &&
      String(this.canonicalCryptoPerpetualSymbol(existingOpenForSymbol.symbol || '')).toUpperCase() === symU &&
      inSeg(existingOpenForSymbol)
        ? existingOpenForSymbol
        : null;

    if (!ex) {
      return sumWithoutThisOpen + orderQuantity;
    }

    const E = this.positionQuantityUnits(ex);
    if (orderSide === ex.side) {
      return sumWithoutThisOpen + E + orderQuantity;
    }

    let newSymQty;
    if (orderQuantity < E) newSymQty = E - orderQuantity;
    else if (orderQuantity === E) newSymQty = 0;
    else newSymQty = orderQuantity - E;
    return sumWithoutThisOpen + newSymQty;
  }

  /**
   * Per-symbol quantity units after this order (like projectedSymbolVolumeTotal but in share/contract units).
   * Used for maxQtyPerScript enforcement.
   */
  projectedSymbolQuantityTotal(
    allCommittedRows,
    segmentName,
    symbol,
    existingOpenForSymbol,
    orderQuantity,
    orderSide,
    isNewPendingOrder
  ) {
    const inSeg = (p) => this.positionMatchesSegmentName(p, segmentName);
    const symCanon = symbol ? this.canonicalCryptoPerpetualSymbol(symbol) : '';
    const symU = symCanon ? String(symCanon).toUpperCase() : '';
    const rowMatchesSymbol = (p) => {
      const pc = p.symbol ? this.canonicalCryptoPerpetualSymbol(p.symbol) : '';
      return symU && String(pc).toUpperCase() === symU;
    };

    const symRows = allCommittedRows.filter((p) => inSeg(p) && rowMatchesSymbol(p));

    if (isNewPendingOrder) {
      return symRows.reduce((sum, p) => sum + this.positionQuantityUnits(p), 0) + orderQuantity;
    }

    let sumWithoutThisOpen = 0;
    for (const p of symRows) {
      const pCanon = p.symbol ? this.canonicalCryptoPerpetualSymbol(p.symbol) : '';
      if (p.status === 'open' && symU && String(pCanon).toUpperCase() === symU) {
        continue;
      }
      sumWithoutThisOpen += this.positionQuantityUnits(p);
    }

    const ex =
      existingOpenForSymbol &&
      existingOpenForSymbol.status === 'open' &&
      symU &&
      String(this.canonicalCryptoPerpetualSymbol(existingOpenForSymbol.symbol || '')).toUpperCase() === symU &&
      inSeg(existingOpenForSymbol)
        ? existingOpenForSymbol
        : null;

    if (!ex) {
      return sumWithoutThisOpen + orderQuantity;
    }

    const E = this.positionQuantityUnits(ex);
    if (orderSide === ex.side) {
      return sumWithoutThisOpen + E + orderQuantity;
    }

    let newSymQty;
    if (orderQuantity < E) newSymQty = E - orderQuantity;
    else if (orderQuantity === E) newSymQty = 0;
    else newSymQty = orderQuantity - E;
    return sumWithoutThisOpen + newSymQty;
  }

  // Get segment name for an instrument based on exchange, segment, and instrument type
  getSegmentNameForInstrument(exchange, segment, instrumentType, symbol = '') {
    // Normalize and handle Forex/Crypto segments first
    const ex = exchange ? exchange.toUpperCase() : '';
    const seg = segment ? segment.toUpperCase() : '';
    const sym = symbol ? symbol.toUpperCase() : '';
    
    const isFutures = instrumentType === 'FUT' || segment === 'FUT' || segment?.includes('FUT') || sym.endsWith('FUT');
    // Detect options: instrumentType CE/PE, segment contains OPT, or symbol ends with CE/PE (e.g. GOLD26APR102200CE)
    const isOptions = ['CE', 'PE'].includes(instrumentType) || segment?.includes('OPT') || sym.endsWith('CE') || sym.endsWith('PE');
    
    // Delta Exchange — must run before generic BTC/ETH -> CRYPTO mapping
    if (ex === 'DELTA' || ex === 'FX_DELTA') {
      const s = (segment || '').toLowerCase();
      if (
        s.includes('call_options') ||
        s.includes('put_options') ||
        sym.startsWith('C-') ||
        sym.startsWith('P-')
      ) {
        return 'CRYPTO_OPTIONS';
      }
      if (s === 'futures' || (s.includes('future') && !s.includes('perpetual'))) {
        return 'CRYPTO_PERPETUAL';
      }
      return 'CRYPTO_PERPETUAL';
    }

    // CRYPTO patterns FIRST — must run before `ex === 'FOREX'` fallback
    // because MetaAPI streams crypto CFDs (BTCUSD, ETHUSD, etc.) with
    // exchange="FOREX" under its forex feed. Trusting that exchange would
    // apply forex segment settings (e.g. minLots=1) to a crypto trade.
    // Symbol-based detection is more reliable than broker labels here.
    const cryptoSymbols = [...MAJOR_CRYPTO_PERPET_BASES];
    if (/^[CP]-/i.test(sym)) return 'CRYPTO_OPTIONS';
    if (new RegExp(`^(${cryptoSymbols.join('|')})USD$`, 'i').test(sym)) return 'CRYPTO_PERPETUAL';
    if (new RegExp(`^(${cryptoSymbols.join('|')})USDT$`, 'i').test(sym)) return 'CRYPTO_PERPETUAL';
    if (new RegExp(`^(${cryptoSymbols.join('|')})USD\\.P$`, 'i').test(sym)) return 'CRYPTO_PERPETUAL';
    if (new RegExp(`^(${cryptoSymbols.join('|')})USDT\\.P$`, 'i').test(sym)) return 'CRYPTO_PERPETUAL';

    // Explicit exchange/segment tags from the client (reliable for non-crypto).
    if (ex === 'FOREX' || seg === 'FOREX') return 'FOREX';
    if (ex === 'STOCKS' || seg === 'STOCKS' || ex === 'NYSE' || ex === 'NASDAQ') return 'STOCKS';
    if (ex === 'COMMODITIES' || seg === 'COMMODITIES' || ex === 'COMEX') return 'COMMODITIES';
    if (ex === 'INDICES' || seg === 'INDICES') return 'INDICES';
    if (ex === 'CRYPTO' || seg === 'CRYPTO') return 'CRYPTO';
    if (ex === 'CRYPTO_PERPETUAL' || seg === 'CRYPTO_PERPETUAL') return 'CRYPTO_PERPETUAL';
    if (ex === 'CRYPTO_OPTIONS' || seg === 'CRYPTO_OPTIONS') return 'CRYPTO_OPTIONS';
    
    // Detect Forex by symbol pattern (e.g., EURUSD, GBPJPY, BTCAUD, ETHGBP, etc.)
    // A symbol is forex if: it has a slash, OR has 2+ forex currency codes, OR ends with a 3-letter forex code (catches cross pairs like BTCAUD, XRPJPY)
    const forexPairs = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
    const isForexSymbol = sym.includes('/') ||
      forexPairs.filter(curr => sym.includes(curr)).length >= 2 ||
      (sym.length >= 6 && forexPairs.some(curr => sym.endsWith(curr)));
    
    // Detect Crypto by symbol pattern — only if NOT a forex cross pair (forex check runs first in routing)
    const isCryptoSymbol = !isForexSymbol && cryptoSymbols.some(crypto => sym.includes(crypto));
    
    // Detect Commodities by symbol pattern
    const commoditySymbols = ['XAU', 'XAG', 'GOLD', 'SILVER', 'OIL', 'BRENT', 'WTI'];
    const isCommoditySymbol = commoditySymbols.some(comm => sym.includes(comm));
    
    // Detect Indices by symbol pattern
    const indexSymbols = ['US30', 'US100', 'US500', 'UK100', 'DE30', 'JP225', 'NAS100', 'SPX500', 'DJ30'];
    const isIndexSymbol = indexSymbols.some(idx => sym.includes(idx));

    // Map Indian markets FIRST — MCX trades GOLD/SILVER but should use MCX_FUT, not COMMODITIES
    // This must run before commodity symbol pattern check to avoid GOLD26APRFUT -> COMMODITIES
    if (ex === 'NSE') {
      if (isFutures) return 'NSE_FUT';
      else if (isOptions) return 'NSE_OPT';
      else return 'NSE_EQ';
    } else if (ex === 'BSE') {
      if (isFutures) return 'BSE_FUT';
      else if (isOptions) return 'BSE_OPT';
      else return 'BSE_EQ';
    } else if (ex === 'MCX') {
      if (isOptions) return 'MCX_OPT';
      else return 'MCX_FUT';
    } else if (ex === 'NFO') {
      if (isOptions) return 'NSE_OPT';
      else return 'NSE_FUT';
    } else if (ex === 'BFO') {
      if (isOptions) return 'BSE_OPT';
      else return 'BSE_FUT';
    }

    // Commodities & indices BEFORE FOREX/CRYPTO — XAUUSD/XAGUSD are often tagged exchange=FOREX by MetaAPI/brokers,
    // which wrongly applied FOREX brokerage (e.g. $9/lot → $0.09 on 0.01 lot) instead of COMMODITIES admin (0).
    if (ex === 'COMMODITIES' || seg === 'COMMODITIES' || ex === 'COMEX' || isCommoditySymbol) return 'COMMODITIES';
    if (ex === 'INDICES' || seg === 'INDICES' || isIndexSymbol) return 'INDICES';
    
    // Map non-Indian markets to their Segment settings names
    if (ex === 'FOREX' || seg === 'FOREX' || isForexSymbol) return 'FOREX';
    if (ex === 'CRYPTO' || seg === 'CRYPTO' || isCryptoSymbol) {
      // Default crypto to CRYPTO_PERPETUAL (most common); options are caught earlier by C-/P- pattern
      return 'CRYPTO_PERPETUAL';
    }
    if (ex === 'STOCKS' || seg === 'STOCKS' || ex === 'NYSE' || ex === 'NASDAQ') return 'STOCKS';
    
    // Default fallback
    return 'NSE_EQ';
  }

  // Get segment settings for a user and symbol
  async getSegmentSettingsForTrade(userId, symbol, exchange, segment, instrumentType) {
    try {
      const segmentName = this.getSegmentNameForInstrument(exchange, segment, instrumentType, symbol);

      // Netting admin edits NettingSegment; fall back to legacy Segment
      let segmentDoc = await NettingSegment.findOne({ name: segmentName });
      if (!segmentDoc) {
        segmentDoc = await Segment.findOne({ name: segmentName });
      }
      if (!segmentDoc) {
        return null;
      }

      const effectiveSettings = await UserSegmentSettings.getEffectiveSettingsForUser(
        userId, 
        segmentDoc._id, 
        symbol,
        'netting'
      );

      // NettingSegment has no maxLeverage / leverageOptions — fill from parallel Segment row for same name
      const segMeta = await Segment.findOne({ name: segmentName }).lean();
      if (segMeta) {
        const fill = (k) => {
          if ((effectiveSettings[k] === undefined || effectiveSettings[k] === null) && segMeta[k] != null) {
            effectiveSettings[k] = segMeta[k];
          }
        };
        fill('maxLeverage');
        fill('defaultLeverage');
        fill('fixedLeverage');
        fill('leverageOptions');
        fill('marginMode');
        fill('marginRate');
        fill('hedgedMarginRate');
      }

      return effectiveSettings;
    } catch (error) {
      console.error('Error getting segment settings for trade:', error);
      return null;
    }
  }

  /** Effective allow-overnight (carry forward) for a symbol — false forces EOD close for CF positions. */
  async getAllowOvernightForPosition(userId, symbol, exchange, segment, instrumentType = '') {
    try {
      const eff = await this.getSegmentSettingsForTrade(userId, symbol, exchange, segment, instrumentType);
      return eff?.allowOvernight !== false;
    } catch {
      return true;
    }
  }

  // Check if current time is within market hours (uses MarketControl from DB)
  async isMarketOpenFromDB(exchange = 'NSE') {
    try {
      const isOpen = await MarketControl.isMarketOpen(exchange);
      return isOpen;
    } catch (error) {
      console.error('Error checking market status from DB:', error);
      // Fallback to local check if DB fails
      return this.isMarketOpenLocal(exchange);
    }
  }

  // Local fallback for market hours check
  isMarketOpenLocal(exchange = 'NSE') {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const currentTime = ist.getHours() * 60 + ist.getMinutes();
    
    const timing = this.marketTimings[exchange] || this.marketTimings.NSE;
    const [openHour, openMin] = timing.open.split(':').map(Number);
    const [closeHour, closeMin] = timing.close.split(':').map(Number);
    
    const openTime = openHour * 60 + openMin;
    const closeTime = closeHour * 60 + closeMin;
    
    // Check if it's a weekday (Monday = 1, Sunday = 0)
    const day = ist.getDay();
    if (day === 0 || day === 6) return false; // Weekend
    
    return currentTime >= openTime && currentTime <= closeTime;
  }

  // Synchronous version for backward compatibility
  isMarketOpen(exchange = 'NSE') {
    return this.isMarketOpenLocal(exchange);
  }

  // Check if position should be auto squared off (intraday)
  shouldAutoSquareOff(exchange = 'NSE') {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const currentTime = ist.getHours() * 60 + ist.getMinutes();
    
    const timing = this.marketTimings[exchange] || this.marketTimings.NSE;
    const [sqHour, sqMin] = timing.squareOffTime.split(':').map(Number);
    const squareOffTime = sqHour * 60 + sqMin;
    
    return currentTime >= squareOffTime;
  }

  // Determine session type based on time and user preference
  determineSession(requestedSession, exchange = 'NSE') {
    // If user explicitly requests carryforward, allow it (if before square-off time)
    if (requestedSession === 'carryforward') {
      // Carryforward not allowed after square-off time
      if (this.shouldAutoSquareOff(exchange)) {
        return 'intraday'; // Force intraday if past square-off time
      }
      return 'carryforward';
    }
    
    // Default to intraday
    return 'intraday';
  }

  // Calculate margin based on Zerodha rules with leverage support
  // Margin = (Quantity × Price) / Leverage × (marginPercent / 100)
  // Intraday (MIS): ~20% margin, Carryforward (CNC/NRML): 100% margin
  calculateZerodhaMargin(quantity, price, session, exchange, segment, leverage = 100) {
    const totalValue = quantity * price;
    
    // Apply leverage first: Margin = TotalValue / Leverage
    const leveragedValue = totalValue / leverage;
    
    // NSE EQ (Cash segment)
    if (exchange === 'NSE' && (!segment || segment === 'NSE' || segment === 'EQ')) {
      if (session === 'intraday') {
        return leveragedValue * 0.20; // 20% for MIS (intraday)
      }
      return leveragedValue; // 100% for CNC (delivery/carryforward)
    }
    
    // F&O segments - use SPAN + Exposure margin (simplified)
    if (session === 'intraday') {
      return leveragedValue * 0.15; // ~15% for MIS in F&O
    }
    return leveragedValue * 0.40; // ~40% for NRML in F&O (simplified SPAN margin)
  }

  generatePositionId() {
    return `NET-${++this.positionIdCounter}`;
  }

  async getSettings() {
    // 5-second in-memory cache. Admin changes propagate within 5s; every
    // order flow was paying 80-200ms on prod Atlas for this near-static read.
    const now = Date.now();
    if (this._settingsCache && (now - this._settingsCacheAt) < 5000) {
      return this._settingsCache;
    }
    let settings = await TradeModeSettings.findOne({ mode: 'netting' }).lean();
    if (!settings) {
      settings = {
        enabled: true,
        minLotSize: 0.01,
        maxLotSize: 100,
        intradayMaxLotSize: 50,
        carryForwardMaxLotSize: 20,
        autoSquareOffTime: '15:30',
        allowCarryForward: true,
        intradayMarginPercent: 20,
        carryForwardMarginPercent: 100,
        defaultLeverage: 100
      };
    }
    this._settingsCache = settings;
    this._settingsCacheAt = now;
    return settings;
  }

  // Get or create user
  async getUser(userId) {
    let user = await User.findOne({ oderId: userId });
    // Fallback: if userId looks like a MongoDB ObjectId (24-char hex), try _id lookup
    // This prevents ghost user creation when admin "Login as User" sends _id instead of oderId
    if (!user && /^[0-9a-fA-F]{24}$/.test(userId)) {
      user = await User.findById(userId);
      if (user) {
        console.log(`[NettingEngine] getUser: resolved _id ${userId} → oderId ${user.oderId}`);
      }
    }
    if (!user) {
      user = new User({
        oderId: userId,
        email: `${userId}@guest.dhanfunded.com`,
        phone: `9999${userId}`,
        password: process.env.GUEST_DEFAULT_PASSWORD || 'guestpass123',
        name: 'Guest User',
        wallet: {
          balance: parseInt(process.env.GUEST_DEFAULT_BALANCE) || 10000,
          credit: 0,
          equity: parseInt(process.env.GUEST_DEFAULT_BALANCE) || 10000,
          margin: 0,
          freeMargin: parseInt(process.env.GUEST_DEFAULT_BALANCE) || 10000,
          marginLevel: 0
        }
      });
      await user.save();
    }
    return user;
  }

  // Calculate margin for netting position (MT5 Standard Formula)
  // Margin = (Lots × Contract Size × Price) / Leverage × (marginPercent / 100)
  calculateMargin(volume, price, marginPercent, symbol = '', leverage = 100) {
    const baseMargin = mt5.calculateMargin(volume, price, leverage, symbol);
    return (baseMargin * marginPercent) / 100;
  }

  // ============== OPTION SEGMENT DETECTION (Fix 22) ==============
  // True iff the segment is an OPTIONS market — these segments use per-side
  // commission rates (optionBuyCommission / optionSellCommission) instead of
  // the single `commission` field. Match by either the canonical segment name
  // (NSE_OPT etc.) or by segmentType === 'OPTIONS'. Both are equivalent in the
  // schema; checking both lets callers pass either the full segmentSettings
  // object or a bare segment string.
  _isOptionsSegmentSettings(segmentSettings) {
    if (!segmentSettings) return false;
    const name = String(segmentSettings.name || '').toUpperCase();
    if (name === 'NSE_OPT' || name === 'BSE_OPT' || name === 'MCX_OPT' || name === 'CRYPTO_OPTIONS') {
      return true;
    }
    const type = String(segmentSettings.segmentType || '').toUpperCase();
    return type === 'OPTIONS';
  }

  // ============== COMMISSION RATE PICKER (Fix 22) ==============
  // For OPT segments → returns optionBuyCommission for buy actions and
  // optionSellCommission for sell actions.
  // For non-OPT segments → returns the single `commission` field regardless
  // of side. Action side is the side of the ORDER being placed (open BUY,
  // open SELL, close-by-opposite-side, etc.) — at close time the caller is
  // responsible for passing the OPPOSITE of position.side.
  _pickCommissionRate(segmentSettings, actionSide) {
    if (!segmentSettings) return 0;
    if (this._isOptionsSegmentSettings(segmentSettings)) {
      const isBuy = String(actionSide || '').toLowerCase() === 'buy';
      return isBuy
        ? Number(segmentSettings.optionBuyCommission) || 0
        : Number(segmentSettings.optionSellCommission) || 0;
    }
    return Number(segmentSettings.commission) || 0;
  }

  // ============== COMMISSION CALCULATION HELPER ==============
  // Calculates commission based on type: per_lot, per_crore, percentage, fixed
  calculateCommission(commissionType, commissionValue, lots, quantity, price) {
    const val = Number(commissionValue);
    if (!Number.isFinite(val) || val <= 0) return 0;
    const typeNorm = String(commissionType || 'per_lot')
      .toLowerCase()
      .replace(/-/g, '_');

    switch (typeNorm) {
      case 'per_lot':
        // Per Lot: commission × number of lots
        return val * lots;
      case 'per_crore':
        // Per Crore: (turnover / 1 Crore) × commission
        const turnover = quantity * price;
        return (turnover / 10000000) * val;
      case 'percentage':
        // Percentage: (trade value × commission) / 100
        const tradeValue = quantity * price;
        return (tradeValue * val) / 100;
      case 'fixed':
        // Fixed: flat fee per trade
        return val;
      default:
        // Default to per_lot
        return val * lots;
    }
  }

  // ============== SWAP CALCULATION HELPER ==============
  // Calculates overnight swap/interest for holding positions
  // SWAP TYPE: points, percentage, money
  // SWAP LONG: Interest for holding BUY positions overnight (negative = charge, positive = earn)
  // SWAP SHORT: Interest for holding SELL positions overnight
  // TRIPLE SWAP DAY: Day of week (0-6) when swap is charged 3x (accounts for weekend)
  calculateSwap(swapType, swapValue, lots, quantity, price, contractSize = 1) {
    if (!swapValue) return 0;

    let raw;
    switch (swapType) {
      case 'points':
        // Points: swap value × lots × contract size
        raw = swapValue * lots * contractSize;
        break;
      case 'percentage': {
        // Percentage: (position value × swap%) / 100 / 365 (annual → daily)
        const positionValue = quantity * price;
        raw = (positionValue * swapValue) / 100 / 365;
        break;
      }
      case 'money':
        // Money: fixed amount per lot
        raw = swapValue * lots;
        break;
      default:
        raw = swapValue * lots * contractSize;
    }

    // Swap is ALWAYS a deduction in this app — see Fix 14 in agent.md §13.
    // Admins may enter swapLong/swapShort as positive OR negative numbers in
    // segment settings; either way, the user is debited the absolute value.
    // This deviates from MT5 where swap can be a credit on favorable carry,
    // but the product team chose this convention so swap behaves like a fee.
    return -Math.abs(raw);
  }

  // ============== APPLY OVERNIGHT SWAP TO ALL POSITIONS ==============
  // Called by settlement cron at end of day to charge/credit swap.
  //
  // Fix 23: now accepts an optional `options.segmentName` filter so the
  // per-minute swap scheduler in settlement.cron.js can fire one segment at
  // a time (each segment has its own configurable `swapTime`). When called
  // without a filter (manual admin trigger / legacy cron), processes ALL
  // open positions across every segment — preserves the original behavior.
  //
  // @param {object} [options]
  // @param {string} [options.segmentName] — only process positions in this
  //   segment (matches NettingSegment.name, e.g. 'NSE_FUT', 'FOREX').
  async applyOvernightSwap(options = {}) {
    const User = require('../models/User');
    const UserSegmentSettings = require('../models/UserSegmentSettings');
    const Segment = require('../models/Segment');

    const { segmentName = null } = options;
    console.log(`[NettingEngine] Applying overnight swap${segmentName ? ` for segment ${segmentName}` : ' to all open positions'}...`);

    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    // Get all open positions (carryforward/overnight only, not intraday).
    // We can't reliably narrow the query by segmentName because Position.segment
    // sometimes holds instrument-derived strings ('call_options', etc.) instead
    // of the canonical NettingSegment.name ('NSE_OPT'). The segment match is
    // resolved per-position below using getSegmentSettingsForTrade so it's
    // always the canonical doc.
    const openPositions = await NettingPosition.find({
      status: 'open',
      session: { $in: ['carryforward', 'overnight', 'nrml', 'cnc'] }
    });
    
    console.log(`[NettingEngine] Found ${openPositions.length} overnight positions for swap calculation`);
    
    let totalSwapCharged = 0;
    let positionsProcessed = 0;
    const swapResults = [];
    
    const { isInstrumentExpiryTodayIST } = require('../services/nettingExpiryDay');
    
    for (const position of openPositions) {
      try {
        let exp = position.instrumentExpiry;
        if (!exp && position.symbol) {
          const inst = await this.getInstrumentDetails(position.symbol);
          if (inst?.expiry) exp = new Date(inst.expiry);
        }
        if (exp && isInstrumentExpiryTodayIST(exp)) {
          continue;
        }

        // Get segment settings for this position
        const segmentSettings = await this.getSegmentSettingsForTrade(
          position.userId,
          position.symbol,
          position.exchange,
          position.segment,
          position.instrumentType
        );

        if (!segmentSettings) continue;

        // Fix 23: when invoked by the per-segment scheduler, skip positions
        // whose resolved segment doesn't match the target. The match is on
        // the canonical NettingSegment.name (e.g., 'NSE_FUT', 'FOREX').
        if (segmentName && String(segmentSettings.name || '').toUpperCase() !== String(segmentName).toUpperCase()) {
          continue;
        }

        // Check if swap is configured
        const swapType = segmentSettings.swapType || 'points';
        const swapLong = segmentSettings.swapLong || 0;
        const swapShort = segmentSettings.swapShort || 0;
        const tripleSwapDay = segmentSettings.tripleSwapDay ?? 3; // Default Wednesday
        
        // Skip if no swap configured
        if (swapLong === 0 && swapShort === 0) continue;
        
        // Determine swap value based on position side
        const swapValue = position.side === 'buy' ? swapLong : swapShort;
        
        // Calculate base swap
        const contractSize = position.lotSize || 1;
        let swapAmount = this.calculateSwap(
          swapType,
          swapValue,
          position.volume,
          position.quantity,
          position.currentPrice || position.avgPrice,
          contractSize
        );
        
        // Apply triple swap on designated day (accounts for weekend)
        if (dayOfWeek === tripleSwapDay) {
          swapAmount *= 3;
          console.log(`[NettingEngine] Triple swap day (${tripleSwapDay}) - swap multiplied by 3`);
        }
        
        if (swapAmount === 0) continue;

        const usdInrRate = getCachedUsdInrRate();
        const isIndian = this.isIndianInstrument(position.exchange, position.segment);

        // For Indian instruments: calculateSwap returns INR (price is ₹).
        // Store the INR amount on position.swap so the UI can display it
        // directly without a lossy USD→INR round-trip. Only convert to USD
        // for the wallet deduction.
        // For international instruments: calculateSwap returns USD. No conversion.
        const swapForWallet = isIndian ? swapAmount / usdInrRate : swapAmount;

        // position.swap stores in the INSTRUMENT'S currency (₹ for Indian, $ for intl)
        position.swap = (position.swap || 0) + swapAmount;
        await position.save();

        // Wallet is always in USD — deduct the USD-equivalent
        const user = await User.findOne({ oderId: position.userId });
        if (user) {
          user.wallet.balance += swapForWallet;
          user.wallet.equity += swapForWallet;
          user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
          await user.save();
        }
        
        totalSwapCharged += swapAmount;
        positionsProcessed++;
        
        swapResults.push({
          positionId: position.oderId,
          symbol: position.symbol,
          side: position.side,
          volume: position.volume,
          swapAmount,
          isTripleDay: dayOfWeek === tripleSwapDay
        });
        
        console.log(`[NettingEngine] Swap applied - Position: ${position.oderId}, Symbol: ${position.symbol}, Side: ${position.side}, Swap: ${swapAmount.toFixed(2)}`);
        
      } catch (error) {
        console.error(`[NettingEngine] Error applying swap to position ${position.oderId}:`, error);
      }
    }
    
    console.log(`[NettingEngine] Overnight swap completed - Positions: ${positionsProcessed}, Total Swap: ${totalSwapCharged.toFixed(2)}`);
    
    return {
      success: true,
      positionsProcessed,
      totalSwapCharged,
      dayOfWeek,
      results: swapResults
    };
  }

  // Check if instrument is Indian (prices in INR)
  // ONLY actual Indian exchanges — international lot-based segments (FOREX, COMMODITIES, CRYPTO) are NOT Indian
  isIndianInstrument(exchange, segment) {
    const indianExchanges = ['NSE', 'NFO', 'MCX', 'BSE', 'BFO', 'CDS'];
    const ex = (exchange || '').toUpperCase();
    return indianExchanges.includes(ex);
  }

  // Convert P&L from INR to USD for Indian instruments
  // Wallet is always in USD, so Indian P&L (in INR) must be converted
  convertPnLToUSD(pnl, exchange, segment) {
    if (this.isIndianInstrument(exchange, segment)) {
      const usdInrRate = getCachedUsdInrRate();
      const pnlInUSD = pnl / usdInrRate;
      console.log(`[NettingEngine] Converting Indian P&L: ₹${pnl.toFixed(2)} → $${pnlInUSD.toFixed(2)} (rate: ${usdInrRate})`);
      return pnlInUSD;
    }
    // Non-Indian instruments already return P&L in USD
    return pnl;
  }

  // Calculate P/L for netting position
  // For Indian instruments (NSE/MCX/BSE): P/L = (currentPrice - entryPrice) × quantity (returns INR)
  // For International (Forex/Crypto/Commodities): Uses MT5 formula with contract size (returns USD)
  calculatePnL(position, currentPrice) {
    const symbol = position.symbol || '';
    const exchange = (position.exchange || '').toUpperCase();
    const quantity = position.quantity || (position.volume * (position.lotSize || 1)) || 0;
    
    // For ACTUAL Indian instruments only (NSE, NFO, MCX, BSE, BFO)
    // These have prices in INR and use simple P/L = priceDiff × quantity
    const indianExchanges = ['NSE', 'NFO', 'MCX', 'BSE', 'BFO', 'CDS'];
    if (indianExchanges.includes(exchange)) {
      const priceDiff = position.side === 'buy' 
        ? currentPrice - position.avgPrice 
        : position.avgPrice - currentPrice;
      return priceDiff * quantity;
    }
    
    // For non-Indian instruments (FOREX, COMMODITIES, CRYPTO, INDICES, etc.)
    // Use MT5 formula with contract size (result is in USD)
    return mt5.calculatePnL(
      position.side,
      position.avgPrice,
      currentPrice,
      position.volume || 0,
      symbol
    );
  }

  // Apply reorder delay and calculate execution price
  async applyReorderDelay(userId, segmentName, originalPrice, side, getCurrentPrice) {
    try {
      console.log(`[Reorder-Netting] Checking reorder for user: ${userId}, segment: ${segmentName}`);
      const reorderConfig = await ReorderSettings.getDelayForTrade(userId, segmentName);
      console.log(`[Reorder-Netting] Config received:`, JSON.stringify(reorderConfig));
      
      if (!reorderConfig || reorderConfig.delaySeconds <= 0) {
        console.log(`[Reorder-Netting] No delay configured or delay is 0`);
        return { executionPrice: originalPrice, delayed: false, delaySeconds: 0 };
      }
      
      const delaySeconds = reorderConfig.delaySeconds;
      console.log(`[Reorder] Applying ${delaySeconds}s delay for user ${userId}, segment ${segmentName}`);
      
      // Wait for the delay
      await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
      
      // Get current price after delay
      const currentPrice = await getCurrentPrice();
      
      // Calculate execution price based on price mode
      const executionPrice = ReorderSettings.calculateExecutionPrice(
        originalPrice,
        currentPrice,
        side,
        reorderConfig.priceMode
      );
      
      console.log(`[Reorder] Original: ${originalPrice}, Current: ${currentPrice}, Execution: ${executionPrice}, Mode: ${reorderConfig.priceMode}`);
      
      return { 
        executionPrice, 
        delayed: true, 
        delaySeconds,
        originalPrice,
        currentPrice,
        priceMode: reorderConfig.priceMode
      };
    } catch (error) {
      console.error('[Reorder] Error applying delay:', error);
      return { executionPrice: originalPrice, delayed: false, delaySeconds: 0 };
    }
  }

  async executeOrder(userId, orderData, marketData = null, getCurrentPriceCallback = null) {
    const settings = await this.getSettings();
    
    if (!settings.enabled) {
      throw new Error('Netting mode is currently disabled');
    }

    const {
      symbol,
      orderType,
      side,
      volume, // This is lots for F&O, quantity for EQ
      price,
      stopLoss,
      takeProfit,
      leverage: orderLeverage, // Leverage passed from frontend
      session: requestedSession = 'intraday',
      isMarketOpen = false,
      exchange: orderExchange,  // Exchange passed from frontend
      segment: orderSegment,    // Segment passed from frontend
      lotSize: orderLotSize,    // Lot size passed from frontend (fallback)
      isCloseOperation = false  // Skip minLot validation for close operations
    } = orderData;

    const mergedMD = marketData && typeof marketData === 'object' ? { ...marketData } : {};
    const pxOrder = Number(price);
    const mdLp = Number(mergedMD.lastPrice);
    const mdLtp = Number(mergedMD.ltp);
    const mdBid = Number(mergedMD.bid);
    const mdAsk = Number(mergedMD.ask);
    // Resolve actual market price: lastPrice > ltp > mid(bid,ask) > bid > ask
    // Do NOT use the order price (pxOrder) here — it could be a limit price far from market
    const resolvedMarketPrice =
      (Number.isFinite(mdLp) && mdLp > 0) ? mdLp
      : (Number.isFinite(mdLtp) && mdLtp > 0) ? mdLtp
      : (Number.isFinite(mdBid) && mdBid > 0 && Number.isFinite(mdAsk) && mdAsk > 0) ? (mdBid + mdAsk) / 2
      : (Number.isFinite(mdBid) && mdBid > 0) ? mdBid
      : (Number.isFinite(mdAsk) && mdAsk > 0) ? mdAsk
      : 0;
    const effectiveMarketData = {
      ...mergedMD,
      lastPrice: resolvedMarketPrice > 0 ? resolvedMarketPrice
        : (Number.isFinite(pxOrder) && pxOrder > 0) ? pxOrder : 0,
      ltp: resolvedMarketPrice > 0 ? resolvedMarketPrice
        : (Number.isFinite(pxOrder) && pxOrder > 0) ? pxOrder : 0
    };

    const symAliases = this.cryptoPerpetualSymbolAliases(symbol);
    const nettingSymbol = this.canonicalCryptoPerpetualSymbol(symbol);

    const isNewPendingOrder = ['limit', 'stop'].includes(String(orderType || '').toLowerCase());

    // Get instrument details from Zerodha (+ strike / underlying for option rules)
    let instrument = await this.getInstrumentDetails(symbol);
    // Fix 24: also try nettingSymbol lookup if direct symbol miss (casing/alias mismatch)
    if (!instrument) {
      instrument = await this.getInstrumentDetails(nettingSymbol);
    }
    if (instrument) {
      instrument = await this.enrichIndianInstrumentForNetting(instrument);
    }
    let optionPositionMeta = await this.buildOptionPositionMetaFromInstrument(instrument);
    const futuresExpiryMeta = this.buildFuturesInstrumentExpiryMeta(instrument);

    // Fix 24: fallback — if instrument was found but meta extraction missed fields,
    // infer from the symbol name itself (e.g. SENSEX2640978100PE → PE, ends in CE/PE)
    if (instrument && !optionPositionMeta.optionType) {
      const symUp = String(symbol || '').toUpperCase();
      if (symUp.endsWith('CE') || symUp.endsWith('PE')) {
        const ot = symUp.endsWith('CE') ? 'CE' : 'PE';
        const strike = instrument.strike || instrument.strikePrice;
        const exp = instrument.expiry ? new Date(instrument.expiry) : null;
        if (exp && !isNaN(exp.getTime()) && Number(strike) > 0) {
          optionPositionMeta = {
            instrumentExpiry: exp,
            optionStrike: Number(strike),
            optionType: ot,
            underlyingQuoteSymbol: optionPositionMeta.underlyingQuoteSymbol || null
          };
          console.log(`[NettingEngine] Fix 24 fallback: inferred option meta for ${symbol}: type=${ot} strike=${strike} expiry=${exp.toISOString()}`);
        }
      }
    }

    const positionInstrumentMeta = { ...futuresExpiryMeta, ...optionPositionMeta };
    // Use exchange from orderData if provided, otherwise from instrument
    // Don't default to NSE for forex/crypto symbols
    let exchange = orderExchange || instrument?.exchange || null;
    let segment = orderSegment || instrument?.segment || '';

    // Delta symbols are not in Zerodha cache → without this we mis-resolve to CRYPTO (MetaAPI) and skip CRYPTO_PERPETUAL netting settings
    if (!exchange && symbol) {
      const inferred = this.inferDeltaExchangeSegment(symbol);
      if (inferred) {
        exchange = inferred.exchange;
        if (!segment) segment = inferred.segment;
      }
    }
    // Fallback lot sizes when Zerodha cache doesn't return the instrument (keep aligned with NSE; refresh instruments CSV when exchange changes lots)
    const KNOWN_LOT_SIZES = {
      NIFTY: 65,
      BANKNIFTY: 15,
      FINNIFTY: 40,
      MIDCPNIFTY: 75,
      SENSEX: 10,
      BANKEX: 15,
      CRUDEOIL: 100,
      GOLD: 100,
      SILVER: 30,
      SILVERM: 5,
      COPPER: 2500,
      NATURALGAS: 1250,
      ZINC: 5000,
      ALUMINIUM: 5000,
      LEAD: 5000,
      NICKEL: 1500
    };
    const getKnownLotSize = (sym) => {
      const upper = (sym || '').toUpperCase();
      for (const [base, ls] of Object.entries(KNOWN_LOT_SIZES)) {
        if (upper.startsWith(base)) return ls;
      }
      return null;
    };

    const instrumentType = instrument?.instrumentType || '';
    const segmentName = this.getSegmentNameForInstrument(exchange, segment, instrumentType, symbol);
    const lotBasedSegmentNames = [
      'NSE_FUT',
      'NSE_OPT',
      'BSE_FUT',
      'BSE_OPT',
      'MCX_FUT',
      'MCX_OPT',
      'FOREX',
      'STOCKS',
      'CRYPTO_PERPETUAL',
      'CRYPTO_OPTIONS',
      'INDICES',
      'COMMODITIES'
    ];
    const isLotBased = exchange
      ? this.isLotBasedSegment(exchange, segment)
      : lotBasedSegmentNames.includes(segmentName);

    // Lot size: UI sends `lotSize` from the same instrument the user sees (e.g. 65). Zerodha cache can be stale (e.g. old 75).
    // For Indian F&O, prefer client `orderLotSize` when > 0 so P&L/margin match the order panel.
    const clientLotSize = Number(orderLotSize);
    const instLotSize = Number(instrument?.lotSize);
    const knownLot = getKnownLotSize(symbol);
    const indianLotBased = this.isIndianInstrument(exchange, segment) && isLotBased;
    const exchangeLotSize = indianLotBased && Number.isFinite(clientLotSize) && clientLotSize > 0
      ? clientLotSize
      : instLotSize > 0
        ? instLotSize
        : knownLot || (Number.isFinite(clientLotSize) && clientLotSize > 1 ? clientLotSize : null) || 1;

    console.log(`[NettingEngine] Instrument details - symbol: ${symbol} (netting ${nettingSymbol}), exchange: ${exchange}, segment: ${segment}, found: ${!!instrument}`);
    console.log(`[NettingEngine][LOT-DEBUG] isLotBased=${isLotBased}, segmentName=${segmentName}, exchangeLotSize=${exchangeLotSize}`);

    // Check if instrument expires today - add warning flag to response
    let expiryWarning = null;
    if (instrument?.expiry || positionInstrumentMeta?.instrumentExpiry) {
      const { isInstrumentExpiryTodayIST } = require('../services/nettingExpiryDay');
      const expiryDate = instrument?.expiry || positionInstrumentMeta?.instrumentExpiry;
      if (isInstrumentExpiryTodayIST(expiryDate)) {
        expiryWarning = `Warning: ${symbol} expires today. Your position will be automatically closed at market close.`;
        console.log(`[NettingEngine] Expiry warning for ${symbol}: expires today`);
      }
    }

    // Only check market timing for Indian exchanges
    // Forex/Crypto symbols (no exchange) are 24/5 and don't need market timing check
    if (exchange && this.indianExchanges.includes(exchange.toUpperCase())) {
      console.log(`[NettingEngine] Checking market status for Indian exchange: ${exchange}, symbol: ${symbol}`);
      const marketOpen = await this.isMarketOpenFromDB(exchange);
      console.log(`[NettingEngine] Market open status for ${exchange}: ${marketOpen}`);
      
      if (!marketOpen) {
        const marketStatus = await MarketControl.getMarketStatus(exchange);
        console.log(`[NettingEngine] Market closed - rejecting trade. Message: ${marketStatus.message}`);
        throw new Error(marketStatus.message || `${exchange} market is currently closed. Trading is not allowed.`);
      }
    }
    
    // Determine actual session based on time and request
    const session = this.determineSession(requestedSession, exchange);
    
    // Calculate actual quantity
    // For F&O: volume is number of lots, quantity = lots × lotSize
    // For EQ: volume is quantity directly (lotSize = 1)
    const quantity = isLotBased ? volume * exchangeLotSize : volume;
    const lots = isLotBased ? volume : volume; // For EQ, lots = quantity

    // Note: Market check is now done above using MarketControl DB settings
    // This legacy check is kept for backward compatibility with price validation
    if (!price) {
      throw new Error('Price is required for order execution.');
    }

    // ============== PARALLEL FETCH (Phase 11 perf fix) ==============
    // These three reads don't depend on each other. Fetching together turns
    // 3 sequential Mongo round-trips into 1 — on Atlas that's ~100-200ms saved.
    const _pt = perfTimer.start('netting.executeOrder');
    const [segmentSettings, effectiveRiskSettingsEarly, existingOpenForSymbolEarly] = await Promise.all([
      this.getSegmentSettingsForTrade(userId, symbol, exchange, segment, instrumentType),
      UserRiskSettings.getEffectiveSettings(userId),
      NettingPosition.findOne({
        userId,
        status: 'open',
        ...(symAliases.length === 1 ? { symbol: symAliases[0] } : { symbol: { $in: symAliases } })
      }),
    ]);
    _pt.mark('parallel-reads');
    
    // DEBUG: Log all lot-related settings
    if (segmentSettings) {
      console.log(`[NettingEngine][LOT-DEBUG] segmentSettings for ${symbol}:`, {
        segmentName,
        maxLots: segmentSettings.maxLots,
        orderLots: segmentSettings.orderLots,
        minLots: segmentSettings.minLots,
        maxExchangeLots: segmentSettings.maxExchangeLots,
        limitType: segmentSettings.limitType,
        maxValue: segmentSettings.maxValue
      });
    } else {
      console.log(`[NettingEngine][LOT-DEBUG] NO segmentSettings for ${symbol}`);
    }
    
    // ============== LEVERAGE SETTINGS ENFORCEMENT ==============
    // Priority: Fixed Leverage > User Selected > Default Leverage > Exposure Multiplier > Fallback (100)
    let leverage = 100; // Fallback default
    
    if (segmentSettings) {
      // FIXED LEVERAGE: Forces a specific multiplier that user cannot change
      // If set, this overrides everything else
      if (segmentSettings.fixedLeverage != null && segmentSettings.fixedLeverage > 0) {
        leverage = segmentSettings.fixedLeverage;
        console.log(`[NettingEngine] Using FIXED leverage: ${leverage}x (user cannot change)`);
      }
      // User selected leverage (from frontend) - validate against max and options
      else if (orderLeverage != null && orderLeverage > 0) {
        // MAX LEVERAGE: Absolute highest multiplier user can set
        if (segmentSettings.maxLeverage != null && segmentSettings.maxLeverage > 0) {
          if (orderLeverage > segmentSettings.maxLeverage) {
            throw new Error(`Maximum leverage allowed is ${segmentSettings.maxLeverage}x. You selected ${orderLeverage}x.`);
          }
        }
        
        // LEVERAGE OPTIONS: Validate against allowed options (e.g., "1,10,20,50,100")
        if (segmentSettings.leverageOptions) {
          const allowedOptions = segmentSettings.leverageOptions.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
          if (allowedOptions.length > 0 && !allowedOptions.includes(orderLeverage)) {
            throw new Error(`Invalid leverage. Allowed options: ${allowedOptions.join(', ')}x. You selected ${orderLeverage}x.`);
          }
        }
        
        leverage = orderLeverage;
        console.log(`[NettingEngine] Using USER selected leverage: ${leverage}x`);
      }
      // DEFAULT LEVERAGE: Applied if user doesn't choose one
      else if (segmentSettings.defaultLeverage != null && segmentSettings.defaultLeverage > 0) {
        leverage = segmentSettings.defaultLeverage;
        console.log(`[NettingEngine] Using DEFAULT leverage: ${leverage}x`);
      }
      // EXP INTRA / EXP CF: Exposure multipliers based on session type
      // These act as leverage multipliers: e.g., EXP INTRA=5 means ₹100 can trade ₹500 worth
      else {
        if (session === 'intraday' && segmentSettings.exposureIntraday != null && segmentSettings.exposureIntraday > 0) {
          leverage = segmentSettings.exposureIntraday;
          console.log(`[NettingEngine] Using EXPOSURE INTRADAY multiplier: ${leverage}x`);
        } else if (session === 'carryforward' && segmentSettings.exposureCarryForward != null && segmentSettings.exposureCarryForward > 0) {
          leverage = segmentSettings.exposureCarryForward;
          console.log(`[NettingEngine] Using EXPOSURE CARRYFORWARD multiplier: ${leverage}x`);
        }
      }
    } else if (orderLeverage != null && orderLeverage > 0) {
      // No segment settings, use order leverage
      leverage = orderLeverage;
    } else {
      // Fallback to settings default
      leverage = settings.defaultLeverage || 100;
    }
    
    // ============== BLOCK SETTINGS ENFORCEMENT ==============
    if (segmentSettings) {
      // Check if segment is active
      if (segmentSettings.isActive === false) {
        throw new Error(`Trading is not available for this segment. Segment is inactive.`);
      }
      // Check if trading is enabled for this segment
      if (segmentSettings.tradingEnabled === false) {
        throw new Error(`Trading is blocked for ${segmentName || 'this segment'}.`);
      }
      // Check if options are blocked (for options instruments)
      const isOptionsInstrument = instrumentType === 'OPT' || instrumentType === 'CE' || instrumentType === 'PE' || 
                                   segment === 'OPT' || segmentName?.includes('_OPT');
      if (segmentSettings.blockOptions === true && isOptionsInstrument) {
        throw new Error(`Options trading is blocked for ${segmentName || 'this segment'}.`);
      }
      // Check if fractional lots are blocked
      if (segmentSettings.blockFractionLot === true && volume % 1 !== 0) {
        throw new Error(`Fractional lot trading is blocked for ${segmentName || 'this segment'}. Please use whole lot sizes.`);
      }
    }

    // Reuse the pre-fetched values from the parallel block above.
    const existingOpenForSymbol = existingOpenForSymbolEarly;
    if (existingOpenForSymbol && existingOpenForSymbol.symbol !== nettingSymbol) {
      existingOpenForSymbol.symbol = nettingSymbol;
    }

    // ============== EXIT ONLY MODE ==============
    // Check global/user risk settings first, then segment settings
    // Close-only: no new symbols, no pyramiding (same side), no over-close that flips to a reverse position.
    const effectiveRiskSettings = effectiveRiskSettingsEarly;
    const isExitOnlyMode = effectiveRiskSettings?.exitOnlyMode === true || segmentSettings?.exitOnlyMode === true;
    
    if (isExitOnlyMode) {
      const openVol = Number(existingOpenForSymbol?.volume) || 0;
      const unitWord = isLotBased ? 'lots' : 'shares';
      if (!existingOpenForSymbol) {
        throw new Error(
          `Exit only mode is enabled: you cannot open new positions. Only close an existing open trade on this symbol (opposite side, size at most your open ${unitWord}).`
        );
      }
      if (side === existingOpenForSymbol.side) {
        throw new Error(
          `Exit only mode: you cannot add to your ${existingOpenForSymbol.side} position — only ${existingOpenForSymbol.side === 'buy' ? 'sell' : 'buy'} to reduce or close.`
        );
      }
      if (volume > openVol + 1e-12) {
        throw new Error(
          `Exit only mode: you can close at most ${openVol} ${unitWord}. A larger size would open a reverse position, which is not allowed.`
        );
      }
    }

    // ============== LOT/QTY VALIDATION ==============
    // Validate volume (lot size) - use segment settings if available
    let minLot = settings.minLotSize || 0.01;
    let maxLot = settings.maxLotSize || 100;
    let orderLot = settings.maxLotSize || 100; // Per order limit
    
    if (segmentSettings) {
      // Use segment-specific limits (nullish so explicit minLots e.g. 1 is not skipped)
      minLot = segmentSettings.minLots != null ? segmentSettings.minLots : minLot;
      
      // Calculate effective max lots based on limit type (lot or price)
      maxLot = this.calculateEffectiveMaxLots(
        segmentSettings.limitType,
        segmentSettings.maxValue,
        segmentSettings.maxLots,
        price,
        exchangeLotSize
      );
      
      // Per order lot limit (orderLots) - maximum lots allowed in a single order
      orderLot =
        segmentSettings.orderLots != null && segmentSettings.orderLots > 0
          ? segmentSettings.orderLots
          : maxLot;
      
      console.log(`[NettingEngine] Segment settings - limitType: ${segmentSettings.limitType}, maxValue: ${segmentSettings.maxValue}, maxLots: ${segmentSettings.maxLots}, orderLots: ${orderLot}, effectiveMaxLots: ${maxLot}`);
    }
    
    // For equity, use "quantity" terminology; for F&O, use "lots"
    const unitLabel = isLotBased ? 'lots' : 'quantity';
    
    // MIN LOT: Smallest tradeable unit (1 for Indian, 0.01 for Forex/Crypto)
    // Skip minLot validation for close operations - user should be able to close any amount
    if (!isCloseOperation && volume < minLot) {
      throw new Error(`Minimum ${unitLabel} is ${minLot}`);
    }
    
    // PER ORDER LOT (orderLots): cap one click when adding/increasing exposure (not pure reduce/close on this symbol)
    const isReduceOnly =
      existingOpenForSymbol &&
      existingOpenForSymbol.side !== side &&
      volume <= (existingOpenForSymbol.volume || 0);

    if (
      segmentSettings &&
      !isReduceOnly &&
      session === 'carryforward' &&
      segmentSettings.allowOvernight === false
    ) {
      throw new Error(
        `Overnight (carry forward) is disabled for ${segmentName || 'this segment'}. Use intraday only — open positions are squared at market close and P&L is settled to your wallet.`
      );
    }

    // For lot-based segments, enforce orderLots cap.
    // For quantity-based segments (NSE/BSE EQ), skip this — perOrderQty check below handles it.
    if (!isReduceOnly && isLotBased && volume > orderLot) {
      throw new Error(`Per order ${unitLabel} limit is ${orderLot}. You are trying to trade ${volume} ${unitLabel}.`);
    }

    // ============== PER ORDER QTY ENFORCEMENT (for quantity-based limits) ==============
    // Max quantity per single order (opening/adding). Same as orderLots but in share/contract units.
    // Skipped for reduce/close on the open row so users can exit size larger than the per-order cap.
    if (segmentSettings && !isReduceOnly) {
      if (segmentSettings.perOrderQty != null && segmentSettings.perOrderQty > 0) {
        if (quantity > segmentSettings.perOrderQty) {
          throw new Error(
            `Per order quantity limit is ${segmentSettings.perOrderQty} (max units per order). You are trying to trade ${quantity}. Reduce order size or place multiple orders.`
          );
        }
      }
    }

    // ============== VALUE SETTINGS ENFORCEMENT ==============
    if (segmentSettings) {
      // Open + pending: both count toward segment lot / exch caps
      const allUserPositions = await NettingPosition.find({
        userId,
        status: { $in: ['open', 'pending'] }
      });
      
      // NOTE: MAX MARGIN VALUE check is done AFTER marginRequired is calculated (see below around line 2320)
      // Store allUserPositions for later use in margin check
      this._tempAllUserPositions = allUserPositions;
      
      // MAX LOT (maxLots): per script/symbol only — net lots on this symbol in the segment after this order.
      // For non-lot-based segments (NSE EQ, BSE EQ), skip if maxQtyPerScript is set — that's the intended per-script cap for equity.
      const skipMaxLotsForQty = !isLotBased && segmentSettings.maxQtyPerScript != null && segmentSettings.maxQtyPerScript > 0;
      console.log(`[NettingEngine][LOT-DEBUG] Checking maxLots: segmentSettings.maxLots=${segmentSettings.maxLots}, volume=${volume}, isLotBased=${isLotBased}, skipMaxLotsForQty=${skipMaxLotsForQty}`);
      if (!skipMaxLotsForQty && segmentSettings.maxLots != null && segmentSettings.maxLots > 0) {
        const projectedScriptLots = this.projectedSymbolVolumeTotal(
          allUserPositions,
          segmentName,
          nettingSymbol,
          existingOpenForSymbol,
          volume,
          side,
          isNewPendingOrder
        );
        console.log(`[NettingEngine][LOT-DEBUG] maxLots check: projectedScriptLots=${projectedScriptLots}, maxLots=${segmentSettings.maxLots}, willReject=${projectedScriptLots > segmentSettings.maxLots}`);
        if (projectedScriptLots > segmentSettings.maxLots) {
          throw new Error(
            `Max ${unitLabel} per symbol (this script) is ${segmentSettings.maxLots} (open + pending on this symbol in the segment). After this order the net on this symbol would be ${projectedScriptLots}.`
          );
        }
      } else if (skipMaxLotsForQty) {
        console.log(`[NettingEngine][LOT-DEBUG] maxLots check SKIPPED - non-lot-based with maxQtyPerScript=${segmentSettings.maxQtyPerScript} (using maxQtyPerScript instead)`);
      } else {
        console.log(`[NettingEngine][LOT-DEBUG] maxLots check SKIPPED - maxLots is null/0`);
      }

      // MAX EXCHANGE LOTS: segment-wide total lots (open + pending) in this netting segment — segment default only, not script overrides. Lot-based segments only (N/A for NSE/BSE EQ).
      console.log(`[NettingEngine][LOT-DEBUG] Checking maxExchangeLots: segmentSettings.maxExchangeLots=${segmentSettings.maxExchangeLots}, isLotBased=${isLotBased}`);
      if (
        isLotBased &&
        segmentSettings.maxExchangeLots != null &&
        segmentSettings.maxExchangeLots > 0
      ) {
        const projectedSegLots = this.projectedSegmentVolumeTotal(
          allUserPositions,
          segmentName,
          nettingSymbol,
          existingOpenForSymbol,
          volume,
          side,
          isNewPendingOrder
        );
        console.log(`[NettingEngine][LOT-DEBUG] maxExchangeLots check: projectedSegLots=${projectedSegLots}, maxExchangeLots=${segmentSettings.maxExchangeLots}, willReject=${projectedSegLots > segmentSettings.maxExchangeLots}`);
        if (projectedSegLots > segmentSettings.maxExchangeLots) {
          throw new Error(
            `Max exchange lots for this segment is ${segmentSettings.maxExchangeLots} (total lots open + pending in the segment after this order). Would be ${projectedSegLots}.`
          );
        }
      } else {
        console.log(`[NettingEngine][LOT-DEBUG] maxExchangeLots check SKIPPED - not lot-based or maxExchangeLots is null/0`);
      }

      
      // MAX QTY HOLD (maxQtyHolding): Total quantity units in segment after this order (netted per symbol).
      // Uses projected total so sells/closes are not rejected (old bug: currentTotal + orderQty).
      // For non-lot-based (EQ): skip if maxQtyPerScript is set — that's the active per-script cap.
      const skipMaxQtyHolding = !isLotBased && segmentSettings.maxQtyPerScript != null && segmentSettings.maxQtyPerScript > 0;
      if (!skipMaxQtyHolding && segmentSettings.maxQtyHolding != null && segmentSettings.maxQtyHolding > 0) {
        const projectedTotalQty = this.projectedSegmentQuantityTotal(
          allUserPositions,
          segmentName,
          nettingSymbol,
          existingOpenForSymbol,
          quantity,
          side,
          isNewPendingOrder
        );
        if (projectedTotalQty > segmentSettings.maxQtyHolding) {
          throw new Error(
            `Max quantity holding limit is ${segmentSettings.maxQtyHolding} (total units in this segment after this order). ` +
              `Would be ${projectedTotalQty}. Reduce size or close other positions in this segment.`
          );
        }
      }

      // ---- DEBUG: qty enforcement ----
      console.log(`[NettingEngine][QTY-DEBUG] segmentName=${segmentName}, symbol=${nettingSymbol}, quantity=${quantity}, volume=${volume}`);
      console.log(`[NettingEngine][QTY-DEBUG] minQty=${segmentSettings.minQty}, maxQtyPerScript=${segmentSettings.maxQtyPerScript}, perOrderQty=${segmentSettings.perOrderQty}, maxQtyHolding=${segmentSettings.maxQtyHolding}`);
      console.log(`[NettingEngine][QTY-DEBUG] isReduceOnly=${isReduceOnly}, isNewPendingOrder=${isNewPendingOrder}, existingOpen=${!!existingOpenForSymbol}, existingOpenVol=${existingOpenForSymbol?.volume}, existingOpenQty=${existingOpenForSymbol?.quantity}`);

      // MIN QTY (minQty): Minimum quantity units per order (for equity segments like NSE_EQ, BSE_EQ).
      if (!isReduceOnly && segmentSettings.minQty != null && segmentSettings.minQty > 0) {
        if (quantity < segmentSettings.minQty) {
          throw new Error(
            `Minimum quantity per order is ${segmentSettings.minQty}. You are trying to trade ${quantity}.`
          );
        }
      }

      // MAX QTY PER SCRIPT (maxQtyPerScript): Max total quantity units on this symbol after this order.
      console.log(`[NettingEngine][QTY-DEBUG] Checking maxQtyPerScript: maxQtyPerScript=${segmentSettings.maxQtyPerScript}, quantity=${quantity}, isReduceOnly=${isReduceOnly}`);
      if (segmentSettings.maxQtyPerScript != null && segmentSettings.maxQtyPerScript > 0) {
        const projectedScriptQty = this.projectedSymbolQuantityTotal(
          allUserPositions,
          segmentName,
          nettingSymbol,
          existingOpenForSymbol,
          quantity,
          side,
          isNewPendingOrder
        );
        console.log(`[NettingEngine][QTY-DEBUG] maxQtyPerScript check: projectedScriptQty=${projectedScriptQty}, maxQtyPerScript=${segmentSettings.maxQtyPerScript}, willReject=${projectedScriptQty > segmentSettings.maxQtyPerScript}`);
        if (projectedScriptQty > segmentSettings.maxQtyPerScript) {
          throw new Error(
            `Max quantity per script is ${segmentSettings.maxQtyPerScript} (total shares/units on this symbol). ` +
              `After this order it would be ${projectedScriptQty}. Reduce size or close existing positions.`
          );
        }
      } else {
        console.log(`[NettingEngine][QTY-DEBUG] maxQtyPerScript check SKIPPED - maxQtyPerScript is null/0`);
      }

    }

    // ============== OPTIONS STRIKE VALIDATION ==============
    // BUY STRIKE FAR: Prevents buying deep OTM options (junk options with 99% chance of expiring worthless)
    // SELL STRIKE FAR: Prevents selling far-away options for tiny premium (unlimited risk if market crashes)
    if (segmentSettings && instrument) {
      const isOptionsInstrument = instrumentType === 'OPT' || instrumentType === 'CE' || instrumentType === 'PE' || 
                                   segment === 'OPT' || segmentName?.includes('_OPT');
      const strikeVal = Number(instrument.strikePrice ?? instrument.strike);
      if (isOptionsInstrument && Number.isFinite(strikeVal) && strikeVal > 0) {
        instrument.strikePrice = strikeVal;
        // Get underlying price (spot / future proxy from subscribed same `name`)
        const underlyingPrice =
          Number(instrument.underlyingPrice || instrument.spotPrice || 0) ||
          0;
        
        if (underlyingPrice > 0) {
          const strikeDistance = Math.abs(strikeVal - underlyingPrice);

          const buyFar = segmentSettings.buyingStrikeFar;
          const buyPct = segmentSettings.buyingStrikeFarPercent;
          const sellFar = segmentSettings.sellingStrikeFar;
          const sellPct = segmentSettings.sellingStrikeFarPercent;

          // BUY: points first, else max distance = underlying × (percent / 100)
          if (side === 'buy') {
            if (buyFar != null && buyFar > 0) {
              if (strikeDistance > buyFar) {
                throw new Error(
                  `Buying strike too far from underlying. Strike: ${strikeVal}, Underlying: ${underlyingPrice}, Distance: ${strikeDistance.toFixed(0)}. Max: ${buyFar} (price units).`
                );
              }
            } else if (buyPct != null && buyPct > 0) {
              const maxDist = underlyingPrice * (Number(buyPct) / 100);
              if (strikeDistance > maxDist) {
                throw new Error(
                  `Buying strike too far from underlying. Strike: ${strikeVal}, Underlying: ${underlyingPrice}, Distance: ${strikeDistance.toFixed(2)}. Max: ${maxDist.toFixed(2)} (${buyPct}% of underlying).`
                );
              }
            }
          }

          if (side === 'sell') {
            if (sellFar != null && sellFar > 0) {
              if (strikeDistance > sellFar) {
                throw new Error(
                  `Selling strike too far from underlying. Strike: ${strikeVal}, Underlying: ${underlyingPrice}, Distance: ${strikeDistance.toFixed(0)}. Max: ${sellFar} (price units).`
                );
              }
            } else if (sellPct != null && sellPct > 0) {
              const maxDist = underlyingPrice * (Number(sellPct) / 100);
              if (strikeDistance > maxDist) {
                throw new Error(
                  `Selling strike too far from underlying. Strike: ${strikeVal}, Underlying: ${underlyingPrice}, Distance: ${strikeDistance.toFixed(2)}. Max: ${maxDist.toFixed(2)} (${sellPct}% of underlying).`
                );
              }
            }
          }

          console.log(
            `[NettingEngine] Options strike — strike: ${strikeVal}, underlying: ${underlyingPrice}, distance: ${strikeDistance}, buyPts: ${buyFar}, buy%: ${buyPct}, sellPts: ${sellFar}, sell%: ${sellPct}`
          );
        } else {
          const bf = segmentSettings.buyingStrikeFar;
          const bp = segmentSettings.buyingStrikeFarPercent;
          const sf = segmentSettings.sellingStrikeFar;
          const sp = segmentSettings.sellingStrikeFarPercent;
          const hasRule =
            (bf != null && bf > 0) ||
            (bp != null && bp > 0) ||
            (sf != null && sf > 0) ||
            (sp != null && sp > 0);
          if (hasRule) {
            console.warn(
              `[NettingEngine] Options strike rule skipped (no underlying LTP) for ${symbol}. Add underlying/index to watchlist or ensure Zerodha ticks for ${String(instrument.symbol || symbol).replace(/[0-9].*$/, '') || 'underlying'}.`
            );
          }
        }
      }
    }

    // ============== LIMIT AWAY (points or % of market) ==============
    // Script override: absolute points. Segment: % of price (e.g. 10% @ ₹100 → ±₹10 → buy limit ≥ ₹90, sell ≤ ₹110).
    // Applies to limit AND stop (SL-M) orders.
    if (segmentSettings && (orderType === 'limit' || orderType === 'pending' || orderType === 'stop')) {
      const marketPrice =
        effectiveMarketData.lastPrice ||
        effectiveMarketData.ltp ||
        instrument?.lastPrice ||
        0;
        
        if (marketPrice > 0) {
        const pts = segmentSettings.limitAwayPoints;
        const pct = segmentSettings.limitAwayPercent;
        let away = null;
        let awayLabel = '';
        if (pts != null && Number(pts) > 0) {
          away = Number(pts);
          awayLabel = `${away} points`;
        } else if (pct != null && Number(pct) > 0) {
          away = marketPrice * (Number(pct) / 100);
          awayLabel = `${Number(pct)}% of market (≈${away.toFixed(2)} price)`;
        }

        if (away != null && away > 0) {
          if (orderType === 'stop') {
            // STOP ORDERS: opposite direction from limit orders
            // BUY STOP: must be at least 'away' ABOVE market price (triggered when price rises)
            if (side === 'buy') {
              const minBuyStopPrice = marketPrice + away;
              if (price < marketPrice) {
                throw new Error(`Buy stop price (${price}) cannot be below market price (${marketPrice}). Use Buy Limit for prices below market.`);
              }
              if (price < minBuyStopPrice) {
                throw new Error(`Buy stop price (${price}) is too close to market (${marketPrice}). Must be at least ${awayLabel} above market. Minimum allowed: ${minBuyStopPrice.toFixed(2)}.`);
              }
            }
            // SELL STOP: must be at least 'away' BELOW market price (triggered when price drops)
            if (side === 'sell') {
              const maxSellStopPrice = marketPrice - away;
              if (price > marketPrice) {
                throw new Error(`Sell stop price (${price}) cannot be above market price (${marketPrice}). Use Sell Limit for prices above market.`);
              }
              if (price > maxSellStopPrice) {
                throw new Error(`Sell stop price (${price}) is too close to market (${marketPrice}). Must be at least ${awayLabel} below market. Maximum allowed: ${maxSellStopPrice.toFixed(2)}.`);
              }
            }
          } else {
            // LIMIT ORDERS: original logic
            // BUY LIMIT: must be at least 'away' below market price
            if (side === 'buy') {
              const maxBuyPrice = marketPrice - away;
              if (price > marketPrice) {
                throw new Error(`Buy limit price (${price}) cannot be above market price (${marketPrice}). Place a market order instead.`);
              }
              if (price > maxBuyPrice) {
                throw new Error(`Buy limit price (${price}) is too close to market (${marketPrice}). Must be at least ${awayLabel} below market. Maximum allowed: ${maxBuyPrice.toFixed(2)}.`);
              }
            }
            // SELL LIMIT: must be at least 'away' above market price
            if (side === 'sell') {
              const minSellPrice = marketPrice + away;
              if (price < marketPrice) {
                throw new Error(`Sell limit price (${price}) cannot be below market price (${marketPrice}). Place a market order instead.`);
              }
              if (price < minSellPrice) {
                throw new Error(`Sell limit price (${price}) is too close to market (${marketPrice}). Must be at least ${awayLabel} above market. Minimum allowed: ${minSellPrice.toFixed(2)}.`);
              }
            }
          }
          console.log(`[NettingEngine] Limit away validation - orderType: ${orderType}, side: ${side}, price: ${price}, marketPrice: ${marketPrice}, ${awayLabel}`);
        }
      }
    }

    // ============== SL/TP placement validation (Fix 12) ==============
    // Direction check + limit-away gap on stopLoss/takeProfit at order entry.
    // Reference price = the price the order will execute at (so for fresh
    // orders entry == current). Same `limitAwayPercent`/`limitAwayPoints`
    // setting that gates pending order prices also gates SL/TP distance.
    if (stopLoss != null || takeProfit != null) {
      const sltpRefPrice =
        Number(price) > 0
          ? Number(price)
          : Number(effectiveMarketData.lastPrice || effectiveMarketData.ltp || instrument?.lastPrice || 0);
      const sltpErr = this.validateSLTPPlacement(side, sltpRefPrice, stopLoss, takeProfit, segmentSettings);
      if (sltpErr) throw new Error(sltpErr);
    }

    // Session-specific limits - skip for equity segments (NSE_EQ, BSE_EQ) which use quantity-based validation
    // Equity segments use perOrderQty for quantity limits, not lot-based limits
    const isEquitySegment = segmentName === 'NSE_EQ' || segmentName === 'BSE_EQ' || !isLotBased;
    
    if (!isEquitySegment) {
      // Lot-based validation for F&O, Forex, Crypto segments
      const globalIntradayMaxLot = settings.intradayMaxLotSize || 50;
      const globalCarryForwardMaxLot = settings.carryForwardMaxLotSize || 20;
      
      // Use segment-specific limits if available and higher than global defaults
      const segmentMaxLot = segmentSettings?.maxLots || segmentSettings?.orderLots || 0;
      const intradayMaxLot = segmentMaxLot > 0 ? Math.max(globalIntradayMaxLot, segmentMaxLot) : globalIntradayMaxLot;
      const carryForwardMaxLot = segmentMaxLot > 0 ? Math.max(globalCarryForwardMaxLot, segmentMaxLot) : globalCarryForwardMaxLot;
      
      if (session === 'intraday' && volume > intradayMaxLot) {
        throw new Error(`Maximum intraday lot size is ${intradayMaxLot}`);
      }
      if (session === 'carryforward') {
        if (!settings.allowCarryForward) {
          throw new Error('Carry forward is not allowed');
        }
        if (volume > carryForwardMaxLot) {
          throw new Error(`Maximum carry forward lot size is ${carryForwardMaxLot}`);
        }
      }
    }
    // For equity segments, quantity validation is handled by perOrderQty check above (line 1880-1887)

    // Get user
    const user = await this.getUser(userId);

    // Calculate margin based on Zerodha rules with leverage
    // Use Zerodha margin calculation for Indian instruments
    let marginRequired;
    if (instrument) {
      marginRequired = this.calculateZerodhaMargin(quantity, price, session, exchange, segment, leverage);
    } else {
      // For non-Indian instruments without Zerodha data: full contract notional.
      // margin = volume × contractSize × price (no leverage in netting mode).
      // When admin configures fixed/times/percent margin, the override below
      // replaces this. Leverage only applies in hedging mode.
      const mt5 = require('../utils/mt5Calculations');
      const contractSize = mt5.getContractSize(symbol);
      marginRequired = volume * contractSize * price;
    }

    // ============== FIXED MARGIN OVERRIDE ==============
    // Expiry-day margins (IST) apply first for intraday + carryforward on that calendar day — intraday-style only, never overnight columns.
    // If instrument expires today and carryforward is used, normal overnight fixed margin is skipped (use intraday / expiry columns instead).
    let usedAdminFixedMargin = false; // tracks whether admin INR margin was applied (vs MT5 USD fallback)
    if (segmentSettings) {
      const { isInstrumentExpiryTodayIST } = require('../services/nettingExpiryDay');
      const isOptionsInstrument =
        instrumentType === 'OPT' ||
        instrumentType === 'CE' ||
        instrumentType === 'PE' ||
        segment === 'OPT' ||
        segmentName?.includes('_OPT') ||
        segmentName === 'CRYPTO_OPTIONS' ||
        symbol?.startsWith('C-') ||
        symbol?.startsWith('P-');
      const expiryToday =
        instrument?.expiry != null && isInstrumentExpiryTodayIST(instrument.expiry);
      const fixedMarginSession =
        expiryToday && session === 'carryforward' ? 'intraday' : session;

      let usedExpiryDayMargin = false;
      if (expiryToday && (session === 'intraday' || session === 'carryforward')) {
        // Pass side + isOptionsInstrument so resolveExpiryDayMarginAmount
        // can pick the per-side option field (Fix 17). Falls back to the
        // single expiryDayIntradayMargin for futures and for options that
        // didn't get a side-specific value.
        const em = this.resolveExpiryDayMarginAmount(segmentSettings, {
          volume,
          quantity,
          price,
          side,
          isOptionsInstrument
        });
        if (em != null) {
          marginRequired = em;
          usedExpiryDayMargin = true;
          console.log(`[NettingEngine] Expiry-day margin override: ${marginRequired} (side=${side}, opt=${isOptionsInstrument})`);
        }
      }

      if (!usedExpiryDayMargin) {
      // Resolve the override margin value (X)
      let rawMarginValue = null;
      let usedIsPercentSetting = null; // For legacy fixed margin % settings

      if (isOptionsInstrument) {
        if (side === 'buy') {
          if (fixedMarginSession === 'intraday') {
            rawMarginValue = segmentSettings.optionBuyIntraday;
            usedIsPercentSetting = segmentSettings.fixedMarginOptionBuyIntradayAsPercent;
          } else {
            rawMarginValue = segmentSettings.optionBuyOvernight;
            usedIsPercentSetting = segmentSettings.fixedMarginOptionBuyOvernightAsPercent;
          }
        } else if (side === 'sell') {
          if (fixedMarginSession === 'intraday') {
            rawMarginValue = segmentSettings.optionSellIntraday;
            usedIsPercentSetting = segmentSettings.fixedMarginOptionSellIntradayAsPercent;
          } else {
            rawMarginValue = segmentSettings.optionSellOvernight;
            usedIsPercentSetting = segmentSettings.fixedMarginOptionSellOvernightAsPercent;
          }
        }
      }

      // If options specific margin is not set (null or 0), fallback to base segment margin
      if (!(Number(rawMarginValue) > 0)) {
        if (fixedMarginSession === 'intraday') {
          rawMarginValue = segmentSettings.intradayHolding;
          usedIsPercentSetting = segmentSettings.fixedMarginIntradayAsPercent;
        } else {
          rawMarginValue = segmentSettings.overnightHolding;
          usedIsPercentSetting = segmentSettings.fixedMarginOvernightAsPercent;
        }
      }

      // If a valid raw override value exists, calculate the margin
      if (Number(rawMarginValue) > 0) {
        const m = this.nettingFixedMarginAmount(
          rawMarginValue,
          segmentSettings.marginCalcMode || (usedIsPercentSetting === true),
          volume,
          quantity,
          price,
          orderLeverage
        );
        if (m != null) {
          marginRequired = m;
          usedAdminFixedMargin = true;
          console.log(`[NettingEngine] Margin override applied: ${marginRequired} (mode: ${segmentSettings.marginCalcMode || (usedIsPercentSetting === true)})`);
        }
      }
      } else {
        usedAdminFixedMargin = usedExpiryDayMargin; // expiry-day margin is also admin-set INR
      }
    }

    // ============== FIXED MARGIN CURRENCY CONVERSION (INTERNATIONAL ONLY) ==============
    // Admin fixed margin values are entered in INR. Wallet margin/balance are stored in USD.
    // International fixed mode: convert that INR admin figure to USD once.
    // Indian instruments: margin stays INR until the INR→USD block further below.
    //
    // Fix 24: ONLY convert when an admin-set INR margin was actually applied. When no fixed
    // margin is set, the MT5 fallback at line 2748 already computed margin in USD — dividing
    // by usdInrRate would make it ~93× too small.
    if (usedAdminFixedMargin && segmentSettings && !this.isIndianInstrument(exchange, segment)) {
      const calcMode = segmentSettings.marginCalcMode || 'fixed';
      if (calcMode === 'fixed') {
        const usdInrRate = getCachedUsdInrRate();
        if (usdInrRate > 0) {
          console.log(`[NettingEngine] Fixed margin INR→USD: ₹${marginRequired.toFixed(2)} ÷ ${usdInrRate} = $${(marginRequired / usdInrRate).toFixed(2)}`);
          marginRequired = marginRequired / usdInrRate;
        }
      }
    }
    
    console.log(`[NettingEngine] Margin calculation - quantity: ${quantity}, price: ${price}, leverage: ${leverage}, marginRequired: ${marginRequired}`);

    // ============== MAX MARGIN VALUE CHECK (admin maxValue is always ₹ INR) ==============
    // Position.marginUsed is stored in USD (wallet units). marginRequired here: INR for Indian, USD for international.
    // Skip for close / reduce-only: order margin is computed like a new trade but net exposure drops — applying the
    // cap to currentUsed + orderMargin double-counts (e.g. ₹100k in use + ₹100k "for close" vs ₹100k cap).
    if (segmentSettings && segmentSettings.maxValue > 0 && this._tempAllUserPositions) {
      if (!isCloseOperation && !isReduceOnly) {
        const allUserPositions = this._tempAllUserPositions;
        const usdInrRateCap = getCachedUsdInrRate() || 1;
        const sumMarginUsd = allUserPositions
          .filter((p) => this.positionMatchesSegmentName(p, segmentName))
          .reduce((sum, p) => sum + (p.marginUsed || 0), 0);
        const currentMarginInr = sumMarginUsd * usdInrRateCap;
        const orderMarginInr = this.isIndianInstrument(exchange, segment)
          ? marginRequired
          : marginRequired * usdInrRateCap;

        if (currentMarginInr + orderMarginInr > segmentSettings.maxValue) {
          const remaining = Math.max(0, segmentSettings.maxValue - currentMarginInr);
          throw new Error(
            `Max margin limit is ₹${segmentSettings.maxValue.toLocaleString()}. Current margin used: ₹${currentMarginInr.toLocaleString(undefined, { maximumFractionDigits: 2 })}, This order margin: ₹${orderMarginInr.toLocaleString(undefined, { maximumFractionDigits: 2 })}. You can only use ₹${remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })} more margin.`
          );
        }

        console.log(
          `[NettingEngine] Margin-based limit check - maxValue: ₹${segmentSettings.maxValue}, currentMargin ₹: ${currentMarginInr.toFixed(2)}, orderMargin ₹: ${orderMarginInr.toFixed(2)}`
        );
      }
      delete this._tempAllUserPositions;
    }

    // ============== INDIAN INSTRUMENT: MARGIN INR → USD (WALLET) ==============
    // NSE/BSE/MCX etc. use INR prices; admin fixed / percent / Zerodha-style margin is therefore INR.
    // User.wallet.margin is in USD — without this, ₹1000 was stored as 1000 "USD" and the UI showed ₹1000×rate (e.g. ₹93,130).
    if (this.isIndianInstrument(exchange, segment)) {
      const usdInrRate = getCachedUsdInrRate();
      if (usdInrRate > 0 && marginRequired > 0) {
        console.log(
          `[NettingEngine] Indian margin INR→USD for wallet: ₹${marginRequired.toFixed(2)} ÷ ${usdInrRate} ≈ $${(marginRequired / usdInrRate).toFixed(4)}`
        );
        marginRequired = marginRequired / usdInrRate;
      }
    }

    // Apply reorder delay if configured
    let executionPrice = price;
    let reorderInfo = null;
    
    if (getCurrentPriceCallback) {
      // Get user's MongoDB _id for reorder check (userDelays uses ObjectId)
      const userMongoId = user._id ? user._id.toString() : userId;
      reorderInfo = await this.applyReorderDelay(
        userMongoId, 
        segmentName, 
        price, 
        side, 
        getCurrentPriceCallback
      );
      executionPrice = reorderInfo.executionPrice;
      
      if (reorderInfo.delayed) {
        console.log(`[NettingEngine] Reorder applied - Original: ${price}, Execution: ${executionPrice}, Delay: ${reorderInfo.delaySeconds}s`);
      }
    }

    // ============== SPREAD SETTINGS ENFORCEMENT ==============
    // spreadPips: minimum width in price units (same as quote, e.g. USD on BTCUSD).
    // BUY pays more, SELL receives less vs the execution reference price.
    // - fixed: always use spreadPips (0 = no spread).
    // - floating: max(spreadPips, live ask−bid) when order includes bid & ask; else spreadPips only.
    // Skip if spread was already applied at display time (market orders with spreadPreApplied flag)
    if (segmentSettings && !orderData.spreadPreApplied) {
      const floor = Math.max(0, Number(segmentSettings.spreadPips) || 0);
      const st = String(segmentSettings.spreadType || 'fixed').toLowerCase();
      let appliedSpread = floor;

      if (st === 'floating') {
        const md = marketData && typeof marketData === 'object' ? marketData : {};
        const bid = Number(md.bid);
        const ask = Number(md.ask);
        if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0 && ask > bid) {
          const marketWidth = ask - bid;
          appliedSpread = Math.max(floor, marketWidth);
          console.log(
            `[NettingEngine] Floating spread: ask−bid=${marketWidth.toFixed(8)}, floor=${floor}, applied=${appliedSpread.toFixed(8)}`
          );
        } else if (floor > 0) {
          console.log(`[NettingEngine] Floating spread: no valid bid/ask on order — using floor ${floor}`);
        }
      }

      if (appliedSpread > 0) {
        const preSpread = executionPrice;
        if (side === 'buy') {
          executionPrice = executionPrice + appliedSpread;
          console.log(`[NettingEngine] Spread (${st}) BUY: ${preSpread} + ${appliedSpread} = ${executionPrice}`);
        } else if (side === 'sell') {
          executionPrice = executionPrice - appliedSpread;
          console.log(`[NettingEngine] Spread (${st}) SELL: ${preSpread} - ${appliedSpread} = ${executionPrice}`);
        }
      }
    }

    // ============== MT5-STYLE ORDER TYPE HANDLING ==============
    // Market orders execute immediately at current price
    // Limit/Stop orders create pending orders that execute when price is reached
    const isPendingOrder = orderType === 'limit' || orderType === 'stop';
    
    console.log(`[NettingEngine] Order type check - orderType: "${orderType}", isPendingOrder: ${isPendingOrder}, marketData: ${!!marketData}`);
    
    // ============== MT5-STYLE PENDING ORDER VALIDATION ==============
    if (isPendingOrder && marketData) {
      const currentAsk = marketData.ask || price;
      const currentBid = marketData.bid || price;
      
      if (orderType === 'limit') {
        if (side === 'buy' && price >= currentAsk) {
          throw new Error(`Buy Limit price (${price}) must be below current Ask price (${currentAsk}). Use Buy Stop for prices above market.`);
        }
        if (side === 'sell' && price <= currentBid) {
          throw new Error(`Sell Limit price (${price}) must be above current Bid price (${currentBid}). Use Sell Stop for prices below market.`);
        }
      } else if (orderType === 'stop') {
        if (side === 'buy' && price <= currentAsk) {
          throw new Error(`Buy Stop price (${price}) must be above current Ask price (${currentAsk}). Use Buy Limit for prices below market.`);
        }
        if (side === 'sell' && price >= currentBid) {
          throw new Error(`Sell Stop price (${price}) must be below current Bid price (${currentBid}). Use Sell Limit for prices above market.`);
        }
      }
    }
    
    const orderStatus = isPendingOrder ? 'pending' : 'open';
    const orderPrice = isPendingOrder ? price : executionPrice;

    // Open position for this symbol (same query as lot limits above)
    let existingPosition = existingOpenForSymbol;

    // For pending orders, we don't merge with existing positions - create separate pending order
    if (isPendingOrder) {
      // MT5 Standard: Reject trade if insufficient free margin
      if (!user.hasSufficientMargin(marginRequired)) {
        // For Indian instruments, show margin in INR
        if (this.isIndianInstrument(exchange, segment)) {
          const usdInrRate = getCachedUsdInrRate();
          const marginInINR = marginRequired * usdInrRate;
          const availableInINR = user.wallet.freeMargin * usdInrRate;
          throw new Error(`Insufficient margin. Required: ₹${marginInINR.toFixed(2)}, Available: ₹${availableInINR.toFixed(2)}`);
        }
        throw new Error(`Insufficient margin. Required: $${marginRequired.toFixed(2)}, Available: $${user.wallet.freeMargin.toFixed(2)}`);
      }

      // Create pending order
      const orderId = this.generatePositionId();
      const pendingOrder = new NettingPosition({
        oderId: orderId,
        userId,
        symbol: nettingSymbol,
        side,
        volume: lots,
        quantity,
        lotSize: exchangeLotSize,
        avgPrice: orderPrice,
        currentPrice: orderPrice,
        stopLoss: stopLoss || null,
        takeProfit: takeProfit || null,
        leverage,
        session,
        exchange,
        segment,
        marginUsed: marginRequired,
        profit: 0,
        status: 'pending',
        orderType,
        triggerPrice: price,
        pendingOrderType: orderType,
        ...positionInstrumentMeta
      });

      user.useMargin(marginRequired);
      await Promise.all([pendingOrder.save(), user.save()]);

      // Log pending order
      const trade = new Trade({
        tradeId: `TRD-${Date.now()}`,
        oderId: orderId,
        userId,
        mode: 'netting',
        symbol: nettingSymbol,
        side,
        volume: lots,
        quantity,
        entryPrice: orderPrice,
        session,
        exchange,
        segment,
        type: 'pending',
        executedAt: new Date()
      });
      trade.save().catch(err => console.error('Trade history save error:', err));

      const updatedPositions = await NettingPosition.find({ userId, status: 'open' });
      const pendingOrders = await NettingPosition.find({ userId, status: 'pending' });

      return {
        success: true,
        position: pendingOrder.toObject(),
        positions: updatedPositions.map(p => ({ ...p.toObject(), mode: 'netting' })),
        pendingOrders: pendingOrders.map(p => ({ ...p.toObject(), mode: 'netting' })),
        wallet: user.wallet,
        message: `${orderType.toUpperCase()} order placed: ${side.toUpperCase()} ${lots} lots of ${symbol} @ ${price}`,
        isPendingOrder: true,
        expiryWarning
      };
    }

    if (!existingPosition) {
      // ============== OPEN COMMISSION CALCULATION (pre-check) ==============
      // Compute commission BEFORE the margin check so `margin + commission`
      // can be validated as a single affordability test. Previously the pre-
      // check only looked at `margin ≥ freeMargin`, then commission was
      // deducted after, which could leave the user with negative free margin
      // and trigger an instant margin call / stop-out on the next tick.
      let openCommission = 0;
      let openCommissionInr = 0;
      let openCommissionChargedOnOpen = false;
      const openCommissionRate = this._pickCommissionRate(segmentSettings, side);
      if (segmentSettings && openCommissionRate > 0) {
        const chargeOn = segmentSettings.chargeOn || 'open';
        const shouldChargeOnOpen = chargeOn === 'open' || chargeOn === 'both';
        if (shouldChargeOnOpen) {
          openCommissionChargedOnOpen = true;
          openCommissionInr = this.calculateCommission(
            segmentSettings.commissionType,
            openCommissionRate,
            lots,
            quantity,
            executionPrice
          );
          const usdInrRate = getCachedUsdInrRate();
          openCommission = openCommissionInr / usdInrRate;
        }
      }

      // MT5 Standard: Reject trade if insufficient free margin for margin + commission.
      const totalRequired = marginRequired + openCommission;
      if (user.wallet.freeMargin < totalRequired) {
        if (this.isIndianInstrument(exchange, segment)) {
          const usdInrRate = getCachedUsdInrRate();
          const mInr = marginRequired * usdInrRate;
          const cInr = openCommissionInr || (openCommission * usdInrRate);
          const availInr = user.wallet.freeMargin * usdInrRate;
          throw new Error(
            cInr > 0
              ? `Insufficient margin. Required: ₹${(mInr + cInr).toFixed(2)} (Margin ₹${mInr.toFixed(2)} + Commission ₹${cInr.toFixed(2)}), Available: ₹${availInr.toFixed(2)}`
              : `Insufficient margin. Required: ₹${mInr.toFixed(2)}, Available: ₹${availInr.toFixed(2)}`
          );
        }
        throw new Error(
          openCommission > 0
            ? `Insufficient margin. Required: $${totalRequired.toFixed(2)} (Margin $${marginRequired.toFixed(2)} + Commission $${openCommission.toFixed(2)}), Available: $${user.wallet.freeMargin.toFixed(2)}`
            : `Insufficient margin. Required: $${marginRequired.toFixed(2)}, Available: $${user.wallet.freeMargin.toFixed(2)}`
        );
      }

      // Affordability verified — now charge commission.
      if (openCommissionChargedOnOpen && openCommission > 0) {
        console.log(`[NettingEngine] Commission: ₹${openCommissionInr.toFixed(2)} → $${openCommission.toFixed(4)} (live rate: ${getCachedUsdInrRate()}, side=${side}, isOpt=${this._isOptionsSegmentSettings(segmentSettings)})`);
        user.wallet.balance -= openCommission;
        user.wallet.equity -= openCommission;
        user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
        console.log(`[NettingEngine] Open commission charged: $${openCommission.toFixed(4)} (${segmentSettings.commissionType}, chargeOn: ${segmentSettings.chargeOn || 'open'})`);
      }

      // Create new position
      const orderId = this.generatePositionId();
      existingPosition = new NettingPosition({
        oderId: orderId,
        userId,
        symbol: nettingSymbol,
        side,
        volume: lots, // Store lots (for F&O) or quantity (for EQ)
        quantity, // Actual quantity (lots × lotSize)
        lotSize: exchangeLotSize, // Exchange lot size
        avgPrice: executionPrice,
        currentPrice: executionPrice,
        stopLoss: stopLoss || null,
        takeProfit: takeProfit || null,
        leverage, // Store leverage for margin recalculation
        session,
        exchange,
        segment,
        marginUsed: marginRequired,
        openCommission: openCommission, // Store open commission (USD)
        openCommissionInr: openCommissionInr, // Store original INR amount
        profit: 0,
        status: 'open',
        orderType: 'market',
        ...positionInstrumentMeta
      });
      // Save position and update wallet in parallel for speed
      user.useMargin(marginRequired);
      await Promise.all([
        existingPosition.save(),
        user.save()
      ]);

      // Fire-and-forget: Trade history (non-critical, don't wait)
      // Per-fill SL/TP (Phase 2): copy SL/TP from the order onto the open Trade
      // leg so the price-tick monitor and per-fill close path can use them.
      const trade = new Trade({
        tradeId: `TRD-${Date.now()}`,
        oderId: orderId,
        userId,
        mode: 'netting',
        symbol: nettingSymbol,
        side,
        volume: lots,
        quantity,
        lotSize: exchangeLotSize,
        entryPrice: executionPrice,
        originalPrice: reorderInfo?.delayed ? price : undefined,
        reorderDelay: reorderInfo?.delaySeconds || 0,
        stopLoss: stopLoss || null,
        takeProfit: takeProfit || null,
        session,
        exchange,
        segment,
        type: 'open',
        executedAt: new Date()
      });
      trade.save().catch(err => console.error('Trade history save error:', err));

    } else {
      // Modify existing position
      if (side === existingPosition.side) {
        // Same-side add (pyramiding): compute commission FIRST so the pre-check
        // can validate `margin + commission` together (prevents sub-zero free
        // margin after commission deduction → instant stop-out).
        let addOpenCommission = 0;
        let addOpenCommissionInr = 0;
        let shouldChargeAddOnOpen = false;
        const addOpenCommissionRate = this._pickCommissionRate(segmentSettings, side);
        if (segmentSettings && addOpenCommissionRate > 0) {
          const chargeOn = segmentSettings.chargeOn || 'open';
          const chargeOpen = chargeOn === 'open' || chargeOn === 'both';
          if (chargeOpen && volume > 0) {
            addOpenCommissionInr = this.calculateCommission(
              segmentSettings.commissionType,
              addOpenCommissionRate,
              volume,
              quantity,
              executionPrice
            );
            if (addOpenCommissionInr > 0) {
              const usdInrRate = getCachedUsdInrRate();
              addOpenCommission = addOpenCommissionInr / usdInrRate;
              shouldChargeAddOnOpen = true;
            }
          }
        }

        const totalRequired = marginRequired + addOpenCommission;
        if (user.wallet.freeMargin < totalRequired) {
          if (this.isIndianInstrument(exchange, segment)) {
            const usdInrRate = getCachedUsdInrRate();
            const mInr = marginRequired * usdInrRate;
            const cInr = addOpenCommissionInr || (addOpenCommission * usdInrRate);
            const availInr = user.wallet.freeMargin * usdInrRate;
            throw new Error(
              cInr > 0
                ? `Insufficient margin. Required: ₹${(mInr + cInr).toFixed(2)} (Margin ₹${mInr.toFixed(2)} + Commission ₹${cInr.toFixed(2)}), Available: ₹${availInr.toFixed(2)}`
                : `Insufficient margin. Required: ₹${mInr.toFixed(2)}, Available: ₹${availInr.toFixed(2)}`
            );
          }
          throw new Error(
            addOpenCommission > 0
              ? `Insufficient margin. Required: $${totalRequired.toFixed(2)} (Margin $${marginRequired.toFixed(2)} + Commission $${addOpenCommission.toFixed(2)}), Available: $${user.wallet.freeMargin.toFixed(2)}`
              : `Insufficient margin. Required: $${marginRequired.toFixed(2)}, Available: $${user.wallet.freeMargin.toFixed(2)}`
          );
        }

        // Affordability verified — charge commission.
        if (shouldChargeAddOnOpen) {
          user.wallet.balance -= addOpenCommission;
          user.wallet.equity -= addOpenCommission;
          user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
          existingPosition.openCommission = (existingPosition.openCommission || 0) + addOpenCommission;
          existingPosition.openCommissionInr = (existingPosition.openCommissionInr || 0) + addOpenCommissionInr;
          console.log(
            `[NettingEngine] Add-to-position open commission: ₹${addOpenCommissionInr.toFixed(2)} → $${addOpenCommission.toFixed(4)} (+${volume} lot(s), type=${segmentSettings.commissionType}, chargeOn=${segmentSettings.chargeOn || 'open'}, side=${side})`
          );
        }

        const totalValue = (existingPosition.volume * existingPosition.avgPrice) + (volume * executionPrice);
        const newVolume = existingPosition.volume + volume;
        const oldQuantity = existingPosition.quantity || (existingPosition.volume * (existingPosition.lotSize || 1));
        existingPosition.avgPrice = totalValue / newVolume;
        existingPosition.volume = newVolume;
        existingPosition.quantity = oldQuantity + quantity;
        existingPosition.lotSize = existingPosition.lotSize || exchangeLotSize;
        existingPosition.marginUsed += marginRequired;
        if (existingPosition.symbol !== nettingSymbol) existingPosition.symbol = nettingSymbol;
        
        // Save position and update wallet in parallel for speed
        user.useMargin(marginRequired);
        await Promise.all([
          existingPosition.save(),
          user.save()
        ]);

        // Fire-and-forget: Trade history (non-critical, don't wait)
        // Per-fill SL/TP (Phase 2): each same-side add can carry its own SL/TP
        // independent of the parent position's SL/TP and the previous fills.
        const trade = new Trade({
          tradeId: `TRD-${Date.now()}`,
          oderId: existingPosition.oderId,
          userId,
          mode: 'netting',
          symbol: nettingSymbol,
          side,
          volume,
          entryPrice: executionPrice,
          originalPrice: reorderInfo?.delayed ? price : undefined,
          reorderDelay: reorderInfo?.delaySeconds || 0,
          stopLoss: stopLoss || null,
          takeProfit: takeProfit || null,
          session,
          type: 'open',
          executedAt: new Date()
        });
        trade.save().catch(err => console.error('Trade history save error:', err));

      } else {
        // Opposite side - reduce or reverse position
        if (volume >= existingPosition.volume) {
          // Close and possibly reverse
          const closedVolume = existingPosition.volume;
          const remainingVolume = volume - closedVolume;
          
          // Calculate P/L for closed portion (Indian → INR, international → USD)
          // Use executionPrice (spread/reorder-adjusted) not raw price for accurate PnL
          let profit = this.calculatePnL(existingPosition, executionPrice);
          const usdInrRateClose = getCachedUsdInrRate() || 1;
          const indianClose = this.isIndianInstrument(existingPosition.exchange, existingPosition.segment);

          // ============== CLOSE COMMISSION CALCULATION ==============
          let closeCommission = 0;
          let closeCommissionInr = 0;
          const closeLotSize = existingPosition.lotSize || exchangeLotSize || 1;
          const closedQty =
            Number(existingPosition.quantity) > 0
              ? (closedVolume / existingPosition.volume) * existingPosition.quantity
              : closedVolume * closeLotSize;

          // Fix 22: `side` here is the close-order's side (opposite of position.side),
          // so passing it directly picks the correct per-side rate on OPT segments.
          const closeCommissionRate = this._pickCommissionRate(segmentSettings, side);
          if (segmentSettings && closeCommissionRate > 0) {
            const chargeOn = segmentSettings.chargeOn || 'open';
            const shouldChargeOnClose = chargeOn === 'close' || chargeOn === 'both';

            if (shouldChargeOnClose) {
              closeCommissionInr = this.calculateCommission(
                segmentSettings.commissionType,
                closeCommissionRate,
                closedVolume,
                closedQty,
                executionPrice
              );
              closeCommission = closeCommissionInr / usdInrRateClose;
              if (indianClose) {
                profit -= closeCommissionInr;
              } else {
                profit -= closeCommission;
              }
              console.log(
                `[NettingEngine] Close commission: ₹${closeCommissionInr.toFixed(2)} → $${closeCommission.toFixed(4)} (chargeOn: ${chargeOn}, side=${side})`
              );
            }
          }

          const openComm = existingPosition.openCommission || 0;
          const openCommInrRaw = Number(existingPosition.openCommissionInr);
          const openCommInr =
            Number.isFinite(openCommInrRaw) && openCommInrRaw > 0
              ? openCommInrRaw
              : indianClose && openComm > 0
                ? openComm * usdInrRateClose
                : 0;

          const totalCommission = openComm + closeCommission;
          const totalCommissionInr = openCommInr + closeCommissionInr;

          // ============== NET P&L SETTLEMENT ==============
          // Settlement approach:
          //   - Open commission: already deducted from balance at open time ✓
          //   - Swap charges: already deducted from balance each night ✓  
          //   - Close commission: deduct from balance NOW
          //   - Raw PnL (price diff × qty): settle to balance NOW
          // We do NOT undo previous charges. We only settle what's new.
          
          const accumulatedSwap = existingPosition.swap || 0;
          
          // Deduct close commission from balance directly (in USD)
          if (closeCommission > 0) {
            user.wallet.balance -= closeCommission;
            // Negative balance protection: don't let commission alone push below 0
            if (user.wallet.balance < 0) {
              console.log(`[NettingEngine][NB-PROTECTION] Close commission pushed balance to ${user.wallet.balance.toFixed(4)}, capping to 0`);
              user.wallet.balance = 0;
            }
          }
          
          // Calculate raw PnL (price movement only, no commissions)
          const rawProfit = this.calculatePnL(existingPosition, executionPrice);
          
          // Store the full display P/L on the position (includes all charges for History tab)
          // position.swap is stored in the instrument's native currency:
          //   Indian (NSE/BSE/MCX) → ₹ INR (Fix 24)
          //   International (Forex/Crypto) → $ USD
          let displayProfit = rawProfit;
          if (indianClose) {
            displayProfit -= (openCommInr + closeCommissionInr); // INR charges
            displayProfit += accumulatedSwap;                     // Swap already in ₹ for Indian instruments (Fix 24)
          } else {
            displayProfit -= (openComm + closeCommission);       // USD charges
            displayProfit += accumulatedSwap;                     // Swap already in USD
          }

          // Close existing position
          existingPosition.status = 'closed';
          existingPosition.closeTime = new Date();
          existingPosition.closePrice = executionPrice;
          existingPosition.profit = displayProfit; // Full P/L for display (includes comm + swap)
          existingPosition.closeCommission = closeCommission;
          existingPosition.closeCommissionInr = closeCommissionInr;
          existingPosition.commission = totalCommission; // Total for the round trip
          existingPosition.commissionInr = totalCommissionInr; // Total INR for display
          await existingPosition.save();

          // Release margin and settle ONLY the raw price PnL to balance
          // (commissions were already handled: open at open-time, close just above, swap nightly)
          const balanceBefore = user.wallet.balance;
          user.releaseMargin(existingPosition.marginUsed);
          const rawProfitInUSD = this.convertPnLToUSD(rawProfit, existingPosition.exchange, existingPosition.segment);
          console.log(`[NettingEngine][SETTLE-DEBUG] rawProfit=${rawProfit}, rawProfitInUSD=${rawProfitInUSD}, balanceBefore=${balanceBefore}, indianClose=${indianClose}`);
          user.settlePnL(rawProfitInUSD);
          console.log(`[NettingEngine][SETTLE-DEBUG] balanceAfter=${user.wallet.balance}, equityAfter=${user.wallet.equity}, diff=${user.wallet.balance - balanceBefore}`);
          await user.save();
          console.log(`[NettingEngine][SETTLE-DEBUG] user.save() completed successfully`);

          // Fix 18: every close action gets a unique groupId so the History
          // tab can render the audit row as a parent and the FIFO-consumed
          // legs as children when the user expands.
          const fullCloseGroupId = `GRP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          // Add close trade to history (parent row of the group)
          const closeTrade = new Trade({
            tradeId: `TRD-${Date.now()}`,
            oderId: existingPosition.oderId,
            userId,
            mode: 'netting',
            symbol: nettingSymbol,
            side: existingPosition.side, // Original position side (BUY/SELL) — not the closing action
            volume: closedVolume,
            quantity: closedQty,
            lotSize: closeLotSize,
            entryPrice: existingPosition.avgPrice,
            closePrice: executionPrice,
            profit: displayProfit,
            commission: totalCommission,
            commissionInr: totalCommissionInr,
            swap: existingPosition.swap || 0,
            session,
            exchange: existingPosition.exchange || exchange,
            segment: existingPosition.segment || segment,
            type: 'close',
            closedBy: orderData.closeReason === 'stop_out' ? 'stop_out' : orderData.closeReason || 'user',
            remark: orderData.closeReason === 'stop_out' ? 'Stop Out' : orderData.closeReason === 'sl' ? 'SL' : orderData.closeReason === 'tp' ? 'TP' : orderData.closeReason === 'auto_square_off' ? 'Auto Square-Off' : 'User',
            closedAt: new Date(),
            groupId: fullCloseGroupId,
            isHistoryParent: true
          });
          await closeTrade.save();

          // FIFO leg consumption (Phase 1.5): the parent position is fully
          // closed (status === 'closed' above), so consume ALL its remaining
          // open Trade legs. closedVolume === existingPosition.volume here, so
          // every leg drains to 0. Pass the groupId so consumed legs become
          // children of the parent close audit row above.
          await this._consumeOpenLegsFIFO(
            existingPosition.oderId,
            userId,
            closedVolume,
            existingPosition.avgPrice,
            fullCloseGroupId
          );

          // Distribute PnL to admin hierarchy
          try {
            await pnlSharingService.distributePnL({
              tradeId: closeTrade._id,
              tradeOderId: closeTrade.tradeId,
              positionId: existingPosition._id,
              positionOderId: existingPosition.oderId,
              userId: user._id,
              userOderId: userId,
              userName: user.name,
              symbol: nettingSymbol,
              segment: existingPosition.segment || segment,
              exchange: existingPosition.exchange || exchange,
              side: existingPosition.side,
              volume: closedVolume,
              quantity: existingPosition.quantity,
              pnl: profit
            });
          } catch (pnlError) {
            console.error('[PnL Sharing] Distribution error:', pnlError.message);
          }

          if (remainingVolume > 0) {
            // Check margin for reverse position
            const reverseMargin = this.calculateMargin(remainingVolume, price, marginPercent, symbol, leverage);
            if (!user.hasSufficientMargin(reverseMargin)) {
              // For Indian instruments, show margin in INR
              if (this.isIndianInstrument(existingPosition.exchange, existingPosition.segment)) {
                const usdInrRate = getCachedUsdInrRate();
                const marginInINR = reverseMargin * usdInrRate;
                const availableInINR = user.wallet.freeMargin * usdInrRate;
                throw new Error(`Insufficient margin for reverse. Required: ₹${marginInINR.toFixed(2)}, Available: ₹${availableInINR.toFixed(2)}`);
              }
              throw new Error(`Insufficient margin for reverse. Required: $${reverseMargin.toFixed(2)}, Available: $${user.wallet.freeMargin.toFixed(2)}`);
            }

            const carryExchange = existingPosition.exchange || exchange;
            const carrySegment = existingPosition.segment || segment;

            // Create reverse position (must carry exchange/segment so segment-wide lot caps count correctly)
            const newOrderId = this.generatePositionId();
            const reverseQty = isLotBased ? remainingVolume * exchangeLotSize : remainingVolume;
            existingPosition = new NettingPosition({
              oderId: newOrderId,
              userId,
              symbol: nettingSymbol,
              side,
              volume: remainingVolume,
              quantity: reverseQty,
              lotSize: exchangeLotSize,
              avgPrice: price,
              currentPrice: price,
              stopLoss: null,
              takeProfit: null,
              leverage,
              session,
              exchange: carryExchange,
              segment: carrySegment,
              marginUsed: reverseMargin,
              profit: 0,
              status: 'open',
              orderType: 'market',
              ...positionInstrumentMeta
            });
            await existingPosition.save();

            // Deduct margin for reverse
            user.useMargin(reverseMargin);
            await user.save();

            // Add open trade for new position
            const openTrade = new Trade({
              tradeId: `TRD-${Date.now() + 1}`,
              oderId: newOrderId,
              userId,
              mode: 'netting',
              symbol: nettingSymbol,
              side,
              volume: remainingVolume,
              entryPrice: price,
              session,
              exchange: carryExchange,
              segment: carrySegment,
              type: 'open',
              executedAt: new Date()
            });
            await openTrade.save();
          }

          // Get updated positions
          const updatedPositions = await NettingPosition.find({ userId, status: 'open' });
          return {
            success: true,
            profit,
            positions: updatedPositions.map(p => ({ ...p.toObject(), mode: 'netting' })),
            wallet: user.wallet,
            message: `Position closed with P/L: ${indianClose ? '₹' : '$'}${profit.toFixed(2)}`,
            expiryWarning
          };

        } else {
          // Partial reduction
          const partialLotSize = existingPosition.lotSize || 1;
          const partialQuantity = this.isLotBasedSegment(existingPosition.exchange, existingPosition.segment)
            ? volume * partialLotSize
            : volume;
          const profit = this.calculatePnL({ ...existingPosition.toObject(), quantity: partialQuantity, volume }, executionPrice);
          const marginToRelease = (volume / existingPosition.volume) * existingPosition.marginUsed;

          existingPosition.volume -= volume;
          existingPosition.quantity = (existingPosition.quantity || 0) - partialQuantity;
          if (existingPosition.quantity < 0) existingPosition.quantity = 0;
          existingPosition.marginUsed -= marginToRelease;
          await existingPosition.save();

          // Release partial margin and settle P/L
          user.releaseMargin(marginToRelease);
          // Convert Indian P&L from INR to USD before settling to wallet
          const profitInUSD = this.convertPnLToUSD(profit, existingPosition.exchange, existingPosition.segment);
          user.settlePnL(profitInUSD);
          await user.save();

          // Fix 18: groupId for the partial close action — same pattern as
          // the full-close branch above.
          const partialGroupId = `GRP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          // Add partial close to history (parent row of the group)
          const trade = new Trade({
            tradeId: `TRD-${Date.now()}`,
            oderId: existingPosition.oderId,
            userId,
            mode: 'netting',
            symbol: nettingSymbol,
            side: existingPosition.side, // Original position side (BUY/SELL) — not the closing action
            volume,
            quantity: partialQuantity,
            lotSize: partialLotSize,
            entryPrice: existingPosition.avgPrice,
            closePrice: executionPrice,
            profit,
            commission: 0,
            swap: 0,
            session,
            exchange: existingPosition.exchange,
            segment: existingPosition.segment,
            type: 'partial_close',
            closedBy: orderData.closeReason === 'stop_out' ? 'stop_out' : orderData.closeReason || 'user',
            remark: orderData.closeReason === 'stop_out' ? 'Stop Out' : orderData.closeReason === 'sl' ? 'SL' : orderData.closeReason === 'tp' ? 'TP' : 'User',
            closedAt: new Date(),
            groupId: partialGroupId,
            isHistoryParent: true
          });
          await trade.save();

          // ============== FIFO LEG CONSUMPTION (Phase 1.5 + Fix 18) ============
          // Keep the Active Trades view consistent: when an opposite-side
          // order reduces the parent's aggregate volume, walk the open Trade
          // legs FIFO (oldest first) and consume `volume` units from them.
          // Realized PnL was already settled above against the parent's
          // avgPrice — leg-level `profit` stays 0 to avoid double-counting.
          // Pass the partialGroupId so consumed legs become children of the
          // parent partial_close row above (Fix 18).
          await this._consumeOpenLegsFIFO(
            existingPosition.oderId,
            userId,
            volume,
            existingPosition.avgPrice,
            partialGroupId
          );
        }
      }
    }

    // Update SL/TP if provided
    if (stopLoss) existingPosition.stopLoss = stopLoss;
    if (takeProfit) existingPosition.takeProfit = takeProfit;
    await existingPosition.save();

    // Get updated positions
    const updatedPositions = await NettingPosition.find({ userId, status: 'open' });

    return {
      success: true,
      position: existingPosition.toObject(),
      positions: updatedPositions.map(p => ({ ...p.toObject(), mode: 'netting' })),
      wallet: user.wallet,
      message: `${side.toUpperCase()} ${volume} lots of ${symbol} at ${price} (${session})`,
      expiryWarning
    };
  }

  async closePosition(userId, symbol, volume, currentPrice = null, options = {}) {
    if (!currentPrice) {
      throw new Error('Market is closed. Cannot close position without live price.');
    }

    const closeAliases = this.cryptoPerpetualSymbolAliases(symbol);
    const position = await NettingPosition.findOne({
      userId,
      status: 'open',
      ...(closeAliases.length === 1 ? { symbol: closeAliases[0] } : { symbol: { $in: closeAliases } })
    });

    if (!position) {
      throw new Error('Position not found');
    }

    if (!options.skipTradeHold) {
      const floatPnL = this.calculatePnL(position, currentPrice);
      const riskManagement = require('../services/riskManagement.service');
      const inst = await this.getInstrumentDetails(position.symbol);
      let instExpiry = position.instrumentExpiry || null;
      if (!instExpiry && inst?.expiry) instExpiry = new Date(inst.expiry);
      const instType = inst?.instrumentType || '';
      const segmentSettings = await this.getSegmentSettingsForTrade(
        userId,
        position.symbol,
        position.exchange,
        position.segment,
        instType
      );
      await riskManagement.assertTradeHoldAllowed(userId, position.openTime, floatPnL, {
        instrumentExpiry: instExpiry,
        segmentSettingsSnapshot: segmentSettings
      });
    }

    const closeVolume = volume || position.volume;
    const oppositeSide = position.side === 'buy' ? 'sell' : 'buy';

    // Execute opposite order to close (skip minLot validation for close operations)
    return this.executeOrder(userId, {
      symbol: position.symbol,
      orderType: 'market',
      side: oppositeSide,
      volume: closeVolume,
      price: currentPrice,
      session: position.session,
      exchange: position.exchange, // Pass so close commission can find segment settings
      segment: position.segment,  // Pass so close commission can find segment settings
      isMarketOpen: true,
      isCloseOperation: true, // Skip minLot validation for closing
      closeReason: options.closeReason || null // Pass close reason for remark tracking
    });
  }

  /**
   * Per-fill close — Phase 3.
   *
   * Closes a single open Trade leg of a netting position. This is the path
   * used by the SL/TP price-tick monitor and the user-clicked ✕ button on
   * each Active Trade row. Distinct from `closePosition` which closes
   * arbitrary volume against the parent's avg.
   *
   * Math (decision D in plans/harmonic-stirring-turtle.md):
   *   - Realized PnL uses **the leg's own entryPrice**, NOT the parent avg.
   *   - The parent's `avgPrice` field is recomputed from the remaining legs:
   *       newAvg = (oldVol * oldAvg − legVol * legEntry) / (oldVol − legVol)
   *   - Margin released proportionally to the leg's share of parent.volume.
   *   - Quantity decremented proportionally.
   *   - If the closed leg was the last open volume → parent becomes status='closed'.
   *
   * Lock: a per-tradeId in-memory set prevents the SL/TP monitor and a user
   * close from running on the same leg concurrently.
   *
   * @param {string} userId       6-digit oderId of the user
   * @param {string} tradeId      Trade.tradeId of the open leg to close
   * @param {number} closePrice   price to close at (passed by monitor as the
   *                              SL/TP level itself, by the manual close as
   *                              the current bid/ask)
   * @param {object} [options]
   * @param {string} [options.closeReason] 'sl' | 'tp' | 'user' | 'system'
   * @returns {Promise<{success: true, profit: number, position: object|null, leg: object, wallet: object}>}
   */
  async closePositionLeg(userId, tradeId, closePrice, options = {}) {
    if (!tradeId) throw new Error('tradeId is required');
    if (!(closePrice > 0)) throw new Error('closePrice must be > 0');

    if (this._legCloseLocks.has(tradeId)) {
      // Another close path (monitor or user) is already handling this leg.
      // Return a noop result rather than racing.
      return { success: false, skipped: 'locked', tradeId };
    }
    this._legCloseLocks.add(tradeId);

    try {
      const leg = await Trade.findOne({ tradeId });
      if (!leg) throw new Error(`Trade leg not found: ${tradeId}`);
      if (leg.userId !== userId) throw new Error('Not your leg');
      if (leg.mode !== 'netting') throw new Error('Per-leg close only supported for netting');
      if (leg.type !== 'open' || leg.closedAt) {
        // Already closed/consumed/etc — idempotent noop.
        return { success: false, skipped: `leg-not-open(${leg.type})`, tradeId };
      }

      const parent = await NettingPosition.findOne({
        oderId: leg.oderId,
        userId,
        status: 'open'
      });
      if (!parent) throw new Error(`Parent netting position not found for oderId=${leg.oderId}`);

      // Fix 24: enforce trade hold on per-leg close (was missing — users could
      // bypass expiry/regular hold by closing individual legs). Skip when the
      // caller is the SL/TP monitor or system (closeReason !== 'user').
      if (!options.skipTradeHold && (!options.closeReason || options.closeReason === 'user')) {
        const riskManagement = require('../services/riskManagement.service');
        const legPnL = this.calculatePnL({
          ...parent.toObject(),
          avgPrice: leg.entryPrice,
          quantity: (leg.volume / (parent.volume || 1)) * (parent.quantity || leg.volume * (parent.lotSize || 1)),
          volume: leg.volume
        }, closePrice);
        let instExpiry = parent.instrumentExpiry || null;
        if (!instExpiry) {
          const inst = await this.getInstrumentDetails(parent.symbol);
          if (inst?.expiry) instExpiry = new Date(inst.expiry);
        }
        const instType = (await this.getInstrumentDetails(parent.symbol))?.instrumentType || '';
        const segSettings = await this.getSegmentSettingsForTrade(
          userId, parent.symbol, parent.exchange, parent.segment, instType
        );
        await riskManagement.assertTradeHoldAllowed(userId, leg.executedAt || parent.openTime, legPnL, {
          instrumentExpiry: instExpiry,
          segmentSettingsSnapshot: segSettings
        });
      }

      const oldVol = Number(parent.volume) || 0;
      const oldQty = Number(parent.quantity) || 0;
      const oldAvg = Number(parent.avgPrice) || 0;
      const oldMargin = Number(parent.marginUsed) || 0;
      const legVol = Number(leg.volume) || 0;
      const legEntry = Number(leg.entryPrice) || 0;

      if (legVol <= 0) throw new Error('Leg has zero volume');
      if (legVol > oldVol + 1e-9) {
        throw new Error(`Leg volume ${legVol} exceeds parent volume ${oldVol}`);
      }

      // Compute realized PnL using the LEG's own entry (not parent.avgPrice)
      // by spoofing a position-shape object into calculatePnL.
      const legPositionShape = {
        symbol: parent.symbol,
        side: parent.side,
        avgPrice: legEntry,
        quantity: oldQty > 0 ? (legVol / oldVol) * oldQty : legVol * (parent.lotSize || 1),
        volume: legVol,
        lotSize: parent.lotSize,
        exchange: parent.exchange,
        segment: parent.segment
      };
      const rawProfit = this.calculatePnL(legPositionShape, closePrice);
      const profitInUSD = this.convertPnLToUSD(rawProfit, parent.exchange, parent.segment);

      // Release the leg's proportional share of margin from the parent.
      const marginToRelease = oldVol > 0 ? (legVol / oldVol) * oldMargin : oldMargin;

      // Recompute the parent's aggregate state.
      const newVol = oldVol - legVol;
      const isLastLeg = newVol <= 1e-9;
      let newAvg = oldAvg;
      let newQty = oldQty;
      let newMargin = oldMargin - marginToRelease;
      if (newMargin < 0) newMargin = 0;
      if (!isLastLeg) {
        // Weighted-mean removal — see header comment for the formula.
        // This may drift from the time-weighted mean of the remaining open
        // legs (because per-fill closes use leg.entry, not parent.avg). That
        // drift is accepted by design — see decision D in the plan.
        const denom = newVol;
        if (denom > 1e-9) {
          newAvg = (oldVol * oldAvg - legVol * legEntry) / denom;
        }
        if (oldQty > 0) {
          newQty = oldQty * (newVol / oldVol);
        }
      }

      // Apply parent state.
      if (isLastLeg) {
        parent.status = 'closed';
        parent.closeTime = new Date();
        parent.closePrice = closePrice;
        parent.profit = (Number(parent.profit) || 0) + rawProfit;
        parent.volume = 0;
        parent.quantity = 0;
        parent.marginUsed = 0;
      } else {
        parent.volume = newVol;
        parent.quantity = newQty;
        parent.avgPrice = newAvg;
        parent.marginUsed = newMargin;
      }
      await parent.save();

      // Apply leg state — this leg becomes a regular `'close'` Trade row.
      // The leg-level `profit` field IS populated here (unlike consumed legs)
      // because per-fill close PnL is meaningful per-leg.
      //
      // Fix 18: when called as part of a parent close action (e.g., the
      // position-level SL monitor closing every remaining leg), the caller
      // passes options.groupId. The leg becomes a CHILD of that group
      // (isHistoryParent=false). When called atomically (user clicks ✕ on
      // one leg, OR the per-fill SL/TP monitor fires on a single leg),
      // groupId is null and the leg appears as a standalone history row.
      leg.type = 'close';
      leg.closePrice = closePrice;
      leg.closedAt = new Date();
      leg.closedBy =
        options.closeReason === 'sl' ? 'sl' :
        options.closeReason === 'tp' ? 'tp' :
        options.closeReason === 'stop_out' ? 'stop_out' :
        options.closeReason === 'system' ? 'system' :
        'user';
      leg.profit = rawProfit;
      leg.remark =
        options.closeReason === 'sl' ? 'SL (per-fill)' :
        options.closeReason === 'tp' ? 'TP (per-fill)' :
        options.closeReason === 'stop_out' ? 'Stop Out' :
        'User (per-fill)';
      if (options.groupId) {
        leg.groupId = options.groupId;
        leg.isHistoryParent = false;
      }
      await leg.save();

      // Settle wallet — release margin and credit realized PnL.
      const user = await User.findOne({ oderId: userId });
      if (user && user.wallet) {
        try {
          user.releaseMargin(marginToRelease);
          user.settlePnL(profitInUSD);
          await user.save();
        } catch (err) {
          console.error('[NettingEngine] closePositionLeg wallet settle error:', err.message);
        }
      }

      return {
        success: true,
        profit: rawProfit,
        profitInUSD,
        position: parent.toObject(),
        leg: leg.toObject(),
        wallet: user?.wallet || null,
        closedParent: isLastLeg
      };
    } finally {
      this._legCloseLocks.delete(tradeId);
    }
  }

  async modifyPosition(userId, positionId, modifications) {
    const position = await NettingPosition.findOne({ oderId: positionId, userId, status: 'open' });
    if (!position) {
      throw new Error('Position not found');
    }

    // SL/TP placement validation (Fix 12) — direction + limit-away gap.
    // Use the live current price as the reference (falls back to avgPrice if
    // the streaming service hasn't ticked yet). Pull segment settings so the
    // limit-away band carries through.
    if (modifications.stopLoss !== undefined || modifications.takeProfit !== undefined) {
      const newSL = modifications.stopLoss !== undefined ? modifications.stopLoss : position.stopLoss;
      const newTP = modifications.takeProfit !== undefined ? modifications.takeProfit : position.takeProfit;
      const refPrice = Number(position.currentPrice) > 0
        ? Number(position.currentPrice)
        : Number(position.avgPrice) || 0;
      let segSettings = null;
      try {
        segSettings = await this.getSegmentSettingsForTrade(
          userId,
          position.symbol,
          position.exchange,
          position.segment,
          position.instrumentType
        );
      } catch (_) {
        // segmentSettings is optional — direction check still runs without it
      }
      const sltpErr = this.validateSLTPPlacement(position.side, refPrice, newSL, newTP, segSettings);
      if (sltpErr) throw new Error(sltpErr);
    }

    if (modifications.stopLoss !== undefined) {
      position.stopLoss = modifications.stopLoss;
    }
    if (modifications.takeProfit !== undefined) {
      position.takeProfit = modifications.takeProfit;
    }

    await position.save();

    // Add modify to trade history
    const trade = new Trade({
      tradeId: `TRD-${Date.now()}`,
      oderId: position.oderId,
      userId,
      mode: 'netting',
      symbol: position.symbol,
      side: position.side,
      quantity: position.quantity,
      entryPrice: position.avgPrice,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      type: 'modify',
      executedAt: new Date()
    });
    await trade.save();

    const updatedPositions = await NettingPosition.find({ userId, status: 'open' });

    return {
      success: true,
      position: position.toObject(),
      positions: updatedPositions.map(p => ({ ...p.toObject(), mode: 'netting' })),
      message: 'Position modified successfully'
    };
  }

  async getPositions(userId) {
    const positions = await NettingPosition.find({ userId, status: 'open' }).lean();
    return positions.map(p => ({ ...p, mode: 'netting' }));
  }

  async updatePositionPrices(userId, priceUpdates) {
    const positions = await NettingPosition.find({ userId, status: 'open' });
    let totalUnrealizedPnL = 0;
    let totalMargin = 0;
    
    for (const position of positions) {
      const priceData = priceUpdates[position.symbol];
      if (priceData) {
        position.currentPrice = position.side === 'buy' ? priceData.bid : priceData.ask;
        position.profit = this.calculatePnL(position, position.currentPrice);
        await position.save();
      }
      totalUnrealizedPnL += position.profit || 0;
      totalMargin += position.marginUsed || 0;
    }

    // Update user equity AND margin (MT5-style: recalculate both from live positions)
    const user = await this.getUser(userId);
    user.wallet.margin = totalMargin;
    user.updateEquity(totalUnrealizedPnL);
    await user.save();

    return {
      positions: positions.map(p => ({ ...p.toObject(), mode: 'netting' })),
      wallet: user.wallet
    };
  }

  // Helper to re-calculate margin for a specific session (used for Intraday -> Carryforward conversion)
  async calculateMarginForSession(position, targetSession, currentPrice) {
    const symbol = position.symbol;
    const exchange = position.exchange || 'NSE';
    const volume = position.volume;
    const side = position.type === 'buy' ? 'buy' : 'sell';
    const leverage = position.leverage || 100;
    const price = currentPrice || position.currentPrice || position.openPrice;
    
    let instrumentType = '';
    let instrument = null;
    try {
      instrument = await this.getInstrumentDetails(symbol);
      if (instrument?.instrumentType) instrumentType = instrument.instrumentType;
    } catch (_) {}
    
    const lotSize = instrument?.lotSize || 1;
    const quantity = volume * lotSize;
    
    const segment = position.segment || (instrument ? instrument.segment : '');
    const segmentName = position.segmentName || `${exchange}_${segment}`;

    const segmentSettings = await this.getSegmentSettingsForTrade(position.userId, symbol, exchange, segment, instrumentType);
    const settings = await this.getSettings();

    let marginRequired;
    if (instrument) {
      marginRequired = this.calculateZerodhaMargin(quantity, price, targetSession, exchange, segment, leverage);
    } else {
      // Full contract notional (no leverage in netting mode fallback).
      // Admin fixed/times/percent margin overrides this below.
      const mt5 = require('../utils/mt5Calculations');
      const contractSize = mt5.getContractSize(symbol);
      marginRequired = volume * contractSize * price;
    }

    if (segmentSettings) {
      const { isInstrumentExpiryTodayIST } = require('../services/nettingExpiryDay');
      const isOptionsInstrument = instrumentType === 'OPT' || instrumentType === 'CE' || instrumentType === 'PE' || segment === 'OPT' || segmentName?.includes('_OPT') || segmentName === 'CRYPTO_OPTIONS' || symbol?.startsWith('C-') || symbol?.startsWith('P-');
      const expiryToday = instrument?.expiry != null && isInstrumentExpiryTodayIST(instrument.expiry);
      const fixedMarginSession = expiryToday && targetSession === 'carryforward' ? 'intraday' : targetSession;

      let usedExpiryDayMargin = false;
      if (expiryToday && (targetSession === 'intraday' || targetSession === 'carryforward')) {
        // Per-side option expiry margin (Fix 17) — see resolveExpiryDay-
        // MarginAmount for the precedence chain.
        const em = this.resolveExpiryDayMarginAmount(segmentSettings, {
          volume, quantity, price,
          side,
          isOptionsInstrument
        });
        if (em != null) {
          marginRequired = em;
          usedExpiryDayMargin = true;
        }
      }

      if (!usedExpiryDayMargin) {
        let rawMarginValue = null;
        let usedIsPercentSetting = null;

        if (isOptionsInstrument) {
          if (side === 'buy') {
            rawMarginValue = fixedMarginSession === 'intraday' ? segmentSettings.optionBuyIntraday : segmentSettings.optionBuyOvernight;
            usedIsPercentSetting = fixedMarginSession === 'intraday' ? segmentSettings.fixedMarginOptionBuyIntradayAsPercent : segmentSettings.fixedMarginOptionBuyOvernightAsPercent;
          } else if (side === 'sell') {
            rawMarginValue = fixedMarginSession === 'intraday' ? segmentSettings.optionSellIntraday : segmentSettings.optionSellOvernight;
            usedIsPercentSetting = fixedMarginSession === 'intraday' ? segmentSettings.fixedMarginOptionSellIntradayAsPercent : segmentSettings.fixedMarginOptionSellOvernightAsPercent;
          }
        }
        
        if (!(Number(rawMarginValue) > 0)) {
          if (fixedMarginSession === 'intraday') {
            rawMarginValue = segmentSettings.intradayHolding;
            usedIsPercentSetting = segmentSettings.fixedMarginIntradayAsPercent;
          } else {
            rawMarginValue = segmentSettings.overnightHolding;
            usedIsPercentSetting = segmentSettings.fixedMarginOvernightAsPercent;
          }
        }

        if (Number(rawMarginValue) > 0) {
          const m = this.nettingFixedMarginAmount(rawMarginValue, segmentSettings.marginCalcMode || (usedIsPercentSetting === true), volume, quantity, price, leverage);
          if (m != null) {
            marginRequired = m;
            usedExpiryDayMargin = true; // reuse flag — means admin INR value was applied
          }
        }
      }

      // Fix 24: ONLY convert INR→USD when admin fixed margin was actually applied.
      // MT5 fallback already returns USD — dividing by rate would make it ~93× too small.
      if (usedExpiryDayMargin && !this.isIndianInstrument(exchange, segment)) {
        if ((segmentSettings.marginCalcMode || 'fixed') === 'fixed') {
          const usdInrRate = getCachedUsdInrRate();
          if (usdInrRate > 0) marginRequired = marginRequired / usdInrRate;
        }
      }
    }

    if (this.isIndianInstrument(exchange, segment)) {
      const usdInrRate = getCachedUsdInrRate();
      if (usdInrRate > 0 && marginRequired > 0) {
        marginRequired = marginRequired / usdInrRate;
      }
    }

    return marginRequired;
  }

  // Auto square-off for intraday positions based on exchange timings
  // EXCLUDES: MCX (commodity futures/options) - they have extended hours and different rules
  async autoSquareOff(currentPrices) {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const currentTime = ist.getHours() * 60 + ist.getMinutes();

    // Check if it's a weekday (Indian markets are weekday-only; international
    // markets are handled per-exchange via MarketControl.tradingDays below).
    const day = ist.getDay();

    // Cache MarketControl docs so we don't hit DB per position.
    const marketControlCache = {};
    const getMarketControl = async (market) => {
      if (!marketControlCache[market]) {
        marketControlCache[market] = await MarketControl.findOne({ market }).lean() || null;
      }
      return marketControlCache[market];
    };

    // Get ALL open intraday positions (we'll filter per-exchange below).
    const intradayPositions = await NettingPosition.find({
      session: 'intraday',
      status: 'open'
    });

    for (const position of intradayPositions) {
      const exchange = position.exchange || 'NSE';

      // 1. Read MarketControl config for this exchange (DB overrides hardcoded timings).
      const mc = await getMarketControl(exchange);

      // 2. If autoSquareOff is explicitly disabled for this market, skip entirely.
      if (mc && mc.autoSquareOff && mc.autoSquareOff.enabled === false) {
        continue;
      }

      // 3. Check trading days — skip if today is not a trading day for this market.
      if (mc && mc.tradingDays && Array.isArray(mc.tradingDays) && !mc.tradingDays.includes(day)) {
        continue;
      } else if (!mc && (day === 0 || day === 6)) {
        continue; // No MarketControl entry → default to weekday-only
      }

      // 4. Resolve square-off time: DB config → hardcoded → fallback NSE.
      let squareOffTimeStr = '15:30';
      if (mc && mc.autoSquareOff && mc.autoSquareOff.time) {
        squareOffTimeStr = mc.autoSquareOff.time;
      } else if (this.marketTimings[exchange]) {
        squareOffTimeStr = this.marketTimings[exchange].squareOffTime;
      }
      const [sqHour, sqMin] = squareOffTimeStr.split(':').map(Number);
      const squareOffTime = sqHour * 60 + sqMin;
      
      // Square off or Convert to Carryforward if current time >= square-off time for this exchange
      if (currentTime >= squareOffTime) {
        const price = currentPrices[position.symbol]?.bid || currentPrices[position.symbol]?.last_price || position.currentPrice;
        if (price) {
          let convertedToCarryforward = false;
          
          let instrumentType = '';
          try {
            const inst = await this.getInstrumentDetails(position.symbol);
            if (inst?.instrumentType) instrumentType = inst.instrumentType;
          } catch (_) {}

          // 1. Check if overnight is allowed for this segment
          const allowOvernight = await this.getAllowOvernightForPosition(
            position.userId, position.symbol, exchange, position.segment || '', instrumentType
          );

          if (allowOvernight) {
            try {
              // 2. Calculate the required CF margin and find difference needed
              const newMargin = await this.calculateMarginForSession(position, 'carryforward', price);
              const currentMargin = position.marginUsed || 0;
              const marginDiff = newMargin - currentMargin;

              // 3. User available margin = equity - margin (or balance if you consider purely free)
              // Wait, equity = balance + profit. The maximum margin one can lock is their current equity minus what is already locked.
              const user = await User.findOne({ oderId: position.userId });
              if (user) {
                const availableFreeMargin = user.wallet.equity - user.wallet.margin;

                if (marginDiff <= 0 || availableFreeMargin >= marginDiff) {
                  // Atomic safe check and increment
                  const updatedUser = await User.findOneAndUpdate(
                    { 
                      oderId: position.userId, 
                      $expr: { 
                        $gte: [ { $subtract: ["$wallet.equity", "$wallet.margin"] }, marginDiff ] 
                      }
                    },
                    { $inc: { 'wallet.margin': marginDiff } },
                    { new: true }
                  );

                  if (updatedUser) {
                    position.session = 'carryforward';
                    position.marginUsed = newMargin;
                    await position.save();
                    convertedToCarryforward = true;
                    console.log(`[AUTO SQUARE-OFF] CONVERTED to carryforward: ${position.symbol} for user ${position.userId}. Blocked additional ${marginDiff.toFixed(2)} USD margin.`);
                  } else {
                    console.log(`[AUTO SQUARE-OFF] Failed to convert ${position.symbol} for user ${position.userId}. Concurrency lock failing. Proceeding to square-off.`);
                  }
                } else {
                  console.log(`[AUTO SQUARE-OFF] Insufficient funds to convert ${position.symbol} for user ${position.userId}. Needs extra ${marginDiff.toFixed(2)} USD, but free margin is ${availableFreeMargin.toFixed(2)} USD. Proceeding to square-off.`);
                }
              }
            } catch (err) {
              console.error(`[AUTO SQUARE-OFF ERROR] Carryforward conversion failed for ${position.symbol} user ${position.userId}:`, err.message);
            }
          } else {
             console.log(`[AUTO SQUARE-OFF] Overnight NOT allowed for ${position.symbol} format/segment, cannot convert. Proceeding to square-off.`);
          }

          if (!convertedToCarryforward) {
            try {
              await this.closePosition(position.userId, position.symbol, position.volume, price, { closeReason: 'auto_square_off' });
              console.log(`[AUTO SQUARE-OFF] SQUARE-OFF: ${position.symbol} for user ${position.userId} at ${price} (${exchange} square-off time: ${timing.squareOffTime})`);
            } catch (error) {
              console.error(`[AUTO SQUARE-OFF ERROR] ${position.symbol} for user ${position.userId}:`, error.message);
            }
          }
        }
      }
    }

    // Carry-forward positions on segments where overnight is disabled — close at square-off (same time as intraday MIS)
    const carryPositions = await NettingPosition.find({ session: 'carryforward', status: 'open' });
    for (const position of carryPositions) {
      const exchange = position.exchange || 'NSE';

      // Use MarketControl DB config (same cache from above)
      const mc2 = await getMarketControl(exchange);

      // Skip if autoSquareOff disabled for this market
      if (mc2 && mc2.autoSquareOff && mc2.autoSquareOff.enabled === false) continue;

      // Skip if not a trading day
      if (mc2 && mc2.tradingDays && Array.isArray(mc2.tradingDays) && !mc2.tradingDays.includes(day)) continue;
      else if (!mc2 && (day === 0 || day === 6)) continue;

      let sqTimeStr2 = '15:30';
      if (mc2 && mc2.autoSquareOff && mc2.autoSquareOff.time) {
        sqTimeStr2 = mc2.autoSquareOff.time;
      } else if (this.marketTimings[exchange]) {
        sqTimeStr2 = this.marketTimings[exchange].squareOffTime;
      }
      const [sqHour, sqMin] = sqTimeStr2.split(':').map(Number);
      const squareOffTime = sqHour * 60 + sqMin;
      if (currentTime < squareOffTime) continue;

      let instrumentType = '';
      try {
        const inst = await this.getInstrumentDetails(position.symbol);
        if (inst?.instrumentType) instrumentType = inst.instrumentType;
      } catch (_) {
        /* ignore */
      }

      const allow = await this.getAllowOvernightForPosition(
        position.userId,
        position.symbol,
        exchange,
        position.segment || '',
        instrumentType
      );
      if (allow) continue;

      const price =
        currentPrices[position.symbol]?.bid ||
        currentPrices[position.symbol]?.last_price ||
        position.currentPrice;
      if (price) {
        try {
          await this.closePosition(position.userId, position.symbol, position.volume, price, {
            skipTradeHold: true,
            closeReason: 'auto_square_off'
          });
          console.log(
            `[AUTO SQUARE-OFF CF] ${position.symbol} user ${position.userId} at ${price} — overnight/carry forward not allowed for this segment (${exchange})`
          );
        } catch (error) {
          console.error(`[AUTO SQUARE-OFF CF ERROR] ${position.symbol} for user ${position.userId}:`, error.message);
        }
      }
    }
  }

  // Get user wallet info
  async getWallet(userId) {
    const user = await this.getUser(userId);
    return user.wallet;
  }

  // Get pending orders for a user
  async getPendingOrders(userId) {
    const pendingOrders = await NettingPosition.find({ userId, status: 'pending' });
    return pendingOrders.map(p => ({ ...p.toObject(), mode: 'netting' }));
  }

  // Cancel a pending order
  async cancelPendingOrder(userId, orderId) {
    const mongoose = require('mongoose');
    
    let order;
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await NettingPosition.findOne({ _id: orderId, userId, status: 'pending' });
    }
    if (!order) {
      order = await NettingPosition.findOne({ oderId: orderId, userId, status: 'pending' });
    }
    
    if (!order) {
      throw new Error('Pending order not found');
    }

    // Release the reserved margin
    const user = await this.getUser(userId);
    user.releaseMargin(order.marginUsed);
    
    // Update order status
    order.status = 'cancelled';
    order.closeTime = new Date();
    
    await Promise.all([order.save(), user.save()]);

    // Log the cancellation
    const trade = new Trade({
      tradeId: `TRD-${Date.now()}`,
      oderId: order.oderId,
      userId,
      mode: 'netting',
      symbol: order.symbol,
      side: order.side,
      volume: order.volume,
      entryPrice: order.avgPrice,
      type: 'cancelled',
      executedAt: new Date()
    });
    trade.save().catch(err => console.error('Trade history save error:', err));

    const pendingOrders = await NettingPosition.find({ userId, status: 'pending' });

    return {
      success: true,
      message: `Pending order ${order.oderId} cancelled`,
      pendingOrders: pendingOrders.map(p => ({ ...p.toObject(), mode: 'netting' })),
      wallet: user.wallet
    };
  }
}

module.exports = NettingEngine;
