/**
 * MetaApi Market Data API — historical OHLC (separate host from MT client API).
 */

const METAAPI_MARKET_DATA_URL =
  process.env.METAAPI_MARKET_DATA_URL || 'https://mt-market-data-client-api-v1.london.agiliumtrade.ai';
const METAAPI_BASE_URL =
  (process.env.METAAPI_BASE_URL || 'https://mt-client-api-v1.new-york.agiliumtrade.ai').replace(/\/$/, '');
const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID || '';
const METAAPI_AUTH_TOKEN = process.env.METAAPI_AUTH_TOKEN || '';

const MARKET_DATA_REQUEST_MS = Math.min(
  120000,
  Math.max(5000, parseInt(process.env.METAAPI_MARKET_DATA_TIMEOUT_MS || '20000', 10) || 20000)
);

const BUILTIN_CHART_SYMBOL_ALIASES = {
  XAUUSD: ['GOLD', 'XAUUSD.', 'XAUUSD-', 'XAUUSD#', 'XAUUSDm', 'XAUUSD.i', 'GOLD.', 'XAUUSDpro'],
  XAGUSD: ['SILVER', 'XAGUSD.', 'XAGUSDm', 'XAGUSD-', 'SILVER.'],
  XPTUSD: ['PLATINUM', 'XPTUSD.', 'XPTUSDm'],
  XPDUSD: ['PALLADIUM', 'XPDUSD.', 'XPDUSDm'],
  USOIL: ['WTI', 'USOIL.', 'XTIUSD', 'CL-OIL', 'CRUDE', 'WTIUSD'],
  UKOIL: ['BRENT', 'UKOIL.', 'XBRUSD', 'BRENTUSD'],
  US30: ['DJ30', 'US30.', 'WS30', 'DOW30', 'DJIUSD'],
  US100: ['NAS100', 'US100.', 'NDX', 'USTEC', 'NAS100.'],
  US500: ['SPX500', 'US500.', 'SP500', 'SPX', 'SP500USD'],
  BTCUSD: ['BTCUSD.', 'BTCUSDm', 'BTCUSD#', 'BTCUSD.i'],
  ETHUSD: ['ETHUSD.', 'ETHUSDm', 'ETHUSD#', 'ETHUSD.i']
};

function parseEnvChartAliases() {
  const raw = process.env.METAAPI_CHART_SYMBOL_ALIASES;
  if (!raw || typeof raw !== 'string') return {};
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === 'object' && !Array.isArray(o)) return o;
  } catch (_) {
    /* ignore */
  }
  return {};
}

function stripBrokerSuffix(sym) {
  return String(sym || '')
    .trim()
    .replace(/\.[a-zA-Z0-9]+$/i, '')
    .toUpperCase();
}

/**
 * Names as they exist on the MT account (e.g. EURUSD.c). Market-data API often rejects plain "EURUSD".
 */
async function fetchBrokerSymbolNamesMatching(requestedSymbol) {
  if (!METAAPI_AUTH_TOKEN || !METAAPI_ACCOUNT_ID) return [];

  const raw = String(requestedSymbol || '').trim();
  const upper = raw.toUpperCase();
  const base = stripBrokerSuffix(upper);

  const symCtrl = new AbortController();
  const symTo = setTimeout(() => symCtrl.abort(), Math.min(MARKET_DATA_REQUEST_MS, 15000));
  try {
    const listRes = await fetch(
      `${METAAPI_BASE_URL}/users/current/accounts/${encodeURIComponent(METAAPI_ACCOUNT_ID)}/symbols`,
      {
        headers: { 'auth-token': METAAPI_AUTH_TOKEN, Accept: 'application/json' },
        signal: symCtrl.signal
      }
    );
    if (!listRes.ok) return [];
    const symbols = await listRes.json();
    if (!Array.isArray(symbols)) return [];

    const exact = [];
    const dotSuffix = [];
    const sameBase = [];

    for (const s of symbols) {
      const name = (s.symbol || s.name || '').toString().trim();
      if (!name) continue;
      const nu = name.toUpperCase();
      if (nu === upper) {
        exact.push(name);
        continue;
      }
      if (base.length >= 4 && nu.startsWith(`${base}.`)) {
        dotSuffix.push(name);
        continue;
      }
      if (base.length >= 4 && stripBrokerSuffix(nu) === base) {
        sameBase.push(name);
      }
    }

    const ordered = [...new Set([...exact, ...dotSuffix, ...sameBase])];
    return ordered.slice(0, 24);
  } catch {
    return [];
  } finally {
    clearTimeout(symTo);
  }
}

function getChartSymbolCandidates(symbol) {
  const u = String(symbol || '').trim().toUpperCase();
  const out = [];
  const add = (s) => {
    const x = String(s || '').trim();
    if (x && !out.includes(x)) out.push(x);
  };
  add(u);
  const builtin = BUILTIN_CHART_SYMBOL_ALIASES[u];
  if (Array.isArray(builtin)) builtin.forEach(add);
  const envMap = parseEnvChartAliases();
  const extra = envMap[u] || envMap[symbol];
  if (Array.isArray(extra)) extra.forEach(add);
  return out;
}

function toUnixSeconds(t) {
  if (t == null) return null;
  if (typeof t === 'number') {
    return t > 1e12 ? Math.floor(t / 1000) : Math.floor(t);
  }
  const d = new Date(t);
  const s = Math.floor(d.getTime() / 1000);
  return Number.isNaN(s) ? null : s;
}

