/**
 * Yahoo Finance historical candles fallback.
 * Used when MetaAPI market-data endpoint is unavailable.
 */

// Map internal symbols to Yahoo Finance tickers
const YAHOO_SYMBOL_MAP = {
  XAUUSD: 'GC=F',
  XAGUSD: 'SI=F',
  XPTUSD: 'PL=F',
  XPDUSD: 'PA=F',
  BTCUSD: 'BTC-USD',
  ETHUSD: 'ETH-USD',
  LTCUSD: 'LTC-USD',
  XRPUSD: 'XRP-USD',
  DOGEUSD: 'DOGE-USD',
  SOLUSD: 'SOL-USD',
  EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X',
  USDJPY: 'USDJPY=X',
  AUDUSD: 'AUDUSD=X',
  USDCAD: 'USDCAD=X',
  USDCHF: 'USDCHF=X',
  NZDUSD: 'NZDUSD=X',
  EURGBP: 'EURGBP=X',
  EURJPY: 'EURJPY=X',
  GBPJPY: 'GBPJPY=X',
  US30: 'YM=F',
  US100: 'NQ=F',
  US500: 'ES=F',
  USOIL: 'CL=F',
  UKOIL: 'BZ=F',
};

// Map our timeframes to Yahoo intervals (ranges are Yahoo max allowed)
const TIMEFRAME_MAP = {
  '1m': { interval: '1m', range: '7d' },    // Yahoo max for 1m is 7 days
  '5m': { interval: '5m', range: '60d' },   // Yahoo max for 5m is 60 days
  '15m': { interval: '15m', range: '60d' },
  '1h': { interval: '1h', range: '2y' },    // Yahoo max for 1h is ~2 years
  '1d': { interval: '1d', range: '10y' },
};

function getYahooTicker(symbol) {
  const upper = String(symbol || '').trim().toUpperCase();
  if (YAHOO_SYMBOL_MAP[upper]) return YAHOO_SYMBOL_MAP[upper];

  // Try common patterns
  // Forex: 6-letter pairs → append =X
  if (/^[A-Z]{6}$/.test(upper) && !upper.includes('USD')) {
    return `${upper}=X`;
  }
  // Crypto ending in USD
  if (upper.endsWith('USD') && upper.length <= 10) {
    const base = upper.replace(/USD$/, '');
    return `${base}-USD`;
  }

  return null; // No mapping available
}

async function fetchYahooCandles(symbol, timeframe, opts = {}) {
  const ticker = getYahooTicker(symbol);
  if (!ticker) {
    return { success: false, error: `No Yahoo Finance mapping for ${symbol}` };
  }

  const tf = TIMEFRAME_MAP[timeframe] || TIMEFRAME_MAP['1h'];

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${tf.interval}&range=${tf.range}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { success: false, error: 'Yahoo Finance request timed out' };
    }
    return { success: false, error: err.message };
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    return { success: false, error: `Yahoo Finance HTTP ${res.status}` };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { success: false, error: 'Yahoo Finance: invalid JSON' };
  }

  const result = data?.chart?.result?.[0];
  if (!result) {
    return { success: false, error: 'Yahoo Finance: no result data' };
  }

  const timestamps = result.timestamp;
  const quote = result.indicators?.quote?.[0];
  if (!timestamps || !quote) {
    return { success: false, error: 'Yahoo Finance: missing quote data' };
  }

  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    const v = quote.volume?.[i] || 0;
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({
      time: timestamps[i],
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v,
    });
  }

  if (candles.length === 0) {
    return { success: false, error: 'Yahoo Finance: no valid candles' };
  }

  candles.sort((a, b) => a.time - b.time);
  return { success: true, candles, source: 'yahoo', resolvedTicker: ticker };
}

module.exports = {
  fetchYahooCandles,
  getYahooTicker,
  YAHOO_SYMBOL_MAP,
};
