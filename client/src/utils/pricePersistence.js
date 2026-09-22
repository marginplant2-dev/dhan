/** Treat as a valid positive quote for merge decisions */
export function posNum(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * If the incoming update has no usable bid/ask/last, keep numeric fields from prev.
 * Used for MetaAPI / Delta socket batches so a dead feed does not zero the UI.
 */
export function mergeQuoteObject(prev, next) {
  if (!next || typeof next !== 'object') return prev;
  if (!prev || typeof prev !== 'object') return next;
  const nextOk =
    posNum(next.bid) ||
    posNum(next.ask) ||
    posNum(next.last) ||
    posNum(next.ltp) ||
    posNum(next.lastPrice) ||
    posNum(next.mark_price);
  if (nextOk) return { ...prev, ...next };
  const prevOk =
    posNum(prev.bid) ||
    posNum(prev.ask) ||
    posNum(prev.last) ||
    posNum(prev.ltp) ||
    posNum(prev.lastPrice) ||
    posNum(prev.mark_price);
  if (prevOk) return { ...next, ...prev };
  return { ...prev, ...next };
}

export function zerodhaTickLp(t) {
  if (!t) return 0;
  return posNum(t.last_price ?? t.lastPrice ?? t.ohlc?.close ?? t.ohlc?.last_price);
}

function zerodhaTickLooksLtpOnlyFlatBook(t) {
  const lp = posNum(t.lastPrice ?? t.last_price ?? t.ltp);
  const b = posNum(t.bid);
  const a = posNum(t.ask);
  if (!lp || !b || !a) return false;
  const eps = 0.005; // ~half NSE equity tick; avoids float noise on INR
  const sameSide = Math.abs(b - a) < eps;
  const bothLtp = Math.abs(b - lp) < eps && Math.abs(a - lp) < eps;
  return sameSide && bothLtp;
}

export function mergeZerodhaTick(prev, next) {
  if (!next) return prev;
  if (!prev) return next;
  if (zerodhaTickLp(next)) {
    const merged = { ...prev, ...next };
    const prevSpread = Math.abs(posNum(prev.ask) - posNum(prev.bid));
    if (prevSpread > 0.005 && zerodhaTickLooksLtpOnlyFlatBook(merged)) {
      merged.bid = prev.bid;
      merged.ask = prev.ask;
    }
    return merged;
  }
  if (zerodhaTickLp(prev)) return { ...next, ...prev };
  return { ...prev, ...next };
}

/** Match MetaAPI socket keys: plain ticker vs broker suffix (AAPL.c) */
export function resolveMetaapiLiveQuote(livePrices, symbol) {
  if (!livePrices || !symbol) return null;
  const u = String(symbol).toUpperCase();
  const tryKeys = [symbol, u, `${u}.c`, `${u}.i`, `${u}.m`, `${u}.raw`, `${u}a`];
  for (const k of tryKeys) {
    const lp = livePrices[k];
    if (lp && (Number(lp.bid) > 0 || Number(lp.ask) > 0)) return lp;
  }
  const hit = Object.keys(livePrices).find(
    (k) => String(k).replace(/\.[a-zA-Z0-9]+$/i, '').toUpperCase() === u
  );
  return hit ? livePrices[hit] : null;
}
