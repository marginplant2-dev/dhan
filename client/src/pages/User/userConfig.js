// User App Configuration

import { ORDERED_WATCHLIST_CATEGORY_KEYS } from '../../constants/nettingSegmentUi';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const DEFAULT_FOREX = [
  { symbol: 'EURUSD', name: 'Euro/USD', category: 'forex', exchange: 'FOREX' },
  { symbol: 'GBPUSD', name: 'GBP/USD', category: 'forex', exchange: 'FOREX' },
  { symbol: 'USDJPY', name: 'USD/JPY', category: 'yen', exchange: 'FOREX' },
  { symbol: 'USDCHF', name: 'USD/CHF', category: 'forex', exchange: 'FOREX' },
  { symbol: 'AUDUSD', name: 'AUD/USD', category: 'forex', exchange: 'FOREX' },
  { symbol: 'USDCAD', name: 'USD/CAD', category: 'forex', exchange: 'FOREX' },
  { symbol: 'NZDUSD', name: 'NZD/USD', category: 'forex', exchange: 'FOREX' },
  { symbol: 'EURGBP', name: 'EUR/GBP', category: 'forex', exchange: 'FOREX' },
  { symbol: 'EURJPY', name: 'EUR/JPY', category: 'yen', exchange: 'FOREX' },
  { symbol: 'GBPJPY', name: 'GBP/JPY', category: 'yen', exchange: 'FOREX' },
  { symbol: 'EURCHF', name: 'EUR/CHF', category: 'forex', exchange: 'FOREX' },
  { symbol: 'EURAUD', name: 'EUR/AUD', category: 'forex', exchange: 'FOREX' },
  { symbol: 'GBPAUD', name: 'GBP/AUD', category: 'forex', exchange: 'FOREX' },
  { symbol: 'AUDNZD', name: 'AUD/NZD', category: 'forex', exchange: 'FOREX' },
  { symbol: 'CADJPY', name: 'CAD/JPY', category: 'yen', exchange: 'FOREX' },
  { symbol: 'AUDCAD', name: 'AUD/CAD', category: 'forex', exchange: 'FOREX' },
  { symbol: 'EURNZD', name: 'EUR/NZD', category: 'forex', exchange: 'FOREX' },
  { symbol: 'GBPNZD', name: 'GBP/NZD', category: 'forex', exchange: 'FOREX' },
  { symbol: 'CHFJPY', name: 'CHF/JPY', category: 'yen', exchange: 'FOREX' },
  { symbol: 'AUDCHF', name: 'AUD/CHF', category: 'forex', exchange: 'FOREX' },
  { symbol: 'AUDJPY', name: 'AUD/JPY', category: 'yen', exchange: 'FOREX' },
  { symbol: 'CADCHF', name: 'CAD/CHF', category: 'forex', exchange: 'FOREX' },
  { symbol: 'EURCAD', name: 'EUR/CAD', category: 'forex', exchange: 'FOREX' },
  { symbol: 'GBPCAD', name: 'GBP/CAD', category: 'forex', exchange: 'FOREX' },
  { symbol: 'GBPCHF', name: 'GBP/CHF', category: 'forex', exchange: 'FOREX' },
  { symbol: 'NZDCAD', name: 'NZD/CAD', category: 'forex', exchange: 'FOREX' },
  { symbol: 'NZDCHF', name: 'NZD/CHF', category: 'forex', exchange: 'FOREX' },
  { symbol: 'NZDJPY', name: 'NZD/JPY', category: 'yen', exchange: 'FOREX' }
];

const DEFAULT_INDICES = [
  { symbol: 'US30', name: 'Dow Jones', category: 'indices', exchange: 'INDICES' },
  { symbol: 'US500', name: 'S&P 500', category: 'indices', exchange: 'INDICES' },
  { symbol: 'UK100', name: 'FTSE 100', category: 'indices', exchange: 'INDICES' }
];

/** Metals + energy → netting COMMODITIES (UI label "Com") */
const DEFAULT_COM = [
  { symbol: 'XAUUSD', name: 'Gold', category: 'commodity', exchange: 'COMMODITIES' },
  { symbol: 'XAGUSD', name: 'Silver', category: 'commodity', exchange: 'COMMODITIES' },
  { symbol: 'USOIL', name: 'WTI Crude Oil', category: 'commodity', exchange: 'COMMODITIES' },
  { symbol: 'UKOIL', name: 'Brent Crude Oil', category: 'commodity', exchange: 'COMMODITIES' }
];

