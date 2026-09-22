/**
 * Canonical UI labels for Indian netting/segment rows (match Market watchlist: "NSE EQ", "NSE FUT", …).
 * Internal `name` keys stay e.g. NSE_EQ — only `displayName` / admin copy uses these strings.
 */
const CANONICAL_INDIAN_DISPLAY = {
  NSE_EQ: 'NSE EQ',
  NSE_FUT: 'NSE FUT',
  NSE_OPT: 'NSE OPT',
  BSE_FUT: 'BSE FUT',
  BSE_OPT: 'BSE OPT',
  MCX_FUT: 'MCX FUT',
  MCX_OPT: 'MCX OPT'
};

/** Pairs [segmentName, oldDisplayName, newDisplayName] for idempotent migration */
const INDIAN_DISPLAY_RENAMES = [
  ['NSE_EQ', 'NSE Equity', 'NSE EQ'],
  ['NSE_FUT', 'NSE Futures', 'NSE FUT'],
  ['NSE_OPT', 'NSE Options', 'NSE OPT'],
  ['BSE_FUT', 'BSE Futures', 'BSE FUT'],
  ['BSE_OPT', 'BSE Options', 'BSE OPT'],
  ['MCX_FUT', 'MCX Futures', 'MCX FUT'],
  ['MCX_OPT', 'MCX Options', 'MCX OPT']
];

async function migrateIndianSegmentDisplayNames(Model) {
  for (const [name, from, to] of INDIAN_DISPLAY_RENAMES) {
    const res = await Model.updateMany({ name, displayName: from }, { $set: { displayName: to } });
    if (res.modifiedCount > 0) {
      console.log(`[Segments] Updated displayName for ${name}: "${from}" → "${to}" (${res.modifiedCount} doc(s))`);
    }
  }
}

/** Exchange-level market timing UI (one row per Zerodha exchange code) */
const MARKET_CONTROL_RENAMES = [
  { market: 'NSE', from: 'NSE Equity', to: 'NSE EQ' },
  { market: 'NFO', from: 'NSE F&O', to: 'NSE FUT / OPT' },
  { market: 'BSE', from: 'BSE Equity', to: 'BSE EQ' },
  { market: 'BFO', from: 'BSE F&O', to: 'BSE FUT / OPT' },
  { market: 'MCX', from: 'MCX Commodity', to: 'MCX FUT / OPT' }
];

async function migrateMarketControlDisplayNames(MarketControl) {
  for (const { market, from, to } of MARKET_CONTROL_RENAMES) {
    const res = await MarketControl.updateMany({ market, displayName: from }, { $set: { displayName: to } });
    if (res.modifiedCount > 0) {
      console.log(`[MarketControl] ${market}: "${from}" → "${to}" (${res.modifiedCount})`);
    }
  }
}

module.exports = {
  CANONICAL_INDIAN_DISPLAY,
  INDIAN_DISPLAY_RENAMES,
  migrateIndianSegmentDisplayNames,
  migrateMarketControlDisplayNames,
  MARKET_CONTROL_RENAMES
};
