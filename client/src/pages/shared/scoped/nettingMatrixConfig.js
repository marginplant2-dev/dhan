/**
 * Config for the scoped segment matrix table. Subset of the admin's
 * NettingSegmentSettings fields + categories — kept in sync manually.
 */

export const NETTING_SEGMENTS = [
  { code: 'NSE_EQ', name: 'NSE EQ', lotApplies: false, qtyApplies: true, optionApplies: false, expiryHoldApplies: false, futureApplies: false },
  { code: 'NSE_FUT', name: 'NSE FUT', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: true, futureApplies: true },
  { code: 'NSE_OPT', name: 'NSE OPT', lotApplies: true, qtyApplies: false, optionApplies: true, expiryHoldApplies: true, futureApplies: false },
  { code: 'BSE_EQ', name: 'BSE EQ', lotApplies: false, qtyApplies: true, optionApplies: false, expiryHoldApplies: false, futureApplies: false },
  { code: 'BSE_FUT', name: 'BSE FUT', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: true, futureApplies: true },
  { code: 'BSE_OPT', name: 'BSE OPT', lotApplies: true, qtyApplies: false, optionApplies: true, expiryHoldApplies: true, futureApplies: false },
  { code: 'MCX_FUT', name: 'MCX FUT', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: true, futureApplies: true },
  { code: 'MCX_OPT', name: 'MCX OPT', lotApplies: true, qtyApplies: false, optionApplies: true, expiryHoldApplies: true, futureApplies: false },
  { code: 'FOREX', name: 'Forex', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: false, futureApplies: false },
  { code: 'STOCKS', name: 'Stocks', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: false, futureApplies: false },
  { code: 'CRYPTO_PERPETUAL', name: 'Crypto Perpetual', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: false, futureApplies: false },
  { code: 'CRYPTO_OPTIONS', name: 'Crypto Options', lotApplies: true, qtyApplies: false, optionApplies: true, expiryHoldApplies: true, futureApplies: false },
  { code: 'INDICES', name: 'Indices', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: false, futureApplies: false },
  { code: 'COMMODITIES', name: 'Commodities', lotApplies: true, qtyApplies: false, optionApplies: false, expiryHoldApplies: false, futureApplies: false },
];

export const SETTING_CATEGORIES = [
  { id: 'lot', label: 'Lot' },
  { id: 'quantity', label: 'Quantity' },
  { id: 'value', label: 'Value' },
  { id: 'fixedMargin', label: 'Fixed Margin' },
  { id: 'options', label: 'Options' },
  { id: 'brokerage', label: 'Brokerage' },
  { id: 'limitPoint', label: 'Limit away' },
  { id: 'spread', label: 'Spread' },
  { id: 'block', label: 'Block' },
  { id: 'expiryHold', label: 'Expiry day' },
];

