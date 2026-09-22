/**
 * MT5 Standard Calculations
 * 
 * These functions implement the standard MetaTrader 5 formulas for:
 * - Margin calculation
 * - Profit/Loss calculation
 * - Contract sizes
 */

// Get contract size for a symbol (MT5 Standard)
function getContractSize(symbol) {
  const sym = symbol.toUpperCase();
  
  // Precious Metals
  if (sym.includes('XAU') || sym.includes('GOLD')) {
    return 100; // 1 lot = 100 troy oz
  }
  if (sym.includes('XAG') || sym.includes('SILVER')) {
    return 5000; // 1 lot = 5000 troy oz
  }
  if (sym.includes('XPT') || sym.includes('PLATINUM')) {
    return 100; // 1 lot = 100 troy oz
  }
  
  // Cryptocurrencies
  if (sym.includes('BTC')) {
    return 1; // 1 lot = 1 BTC
  }
  if (sym.includes('ETH')) {
    return 1; // 1 lot = 1 ETH
  }
  if (sym.includes('ADA')) {
    return 1000; // 1 lot = 1000 ADA
  }
  
  // US Indices
  if (sym === 'US100' || sym === 'US30' || sym === 'US2000') {
    return 1; // 1 lot = $1 per point
  }
  
  // Commodities
  if (sym === 'BRENT' || sym === 'WTI' || sym.includes('OIL')) {
    return 1000; // 1 lot = 1000 barrels
  }
  if (sym === 'COPPER') {
    return 25000; // 1 lot = 25000 lbs
  }
  
  // Indian Market Stocks (NSE/BSE) - 1 lot = 1 share for equity
  // Common Indian stocks
  const indianStocks = [
    'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'BHARTIARTL',
    'ITC', 'KOTAKBANK', 'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'TITAN',
    'SUNPHARMA', 'BAJFINANCE', 'WIPRO', 'HCLTECH', 'ULTRACEMCO', 'NESTLEIND',
    'TATAMOTORS', 'TATASTEEL', 'POWERGRID', 'NTPC', 'ONGC', 'COALINDIA',
    'JSWSTEEL', 'HINDALCO', 'ADANIENT', 'ADANIPORTS', 'TECHM', 'DRREDDY',
    'CIPLA', 'DIVISLAB', 'APOLLOHOSP', 'EICHERMOT', 'BAJAJ-AUTO', 'HEROMOTOCO',
    'BRITANNIA', 'HINDUNILVR', 'GRASIM', 'INDUSINDBK', 'SBILIFE', 'HDFCLIFE',
    'BAJAJFINSV', 'BPCL', 'M&M', 'UPL', 'SHREECEM', 'TATACONSUM'
  ];
  
  if (indianStocks.includes(sym)) {
    return 1; // 1 lot = 1 share for Indian equity
  }
  
  // Check if it looks like an Indian stock (short symbol, no currency pair pattern)
  // Indian stocks are typically 2-15 chars, no "/" or currency codes
  if (sym.length <= 15 && !sym.includes('/') && !sym.includes('USD') && 
      !sym.includes('EUR') && !sym.includes('GBP') && !sym.includes('JPY') &&
      !sym.includes('AUD') && !sym.includes('CAD') && !sym.includes('CHF') &&
      !sym.includes('NZD')) {
    // Likely an Indian stock - use contract size of 1
    return 1;
  }
  
  // Default: Forex (1 standard lot = 100,000 units)
  return 100000;
}

// Check if symbol is a JPY pair
function isJPYPair(symbol) {
  return symbol.toUpperCase().includes('JPY');
}

/**
 * Calculate margin required for a position (MT5 Standard Formula)
 * Margin = (Lots × Contract Size × Price) / Leverage
 * 
 * @param {number} lots - Position size in lots
 * @param {number} price - Entry price
 * @param {number} leverage - Account leverage
 * @param {string} symbol - Trading symbol
 * @returns {number} Required margin in account currency
 */
function calculateMargin(lots, price, leverage, symbol, customContractSize = null) {
  const contractSize = customContractSize || getContractSize(symbol);
  return (lots * contractSize * price) / leverage;
}

/**
 * Calculate P/L for a position (MT5 Standard Formula)
 * P/L = (Close Price - Open Price) × Contract Size × Lots (for buy)
 * P/L = (Open Price - Close Price) × Contract Size × Lots (for sell)
 * 
 * @param {string} side - 'buy' or 'sell'
 * @param {number} entryPrice - Position entry price
 * @param {number} currentPrice - Current market price
 * @param {number} lots - Position size in lots
 * @param {string} symbol - Trading symbol
 * @returns {number} Profit/Loss in account currency
 */
function calculatePnL(side, entryPrice, currentPrice, lots, symbol, customContractSize = null, customIsJPY = null) {
  const priceDiff = side === 'buy' 
    ? currentPrice - entryPrice 
    : entryPrice - currentPrice;
  
  const contractSize = customContractSize || getContractSize(symbol);
  const jpyCheck = customIsJPY !== null ? customIsJPY : isJPYPair(symbol);
  
  // For JPY pairs, result needs to be converted to USD
  if (jpyCheck) {
    // JPY pairs: P/L in JPY, divide by ~100 to approximate USD
    return (priceDiff * contractSize * lots) / 100;
  }
  
  return priceDiff * contractSize * lots;
}

/**
 * Calculate pip value for a symbol
 * 
 * @param {string} symbol - Trading symbol
 * @param {number} lots - Position size in lots
 * @param {number} currentPrice - Current price (needed for JPY pairs)
 * @returns {number} Value of 1 pip in account currency
 */
function calculatePipValue(symbol, lots, currentPrice = 1) {
  const contractSize = getContractSize(symbol);
  const sym = symbol.toUpperCase();
  
  // JPY pairs: pip = 0.01
  if (isJPYPair(sym)) {
    return (0.01 * contractSize * lots) / currentPrice;
  }
  
  // Metals and indices have different pip definitions
  if (sym.includes('XAU')) {
    return 0.01 * contractSize * lots; // $0.01 move = 1 pip for gold
  }
  if (sym.includes('XAG')) {
    return 0.001 * contractSize * lots; // $0.001 move = 1 pip for silver
  }
  
  // Standard forex: pip = 0.0001
  return 0.0001 * contractSize * lots;
}

/**
 * MT5 Wallet/Account Calculations
 */

/**
 * Calculate equity
 * Equity = Balance + Credit + Unrealized P/L
 */
function calculateEquity(balance, credit, unrealizedPnL) {
  return balance + credit + unrealizedPnL;
}

/**
 * Calculate free margin
 * Free Margin = Equity - Used Margin
 */
function calculateFreeMargin(equity, usedMargin) {
  return equity - usedMargin;
}

/**
 * Calculate margin level
 * Margin Level = (Equity / Used Margin) × 100%
 * Returns 0 if no margin is used
 */
function calculateMarginLevel(equity, usedMargin) {
  if (usedMargin <= 0) return 0;
  return (equity / usedMargin) * 100;
}

module.exports = {
  getContractSize,
  isJPYPair,
  calculateMargin,
  calculatePnL,
  calculatePipValue,
  calculateEquity,
  calculateFreeMargin,
  calculateMarginLevel
};