const DEFAULT_CRYPTO_PERP = [
  { symbol: 'BTCUSD', name: 'Bitcoin', category: 'crypto_perpetual' },
  { symbol: 'ETHUSD', name: 'Ethereum', category: 'crypto_perpetual' },
  { symbol: 'LTCUSD', name: 'Litecoin', category: 'crypto_perpetual' },
  { symbol: 'XRPUSD', name: 'Ripple', category: 'crypto_perpetual' },
  { symbol: 'ADAUSD', name: 'Cardano', category: 'crypto_perpetual' }
];

const CATEGORY_PRESETS = {
  Forex: DEFAULT_FOREX,
  Indices: DEFAULT_INDICES,
  Commodities: DEFAULT_COM,
  'Crypto Perpetual': DEFAULT_CRYPTO_PERP,
  'NSE EQ': [],
  'NSE FUT': [],
  'NSE OPT': [],
  'BSE EQ': [],
  'BSE FUT': [],
  'BSE OPT': [],
  'MCX FUT': [],
  'MCX OPT': [],
  'Stocks (International)': [],
  'Crypto Options': []
};

// Instruments by category — key order matches netting segment table (Indian → global)
export const instrumentsByCategory = ORDERED_WATCHLIST_CATEGORY_KEYS.reduce((acc, key) => {
  acc[key] = CATEGORY_PRESETS[key] ? [...CATEGORY_PRESETS[key]] : [];
  return acc;
}, {});

// Flatten all instruments for lookup
export const allInstruments = Object.values(instrumentsByCategory).flat();

// Default watchlist. NIFTY 50 (the NSE index — exact Zerodha tradingsymbol, with
// a space) leads so this India-first platform opens on a familiar instrument that
// also drives the default chart symbol (see UserLayout DEFAULT_MARKET_SYMBOL).
export const DEFAULT_WATCHLIST = ['NIFTY 50', 'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD', 'US100', 'US30'];