export const CATEGORY_FIELDS = {
  lot: [
    { key: 'minLots', label: 'Min Lot', type: 'number' },
    { key: 'orderLots', label: 'Per Order Lot', type: 'number' },
    { key: 'maxLots', label: 'Max Lot/Script', type: 'number' },
    { key: 'maxExchangeLots', label: 'Max Exchange Lots', type: 'number' },
  ],
  quantity: [
    { key: 'minQty', label: 'Min Qty', type: 'number' },
    { key: 'perOrderQty', label: 'Per Order Qty', type: 'number' },
    { key: 'maxQtyPerScript', label: 'Max Qty/Script', type: 'number' },
  ],
  value: [
    { key: 'maxValue', label: 'Max margin value (₹)', type: 'number' },
  ],
  fixedMargin: [
    { key: 'marginCalcMode', label: 'Margin Mode', type: 'select', options: [{ v: 'fixed', l: 'Fixed' }, { v: 'times', l: 'Times' }] },
    { key: 'intradayMargin', label: 'Intraday Margin', type: 'number' },
    { key: 'overnightMargin', label: 'Overnight Margin', type: 'number' },
    { key: 'optionBuyIntraday', label: 'Opt Buy Intraday', type: 'number', optionOnly: true },
    { key: 'optionBuyOvernight', label: 'Opt Buy Overnight', type: 'number', optionOnly: true },
    { key: 'optionSellIntraday', label: 'Opt Sell Intraday', type: 'number', optionOnly: true },
    { key: 'optionSellOvernight', label: 'Opt Sell Overnight', type: 'number', optionOnly: true },
  ],
  options: [
    { key: 'buyingStrikeFarPercent', label: 'Buy max % from underlying', type: 'number', optionOnly: true },
    { key: 'sellingStrikeFarPercent', label: 'Sell max % from underlying', type: 'number', optionOnly: true },
  ],
  brokerage: [
    { key: 'commissionType', label: 'Type', type: 'select', options: [{ v: 'per_lot', l: 'Per Lot' }, { v: 'per_crore', l: 'Per Crore' }] },
    { key: 'commission', label: 'Commission (₹)', type: 'number', notForOption: true },
    { key: 'optionBuyCommission', label: 'Buy Brokerage (₹)', type: 'number', optionOnly: true },
    { key: 'optionSellCommission', label: 'Sell Brokerage (₹)', type: 'number', optionOnly: true },
    { key: 'chargeOn', label: 'Charge On', type: 'select', options: [{ v: 'open', l: 'Open' }, { v: 'close', l: 'Close' }, { v: 'both', l: 'Both' }] },
  ],
  limitPoint: [
    { key: 'limitAwayPercent', label: 'Max % away from market', type: 'number' },
  ],
  spread: [
    { key: 'spreadType', label: 'Spread Type', type: 'select', options: [{ v: 'fixed', l: 'Fixed' }, { v: 'floating', l: 'Floating' }] },
    { key: 'spreadPips', label: 'Spread (pips)', type: 'number' },
    { key: 'swapType', label: 'Swap Type', type: 'select', options: [{ v: 'points', l: 'Points' }, { v: 'percentage', l: 'Percentage' }] },
    { key: 'swapLong', label: 'Swap Long', type: 'number' },
    { key: 'swapShort', label: 'Swap Short', type: 'number' },
    { key: 'swapTime', label: 'Swap Time (IST)', type: 'time' },
  ],
  block: [
    { key: 'isActive', label: 'Is Active', type: 'select', options: [{ v: true, l: 'Yes' }, { v: false, l: 'No' }] },
    { key: 'tradingEnabled', label: 'Access Enabled', type: 'select', options: [{ v: true, l: 'Yes' }, { v: false, l: 'No' }] },
    { key: 'allowOvernight', label: 'Allow Overnight', type: 'select', options: [{ v: true, l: 'Yes' }, { v: false, l: 'No' }] },
  ],
  expiryHold: [
    { key: 'expiryProfitHoldMinSeconds', label: 'Expiry profit hold (s)', type: 'number' },
    { key: 'expiryLossHoldMinSeconds', label: 'Expiry loss hold (s)', type: 'number' },
    { key: 'expiryDayIntradayMargin', label: 'Expiry day margin (futures)', type: 'number', futureOnly: true },
    { key: 'expiryDayOptionBuyMargin', label: 'Expiry day OPT BUY margin', type: 'number', optionOnly: true },
    { key: 'expiryDayOptionSellMargin', label: 'Expiry day OPT SELL margin', type: 'number', optionOnly: true },
  ],
};

/** Returns true if a field cell is N/A for the segment (per applies flags). */
export function isFieldNA(segment, category, field) {
  if (!segment) return true;
  if (field.optionOnly && !segment.optionApplies) return true;
  if (field.notForOption && segment.optionApplies) return true;
  if (field.futureOnly && !segment.futureApplies) return true;
  if (category === 'lot' && !segment.lotApplies) return true;
  if (category === 'quantity' && !segment.qtyApplies) return true;
  if (category === 'options' && !segment.optionApplies) return true;
  if (category === 'expiryHold' && !segment.expiryHoldApplies) return true;
  return false;
}
