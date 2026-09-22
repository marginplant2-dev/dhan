/**
 * Broker symbols often differ only by a suffix (e.g. XAUUSD vs XAUUSD.c on MetaTrader/MetaAPI).
 * Strip the trailing segment to compare the same underlying. Matches server metaApiStreaming.stripBrokerSuffix.
 */
export function stripBrokerInstrumentSuffix(sym) {
  if (!sym) return '';
  return String(sym).replace(/\.[a-zA-Z0-9]+$/, '').toUpperCase();
}

function brokerSymbolPreferenceRank(sym) {
  const s = String(sym);
  const hasSuffix = /\.[a-zA-Z0-9]+$/.test(s);
  return (hasSuffix ? 1 << 20 : 0) + s.length;
}

export function pickPreferredBrokerSymbol(a, b) {
  const ra = brokerSymbolPreferenceRank(a);
  const rb = brokerSymbolPreferenceRank(b);
  if (ra !== rb) return ra < rb ? a : b;
  return a <= b ? a : b;
}

export function canonicalBrokerSymbolForBase(symbols, base) {
  const upperBase = String(base).toUpperCase();
  const same = symbols.filter((s) => stripBrokerInstrumentSuffix(s) === upperBase);
  if (same.length === 0) return null;
  return same.reduce((best, s) => pickPreferredBrokerSymbol(best, s));
}

/**
 * One row per underlying: keeps order of first occurrence, symbol shown is the preferred broker name.
 */
export function mergeWatchlistBrokerVariants(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) return symbols || [];
  const order = [];
  const seen = new Set();
  for (const s of symbols) {
    const b = stripBrokerInstrumentSuffix(s);
    if (!seen.has(b)) {
      seen.add(b);
      order.push(b);
    }
  }
  return order.map((b) => canonicalBrokerSymbolForBase(symbols, b)).filter(Boolean);
}

export function isBrokerVariantInWatchlist(watchlist, symbol) {
  if (!Array.isArray(watchlist) || !symbol) return false;
  const base = stripBrokerInstrumentSuffix(symbol);
  return watchlist.some((s) => stripBrokerInstrumentSuffix(s) === base);
}
