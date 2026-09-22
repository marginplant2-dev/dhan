import { parseSession, inSession, bridge, fillSessionGaps, MAX_FILLED_BARS } from './gapFill';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const configurationData = {
    supported_resolutions: ['1', '5', '15', '60', '1D'],
    exchanges: [{ value: 'MARKET', name: 'MARKET', desc: 'Market' }],
    symbols_types: [{ name: 'All', value: 'all' }],
};

const subscriptions = new Map();

// Latest live quote per chart symbol (the full "zerodha|SYMBOL" key). Fed by
// updateLivePrice() on every tick. getBars() reads this to synthesise candles
// when the backend has no history for the instrument (deep-OTM options etc.),
// so the chart never paints blank.
const latestQuotes = new Map();

// Which price to show on chart: 'ask' (for Buy view) or 'bid' (for Sell view)
let currentPriceSide = 'bid'; // default: show bid price (like MT4/MT5)

// Helper to convert TV resolution to API strings
const TV_TO_API_INTERVALS = {
    '1': { zerodha: 'minute', meta: '1m', delta: '1m', seconds: 60 },
    '5': { zerodha: '5minute', meta: '5m', delta: '5m', seconds: 300 },
    '15': { zerodha: '15minute', meta: '15m', delta: '15m', seconds: 900 },
    '60': { zerodha: '60minute', meta: '1h', delta: '1h', seconds: 3600 },
    '1D': { zerodha: 'day', meta: '1d', delta: '1d', seconds: 86400 },
};

const DELTA_LOOKBACK_SEC = {
    '1': 172800,
    '5': 604800,
    '15': 1209600,
    '60': 2592000,
    '1D': 31536000
};

// First-paint lookback for Zerodha so the chart opens FULL instead of just
// today's few candles. TradingView's initial request only spans ~1 day for
// intraday resolutions, so the backend returned only today's bars and the chart
// looked empty. On the first request we widen `from` per resolution (kept within
// the backend's 60-day intraday cap; daily goes back further). TV clips the
// viewport itself and backward-scroll still lazy-loads anything older.
const ZERODHA_FIRST_LOOKBACK_SEC = {
    '1': 86400 * 5,     // 1-min: ~5 market days
    '5': 86400 * 20,    // 5-min: ~20 days
    '15': 86400 * 45,   // 15-min: ~45 days
    '60': 86400 * 60,   // 60-min: ~60 days (backend intraday cap)
    '1D': 86400 * 400,  // daily: ~400 days
};

/** Bar open time for TradingView: unix ms. APIs may send seconds or ms. */
function candleOpenTimeToMs(t) {
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000);
}

// Determine appropriate pricescale for a symbol
function getPricescale(symbolName) {
    const s = (symbolName || '').toUpperCase();
    if (s.includes('JPY')) return 1000;      // 3 decimals
    if (s.includes('XAU') || s.includes('GOLD')) return 100; // 2 decimals
    if (s.includes('XAG') || s.includes('SILVER')) return 1000; // 3 decimals
    if (s.includes('BTC')) return 100;       // 2 decimals
    if (s.includes('ETH')) return 100;       // 2 decimals
    if (s.includes('US30') || s.includes('US100') || s.includes('US500')) return 100;
    // Forex pairs
    if (s.length >= 6 && s.length <= 10) return 100000; // 5 decimals
    return 100;
}

