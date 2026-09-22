const express = require('express');
const router = express.Router();
const { SpreadSetting, CommissionSetting, LeverageSetting } = require('../models/ChargeSettings');
const MetaApiStreamingService = require('../services/metaApiStreaming');
const { fetchHistoricalCandles } = require('../services/metaApiMarketData.service');
const { fetchYahooCandles } = require('../services/yahooFinanceFallback');
const restPriceForSymbol = MetaApiStreamingService.restPriceForSymbol;
const loadDiskCacheForFallback = MetaApiStreamingService.loadDiskCacheForFallback;

const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID || '';
const METAAPI_AUTH_TOKEN = process.env.METAAPI_AUTH_TOKEN || '';
const METAAPI_BASE_URL = process.env.METAAPI_BASE_URL || 'https://mt-client-api-v1.new-york.agiliumtrade.ai';

// Helper: Get pip size for a symbol (used for spread calculation)
function getPipSize(symbol) {
  const sym = symbol.toUpperCase();
  if (sym.includes('JPY')) return 0.01;
  if (sym.includes('XAU')) return 0.01;
  if (sym.includes('XAG')) return 0.001;
  if (sym.includes('BTC')) return 0.01;
  if (sym.includes('ETH')) return 0.01;
  if (sym.endsWith('USD') && !sym.startsWith('USD') && sym.length <= 7) return 0.0001; // Forex pairs
  return 0.0001; // Default forex pip
}

// Helper: Apply spread markup to bid/ask
async function applySpread(symbol, bid, ask) {
  try {
    const spread = await SpreadSetting.findOne({ symbol: symbol.toUpperCase(), isActive: true });
    if (!spread) return { bid, ask, spreadApplied: false, spreadPips: 0, markupPips: 0 };

    const pipSize = getPipSize(symbol);
    const totalMarkup = (spread.spreadPips + spread.markupPips) * pipSize;
    const halfMarkup = totalMarkup / 2;

    // Widen bid/ask: lower bid, raise ask
    const adjustedBid = bid - halfMarkup;
    const adjustedAsk = ask + halfMarkup;

    return {
      bid: parseFloat(adjustedBid.toFixed(6)),
      ask: parseFloat(adjustedAsk.toFixed(6)),
      spreadApplied: true,
      spreadPips: spread.spreadPips,
      markupPips: spread.markupPips,
      totalSpreadPips: spread.spreadPips + spread.markupPips,
      spreadType: spread.spreadType
    };
  } catch (err) {
    console.warn('Spread lookup failed:', err.message);
    return { bid, ask, spreadApplied: false, spreadPips: 0, markupPips: 0 };
  }
}

// Helper: Calculate commission for a trade
async function calculateCommission(symbol, volume) {
  try {
    const comm = await CommissionSetting.findOne({ symbol: symbol.toUpperCase(), isActive: true });
    if (!comm) return { commission: 0, commissionType: 'none', details: null };

    let openComm = 0;
    let closeComm = 0;

    if (comm.commissionType === 'per-lot') {
      openComm = comm.openCommission * volume;
      closeComm = comm.closeCommission * volume;
    } else if (comm.commissionType === 'per-trade') {
      openComm = comm.openCommission;
      closeComm = comm.closeCommission;
    } else if (comm.commissionType === 'percentage') {
      // Percentage of trade value — would need price, but simplify to flat for now
      openComm = comm.openCommission;
      closeComm = comm.closeCommission;
    }

    // Apply min/max
    const totalComm = openComm + closeComm;
    let finalComm = totalComm;
    if (comm.minCommission > 0 && finalComm < comm.minCommission) finalComm = comm.minCommission;
    if (comm.maxCommission > 0 && finalComm > comm.maxCommission) finalComm = comm.maxCommission;

    return {
      commission: parseFloat(finalComm.toFixed(2)),
      commissionType: comm.commissionType,
      details: { open: openComm, close: closeComm, currency: comm.currency }
    };
  } catch (err) {
    console.warn('Commission lookup failed:', err.message);
    return { commission: 0, commissionType: 'none', details: null };
  }
}

