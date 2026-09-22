/** Match Market watchlist / search modal wording (same as Netting segment displayName). */
export const INDIAN_SEGMENT_CODE_TO_LABEL = {
  NSE_EQ: 'NSE EQ',
  NSE_FUT: 'NSE FUT',
  NSE_OPT: 'NSE OPT',
  BSE_EQ: 'BSE EQ',
  BSE_FUT: 'BSE FUT',
  BSE_OPT: 'BSE OPT',
  MCX_FUT: 'MCX FUT',
  MCX_OPT: 'MCX OPT'
};

export function formatIndianSegmentCode(code) {
  if (!code) return '';
  return INDIAN_SEGMENT_CODE_TO_LABEL[code] || code;
}

/** NSE/BSE cash equity — UI uses "quantity/shares", not "lots" */
export function isIndianCashEquitySegmentCode(code) {
  const c = String(code || '').trim().toUpperCase();
  return c === 'NSE_EQ' || c === 'BSE_EQ';
}
