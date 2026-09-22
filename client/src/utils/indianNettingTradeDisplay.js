/**
 * Indian cash / F&O netting: activity history stores commission in USD (wallet) and commissionInr.
 * Legacy rows may have `profit` computed with mixed INR/USD — gross(price) − fees in INR matches the commission column.
 */

export function isIndianSymbolLikely(sym) {
  const s = String(sym || '').trim();
  if (!s || s.length > 22) return false;
  if (s.includes('/')) return false;
  const fx = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'BTC', 'ETH', 'XAU', 'XAG', 'XPT', 'XPD'];
  if (fx.some((x) => s.includes(x))) return false;
  return true;
}

/**
 * Gross P/L in INR from entry/close only (netting full close row).
 * `trade.side` is the **original position side** (buy = original was long, sell = original was short).
 * Needs reliable contract count: prefer `quantity`, else `volume * lotSize`. If those are missing on legacy
 * rows, return null so the UI uses server `profit` (which used `NettingPosition.quantity`).
 */
export function grossIndianNettingCloseInr(trade) {
  const vol = Number(trade.volume);
  const lot = Number(trade.lotSize);
  let qty;
  if (trade.quantity != null && trade.quantity !== '' && Number(trade.quantity) > 0) {
    qty = Number(trade.quantity);
  } else if (Number.isFinite(vol) && vol > 0 && Number.isFinite(lot) && lot > 0) {
    qty = vol * lot;
  } else {
    return null;
  }
  const entry = Number(trade.entryPrice);
  const close = Number(trade.closePrice);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(entry) || !Number.isFinite(close)) {
    return null;
  }
  const side = String(trade.side || '').toLowerCase();
  // side=buy → original was long → P/L = (close − entry) × qty
  // side=sell → original was short → P/L = (entry − close) × qty
  if (side === 'buy') return (close - entry) * qty;
  if (side === 'sell') return (entry - close) * qty;
  return null;
}

/** Total brokerage for the round trip in INR (for display / net P/L). */
export function commissionInrForTrade(trade, effectiveRate) {
  const rate = Number(effectiveRate) || 83;
  const usd = Number(trade.commission) || 0;
  const inr = Number(trade.commissionInr) || 0;
  if (inr > 0) return inr;
  if (usd > 0) return usd * rate;
  return 0;
}

/**
 * Net P/L in INR for a full Indian netting close: gross − commission(INR) + swap(USD→INR).
 * Returns null if not applicable.
 */
export function netProfitInrIndianNettingClose(trade, effectiveRate) {
  if (!trade) return null;
  const isProp = trade.mode === 'prop' || trade.accountContext === 'challenge';
  if (!isProp && (trade.mode !== 'netting' || trade.type !== 'close')) return null;
  if (!isIndianSymbolLikely(trade.symbol)) return null;
  const gross = grossIndianNettingCloseInr(trade);
  if (gross == null) return null;
  const rate = Number(effectiveRate) || 83;
  const commInr = commissionInrForTrade(trade, rate);
  const swapUsd = Number(trade.swap) || 0;
  const swapInr = swapUsd * rate;
  return gross - commInr + swapInr;
}