// Proxy: Get account information
router.get('/account-info', async (req, res) => {
  try {
    const response = await fetch(
      `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/account-information`,
      {
        headers: {
          'auth-token': METAAPI_AUTH_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: `MetaAPI error: ${response.statusText}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('MetaAPI proxy error (account-info):', error.message);
    res.status(500).json({ error: 'Failed to fetch account info' });
  }
});

// Proxy: Get current price for a symbol — WITH SPREAD MARKUP
router.get('/price/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    const data = restPriceForSymbol ? await restPriceForSymbol(symbol) : null;
    if (!data) {
      return res.status(404).json({ error: `Failed to fetch price for ${symbol}` });
    }

    const payload = { ...data, symbol };
    if (payload.bid != null && payload.ask != null) {
      const adjusted = await applySpread(symbol, payload.bid, payload.ask);
      payload.originalBid = payload.bid;
      payload.originalAsk = payload.ask;
      payload.bid = adjusted.bid;
      payload.ask = adjusted.ask;
      payload.spreadApplied = adjusted.spreadApplied;
      payload.spreadPips = adjusted.totalSpreadPips || 0;
    }

    res.json(payload);
  } catch (error) {
    console.error(`MetaAPI proxy error (price/${req.params.symbol}):`, error.message);
    res.status(500).json({ error: 'Failed to fetch price' });
  }
});

// Proxy: Get prices for multiple symbols — WITH SPREAD MARKUP
router.post('/prices', async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'symbols array required' });
    }

    const prices = {};
    const fetchPromises = symbols.map(async (symbol) => {
      try {
        if (!restPriceForSymbol) return;
        const data = await restPriceForSymbol(symbol);
        if (!data) return;
        const payload = { ...data };
        if (payload.bid != null && payload.ask != null) {
          const adjusted = await applySpread(symbol, payload.bid, payload.ask);
          payload.originalBid = payload.bid;
          payload.originalAsk = payload.ask;
          payload.bid = adjusted.bid;
          payload.ask = adjusted.ask;
          payload.spreadApplied = adjusted.spreadApplied;
        }
        prices[symbol] = payload;
      } catch (err) {
        console.warn(`Failed to fetch ${symbol}:`, err.message);
      }
    });

    await Promise.allSettled(fetchPromises);

    const disk = typeof loadDiskCacheForFallback === 'function' ? loadDiskCacheForFallback() : {};
    const pickDisk = (sym) => {
      if (!sym || !disk || typeof disk !== 'object') return null;
      const upper = String(sym).toUpperCase();
      let p = disk[upper] || disk[sym];
      if (p && (Number(p.bid) > 0 || Number(p.ask) > 0)) return p;
      const hit = Object.keys(disk).find(
        (k) => k.replace(/\.[a-zA-Z0-9]+$/, '').toUpperCase() === upper
      );
      return hit ? disk[hit] : null;
    };

    for (const symbol of symbols) {
      const cur = prices[symbol];
      if (cur && Number(cur.bid) > 0 && Number(cur.ask) > 0) continue;
      const d = pickDisk(symbol);
      if (!d || (Number(d.bid) <= 0 && Number(d.ask) <= 0)) continue;
      let payload = {
        bid: d.bid,
        ask: d.ask,
        low: d.low,
        high: d.high
      };
      if (payload.bid != null && payload.ask != null) {
        const adjusted = await applySpread(symbol, payload.bid, payload.ask);
        payload.originalBid = payload.bid;
        payload.originalAsk = payload.ask;
        payload.bid = adjusted.bid;
        payload.ask = adjusted.ask;
        payload.spreadApplied = adjusted.spreadApplied;
      }
      prices[symbol] = payload;
    }

    res.json({ prices });
  } catch (error) {
    console.error('MetaAPI proxy error (prices):', error.message);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
});

// Proxy: Execute trade order — DISABLED (MetaAPI used only for price feed)
// Trades are handled locally via /api/positions/open endpoint
router.post('/trade', async (req, res) => {
  // MetaAPI trade execution disabled - use local trade handling instead
  res.status(400).json({ 
    error: 'Direct MetaAPI trading disabled. Use /api/positions/open for local trades.',
    message: 'MetaAPI is used only for price feed. Trades are processed locally.'
  });
});

// Proxy: Get all available symbols from broker
router.get('/symbols', async (req, res) => {
  try {
    const response = await fetch(
      `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/symbols`,
      {
        headers: {
          'auth-token': METAAPI_AUTH_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: `MetaAPI error: ${response.statusText}` });
    }

    const symbols = await response.json();
    
    // Categorize symbols
    const categorizedSymbols = {
      forex: [],
      metals: [],
      indices: [],
      commodities: [],
      crypto_spot: [],
      crypto_futures: [],
      crypto_options: [],
      stocks: [],
      bonds: [],
      other: []
    };
    
    symbols.forEach(sym => {
      const symbol = sym.symbol || sym.name || '';
      const upper = symbol.toUpperCase();
      
      // Crypto Futures
      if (upper.includes('USDT') || upper.endsWith('.F') || upper.includes('_PERP') || upper.includes(':USD')) {
        categorizedSymbols.crypto_futures.push(sym);
      }
      // Crypto Options
      else if (upper.endsWith('.O') || upper.includes('_OPT')) {
        categorizedSymbols.crypto_options.push(sym);
      }
      // Crypto Spot
      else if (upper.includes('BTC') || upper.includes('ETH') || upper.includes('LTC') || 
               upper.includes('XRP') || upper.includes('DOGE') || upper.includes('SOL') ||
               upper.includes('ADA') || upper.includes('DOT') || upper.includes('LINK') ||
               upper.includes('BNB') || upper.includes('AVAX') || upper.includes('MATIC') ||
               upper.includes('SHIB') || upper.includes('ATOM') || upper.includes('UNI')) {
        categorizedSymbols.crypto_spot.push(sym);
      }
      // Metals
      else if (upper.includes('XAU') || upper.includes('XAG') || upper.includes('XPT') || upper.includes('XPD')) {
        categorizedSymbols.metals.push(sym);
      }
      // Indices
      else if (upper.includes('US30') || upper.includes('US100') || upper.includes('US500') ||
               upper.includes('NAS') || upper.includes('SPX') || upper.includes('DJ') ||
               upper.includes('DAX') || upper.includes('FTSE') || upper.includes('DE40') ||
               upper.includes('UK100') || upper.includes('JP225') || upper.includes('HK50')) {
        categorizedSymbols.indices.push(sym);
      }
      // Commodities
      else if (upper.includes('OIL') || upper.includes('BRENT') || upper.includes('WTI') ||
               upper.includes('NATGAS') || upper.includes('NGAS') || upper.includes('XTI') || upper.includes('XBR') ||
               upper.includes('COCOA') || upper.includes('COFFEE') || upper.includes('SUGAR') ||
               upper.includes('WHEAT') || upper.includes('CORN') || upper.includes('SOYBEAN')) {
        categorizedSymbols.commodities.push(sym);
      }
      // Bonds
      else if (upper.includes('BOND') || upper.includes('GILT') || upper.includes('BUND') || upper.includes('TNOTE')) {
        categorizedSymbols.bonds.push(sym);
      }
      // Forex (6 letter pairs like EURUSD, GBPUSD, etc.)
      else if (upper.length === 6 && /^[A-Z]{6}$/.test(upper)) {
        categorizedSymbols.forex.push(sym);
      }
      // Stocks (common stock symbols)
      else if (['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'NFLX'].includes(upper) ||
               (upper.length >= 1 && upper.length <= 5 && /^[A-Z]+$/.test(upper))) {
        categorizedSymbols.stocks.push(sym);
      }
      else {
        categorizedSymbols.other.push(sym);
      }
    });

    res.json({
      success: true,
      total: symbols.length,
      symbols: symbols,
      categorized: categorizedSymbols,
      counts: {
        forex: categorizedSymbols.forex.length,
        metals: categorizedSymbols.metals.length,
        indices: categorizedSymbols.indices.length,
        commodities: categorizedSymbols.commodities.length,
        crypto_spot: categorizedSymbols.crypto_spot.length,
        crypto_futures: categorizedSymbols.crypto_futures.length,
        crypto_options: categorizedSymbols.crypto_options.length,
        stocks: categorizedSymbols.stocks.length,
        bonds: categorizedSymbols.bonds.length,
        other: categorizedSymbols.other.length
      }
    });
  } catch (error) {
    console.error('MetaAPI proxy error (symbols):', error.message);
    res.status(500).json({ error: 'Failed to fetch symbols' });
  }
});

// Proxy: Get symbol specification (contract details)
router.get('/symbol-spec/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    const response = await fetch(
      `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/symbols/${symbol}/specification`,
      {
        headers: {
          'auth-token': METAAPI_AUTH_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch specification for ${symbol}` });
    }

    const spec = await response.json();
    res.json({ success: true, specification: spec });
  } catch (error) {
    console.error(`MetaAPI proxy error (symbol-spec/${req.params.symbol}):`, error.message);
    res.status(500).json({ error: 'Failed to fetch symbol specification' });
  }
});

