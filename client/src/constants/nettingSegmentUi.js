/**
 * Canonical netting segment codes ↔ UI watchlist category labels (user app + admin naming).
 * COMMODITIES displays as "Com" per product spec.
 */
export const NETTING_SEGMENT_CODE_TO_CATEGORY = {
  NSE_EQ: 'NSE EQ',
  NSE_FUT: 'NSE FUT',
  NSE_OPT: 'NSE OPT',
  BSE_EQ: 'BSE EQ',
  BSE_FUT: 'BSE FUT',
  BSE_OPT: 'BSE OPT',
  MCX_FUT: 'MCX FUT',
  MCX_OPT: 'MCX OPT',
  FOREX: 'Forex',
  STOCKS: 'Stocks (International)',
  CRYPTO_PERPETUAL: 'Crypto Perpetual',
  CRYPTO_OPTIONS: 'Crypto Options',
  INDICES: 'Indices',
  COMMODITIES: 'Commodities'
};

/** Sidebar / "All symbols" order (matches admin segment table). */
export const ORDERED_WATCHLIST_CATEGORY_KEYS = [
  'NSE EQ',
  'NSE FUT',
  'NSE OPT',
  'BSE EQ',
  'BSE FUT',
  'BSE OPT',
  'MCX FUT',
  'MCX OPT',
  'Forex',
  'Stocks (International)',
  'Crypto Perpetual',
  'Crypto Options',
  'Indices',
  'Commodities'
];

/** Watchlist category label → netting API segment name */
export const WATCHLIST_CATEGORY_TO_SEGMENT_CODE = Object.fromEntries(
  Object.entries(NETTING_SEGMENT_CODE_TO_CATEGORY).map(([code, cat]) => [cat, code])
);
