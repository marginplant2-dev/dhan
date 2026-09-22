const MetaApi = require('metaapi.cloud-sdk').default;

const METAAPI_AUTH_TOKEN = process.env.METAAPI_AUTH_TOKEN;
const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID;

function stripBrokerSuffix(sym) {
  if (!sym) return '';
  return String(sym).replace(/\.[a-zA-Z0-9]+$/, '').toUpperCase();
}

/**
 * Fetch bid/ask via MetaAPI REST when streaming cache is empty or symbol uses a broker suffix (e.g. EURUSD.c).
 * Used by Market Watch and /api/instruments/prices.
 */
async function restPriceForSymbol(requestedSymbol) {
  const baseUrl = process.env.METAAPI_BASE_URL || 'https://mt-client-api-v1.new-york.agiliumtrade.ai';
  const token = process.env.METAAPI_AUTH_TOKEN;
  const accountId = process.env.METAAPI_ACCOUNT_ID;
  if (!token || !accountId || !requestedSymbol) return null;

  const base = stripBrokerSuffix(requestedSymbol);
  const candidates = [
    requestedSymbol,
    base,
    `${base}.c`,
    `${base}.i`,
    `${base}.m`,
    `${base}.raw`,
    `${base}a`
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  const parsePrice = (data) => {
    if (!data || typeof data !== 'object') return null;
    let bid = Number(data.bid);
    let ask = Number(data.ask);
    const last = Number(data.last || data.lastPrice || 0);
    if ((!Number.isFinite(bid) || bid <= 0) && (!Number.isFinite(ask) || ask <= 0) && last > 0) {
      bid = last;
      ask = last;
    }
    if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
    if (bid <= 0 && ask <= 0) return null;
    if (bid <= 0) bid = ask;
    if (ask <= 0) ask = bid;
    const low = data.low != null ? Number(data.low) : undefined;
    const high = data.high != null ? Number(data.high) : undefined;
    const sessionOpen = Number(data.open ?? data.dayOpen ?? data.dailyOpen ?? data.sessionOpen);
    const previousClose = Number(data.close ?? data.previousClose ?? data.prevClose ?? data.lastClose);
    const out = {
      bid,
      ask,
      low: Number.isFinite(low) ? low : undefined,
      high: Number.isFinite(high) ? high : undefined
    };
    if (Number.isFinite(sessionOpen) && sessionOpen > 0) out.sessionOpen = sessionOpen;
    if (Number.isFinite(previousClose) && previousClose > 0) out.previousClose = previousClose;
    return out;
  };

  for (const sym of candidates) {
    try {
      const url = `${baseUrl}/users/current/accounts/${accountId}/symbols/${encodeURIComponent(sym)}/current-price`;
      const response = await fetch(url, {
        headers: { 'auth-token': token, 'Content-Type': 'application/json' }
      });
      if (!response.ok) continue;
      const data = await response.json();
      const p = parsePrice(data);
      if (p) return p;
    } catch (_) {
      /* try next */
    }
  }

  try {
    const listRes = await fetch(
      `${baseUrl}/users/current/accounts/${accountId}/symbols`,
      { headers: { 'auth-token': token, 'Content-Type': 'application/json' } }
    );
    if (!listRes.ok) return null;
    const symbols = await listRes.json();
    if (!Array.isArray(symbols)) return null;
    const match = symbols.find((s) => {
      const name = (s.symbol || s.name || '').toString();
      return stripBrokerSuffix(name) === base;
    });
    if (!match) return null;
    const sym = match.symbol || match.name;
    const url = `${baseUrl}/users/current/accounts/${accountId}/symbols/${encodeURIComponent(sym)}/current-price`;
    const response = await fetch(url, {
      headers: { 'auth-token': token, 'Content-Type': 'application/json' }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return parsePrice(data);
  } catch (_) {
    return null;
  }
}

// Symbols to stream - organized by category (expanded list)
const SYMBOLS = [
  // ========== FOREX - Major Pairs ==========
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
  
  // ========== FOREX - Cross Pairs ==========
  'EURGBP', 'EURJPY', 'GBPJPY', 'EURCHF', 'EURAUD', 'GBPAUD', 'AUDNZD', 'CADJPY',
  'CHFJPY', 'NZDJPY', 'AUDCAD', 'AUDCHF', 'AUDJPY', 'CADCHF', 'EURCAD', 'EURNZD',
  'GBPCAD', 'GBPCHF', 'GBPNZD', 'NZDCAD', 'NZDCHF',
  
  // ========== FOREX - Exotic Pairs ==========
  'USDZAR', 'USDMXN', 'USDTRY', 'USDSEK', 'USDNOK', 'USDDKK', 'USDSGD', 'USDHKD',
  'USDPLN', 'USDHUF', 'USDCZK', 'EURPLN', 'EURTRY', 'EURZAR', 'EURHUF', 'EURCZK',
  'GBPZAR', 'GBPTRY', 'GBPPLN',
  
  // ========== METALS ==========
  'XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDUSD',  // Gold, Silver, Platinum, Palladium
  'XAUEUR', 'XAUGBP', 'XAUAUD', 'XAUCHF',  // Gold in other currencies
  'XAGEUR',  // Silver in EUR
  
  // ========== INDICES - US ==========
  'US100', 'US30', 'US500', 'US2000',  // Nasdaq 100, Dow Jones, S&P 500, Russell 2000
  'NAS100', 'SPX500', 'DJ30',  // Alternative names
  
  // ========== INDICES - Europe ==========
  'DE40', 'DE30', 'GER40', 'DAX',  // Germany DAX
  'UK100', 'FTSE100',  // UK FTSE
  'FRA40', 'CAC40',  // France CAC
  'EU50', 'STOXX50',  // Euro Stoxx 50
  'ESP35',  // Spain IBEX
  'SWI20',  // Switzerland SMI
  'NED25',  // Netherlands AEX
  
  // ========== INDICES - Asia Pacific ==========
  'JP225', 'JPN225', 'NIKKEI',  // Japan Nikkei
  'HK50', 'HSI',  // Hong Kong Hang Seng
  'AUS200', 'ASX200',  // Australia ASX
  'CN50', 'CHINA50',  // China A50
  'SG30',  // Singapore
  
  // ========== COMMODITIES - Energy ==========
  'USOIL', 'UKOIL', 'XTIUSD', 'XBRUSD',  // WTI, Brent Crude
  'WTIUSD', 'BRENTUSD',  // Alternative names
  'NATGAS', 'NGAS',  // Natural Gas
  
  // ========== COMMODITIES - Agricultural ==========
  'COCOA', 'COFFEE', 'COTTON', 'SUGAR', 'WHEAT', 'CORN', 'SOYBEAN',
  
  // ========== CRYPTO - Spot ==========
  'BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD', 'BCHUSD',
  'ADAUSD', 'DOTUSD', 'SOLUSD', 'DOGEUSD', 'AVAXUSD',
  'LINKUSD', 'MATICUSD', 'UNIUSD', 'ATOMUSD', 'XLMUSD',
  'BNBUSD', 'XMRUSD', 'EOSUSD', 'TRXUSD', 'ETCUSD',
  'FILUSD', 'AABORSUSD', 'ALGOUSD', 'VETUSD', 'ICPUSD',
  'SHIBUSD', 'NEARUSD', 'APTUSD', 'ARBUSD', 'OPUSD',
  
  // ========== CRYPTO - Futures (common naming conventions) ==========
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT',
  'ADAUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT', 'LTCUSDT',
  'BTCUSD.f', 'ETHUSD.f', 'LTCUSD.f', 'XRPUSD.f', 'BCHUSD.f',  // Futures suffix .f
  'BTCUSD_PERP', 'ETHUSD_PERP', 'SOLUSD_PERP',  // Perpetual contracts
  'BTC/USD:USD', 'ETH/USD:USD',  // Some broker naming
  
  // ========== CRYPTO - Options (if supported) ==========
  'BTCUSD.o', 'ETHUSD.o',  // Options suffix .o
  
  // ========== BONDS ==========
  'USTBOND', 'EURBOND', 'UKGILT', 'BUND', 'TNOTE'
];

// Cache file for storing last known prices
const fs = require('fs');
const path = require('path');
const PRICE_CACHE_FILE = path.join(__dirname, '../data/metaapi-price-cache.json');

// Load cached prices from file
const loadCachedPrices = () => {
  try {
    if (fs.existsSync(PRICE_CACHE_FILE)) {
      const data = fs.readFileSync(PRICE_CACHE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      // Only use cache if it's less than 24 hours old
      if (parsed.timestamp && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
        console.log(`📦 Loaded ${Object.keys(parsed.prices || {}).length} cached MetaAPI prices`);
        return parsed.prices || {};
      }
    }
  } catch (e) {
    console.warn('Could not load price cache:', e.message);
  }
  return {};
};

// Save prices to cache file
const saveCachedPrices = (prices) => {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(PRICE_CACHE_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(PRICE_CACHE_FILE, JSON.stringify({
      prices,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.warn('Could not save price cache:', e.message);
  }
};

/** Last-known MetaAPI quotes from disk (for API responses when stream/REST are empty). Default max age 7d. */
function loadDiskCacheForFallback(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  try {
    if (fs.existsSync(PRICE_CACHE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(PRICE_CACHE_FILE, 'utf8'));
      const ts = parsed.timestamp || 0;
      if (parsed.prices && Date.now() - ts <= maxAgeMs) {
        return parsed.prices;
      }
    }
  } catch (e) {
    console.warn('Disk price cache (fallback) read failed:', e.message);
  }
  return {};
}

class MetaApiStreamingService {
  constructor(io) {
    this.io = io;
    this.api = null;
    this.account = null;
    this.connection = null;
    this.terminalState = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.prices = loadCachedPrices(); // Load cached prices on startup
    this.lastCacheSave = 0;
    this.hedgingEngine = null;
    this.nettingEngine = null;
    this.deltaExchangeStreaming = null;
    this._priceBroadcastStarted = false;
  }

  setTradeEngines(hedgingEngine, nettingEngine, deltaExchangeStreaming = null) {
    this.hedgingEngine = hedgingEngine;
    this.nettingEngine = nettingEngine;
    this.deltaExchangeStreaming = deltaExchangeStreaming;
  }

  /** Build bid/ask for a symbol from Meta cache, Delta, or Zerodha (Indian). */
  _resolvePriceBundle(symbol) {
    const sym = symbol ? String(symbol).toUpperCase() : '';
    let p = this.prices[sym] || this.prices[symbol];
    if (p && Number(p.bid) > 0 && Number(p.ask) > 0) {
      return { bid: Number(p.bid), ask: Number(p.ask) };
    }
    if (this.deltaExchangeStreaming && typeof this.deltaExchangeStreaming.getPrice === 'function') {
      const d = this.deltaExchangeStreaming.getPrice(sym) || this.deltaExchangeStreaming.getPrice(symbol);
      if (d) {
        let bid = Number(d.bid);
        let ask = Number(d.ask);
        if (!bid || !ask) {
          const m = Number(d.lastPrice || d.mark_price || d.last || 0);
          if (m > 0) {
            bid = m;
            ask = m;
          }
        }
        if (bid > 0 && ask > 0) return { bid, ask };
      }
    }
    try {
      const zerodhaService = require('./zerodha.service');
      const z = zerodhaService.getPrice(sym) || zerodhaService.getPrice(symbol);
      if (z) {
        // Prefer real bid/ask from Zerodha depth (critical for options which
        // have wide spreads). Fall back to synthetic spread only when depth
        // data is unavailable.
        const realBid = Number(z.bid);
        const realAsk = Number(z.ask);
        if (realBid > 0 && realAsk > 0) {
          return { bid: realBid, ask: realAsk };
        }
        const lp = Number(z.lastPrice || z.last_price || 0);
        if (lp > 0) {
          const sp = lp * 0.0001;
          return { bid: lp - sp / 2, ask: lp + sp / 2 };
        }
      }
    } catch (_) {
      /* optional */
    }
    return null;
  }

  async syncOpenPositionsAndLedgerRisk() {
    const priceResolver = (sym) => this._resolvePriceBundle(sym);

    // Netting / Hedging path — only runs if those engines are wired and a
    // user has open positions in either collection. Prop challenge accounts
    // have their own collection (ChallengePosition) and must be refreshed
    // unconditionally below — DON'T early-return on empty userIds list,
    // otherwise SL/TP on prop options never evaluates.
    if (this.hedgingEngine && this.nettingEngine) {
      const riskManagement = require('./riskManagement.service');
      const { HedgingPosition, NettingPosition } = require('../models/Position');

      let userIds = [];
      try {
        const h = await HedgingPosition.distinct('userId', { status: 'open' });
        const n = await NettingPosition.distinct('userId', { status: 'open' });
        userIds = [...new Set([...h, ...n])];
      } catch (e) { /* fall through to prop refresh */ }

      for (const userId of userIds) {
        try {
          const updates = {};
          const hp = await HedgingPosition.find({ userId, status: 'open' });
          const np = await NettingPosition.find({ userId, status: 'open' });
          for (const pos of hp) {
            const b = priceResolver(pos.symbol);
            if (b) updates[pos.symbol] = b;
          }
          for (const pos of np) {
            const b = priceResolver(pos.symbol);
            if (b) updates[pos.symbol] = b;
          }
          if (Object.keys(updates).length > 0) {
            if (hp.length > 0) await this.hedgingEngine.updatePositionPrices(userId, updates);
            if (np.length > 0) await this.nettingEngine.updatePositionPrices(userId, updates);
            await riskManagement.reconcileWalletEquityForUser(userId);
          }
          // Per-fill SL/TP monitor (Phase 3) — close any open netting Trade leg
          // whose stopLoss/takeProfit has been crossed by the current bid/ask.
          // (Fix 11 added it). Position-level SL/TP for the parent NettingPosition
          // is checked here too.
          await this._checkPerFillSLTP(userId, priceResolver);

          // Hedging SL/TP monitor — close hedging positions whose SL/TP is hit.
          await this._checkHedgingSLTP(userId, priceResolver);

          await riskManagement.maybeLiquidateUser(userId, this.io, priceResolver);
          await riskManagement.checkStopOut(userId, this.io, priceResolver);
        } catch (err) {
          if (err.message && !err.message.includes('Cannot find module')) {
            console.error('[Risk] syncOpenPositionsAndLedgerRisk:', userId, err.message);
          }
        }
      }
    }

    // Refresh floating P&L + equity on challenge (prop) accounts. Open prop
    // positions live in ChallengePosition; their floating P&L needs to tick
    // on every price update so Daily-DD and profit-target checks stay live.
    try {
      const ChallengePosition = require('../models/ChallengePosition');
      const challengePropEngine = require('./challengePropEngine.service');
      // Include accounts that have EITHER open positions OR pending (limit/stop)
      // orders — pending orders must tick so their trigger price is checked and
      // they activate when the market reaches it.
      const openChallengeIds = await ChallengePosition.distinct('challengeAccountId', { status: { $in: ['open', 'pending'] } });
      for (const accId of openChallengeIds) {
        try {
          // Build the live-price map from BOTH open and pending symbols so a
          // pending order on a symbol with no open position still gets a quote.
          const activePositions = await ChallengePosition.find({ challengeAccountId: accId, status: { $in: ['open', 'pending'] } });
          const livePrices = {};
          for (const pos of activePositions) {
            if (livePrices[pos.symbol]) continue;
            const b = priceResolver(pos.symbol);
            if (b) livePrices[pos.symbol] = { bid: b.bid, ask: b.ask, last: (b.bid + b.ask) / 2 };
          }
          // NOTE: do NOT skip when livePrices is empty. Each open position
          // already carries the last-tick floating PnL in `pos.profit`, so
          // recomputeWallet() inside refreshEquity will still arrive at a
          // valid equity, and the drawdown-breach check MUST fire every
          // second so a brief feed lag can't mask a live DD violation.
          // (Previously we skipped, which is exactly how breaches were
          // getting missed — floating loss crossed the daily limit for a
          // moment, no tick fired during that window because no symbol
          // had a fresh price, and the breach was never recorded.)
          const refreshed = await challengePropEngine.refreshEquity(accId, livePrices);
          if (this.io && refreshed?.account) {
            this.io.to(String(refreshed.account.userId)).emit('challengeAccountUpdate', {
              challengeAccountId: accId,
              account: refreshed.account,
              breached: refreshed.breached || false,
              reason: refreshed.reason || null
            });
          }
        } catch (err) {
          console.error('[Challenge Tick] refresh error for', accId, err.message);
        }
      }
    } catch (err) {
      console.error('[Challenge Tick] loop error:', err.message);
    }
  }

  /**
   * Per-fill and per-position SL/TP automation pass — Phase 3.
   *
   * Walks all open netting Trade legs for the given user. For each leg with
   * stopLoss/takeProfit set, checks whether the current bid/ask has crossed
   * the level and, if so, calls `nettingEngine.closePositionLeg` with the
   * SL/TP price as the close price. The leg's own entry is used for realized
   * PnL (decision D — see plans/harmonic-stirring-turtle.md).
   *
   * Trigger conventions (matches MT5):
   *   BUY  position → close at bid; SL hit when bid <= sl, TP hit when bid >= tp
   *   SELL position → close at ask; SL hit when ask >= sl, TP hit when ask <= tp
   *
   * Concurrency is handled by the per-tradeId lock inside closePositionLeg —
   * if a manual close races with this monitor, only one of them books PnL.
   *
   * Position-level SL/TP on the parent NettingPosition is also checked: if
   * hit, ALL remaining open legs of that parent are closed via closePositionLeg
   * (each leg's own entry still drives its individual realized PnL — but the
   * cumulative effect is the same as closing the whole aggregated position).
   */
  async _checkPerFillSLTP(userId, priceResolver) {
    if (!this.nettingEngine) return;
    const Trade = require('../models/Trade');
    const { NettingPosition } = require('../models/Position');

    // Pull every open netting leg for this user that has SL or TP set.
    let openLegs;
    try {
      openLegs = await Trade.find({
        userId,
        mode: 'netting',
        type: 'open',
        closedAt: null,
        $or: [
          { stopLoss: { $ne: null, $gt: 0 } },
          { takeProfit: { $ne: null, $gt: 0 } }
        ]
      });
    } catch (e) {
      return;
    }

    // Also check parent positions with SL/TP set — each crossing closes ALL
    // remaining open legs of that parent.
    let parentsWithSLTP;
    try {
      parentsWithSLTP = await NettingPosition.find({
        userId,
        status: 'open',
        $or: [
          { stopLoss: { $ne: null, $gt: 0 } },
          { takeProfit: { $ne: null, $gt: 0 } }
        ]
      });
    } catch (e) {
      parentsWithSLTP = [];
    }

    // ---- 1) Per-fill SL/TP -----------------------------------------------
    for (const leg of openLegs) {
      try {
        const bundle = priceResolver(leg.symbol);
        if (!bundle) continue;
        const bid = Number(bundle.bid);
        const ask = Number(bundle.ask);
        if (!(bid > 0) && !(ask > 0)) continue;

        const sl = leg.stopLoss != null ? Number(leg.stopLoss) : null;
        const tp = leg.takeProfit != null ? Number(leg.takeProfit) : null;
        const side = String(leg.side || '').toLowerCase();

        let triggerPrice = null;
        let reason = null;
        if (side === 'buy') {
          // BUY closes at bid
          if (sl != null && bid > 0 && bid <= sl) {
            triggerPrice = sl;
            reason = 'sl';
          } else if (tp != null && bid > 0 && bid >= tp) {
            triggerPrice = tp;
            reason = 'tp';
          }
        } else if (side === 'sell') {
          // SELL closes at ask
          if (sl != null && ask > 0 && ask >= sl) {
            triggerPrice = sl;
            reason = 'sl';
          } else if (tp != null && ask > 0 && ask <= tp) {
            triggerPrice = tp;
            reason = 'tp';
          }
        }

        if (triggerPrice != null && reason) {
          const result = await this.nettingEngine.closePositionLeg(
            userId,
            leg.tradeId,
            triggerPrice,
            { closeReason: reason }
          );
          if (result?.success) {
            console.log(
              `[SL/TP] Per-fill ${reason.toUpperCase()} hit on ${leg.symbol} leg ${leg.tradeId}: triggered at ${triggerPrice}, realized ${result.profit?.toFixed(4)}`
            );
            if (this.io) {
              this.io.to(userId).emit('legClosedBySLTP', {
                tradeId: leg.tradeId,
                symbol: leg.symbol,
                reason,
                triggerPrice,
                profit: result.profit
              });
            }
          }
        }
      } catch (err) {
        console.error('[SL/TP] per-fill check error:', err.message);
      }
    }

    // ---- 2) Position-level SL/TP -----------------------------------------
    // When the parent position's SL/TP is hit, close every remaining open leg
    // of that parent. Each leg uses its own entry for PnL — sum equals the
    // standard "close everything against the parent.avg" math only if the
    // weighted-mean invariant holds (which it does pre-Phase-3 closes).
    for (const parent of parentsWithSLTP) {
      try {
        const bundle = priceResolver(parent.symbol);
        if (!bundle) continue;
        const bid = Number(bundle.bid);
        const ask = Number(bundle.ask);
        const sl = parent.stopLoss != null ? Number(parent.stopLoss) : null;
        const tp = parent.takeProfit != null ? Number(parent.takeProfit) : null;
        const side = String(parent.side || '').toLowerCase();

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
          // Fix 18: generate one groupId for the whole position-level close
          // event. Each leg's closePositionLeg call will tag the leg as a
          // child of this group. After all legs are closed, we insert ONE
          // parent summary Trade row marked isHistoryParent=true so the
          // History tab shows it as a single expandable entry.
          const posGroupId = `GRP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          // Close every remaining open leg of this parent.
          const remainingLegs = await Trade.find({
            userId,
            oderId: parent.oderId,
            mode: 'netting',
            type: 'open',
            closedAt: null
          }).sort({ executedAt: 1 });

          let totalClosedVol = 0;
          let totalClosedQty = 0;
          let totalProfit = 0;
          let firstLegEntry = null;
          for (const leg of remainingLegs) {
            try {
              const result = await this.nettingEngine.closePositionLeg(
                userId,
                leg.tradeId,
                triggerPrice,
                { closeReason: reason, groupId: posGroupId }
              );
              if (result?.success) {
                totalClosedVol += Number(leg.volume) || 0;
                totalClosedQty += Number(leg.quantity) || 0;
                totalProfit += Number(result.profit) || 0;
                if (firstLegEntry == null) firstLegEntry = Number(leg.entryPrice) || null;
                console.log(
                  `[SL/TP] Position-level ${reason.toUpperCase()} hit on ${parent.symbol}: closed leg ${leg.tradeId} at ${triggerPrice}, realized ${result.profit?.toFixed(4)}`
                );
              }
            } catch (legErr) {
              console.error('[SL/TP] position-level leg close error:', legErr.message);
            }
          }

          // Insert the parent summary row for this group (Fix 18). Marked
          // isHistoryParent=true so it appears in the flat History list.
          // entryPrice = parent.avgPrice (the position's averaged entry,
          // since the group represents "the position" not any single fill).
          if (totalClosedVol > 0) {
            try {
              const summaryTrade = new Trade({
                tradeId: `TRD-${Date.now() + 1}`,
                oderId: parent.oderId,
                userId,
                mode: 'netting',
                symbol: parent.symbol,
                side: parent.side,
                volume: totalClosedVol,
                quantity: totalClosedQty || null,
                lotSize: parent.lotSize || 1,
                entryPrice: Number(parent.avgPrice) || firstLegEntry || 0,
                closePrice: triggerPrice,
                profit: totalProfit,
                commission: 0,
                swap: 0,
                exchange: parent.exchange,
                segment: parent.segment,
                type: 'close',
                closedBy: reason, // 'sl' or 'tp'
                remark: reason === 'sl' ? 'SL' : 'TP',
                closedAt: new Date(),
                groupId: posGroupId,
                isHistoryParent: true
              });
              await summaryTrade.save();
            } catch (summaryErr) {
              console.error('[SL/TP] position-level summary row save error:', summaryErr.message);
            }
          }

          if (this.io) {
            this.io.to(userId).emit('positionClosedBySLTP', {
              positionId: parent.oderId,
              symbol: parent.symbol,
              reason,
              triggerPrice
            });
          }
        }
      } catch (err) {
        console.error('[SL/TP] parent position check error:', err.message);
      }
    }
  }

  /**
   * Hedging SL/TP monitor — walks all open hedging positions for the given
   * user. When a position's stopLoss/takeProfit is crossed by bid/ask, the
   * position is auto-closed via hedgingEngine.closePosition().
   *
   * Trigger conventions (MT5):
   *   BUY  → close at bid; SL hit when bid <= sl, TP hit when bid >= tp
   *   SELL → close at ask; SL hit when ask >= sl, TP hit when ask <= tp
   */
  async _checkHedgingSLTP(userId, priceResolver) {
    if (!this.hedgingEngine) return;
    const { HedgingPosition } = require('../models/Position');

    let positions;
    try {
      positions = await HedgingPosition.find({
        userId,
        status: 'open',
        $or: [
          { stopLoss: { $ne: null, $gt: 0 } },
          { takeProfit: { $ne: null, $gt: 0 } }
        ]
      });
    } catch (e) {
      return;
    }

    for (const pos of positions) {
      try {
        const bundle = priceResolver(pos.symbol);
        if (!bundle) continue;
        const bid = Number(bundle.bid);
        const ask = Number(bundle.ask);
        if (!(bid > 0) && !(ask > 0)) continue;

        const sl = pos.stopLoss != null ? Number(pos.stopLoss) : null;
        const tp = pos.takeProfit != null ? Number(pos.takeProfit) : null;
        const side = String(pos.side || '').toLowerCase();

        let closePrice = null;
        let reason = null;
        if (side === 'buy') {
          // BUY closes at bid
          if (sl != null && bid > 0 && bid <= sl) { closePrice = bid; reason = 'sl'; }
          else if (tp != null && bid > 0 && bid >= tp) { closePrice = bid; reason = 'tp'; }
        } else if (side === 'sell') {
          // SELL closes at ask
          if (sl != null && ask > 0 && ask >= sl) { closePrice = ask; reason = 'sl'; }
          else if (tp != null && ask > 0 && ask <= tp) { closePrice = ask; reason = 'tp'; }
        }

        if (closePrice != null && reason) {
          try {
            const result = await this.hedgingEngine.closePosition(
              userId,
              pos.oderId || pos._id.toString(),
              pos.volume,
              closePrice,
              { skipTradeHold: true, closeReason: reason }
            );
            console.log(
              `[Hedging SL/TP] ${reason.toUpperCase()} hit on ${pos.symbol} (${pos.oderId}): closed @ ${closePrice}, profit: ${result?.profit?.toFixed(2)}`
            );
            if (this.io) {
              this.io.to(userId).emit('positionClosedBySLTP', {
                positionId: pos.oderId,
                symbol: pos.symbol,
                side: pos.side,
                reason,
                closePrice,
                profit: result?.profit,
                mode: 'hedging'
              });
            }
          } catch (closeErr) {
            console.error(`[Hedging SL/TP] close error for ${pos.oderId}:`, closeErr.message);
          }
        }
      } catch (err) {
        console.error('[Hedging SL/TP] check error:', err.message);
      }
    }
  }

  async initialize() {
    if (!METAAPI_AUTH_TOKEN || !METAAPI_ACCOUNT_ID) {
      console.log('⚠️ MetaAPI credentials not configured. Using cached prices if available.');
      // Always start the broadcast loop — it drives prop-challenge SL/TP
      // evaluation via syncOpenPositionsAndLedgerRisk(). Indian-market-only
      // setups (Zerodha) have an empty MetaAPI price cache, but the SL/TP
      // resolver pulls live bid/ask from Zerodha directly, so we MUST start
      // the loop regardless of the MetaAPI cache size.
      this.startPriceBroadcast();
      return;
    }

    try {
      console.log('🔌 Connecting to MetaAPI SDK...');
      
      this.api = new MetaApi(METAAPI_AUTH_TOKEN);
      this.account = await this.api.metatraderAccountApi.getAccount(METAAPI_ACCOUNT_ID);
      
      // Check account state and deploy if needed
      const state = this.account.state || (typeof this.account.getState === 'function' ? await this.account.getState() : 'DEPLOYED');
      console.log(`📊 MetaAPI account state: ${state}`);
      
      if (state === 'UNDEPLOYED') {
        console.log('🚀 Deploying MetaAPI account...');
        try {
          // Deploy the account first
          await this.account.deploy();
          console.log('⏳ Waiting for account deployment (timeout: 5 minutes)...');
          // Wait with timeout
          await Promise.race([
            this.account.waitDeployed(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Deployment timeout')), 300000))
          ]);
          console.log('✅ Account deployed successfully');
        } catch (deployError) {
          console.error('❌ Account deployment failed:', deployError.message);
          console.log('⚠️ Using cached prices. Please deploy your MetaAPI account manually at https://app.metaapi.cloud');
          // Start the broadcast loop unconditionally — it drives prop SL/TP
          // monitoring which uses Zerodha live prices for Indian instruments.
          this.startPriceBroadcast();
          return;
        }
      } else if (state !== 'DEPLOYED') {
        console.log(`⏳ Waiting for account deployment (current state: ${state})...`);
        try {
          await Promise.race([
            this.account.waitDeployed(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Deployment timeout')), 120000))
          ]);
        } catch (waitError) {
          console.error('❌ Deployment wait timeout:', waitError.message);
          console.log('⚠️ Using cached prices. MetaAPI connection failed.');
          // Start broadcast loop unconditionally so prop SL/TP keeps working
          // via Zerodha live prices for Indian instruments.
          this.startPriceBroadcast();
          return;
        }
      }
      
      // Get streaming connection
      this.connection = this.account.getStreamingConnection();
      
      // Add synchronization listener for real-time price updates
      const self = this;
      const listener = {
        onSymbolPriceUpdated: (instanceIndex, price) => {
          self.handlePriceUpdate(price);
        },
        onConnected: (instanceIndex, replicas) => {
          console.log('✅ MetaAPI streaming connected');
          self.isConnected = true;
          self.reconnectAttempts = 0;
        },
        onDisconnected: (instanceIndex) => {
          console.log('❌ MetaAPI streaming disconnected');
          self.isConnected = false;
          self.handleReconnect();
        },
        onBrokerConnectionStatusChanged: (instanceIndex, connected) => {
          console.log(`📡 Broker connection: ${connected ? 'Connected' : 'Disconnected'}`);
        },
        onSymbolSpecificationUpdated: () => {},
        onSymbolSpecificationsUpdated: () => {},
        onPositionUpdated: () => {},
        onPositionRemoved: () => {},
        onPositionsReplaced: () => {},
        onPositionsSynchronized: () => {},
        onOrderUpdated: () => {},
        onOrderCompleted: () => {},
        onOrdersReplaced: () => {},
        onOrdersSynchronized: () => {},
        onHistoryOrderAdded: () => {},
        onHistoryOrdersSynchronized: () => {},
        onDealAdded: () => {},
        onDealsSynchronized: () => {},
        onDealSynchronizationFinished: () => {},
        onOrderSynchronizationFinished: () => {},
        onAccountInformationUpdated: () => {},
        onSymbolPricesUpdated: (instanceIndex, prices) => {
          prices.forEach(price => self.handlePriceUpdate(price));
        },
        onCandlesUpdated: () => {},
        onTicksUpdated: () => {},
        onBooksUpdated: () => {},
        onSubscriptionDowngraded: () => {},
        onStreamClosed: () => {},
        onHealthStatus: () => {},
        onSignal: () => {},
        onUnsubscribeRegion: () => {},
        onSynchronizationStarted: () => {},
        onPendingOrdersSynchronized: () => {},
        onPendingOrdersReplaced: () => {}
      };
      
      this.connection.addSynchronizationListener(listener);
      
      // Connect
      await this.connection.connect();
      
      // Wait for synchronization
      console.log('⏳ Waiting for MetaAPI synchronization...');
      await this.connection.waitSynchronized();
      
      this.terminalState = this.connection.terminalState;
      console.log('✅ MetaAPI synchronized successfully');
      
      // Subscribe to market data for all symbols
      await this.subscribeToSymbols();
      
      // Start broadcasting prices
      this.startPriceBroadcast();
      
    } catch (error) {
      console.error('❌ MetaAPI connection error:', error.message);
      console.log('⚠️ Using cached prices. MetaAPI connection failed.');
      // Start the loop regardless so prop-challenge SL/TP still fires using
      // Zerodha live prices for Indian instruments. The broadcast guards
      // empty-cache cases internally.
      this.startPriceBroadcast();
    }
  }

  async subscribeToSymbols() {
    console.log('📊 Subscribing to market data...');
    
    let allSymbols = [];
    
    // Try to fetch available symbols from broker FIRST (priority)
    try {
      const brokerSymbols = await this.fetchBrokerSymbols();
      if (brokerSymbols && brokerSymbols.length > 0) {
        console.log(`📋 Found ${brokerSymbols.length} symbols from broker`);
        // Use broker symbols as primary source
        brokerSymbols.forEach(sym => {
          const symbolName = sym.symbol || sym.name || sym;
          if (symbolName && !allSymbols.includes(symbolName)) {
            allSymbols.push(symbolName);
          }
        });
      }
    } catch (err) {
      console.warn('Could not fetch broker symbols:', err.message);
    }
    
    // If no broker symbols, fall back to hardcoded list
    if (allSymbols.length === 0) {
      console.log('⚠️ No broker symbols found, using hardcoded list');
      allSymbols = [...SYMBOLS];
    }
    
    console.log(`📊 Total symbols to subscribe: ${allSymbols.length}`);
    
    let subscribed = 0;
    let failed = 0;
    
    for (const symbol of allSymbols) {
      try {
        await this.connection.subscribeToMarketData(symbol, [
          { type: 'quotes' },
          { type: 'ticks' }
        ]);
        subscribed++;
        // Only log first 20 and then summary
        if (subscribed <= 20) {
          console.log(`  ✓ Subscribed to ${symbol}`);
        }
      } catch (error) {
        failed++;
        // Only log first 5 failures
        if (failed <= 5) {
          console.warn(`  ✗ Failed to subscribe to ${symbol}:`, error.message);
        }
      }
    }
    
    console.log(`📊 Subscription complete: ${subscribed} subscribed, ${failed} failed`);
  }

  // Fetch available symbols from broker via REST API
  async fetchBrokerSymbols() {
    try {
      const METAAPI_BASE_URL = process.env.METAAPI_BASE_URL || 'https://mt-client-api-v1.new-york.agiliumtrade.ai';
      
      const response = await fetch(
        `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/symbols`,
        {
          headers: {
            'auth-token': METAAPI_AUTH_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const symbols = await response.json();
      return symbols;
    } catch (error) {
      console.error('Error fetching broker symbols:', error.message);
      return [];
    }
  }

  handlePriceUpdate(price) {
    if (!price || !price.symbol) return;
    
    const originalSymbol = price.symbol;
    
    // Normalize symbol - remove broker suffixes like .c, .i, .m, etc.
    const normalizedSymbol = originalSymbol.replace(/\.[a-zA-Z0-9]+$/, '');
    
    // Get previous price data to track low/high
    const prev = this.prices[normalizedSymbol];
    const currentBid = price.bid || 0;
    const currentAsk = price.ask || 0;
    
    // Track daily low/high (reset at new local day) + session open for Market Watch OHLC-style columns
    let low = currentBid;
    let high = currentBid;
    let sessionOpen = currentBid;
    const prevDate = prev?.time ? new Date(prev.time).toDateString() : null;
    const currentDate = new Date().toDateString();

    if (prev) {
      if (prevDate === currentDate) {
        low = Math.min(prev.low || currentBid, currentBid);
        high = Math.max(prev.high || currentBid, currentBid);
        sessionOpen =
          prev.sessionOpen != null && Number(prev.sessionOpen) > 0
            ? Number(prev.sessionOpen)
            : currentBid;
      }
      // new calendar day: low/high/sessionOpen stay at currentBid
    }

    const pointChange = prev && prev.bid ? currentBid - prev.bid : 0;

    const priceData = {
      symbol: normalizedSymbol, // Use normalized symbol for frontend
      originalSymbol: originalSymbol, // Keep original for reference
      bid: currentBid,
      ask: currentAsk,
      low: low,
      high: high,
      sessionOpen,
      pointChange,
      previousClose:
        price.previousClose != null && Number(price.previousClose) > 0
          ? Number(price.previousClose)
          : prev?.previousClose,
      time: price.time || new Date().toISOString(),
      brokerTime: price.brokerTime,
      spread: currentAsk && currentBid ? (currentAsk - currentBid) : 0
    };

    // change = tick-to-tick % (used by user terminal / sockets); pointChange = absolute bid delta
    if (prev) {
      priceData.change = prev.bid ? (pointChange / prev.bid) * 100 : 0;
      priceData.direction = currentBid > prev.bid ? 'up' : currentBid < prev.bid ? 'down' : 'neutral';
    } else {
      priceData.change = 0;
      priceData.direction = 'neutral';
    }
    
    // Store with normalized symbol so frontend can find it
    this.prices[normalizedSymbol] = priceData;
    
    // Also store with original symbol for backward compatibility
    if (originalSymbol !== normalizedSymbol) {
      this.prices[originalSymbol] = { ...priceData, symbol: originalSymbol };
    }
    
    // Save to cache every 30 seconds
    const now = Date.now();
    if (now - this.lastCacheSave > 30000) {
      this.lastCacheSave = now;
      saveCachedPrices(this.prices);
    }
    
    // Emit to all connected clients immediately (tick-by-tick)
    this.io.emit('price_tick', priceData);
    
    // Also emit with original symbol for any clients using broker symbols
    if (originalSymbol !== normalizedSymbol) {
      this.io.emit('price_tick', { ...priceData, symbol: originalSymbol });
    }
  }

  startPriceBroadcast() {
    if (this._priceBroadcastStarted) return;
    this._priceBroadcastStarted = true;
    // Broadcast all prices every second as a batch update
    setInterval(() => {
      if (Object.keys(this.prices).length > 0) {
        this.io.emit('prices_batch', this.prices);
        
        // Check and execute pending orders
        this.checkAllPendingOrders();
      }
      // Refresh open P/L + equity from live prices; ledger-balance-close if configured
      this.syncOpenPositionsAndLedgerRisk();
    }, 1000);
    
    // If not connected, try to fetch prices via REST API every 5 seconds
    setInterval(async () => {
      if (!this.isConnected && METAAPI_AUTH_TOKEN && METAAPI_ACCOUNT_ID) {
        await this.fetchPricesViaRest();
      }
    }, 5000);
    
    // Periodically try to reconnect if disconnected
    setInterval(async () => {
      if (!this.isConnected && METAAPI_AUTH_TOKEN && METAAPI_ACCOUNT_ID) {
        console.log('🔄 Attempting to reconnect to MetaAPI...');
        this.reconnectAttempts = 0; // Reset attempts for periodic reconnect
        await this.initialize();
      }
    }, 60000); // Try every 60 seconds
  }
  
  // Fetch prices via REST API as fallback (same alias resolution as Market Watch)
  async fetchPricesViaRest() {
    try {
      const keySymbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'US30', 'US100'];
      for (const symbol of keySymbols) {
        try {
          const p = await restPriceForSymbol(symbol);
          if (p) {
            this.handlePriceUpdate({
              symbol,
              bid: p.bid,
              ask: p.ask,
              time: new Date().toISOString()
            });
          }
        } catch (e) {
          /* per-symbol */
        }
      }
    } catch (error) {
      console.warn('[MetaAPI REST] Failed to fetch prices:', error.message);
    }
  }

  // Check all pending orders against current prices
  async checkAllPendingOrders() {
    try {
      const { HedgingPosition, NettingPosition } = require('../models/Position');
      
      // Check both hedging and netting pending orders
      const hedgingPendingOrders = await HedgingPosition.find({ status: 'pending' });
      const nettingPendingOrders = await NettingPosition.find({ status: 'pending' });
      const pendingOrders = [...hedgingPendingOrders, ...nettingPendingOrders];
      
      if (pendingOrders.length === 0) return;
      
      console.log(`[PendingOrder] Checking ${pendingOrders.length} pending orders...`);

      // Get Zerodha prices for Indian instruments
      let zerodhaService = null;
      try {
        zerodhaService = require('./zerodha.service');
      } catch (e) {
        // Zerodha service not available
      }

      for (const order of pendingOrders) {
        let priceData = this.prices[order.symbol];
        
        // If no MetaAPI price, check Zerodha prices for Indian instruments
        if ((!priceData || !priceData.bid || !priceData.ask) && zerodhaService) {
          const zerodhaPrice = zerodhaService.getPrice(order.symbol);
          if (zerodhaPrice) {
            // Prefer real bid/ask from Zerodha depth (critical for options)
            const rBid = Number(zerodhaPrice.bid);
            const rAsk = Number(zerodhaPrice.ask);
            const lp = Number(zerodhaPrice.lastPrice || zerodhaPrice.last_price || 0);
            if (rBid > 0 && rAsk > 0) {
              priceData = { bid: rBid, ask: rAsk, lastPrice: lp || rBid };
            } else if (lp > 0) {
              const spread = lp * 0.0001;
              priceData = { bid: lp - spread, ask: lp + spread, lastPrice: lp };
            }
          }
        }
        
        if (!priceData || !priceData.bid || !priceData.ask) {
          console.log(`[PendingOrder] No price data for ${order.symbol}`);
          continue;
        }

        const triggerPrice = order.triggerPrice || order.entryPrice || order.avgPrice;
        let shouldExecute = false;
        
        console.log(`[PendingOrder] Checking ${order.symbol}: orderType=${order.orderType}, side=${order.side}, trigger=${triggerPrice}, bid=${priceData.bid.toFixed(2)}, ask=${priceData.ask.toFixed(2)}`);

        // MT5-style pending order execution logic:
        // BUY LIMIT: Triggers when Ask price falls to or below the trigger price
        // BUY STOP: Triggers when Ask price rises to or above the trigger price
        // SELL LIMIT: Triggers when Bid price rises to or above the trigger price
        // SELL STOP: Triggers when Bid price falls to or below the trigger price
        
        if (order.orderType === 'limit') {
          if (order.side === 'buy' && priceData.ask <= triggerPrice) {
            shouldExecute = true;
          } else if (order.side === 'sell' && priceData.bid >= triggerPrice) {
            shouldExecute = true;
          }
        } else if (order.orderType === 'stop') {
          if (order.side === 'buy' && priceData.ask >= triggerPrice) {
            shouldExecute = true;
          } else if (order.side === 'sell' && priceData.bid <= triggerPrice) {
            shouldExecute = true;
          }
        }

        if (shouldExecute) {
          console.log(`[PendingOrder] EXECUTING: ${order.oderId} ${order.side} ${order.symbol}`);
          const currentPrice = order.side === 'buy' ? priceData.ask : priceData.bid;
          
          // Determine mode based on which collection the order came from
          const isNettingOrder = order.session !== undefined; // Netting orders have session field
          const mode = isNettingOrder ? 'netting' : 'hedging';
          
          // Activate the pending order - convert to open position
          order.status = 'open';
          if (isNettingOrder) {
            order.avgPrice = currentPrice; // Netting uses avgPrice
          } else {
            order.entryPrice = currentPrice; // Hedging uses entryPrice
          }
          order.currentPrice = currentPrice;
          order.activatedAt = new Date();
          order.openTime = new Date();

          // ====== COMMISSION ON ACTIVATION ======
          // Charge commission when pending order becomes open, same logic as market orders
          let openCommission = 0;
          let openCommissionInr = 0;
          try {
            const engine = isNettingOrder ? this.nettingEngine : this.hedgingEngine;
            if (engine) {
              const segmentSettings = await engine.getSegmentSettingsForTrade(
                order.userId, order.symbol, order.exchange, order.segment
              );
              if (segmentSettings && Number(segmentSettings.commission) > 0) {
                const chargeOn = segmentSettings.chargeOn || 'open';
                const shouldChargeOnOpen = chargeOn === 'open' || chargeOn === 'both';
                if (shouldChargeOnOpen) {
                  const qty = order.quantity || (order.volume * (order.lotSize || 1)) || order.volume;
                  openCommission = engine.calculateCommission(
                    segmentSettings.commissionType,
                    segmentSettings.commission,
                    order.volume,
                    qty,
                    currentPrice
                  );
                  openCommissionInr = openCommission;
                  // Convert INR to USD for wallet
                  const { getCachedUsdInrRate } = require('./currencyRateService');
                  const usdInrRate = getCachedUsdInrRate();
                  openCommission = openCommission / usdInrRate;
                  
                  // Deduct from user wallet
                  const User = require('../models/User');
                  const user = await User.findOne({ oderId: order.userId });
                  if (user) {
                    user.wallet.balance -= openCommission;
                    user.wallet.equity = user.wallet.balance + user.wallet.credit;
                    user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
                    await user.save();
                    console.log(`[PendingOrder] Commission charged: ₹${openCommissionInr.toFixed(2)} → $${openCommission.toFixed(4)}`);
                  }
                }
              }
            }
          } catch (commErr) {
            console.error('[PendingOrder] Commission error:', commErr.message);
          }
          
          order.openCommission = openCommission;
          order.openCommissionInr = openCommissionInr;
          await order.save();

          // Log the execution
          const Trade = require('../models/Trade');
          const trade = new Trade({
            tradeId: `TRD-${Date.now()}`,
            oderId: order.oderId,
            userId: order.userId,
            mode,
            symbol: order.symbol,
            side: order.side,
            volume: order.volume,
            entryPrice: currentPrice,
            originalPrice: triggerPrice,
            commission: openCommission,
            commissionInr: openCommissionInr,
            type: 'open',
            executedAt: new Date()
          });
          trade.save().catch(err => console.error('Trade history save error:', err));

          console.log(`[PendingOrder] Executed (${mode}): ${order.oderId} ${order.side} ${order.volume} ${order.symbol} @ ${currentPrice} (trigger: ${triggerPrice})`);

          // Notify the user via socket
          this.io.to(order.userId).emit('pendingOrderExecuted', {
            orderId: order.oderId,
            symbol: order.symbol,
            side: order.side,
            volume: order.volume,
            triggerPrice,
            executionPrice: currentPrice,
            mode,
            message: `${order.orderType.toUpperCase()} order executed: ${order.side.toUpperCase()} ${order.volume} ${order.symbol} @ ${currentPrice}`
          });

          // Emit position update based on mode
          if (isNettingOrder) {
            const updatedPositions = await NettingPosition.find({ userId: order.userId, status: 'open' }).lean();
            this.io.to(order.userId).emit('positionUpdate', { 
              mode: 'netting', 
              positions: updatedPositions.map(p => ({ ...p, mode: 'netting' }))
            });
          } else {
            const updatedPositions = await HedgingPosition.find({ userId: order.userId, status: 'open' }).lean();
            this.io.to(order.userId).emit('positionUpdate', { 
              mode: 'hedging', 
              positions: updatedPositions.map(p => ({ ...p, mode: 'hedging' }))
            });
          }
        }
      }
    } catch (error) {
      // Silent fail - don't spam logs
      if (error.message && !error.message.includes('Cannot find module')) {
        console.error('[PendingOrder] Check error:', error.message);
      }
    }
  }

  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('⚠️ Max reconnect attempts reached. Using cached prices.');
      this.isConnected = false;
      // Continue broadcasting cached prices
      if (Object.keys(this.prices).length > 0) {
        this.startPriceBroadcast();
      }
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`🔄 Reconnecting in ${delay/1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    setTimeout(async () => {
      try {
        await this.connection.connect();
        await this.connection.waitSynchronized();
        await this.subscribeToSymbols();
      } catch (error) {
        console.error('Reconnection failed:', error.message);
        this.handleReconnect();
      }
    }, delay);
  }

  getPrice(symbol) {
    return this.prices[symbol] || null;
  }

  getAllPrices() {
    return this.prices;
  }

  async disconnect() {
    if (this.connection) {
      try {
        await this.connection.close();
        console.log('MetaAPI connection closed');
      } catch (error) {
        console.error('Error closing MetaAPI connection:', error.message);
      }
    }
  }
}

module.exports = MetaApiStreamingService;
module.exports.restPriceForSymbol = restPriceForSymbol;
module.exports.loadDiskCacheForFallback = loadDiskCacheForFallback;