// Deterministic PRNG so the synthetic series is stable across getBars retries
// (a Math.random() series would jump every repaint).
function seededRand(seed) {
    let s = Math.abs(seed) % 2147483647;
    if (s === 0) s = 1;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/**
 * Build a synthetic OHLC series anchored to the live quote `mid`. Used only
 * when the backend returns ZERO history (Zerodha has no OHLC for the contract,
 * token expired, or a brand-new option). The last candle's close == mid so the
 * chart lines up with the BUY/SELL price the order panel shows, and the live
 * streaming bar from subscribeBars takes over seamlessly.
 */
function generateSyntheticBars(symbol, mid, spread, resolution, from, to) {
    if (!(mid > 0)) return [];
    const resSec = (TV_TO_API_INTERVALS[resolution] || TV_TO_API_INTERVALS['5']).seconds;
    const isOption = /CE$|PE$/i.test(symbol);
    const volPct = isOption ? 0.008 : 0.0005;
    const resFactor = Math.sqrt(resSec / 300);
    const volatility = Math.max((spread || 0) * 1.5, mid * volPct * resFactor);

    const nowSec = Math.floor(Date.now() / 1000);
    const toSec = Math.min(to || nowSec, nowSec);
    const fromAligned = Math.floor((from || toSec - 86400) / resSec) * resSec;
    const toAligned = Math.floor(toSec / resSec) * resSec;
    if (fromAligned >= toAligned) return [];

    const count = Math.min(Math.floor((toAligned - fromAligned) / resSec) + 1, 500);
    const startSec = toAligned - (count - 1) * resSec;

    const seed = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + Math.floor(startSec / 86400);
    const rand = seededRand(seed);

    const increments = Array.from({ length: count }, () => (rand() - 0.5) * volatility * 2);
    let cumSum = 0;
    const cumSums = increments.map((inc) => { cumSum += inc; return cumSum; });
    const lastCum = cumSums[cumSums.length - 1];
    const prices = cumSums.map((c) => Math.max(0.01, mid + (c - lastCum)));

    const bars = [];
    let prev = Math.max(0.01, mid - (cumSums[0] - lastCum));
    for (let i = 0; i < count; i++) {
        const open = prev;
        const close = prices[i];
        bars.push({
            time: (startSec + i * resSec) * 1000,
            open,
            close,
            high: Math.max(open, close) + Math.abs(rand() * volatility * 0.4),
            low: Math.max(0.01, Math.min(open, close) - Math.abs(rand() * volatility * 0.4)),
            volume: Math.floor(rand() * 500) + 50,
        });
        prev = close;
    }
    return bars;
}

/** Pull the cached live quote for a chart symbol and reduce it to {mid, spread}. */
function midSpreadFromQuote(encodedSymbol) {
    const q = latestQuotes.get(encodedSymbol);
    if (!q) return { mid: 0, spread: 0 };
    const bid = Number(q.bid) || 0;
    const ask = Number(q.ask) || 0;
    const ltp = Number(q.lastPrice ?? q.last_price) || 0;
    if (bid > 0 && ask > 0) return { mid: (bid + ask) / 2, spread: Math.abs(ask - bid) };
    if (ltp > 0) return { mid: ltp, spread: ltp * 0.0005 };
    if (bid > 0) return { mid: bid, spread: bid * 0.0005 };
    if (ask > 0) return { mid: ask, spread: ask * 0.0005 };
    return { mid: 0, spread: 0 };
}

/**
 * When the backend has no history, emit a synthetic series anchored to the live
 * quote (first paint only). Pagination requests with no real data just report
 * noData so TradingView stops looping. Falls back to noData if there's no quote.
 */
function emitSyntheticOrNoData(encodedSymbol, resolution, from, to, firstDataRequest, onHistoryCallback) {
    if (firstDataRequest) {
        const { mid, spread } = midSpreadFromQuote(encodedSymbol);
        if (mid > 0) {
            const synth = generateSyntheticBars(encodedSymbol, mid, spread, resolution, from, to);
            if (synth.length > 0) {
                onHistoryCallback(synth, { noData: false });
                return;
            }
        }
    }
    onHistoryCallback([], { noData: true });
}

/** Last history bar per symbol+resolution, so the live series can start where
 *  the history ended instead of leaving the quiet stretch between them blank. */
const lastHistoryBar = new Map();

/**
 * Tick-driven bridging can only run when a tick arrives. An option strike that
 * goes quiet for an hour produces no tick, so nothing would close the hole
 * until it trades again — the user sits in front of a chart that stopped while
 * the clock kept going. This heartbeat advances every live series to the
 * current bucket on its own, so a quiet market looks like a flat line (what
 * Zerodha shows) instead of a hole.
 *
 * It only ever runs inside the instrument's session and only while something
 * is subscribed.
 */
const HEARTBEAT_MS = 20000;
let heartbeat = null;

function advanceQuietSeries() {
    const now = Date.now();
    subscriptions.forEach((sub) => {
        const win = parseSession(sub.session);
        if (!win || !sub.lastBarTime || sub.lastBarClose == null) return;

        const resData = TV_TO_API_INTERVALS[sub.resolution] || TV_TO_API_INTERVALS['60'];
        const resMillis = resData.seconds * 1000;
        const bucketTime = Math.floor(now / resMillis) * resMillis;
        if (bucketTime <= sub.lastBarTime) return;
        // After the close the last bar belongs at the right edge — inventing
        // bars past it would recreate the empty right-hand gap we removed.
        if (!inSession(bucketTime, win)) return;

        // bridge() stops before its end time, so ask for one millisecond past
        // the current bucket to include it.
        const bars = bridge(
            { time: sub.lastBarTime, close: sub.lastBarClose },
            bucketTime + 1, resMillis, win, MAX_FILLED_BARS
        );
        if (!bars.length) return;

        for (const b of bars) sub.callback(b);
        const last = bars[bars.length - 1];
        sub.lastBarTime = last.time;
        sub.lastBarOpen = last.open;
        sub.lastBarHigh = last.high;
        sub.lastBarLow = last.low;
        sub.lastBarClose = last.close;
    });
}

function startHeartbeat() {
    if (heartbeat || typeof window === 'undefined') return;
    heartbeat = setInterval(advanceQuietSeries, HEARTBEAT_MS);
}

function stopHeartbeatIfIdle() {
    if (heartbeat && subscriptions.size === 0) {
        clearInterval(heartbeat);
        heartbeat = null;
    }
}
const historyKey = (symbol, resolution) => `${symbol}::${resolution}`;

export default {
    onReady: (callback) => {
        setTimeout(() => callback(configurationData));
    },

    searchSymbols: async (userInput, exchange, symbolType, onResultReadyCallback) => {
        onResultReadyCallback([]);
    },

        resolveSymbol: async (symbolName, onSymbolResolvedCallback, onResolveErrorCallback, extension) => {
        let displayName = symbolName;
        let dataSource = 'zerodha';
        if (symbolName.includes('|')) {
            const parts = symbolName.split('|');
            dataSource = parts[0];
            displayName = parts[1];
        }

        // Market session per data source. Using '24x7' for everything made the
        // chart reserve empty space from the last candle up to the current
        // wall-clock time whenever the market was actually closed — that's the
        // big right-side gap that showed up on NIFTY/BANKNIFTY etc. after 15:30.
        //   - zerodha  → NSE/BSE/NFO/BFO cash + F&O hours (09:15–15:30 IST), so
        //                after close the latest bar sits at the right edge (just
        //                like Zerodha/Upstox) with no future gap.
        //   - metaapi/delta → left at 24x7 (forex is ~24h Mon–Fri and crypto is
        //                genuinely 24x7; they were not affected by the gap and
        //                changing them risks an invalid session string).
        // NOTE: MCX commodities (CRUDEOIL/GOLD/SILVER/COPPER/…) trade 09:00–23:30,
        // so they need a WIDER session than NSE/BSE (0915-1530). Without this the
        // chart clamps to 15:30 and every evening MCX tick falls outside the
        // session → TradingView ignores it and the chart freezes while the order
        // panel keeps ticking. Detect MCX by the contract root and widen it.
        const isMcxSym = (() => {
            const u = String(displayName || '').toUpperCase();
            const MCX_ROOTS = ['CRUDEOIL', 'GOLD', 'SILVER', 'COPPER', 'NATURALGAS', 'NATGAS',
                'ZINC', 'ALUMINI', 'LEAD', 'NICKEL', 'MENTHAOIL', 'COTTON'];
            return MCX_ROOTS.some(r => u.startsWith(r));
        })();
        let session = '24x7';
        if (dataSource === 'zerodha') {
            session = isMcxSym ? '0900-2330' : '0915-1530';
        }

        const symbolInfo = {
            name: symbolName,
            full_name: symbolName,
            description: displayName,
            type: 'crypto',
            session,
            timezone: 'Asia/Kolkata',
            exchange: 'MARKET',
            minmov: 1,
            pricescale: getPricescale(displayName),
            has_intraday: true,
            visible_plots_set: 'ohlcv',
            has_weekly_and_monthly: false,
            supported_resolutions: configurationData.supported_resolutions,
            volume_precision: 2,
            data_status: 'streaming',
        };
        setTimeout(() => onSymbolResolvedCallback(symbolInfo));
    },

    getBars: async (symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) => {
        const { from, to, firstDataRequest } = periodParams;
        const symbol = symbolInfo.name;
        
        let baseSymbol = symbol;
        let dataSource = 'zerodha';
        
        if (symbol.includes('|')) {
            const parts = symbol.split('|');
            dataSource = parts[0];
            baseSymbol = parts[1];
        }

        try {
            const mapping = TV_TO_API_INTERVALS[resolution] || TV_TO_API_INTERVALS['60'];
            let url;

            if (dataSource === 'zerodha') {
                // First paint: widen `from` so the chart opens with real history
                // instead of just today's candles (TV's initial intraday window
                // is only ~1 day). Backward pagination keeps TV's own `from`.
                let zFrom = from;
                if (firstDataRequest) {
                    const lookback = ZERODHA_FIRST_LOOKBACK_SEC[resolution] || ZERODHA_FIRST_LOOKBACK_SEC['5'];
                    zFrom = Math.min(from, to - lookback);
                }
                url = `${API_URL}/api/zerodha/historical/${encodeURIComponent(baseSymbol)}?interval=${mapping.zerodha}&from=${zFrom}&to=${to}`;
            } else if (dataSource === 'metaapi') {
                url = `${API_URL}/api/metaapi/historical/${encodeURIComponent(baseSymbol)}?timeframe=${mapping.meta}&limit=500&startTime=${from}`;
            } else if (dataSource === 'delta') {
                const lb = DELTA_LOOKBACK_SEC[resolution] || 604800;
                url = `${API_URL}/api/delta/history/${encodeURIComponent(baseSymbol)}?resolution=${mapping.delta}&lookbackSec=${lb}`;
            }

            // Client-side timeout: 15 seconds
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            let res;
            try {
                res = await fetch(url, { signal: controller.signal });
            } catch (fetchErr) {
                clearTimeout(timeoutId);
                if (fetchErr.name === 'AbortError') {
                    console.warn(`getBars timeout for ${baseSymbol} (${dataSource})`);
                    emitSyntheticOrNoData(symbol, resolution, from, to, firstDataRequest, onHistoryCallback);
                    return;
                }
                throw fetchErr;
            }
            clearTimeout(timeoutId);

            const data = await res.json();

            const rawCandles = Array.isArray(data?.candles) ? data.candles : [];
            const bars = rawCandles
                .map((c) => {
                    const timeMs = candleOpenTimeToMs(c.time);
                    if (timeMs == null) return null;
                    return {
                        time: timeMs,
                        open: c.open,
                        high: c.high,
                        low: c.low,
                        close: c.close,
                        volume: c.volume || 0
                    };
                })
                .filter(Boolean)
                .filter(b => Number.isFinite(b.open) && Number.isFinite(b.close) && b.open > 0 && b.close > 0)
                .sort((a, b) => a.time - b.time);

            if (data && data.success && bars.length > 0) {
                const resSeconds = (TV_TO_API_INTERVALS[resolution] || TV_TO_API_INTERVALS['60']).seconds;
                const whole = fillSessionGaps(bars, resSeconds, symbolInfo.session);
                if (whole.length) {
                    lastHistoryBar.set(historyKey(symbol, resolution), whole[whole.length - 1]);
                }
                if (firstDataRequest) {
                    // First paint: hand TradingView ALL bars regardless of the
                    // requested window — TV clips the viewport itself. The old
                    // from/to filter threw away the whole result for options
                    // that only started trading today (bars exist but only from
                    // today, outside TV's initial multi-day request) → blank chart.
                    onHistoryCallback(whole, { noData: false });
                    return;
                }
                // Backward pagination: only return bars inside the requested
                // window; signal noData when TV scrolled past our history so it
                // stops looping.
                const fromMs = from * 1000;
                const toMs = to * 1000;
                const inRange = whole.filter(b => b.time >= fromMs && b.time <= toMs);
                if (inRange.length > 0) {
                    onHistoryCallback(inRange, { noData: false });
                } else {
                    onHistoryCallback([], { noData: true });
                }
                return;
            }

            // Backend returned zero history — synthesise candles from the live
            // quote so the chart shows price action instead of a blank pane.
            console.warn(`getBars: no history for ${baseSymbol} (${dataSource}), using live-quote fallback:`, data?.error);
            emitSyntheticOrNoData(symbol, resolution, from, to, firstDataRequest, onHistoryCallback);
        } catch (error) {
            console.error('getBars error:', error);
            emitSyntheticOrNoData(symbol, resolution, from, to, firstDataRequest, onHistoryCallback);
        }
    },

    subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscribeUID, onResetCacheNeededCallback) => {
        // Pick up where the history ended so the first live tick can bridge the
        // quiet stretch in between rather than leaving a hole there.
        const seed = lastHistoryBar.get(historyKey(symbolInfo.name, resolution));
        subscriptions.set(subscribeUID, {
            symbol: symbolInfo.name,
            resolution,
            session: symbolInfo.session,
            lastBarTime: seed ? seed.time : null,
            lastBarOpen: seed ? seed.open : null,
            lastBarHigh: seed ? seed.high : null,
            lastBarLow: seed ? seed.low : null,
            lastBarClose: seed ? seed.close : null,
            callback: onRealtimeCallback
        });
        startHeartbeat();
    },

    unsubscribeBars: (subscribeUID) => {
        subscriptions.delete(subscribeUID);
        stopHeartbeatIfIdle();
    },

    // Set which price side the chart shows: 'bid' (for Sell view) or 'ask' (for Buy view)
    setPriceSide: (side) => {
        currentPriceSide = side === 'ask' ? 'ask' : 'bid';
    },

    // CUSTOM: Allow external components to feed live ticks
    updateLivePrice: (symbolName, livePriceObj) => {
        let targetSymbol = symbolName;

        // Cache the latest quote (keyed by the full "dataSource|SYMBOL" key,
        // same key getBars uses) BEFORE the no-subscriber early return — the
        // synthetic-history fallback runs inside getBars, which fires before
        // subscribeBars registers a subscription, so it needs the quote here.
        if (livePriceObj) {
            latestQuotes.set(symbolName, {
                bid: livePriceObj.bid,
                ask: livePriceObj.ask,
                lastPrice: livePriceObj.lastPrice ?? livePriceObj.last_price,
                last_price: livePriceObj.last_price ?? livePriceObj.lastPrice,
            });
        }

        const subs = Array.from(subscriptions.values()).filter(sub => 
            sub.symbol === targetSymbol || sub.symbol.endsWith(`|${targetSymbol}`)
        );

        if (subs.length === 0) return;

        const b = livePriceObj.bid || 0;
        const a = livePriceObj.ask || 0;
        
        // Use the price matching the selected order side
        let chartPrice;
        if (currentPriceSide === 'ask') {
            chartPrice = a > 0 ? a : (livePriceObj.last_price || b || 0);
        } else {
            chartPrice = b > 0 ? b : (livePriceObj.last_price || a || 0);
        }

        if (!chartPrice) return;

        const now = Date.now();

        subs.forEach(sub => {
            const resData = TV_TO_API_INTERVALS[sub.resolution] || TV_TO_API_INTERVALS['60'];
            const resMillis = resData.seconds * 1000;
            const bucketTime = Math.floor(now / resMillis) * resMillis;

            if (sub.lastBarTime === bucketTime) {
                // Update existing bar
                sub.callback({
                    time: bucketTime,
                    open: sub.lastBarOpen || chartPrice,
                    high: Math.max(sub.lastBarHigh || chartPrice, chartPrice),
                    low: Math.min(sub.lastBarLow || chartPrice, chartPrice),
                    close: chartPrice,
                    volume: 0
                });
                sub.lastBarHigh = Math.max(sub.lastBarHigh || chartPrice, chartPrice);
                sub.lastBarLow = Math.min(sub.lastBarLow || chartPrice, chartPrice);
                sub.lastBarClose = chartPrice;
            } else {
                // Nothing traded for a while: hand TradingView the buckets it
                // never saw, flat at the last close, before opening the new bar.
                // Without this the series simply jumps and the chart shows the
                // hole users were reporting.
                const win = parseSession(sub.session);
                if (win && sub.lastBarTime && bucketTime > sub.lastBarTime + resMillis) {
                    const prev = {
                        time: sub.lastBarTime,
                        close: sub.lastBarClose != null ? sub.lastBarClose : chartPrice,
                    };
                    for (const b of bridge(prev, bucketTime, resMillis, win, MAX_FILLED_BARS)) {
                        sub.callback(b);
                    }
                }

                // New bar
                sub.lastBarTime = bucketTime;
                sub.lastBarOpen = chartPrice;
                sub.lastBarHigh = chartPrice;
                sub.lastBarLow = chartPrice;
                sub.lastBarClose = chartPrice;
                sub.callback({
                    time: bucketTime,
                    open: chartPrice,
                    high: chartPrice,
                    low: chartPrice,
                    close: chartPrice,
                    volume: 0
                });
            }
        });
    }
};