// TradingView symbol mapping
export const getTVSymbol = (symbol) => {
  const symbolMap = {
    // Forex Majors
    'EURUSD': 'FX:EURUSD',
    'GBPUSD': 'FX:GBPUSD',
    'USDJPY': 'FX:USDJPY',
    'USDCHF': 'FX:USDCHF',
    'AUDUSD': 'FX:AUDUSD',
    'USDCAD': 'FX:USDCAD',
    'NZDUSD': 'FX:NZDUSD',
    // Forex Cross Pairs
    'EURGBP': 'FX:EURGBP',
    'EURJPY': 'FX:EURJPY',
    'GBPJPY': 'FX:GBPJPY',
    'EURCHF': 'FX:EURCHF',
    'EURAUD': 'FX:EURAUD',
    'GBPAUD': 'FX:GBPAUD',
    'AUDNZD': 'FX:AUDNZD',
    'CADJPY': 'FX:CADJPY',
    'AUDCAD': 'FX:AUDCAD',
    'EURNZD': 'FX:EURNZD',
    'GBPNZD': 'FX:GBPNZD',
    'CHFJPY': 'FX:CHFJPY',
    'AUDJPY': 'FX:AUDJPY',
    'NZDJPY': 'FX:NZDJPY',
    'CADCHF': 'FX:CADCHF',
    'AUDCHF': 'FX:AUDCHF',
    'NZDCHF': 'FX:NZDCHF',
    'GBPCAD': 'FX:GBPCAD',
    'EURCAD': 'FX:EURCAD',
    'NZDCAD': 'FX:NZDCAD',
    // Forex Exotic Pairs
    'USDZAR': 'FX:USDZAR',
    'USDMXN': 'FX:USDMXN',
    'USDTRY': 'FX:USDTRY',
    'USDSEK': 'FX:USDSEK',
    'USDNOK': 'FX:USDNOK',
    'USDDKK': 'FX:USDDKK',
    'USDSGD': 'FX:USDSGD',
    'USDHKD': 'FX:USDHKD',
    'USDPLN': 'FX:USDPLN',
    'USDHUF': 'FX:USDHUF',
    'USDCZK': 'FX:USDCZK',
    'EURPLN': 'FX:EURPLN',
    'EURTRY': 'FX:EURTRY',
    'EURZAR': 'FX:EURZAR',
    'EURHUF': 'FX:EURHUF',
    'EURCZK': 'FX:EURCZK',
    'EURSEK': 'FX:EURSEK',
    'EURNOK': 'FX:EURNOK',
    'EURDKK': 'FX:EURDKK',
    'GBPZAR': 'FX:GBPZAR',
    'GBPTRY': 'FX:GBPTRY',
    'GBPPLN': 'FX:GBPPLN',
    // Crypto spot / CFD (TradingView chart proxy — execution prices: MetaAPI or Delta Exchange)
    'BTCUSD': 'COINBASE:BTCUSD',
    'ETHUSD': 'COINBASE:ETHUSD',
    'LTCUSD': 'COINBASE:LTCUSD',
    'XRPUSD': 'COINBASE:XRPUSD',
    'BCHUSD': 'COINBASE:BCHUSD',
    'ADAUSD': 'COINBASE:ADAUSD',
    'DOTUSD': 'COINBASE:DOTUSD',
    'SOLUSD': 'COINBASE:SOLUSD',
    'DOGEUSD': 'COINBASE:DOGEUSD',
    'AVAXUSD': 'COINBASE:AVAXUSD',
    'LINKUSD': 'COINBASE:LINKUSD',
    'MATICUSD': 'COINBASE:MATICUSD',
    // Crypto in other currencies - map to USD equivalent chart
    'BTCEUR': 'COINBASE:BTCUSD',
    'ETHEUR': 'COINBASE:ETHUSD',
    'BTCGBP': 'COINBASE:BTCUSD',
    'ETHGBP': 'COINBASE:ETHUSD',
    'BTCCHF': 'COINBASE:BTCUSD',
    'ETHCHF': 'COINBASE:ETHUSD',
    // Crypto perpetuals (.P) — chart uses USD spot proxy
    'BTCUSD.P': 'COINBASE:BTCUSD',
    'ETHUSD.P': 'COINBASE:ETHUSD',
    'SOLUSD.P': 'COINBASE:SOLUSD',
    'XRPUSD.P': 'COINBASE:XRPUSD',
    'DOGEUSD.P': 'COINBASE:DOGEUSD',
    'ADAUSD.P': 'COINBASE:ADAUSD',
    'AVAXUSD.P': 'COINBASE:AVAXUSD',
    'LINKUSD.P': 'COINBASE:LINKUSD',
    // Metals - USD
    'XAUUSD': 'TVC:GOLD',
    'XAGUSD': 'TVC:SILVER',
    'XPTUSD': 'TVC:PLATINUM',
    'XPDUSD': 'TVC:PALLADIUM',
    // Metals - Other currencies (map to USD equivalent)
    'XAUEUR': 'TVC:GOLD',
    'XAUGBP': 'TVC:GOLD',
    'XAUAUD': 'TVC:GOLD',
    'XAUCHF': 'TVC:GOLD',
    'XAUCAD': 'TVC:GOLD',
    'XAUJPY': 'TVC:GOLD',
    'XAUNZD': 'TVC:GOLD',
    'XAUNOK': 'TVC:GOLD',
    'XAUSEK': 'TVC:GOLD',
    'XAUDKK': 'TVC:GOLD',
    'XAUPLN': 'TVC:GOLD',
    'XAUHUF': 'TVC:GOLD',
    'XAUCZK': 'TVC:GOLD',
    'XAUTRY': 'TVC:GOLD',
    'XAUZAR': 'TVC:GOLD',
    'XAUMXN': 'TVC:GOLD',
    'XAUSGD': 'TVC:GOLD',
    'XAUHKD': 'TVC:GOLD',
    'XAUCNH': 'TVC:GOLD',
    'XAUAED': 'TVC:GOLD',
    'XAGEUR': 'TVC:SILVER',
    'XAGGBP': 'TVC:SILVER',
    'XAGAUD': 'TVC:SILVER',
    'XAGCHF': 'TVC:SILVER',
    'XAGCAD': 'TVC:SILVER',
    'XAGJPY': 'TVC:SILVER',
    'XAGNZD': 'TVC:SILVER',
    'XAGNOK': 'TVC:SILVER',
    'XAGSEK': 'TVC:SILVER',
    'XAGDKK': 'TVC:SILVER',
    'XAGPLN': 'TVC:SILVER',
    'XAGHUF': 'TVC:SILVER',
    'XAGCZK': 'TVC:SILVER',
    'XAGTRY': 'TVC:SILVER',
    'XAGZAR': 'TVC:SILVER',
    'XAGMXN': 'TVC:SILVER',
    'XAGSGD': 'TVC:SILVER',
    'XAGHKD': 'TVC:SILVER',
    'XAGCNH': 'TVC:SILVER',
    'XAGAED': 'TVC:SILVER',
    // Indices
    'US100': 'PEPPERSTONE:NAS100',
    'US30': 'PEPPERSTONE:US30',
    'US500': 'PEPPERSTONE:US500',
    'US2000': 'PEPPERSTONE:US2000',
    'DE40': 'PEPPERSTONE:GER40',
    'DE30': 'PEPPERSTONE:GER40',
    'UK100': 'PEPPERSTONE:UK100',
    'JP225': 'PEPPERSTONE:JPN225',
    'HK50': 'PEPPERSTONE:HK50',
    'AUS200': 'PEPPERSTONE:AUS200',
    'EU50': 'PEPPERSTONE:EUSTX50',
    'FRA40': 'PEPPERSTONE:FRA40',
    'SWI20': 'PEPPERSTONE:SUI20',
    'ESP35': 'PEPPERSTONE:ESP35',
    'NAS100': 'PEPPERSTONE:NAS100',
    'SPX500': 'PEPPERSTONE:US500',
    'DJ30': 'PEPPERSTONE:US30',
    // Energy
    'USOIL': 'TVC:USOIL',
    'UKOIL': 'TVC:UKOIL',
    'NATGAS': 'TVC:NATGAS',
    'NGAS': 'TVC:NATGAS',
    'BRENT': 'TVC:UKOIL',
    'WTI': 'TVC:USOIL',
    'XTIUSD': 'TVC:USOIL',
    'XBRUSD': 'TVC:UKOIL',
    'WTIUSD': 'TVC:USOIL',
    'BRENTUSD': 'TVC:UKOIL',
    // Indian Market - NSE
    'RELIANCE': 'NSE:RELIANCE',
    'TCS': 'NSE:TCS',
    'HDFCBANK': 'NSE:HDFCBANK',
    'INFY': 'NSE:INFY',
    'ICICIBANK': 'NSE:ICICIBANK',
    'NIFTY': 'NSE:NIFTY',
    'BANKNIFTY': 'NSE:BANKNIFTY',
    // Indian Market - MCX
    'GOLD': 'MCX:GOLD1!',
    'SILVER': 'MCX:SILVER1!',
    'CRUDEOIL': 'MCX:CRUDEOIL1!',
    'NATURALGAS': 'MCX:NATURALGAS1!',
    // Indian Market - BSE
    'SENSEX': 'BSE:SENSEX',
  };
  
  // MCX commodity futures - extract base commodity and map to continuous contract
  const mcxCommodities = {
    'GOLD': 'MCX:GOLD1!',
    'GOLDM': 'MCX:GOLDM1!',
    'GOLDGUINEA': 'MCX:GOLDGUINEA1!',
    'GOLDPETAL': 'MCX:GOLDPETAL1!',
    'SILVER': 'MCX:SILVER1!',
    'SILVERM': 'MCX:SILVERM1!',
    'SILVERMIC': 'MCX:SILVERMIC1!',
    'CRUDEOIL': 'MCX:CRUDEOIL1!',
    'CRUDEOILM': 'MCX:CRUDEOILM1!',
    'NATURALGAS': 'MCX:NATURALGAS1!',
    'COPPER': 'MCX:COPPER1!',
    'ZINC': 'MCX:ZINC1!',
    'LEAD': 'MCX:LEAD1!',
    'ALUMINIUM': 'MCX:ALUMINIUM1!',
    'NICKEL': 'MCX:NICKEL1!',
    'COTTON': 'MCX:COTTON1!',
  };

  // Check direct symbol map first
  if (symbolMap[symbol]) {
    return symbolMap[symbol];
  }

  // For MCX futures, extract base commodity (e.g., GOLDM25MAR -> GOLDM, GOLD26APRFUT -> GOLD)
  if (symbol.includes('FUT') || /\d{2}[A-Z]{3}$/.test(symbol)) {
    // Extract base symbol - remove date suffix like 25MAR, 26APR, 26APRFUT etc.
    let baseSymbol = symbol.replace(/\d{2}[A-Z]{3}FUT$/, '').replace(/\d{2}[A-Z]{3}$/, '');
    
    // Check if it's an MCX commodity
    if (mcxCommodities[baseSymbol]) {
      return mcxCommodities[baseSymbol];
    }
    
    // Check direct symbol map
    if (symbolMap[baseSymbol]) {
      return symbolMap[baseSymbol];
    }
    
    // For NSE futures (NIFTY, BANKNIFTY, etc.)
    if (baseSymbol === 'NIFTY' || baseSymbol === 'BANKNIFTY') {
      return `NSE:${baseSymbol}`;
    }
    
    // Default to NSE for other Indian symbols
    return `NSE:${baseSymbol}`;
  }
  
  // For options (CE/PE)
  if (symbol.includes('CE') || symbol.includes('PE')) {
    const baseSymbol = symbol.replace(/\d{2}[A-Z]{3}\d+[CP]E$/, '');
    if (symbolMap[baseSymbol]) {
      return symbolMap[baseSymbol];
    }
    return `NSE:${baseSymbol}`;
  }
  
  // Handle metals in exotic currencies (XAU/XAG + currency code)
  if (symbol.startsWith('XAU')) {
    return 'TVC:GOLD';
  }
  if (symbol.startsWith('XAG')) {
    return 'TVC:SILVER';
  }
  if (symbol.startsWith('XPT')) {
    return 'TVC:PLATINUM';
  }
  if (symbol.startsWith('XPD')) {
    return 'TVC:PALLADIUM';
  }
  
  // Handle Delta Exchange crypto futures and options
  // Format: C-BTC-101000-240426 (Call option), P-BTC-101000-240426 (Put option), BTCUSD (Perpetual)
  if (symbol.startsWith('C-') || symbol.startsWith('P-')) {
    // Options - extract underlying (e.g., C-BTC-101000-240426 -> BTC, C-ETH-1400-240426 -> ETH)
    const parts = symbol.split('-');
    if (parts.length >= 2) {
      const underlying = parts[1];
      if (underlying === 'BTC') return 'COINBASE:BTCUSD';
      if (underlying === 'ETH') return 'COINBASE:ETHUSD';
      if (underlying === 'SOL') return 'COINBASE:SOLUSD';
      if (underlying === 'XRP') return 'COINBASE:XRPUSD';
      return `COINBASE:${underlying}USD`;
    }
  }
  
  // Handle Delta Exchange perpetual futures (e.g., BTCUSD, ETHUSD, 1000BONKUSD, ACTUSD)
  // Chart: USD spot proxy on Coinbase (execution/pricing: Delta or MetaAPI per instrument)
  // Exclude forex pairs (exactly 6 chars with common forex currencies) and metals
  const forexCurrencies = ['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'HKD', 'SEK', 'NOK', 'DKK', 'PLN', 'ZAR', 'MXN', 'TRY', 'CNH', 'INR'];
  const isForexPair = symbol.length === 6 && forexCurrencies.some(c => symbol.startsWith(c) || symbol.endsWith(c));
  
  if (symbol.endsWith('USD') && !isForexPair && !symbol.startsWith('XAU') && !symbol.startsWith('XAG') && !symbol.includes('/')) {
    const base = symbol.replace('USD', '');
    // Handle special cases like 1000BONK, 1000FLOKI, 1000PEPE
    if (base.startsWith('1000')) {
      const actualBase = base.replace('1000', '');
      return `COINBASE:1000${actualBase}USD`;
    }
    return `COINBASE:${base}USD`;
  }
  
  // Handle crypto in exotic currencies
  if (symbol.startsWith('BTC')) {
    return 'COINBASE:BTCUSD';
  }
  if (symbol.startsWith('ETH') && !symbol.includes('EUR')) {
    return 'COINBASE:ETHUSD';
  }
  if (symbol.startsWith('LTC')) {
    return 'COINBASE:LTCUSD';
  }
  
  // Check if it's an Indian equity symbol (not in map but could be NSE stock)
  const indianSymbols = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK', 'LT', 'AXISBANK', 'MARUTI', 'TITAN', 'SUNPHARMA', 'BAJFINANCE', 'WIPRO', 'HCLTECH', 'ASIANPAINT', 'ULTRACEMCO', 'TATAMOTORS', 'TATASTEEL', 'POWERGRID', 'NTPC', 'ONGC', 'COALINDIA', 'JSWSTEEL', 'ADANIENT', 'ADANIPORTS', 'TECHM', 'HINDALCO', 'GRASIM', 'INDUSINDBK', 'CIPLA', 'DRREDDY', 'EICHERMOT', 'DIVISLAB', 'BAJAJ-AUTO', 'HEROMOTOCO', 'BRITANNIA', 'NESTLEIND', 'APOLLOHOSP', 'SBILIFE', 'HDFCLIFE', 'BAJAJFINSV', 'TATACONSUM', 'M&M', 'BPCL', 'UPL'];
  if (indianSymbols.includes(symbol)) {
    return `NSE:${symbol}`;
  }
  
  // For standard 6-char forex pairs, use FX prefix
  if (/^[A-Z]{6}$/.test(symbol)) {
    return `FX:${symbol}`;
  }
  
  // Default fallback - use OANDA for forex-like symbols
  return `OANDA:${symbol}`;
};