router.get('/historical/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const timeframe = req.query.timeframe || '1h';
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 500;
    const startTime = req.query.startTime || undefined;

    // Try MetaAPI first
    const result = await fetchHistoricalCandles(symbol, timeframe, { limit, startTime });
    if (result.success && result.candles?.length > 0) {
      return res.json({
        success: true,
        candles: result.candles,
        source: 'metaapi',
        ...(result.resolvedSymbol ? { resolvedSymbol: result.resolvedSymbol } : {})
      });
    }

    // MetaAPI failed — try Yahoo Finance fallback
    console.log(`MetaAPI historical failed for ${symbol}, trying Yahoo Finance fallback...`);
    const yahooResult = await fetchYahooCandles(symbol, timeframe);
    if (yahooResult.success && yahooResult.candles?.length > 0) {
      // Apply limit
      const limitedCandles = yahooResult.candles.slice(-limit);
      return res.json({
        success: true,
        candles: limitedCandles,
        source: 'yahoo',
        resolvedTicker: yahooResult.resolvedTicker
      });
    }

    // Both failed
    return res.status(502).json({
      success: false,
      error: result.error || 'Failed to load candles from all sources',
      tried: result.tried,
      details: result.details,
      yahooError: yahooResult?.error
    });
  } catch (error) {
    console.error(`MetaAPI proxy error (historical/${req.params.symbol}):`, error.message);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch historical candles' });
  }
});

module.exports = router;