function normalizeCandle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const time = toUnixSeconds(raw.time ?? raw.timeUtc ?? raw.t ?? raw.timestamp);
  if (time == null) return null;
  const open = Number(raw.open ?? raw.o);
  const high = Number(raw.high ?? raw.h);
  const low = Number(raw.low ?? raw.l);
  const close = Number(raw.close ?? raw.c);
  const volume = Number(raw.volume ?? raw.tickVolume ?? raw.realVolume ?? raw.v ?? 0);
  if (![open, high, low, close].every((n) => Number.isFinite(n))) return null;
  return { time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
}

function bodyIndicatesFailure(data) {
  if (!data || typeof data !== 'object') return false;
  if (Array.isArray(data)) return false;
  if (data.error && typeof data.error === 'string') return true;
  if (data.message && typeof data.message === 'string' && /does not exist|not found|invalid symbol|unknown symbol/i.test(data.message)) {
    return true;
  }
  if (data.id && data.error && data.message) return true;
  return false;
}

async function fetchHistoricalCandlesOnce(symbol, timeframe, opts = {}) {
  const limit = Math.min(1000, Math.max(1, Number(opts.limit) || 500));
  const path = `${METAAPI_MARKET_DATA_URL.replace(/\/$/, '')}/users/current/accounts/${encodeURIComponent(METAAPI_ACCOUNT_ID)}/historical-market-data/symbols/${encodeURIComponent(symbol)}/timeframes/${encodeURIComponent(timeframe)}/candles`;
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (opts.startTime != null && opts.startTime !== '') {
    const n = Number(opts.startTime);
    const iso = Number.isFinite(n)
      ? new Date(n > 1e12 ? Math.floor(n) : Math.floor(n * 1000)).toISOString()
      : String(opts.startTime);
    qs.set('startTime', iso);
  }

  const url = `${path}?${qs.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MARKET_DATA_REQUEST_MS);
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'auth-token': METAAPI_AUTH_TOKEN,
        Accept: 'application/json'
      },
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        success: false,
        error: `MetaApi market data: request timed out (${MARKET_DATA_REQUEST_MS / 1000}s)`,
        status: 408,
        symbol
      };
    }
    throw err;
  }
  clearTimeout(timeoutId);

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return { success: false, error: 'MetaApi market data: invalid JSON', status: res.status, symbol };
  }

  if (!res.ok) {
    const msg = data?.message || data?.error || text?.slice(0, 240) || res.statusText;
    return { success: false, error: String(msg), status: res.status, symbol };
  }

  if (bodyIndicatesFailure(data)) {
    const msg = data?.message || data?.error || 'MetaApi market data request failed';
    return { success: false, error: String(msg), status: res.status, symbol };
  }

  let list = data;
  if (data && Array.isArray(data.candles)) list = data.candles;
  else if (data && Array.isArray(data)) list = data;
  else if (data && Array.isArray(data.history)) list = data.history;
  else if (!Array.isArray(list)) list = [];

  const candles = [];
  for (const row of list) {
    const c = normalizeCandle(row);
    if (c) candles.push(c);
  }
  candles.sort((a, b) => a.time - b.time);

  return { success: true, candles, symbol };
}

async function fetchHistoricalCandles(symbol, timeframe, opts = {}) {
  if (!METAAPI_AUTH_TOKEN || !METAAPI_ACCOUNT_ID) {
    return { success: false, error: 'MetaApi market data: METAAPI_AUTH_TOKEN and METAAPI_ACCOUNT_ID required' };
  }

  const requestedNorm = String(symbol || '').trim().toUpperCase();
  const brokerNames = await fetchBrokerSymbolNamesMatching(symbol);
  const generic = getChartSymbolCandidates(symbol);
  const genericOnly = generic.filter((g) => !brokerNames.includes(g));

  const errors = [];

  for (const cand of brokerNames) {
    const r = await fetchHistoricalCandlesOnce(cand, timeframe, opts);
    if (r.success && r.candles?.length > 0) {
      return {
        success: true,
        candles: r.candles,
        resolvedSymbol: cand.toUpperCase() !== requestedNorm ? cand : undefined
      };
    }
    if (r.error) errors.push(`${cand}: ${r.error}`);
  }

  const results = await Promise.allSettled(
    genericOnly.map((cand) => fetchHistoricalCandlesOnce(cand, timeframe, opts))
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const cand = genericOnly[i];
    if (r.status === 'fulfilled' && r.value.success && r.value.candles?.length > 0) {
      return {
        success: true,
        candles: r.value.candles,
        resolvedSymbol: cand.toUpperCase() !== requestedNorm ? cand : undefined
      };
    }
    if (r.status === 'fulfilled' && r.value.error) {
      errors.push(`${cand}: ${r.value.error}`);
    } else if (r.status === 'rejected') {
      errors.push(`${cand}: ${r.reason?.message || 'unknown error'}`);
    }
  }

  const tried = [...brokerNames, ...genericOnly];
  const first = errors[0] || 'No candle data for any symbol variant';
  return {
    success: false,
    error: `MetaApi market data: ${first}`,
    tried,
    details: errors
  };
}

module.exports = {
  fetchHistoricalCandles,
  fetchBrokerSymbolNamesMatching,
  METAAPI_MARKET_DATA_URL
};
