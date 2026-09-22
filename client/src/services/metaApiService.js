// MetaAPI REST API Service for Real-time Price Streaming
// Now proxied through server to hide auth token from client bundle
const API_PROXY_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// Symbols to subscribe to - expanded list (crypto futures/options may be handled by broker)
const SYMBOLS = [
  // Forex Majors
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
  // Forex Cross
  'EURGBP', 'EURJPY', 'GBPJPY', 'EURCHF', 'EURAUD', 'GBPAUD', 'AUDNZD',
  // Metals
  'XAUUSD', 'XAGUSD', 'XPTUSD',
  // Indices
  'US100', 'US30', 'US500', 'DE40', 'UK100', 'JP225',
  // Commodities
  'USOIL', 'UKOIL', 'NATGAS',
  // Crypto Spot
  'BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD', 'SOLUSD', 'ADAUSD', 'DOGEUSD',
  // Crypto Futures (various naming conventions used by brokers)
  'BTCUSDT', 'ETHUSDT', 'BTCUSD.f', 'ETHUSD.f', 'BTCUSD_PERP', 'ETHUSD_PERP'
];

class MetaApiService {
  constructor() {
    this.isConnected = false;
    this.priceCallbacks = [];
    this.prices = {};
    this.previousPrices = {};
    this.pollInterval = null;
    this.pollIntervalMs = 2000; // Poll every 2000ms to stay within rate limits
    this.errorLogged = false;
  }

  // Add callback for price updates
  onPriceUpdate(callback) {
    this.priceCallbacks.push(callback);
    return () => {
      this.priceCallbacks = this.priceCallbacks.filter(cb => cb !== callback);
    };
  }

  // Notify all callbacks of price update
  notifyPriceUpdate(symbol, priceData) {
    this.prices[symbol] = priceData;
    this.priceCallbacks.forEach(callback => {
      try {
        callback(symbol, priceData, this.prices);
      } catch (err) {
        console.error('Price callback error:', err);
      }
    });
  }

  // Connect and start polling prices
  async connect() {
    if (this.isConnected && this.pollInterval) {
      console.log('Already connected to MetaAPI');
      return;
    }

    console.log('Connecting to MetaAPI REST API...');
    
    // Start polling immediately - don't wait for account info
    this.isConnected = true;
    this.startPricePolling();
    
    // Also try to get account info in background
    try {
      const accountInfo = await this.getAccountInfo();
      if (accountInfo) {
        console.log('MetaAPI connected successfully. Account:', accountInfo.login);
      }
    } catch (error) {
      console.log('Account info fetch failed, but continuing with price polling');
    }
  }

  // Get account information (via server proxy)
  async getAccountInfo() {
    try {
      const response = await fetch(`${API_PROXY_URL}/metaapi/account-info`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching account info:', error);
      return null;
    }
  }

  // Fetch current price for a symbol (via server proxy)
  async fetchSymbolPrice(symbol) {
    try {
      const response = await fetch(`${API_PROXY_URL}/metaapi/price/${symbol}`);
      
      if (!response.ok) {
        console.warn(`Failed to fetch ${symbol}: HTTP ${response.status}`);
        return null;
      }
      
      return await response.json();
    } catch (error) {
      if (!this.errorLogged) {
        console.error('MetaAPI fetch error:', error.message);
        this.errorLogged = true;
      }
      return null;
    }
  }

  // Start polling for price updates
  startPricePolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    // Initial fetch
    this.fetchAllPrices();

    // Poll at regular intervals
    this.pollInterval = setInterval(() => {
      this.fetchAllPrices();
    }, this.pollIntervalMs);
  }

  // Fetch prices for all symbols
  async fetchAllPrices() {
    const fetchPromises = SYMBOLS.map(async (symbol) => {
      const priceData = await this.fetchSymbolPrice(symbol);
      if (priceData) {
        this.updatePrice(symbol, priceData);
      }
    });

    await Promise.allSettled(fetchPromises);
  }

  // Update price data
  updatePrice(symbol, price) {
    const existing = this.previousPrices[symbol] || {};
    const prevBid = existing.bid || price.bid;
    
    const priceData = {
      symbol: symbol,
      bid: price.bid || 0,
      ask: price.ask || 0,
      low: price.low || price.bid || 0,
      high: price.high || price.ask || 0,
      time: price.time || new Date().toISOString(),
      change: this.calculateChange(prevBid, price.bid),
      pips: this.calculatePips(prevBid, price.bid, symbol)
    };
    
    // Store for next comparison
    this.previousPrices[symbol] = { bid: price.bid, ask: price.ask };
    
    this.notifyPriceUpdate(symbol, priceData);
  }

  // Calculate percentage change
  calculateChange(oldPrice, newPrice) {
    if (!oldPrice || !newPrice) return 0;
    return ((newPrice - oldPrice) / oldPrice * 100);
  }

  // Calculate pips difference
  calculatePips(oldPrice, newPrice, symbol) {
    if (!oldPrice || !newPrice) return 0;
    const diff = Math.abs(newPrice - oldPrice);
    const pipSize = symbol.includes('JPY') ? 0.01 : 0.0001;
    return Math.round(diff / pipSize);
  }

  // Execute a market order (BUY or SELL) via server proxy
  async executeOrder(symbol, side, volume) {
    try {
      const orderData = {
        symbol: symbol,
        actionType: side === 'buy' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
        volume: parseFloat(volume),
        comment: 'DhanFunded'
      };

      console.log('Executing order:', orderData);

      const response = await fetch(`${API_PROXY_URL}/metaapi/trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('Order executed:', result);
      return { success: true, data: result.data };
    } catch (error) {
      console.error('Order execution failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Disconnect and stop polling
  disconnect() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isConnected = false;
  }

  // Get current prices
  getPrices() {
    return this.prices;
  }

  // Get price for specific symbol
  getPrice(symbol) {
    return this.prices[symbol] || null;
  }

  // Fetch all available symbols from broker (dynamic)
  async fetchAvailableSymbols() {
    try {
      const response = await fetch(`${API_PROXY_URL}/metaapi/symbols`);
      
      if (!response.ok) {
        console.warn('Failed to fetch symbols from MetaAPI');
        return null;
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching available symbols:', error);
      return null;
    }
  }

  // Fetch symbol specification (contract details)
  async fetchSymbolSpec(symbol) {
    try {
      const response = await fetch(`${API_PROXY_URL}/metaapi/symbol-spec/${symbol}`);
      
      if (!response.ok) {
        console.warn(`Failed to fetch spec for ${symbol}`);
        return null;
      }
      
      const data = await response.json();
      return data.specification;
    } catch (error) {
      console.error(`Error fetching symbol spec for ${symbol}:`, error);
      return null;
    }
  }

  // Subscribe to additional symbols dynamically
  addSymbols(newSymbols) {
    if (!Array.isArray(newSymbols)) return;
    
    newSymbols.forEach(sym => {
      if (!this.subscribedSymbols) this.subscribedSymbols = [...SYMBOLS];
      if (!this.subscribedSymbols.includes(sym)) {
        this.subscribedSymbols.push(sym);
      }
    });
  }

  // Get list of subscribed symbols
  getSubscribedSymbols() {
    return this.subscribedSymbols || [...SYMBOLS];
  }
}

// Create singleton instance
const metaApiService = new MetaApiService();

export default metaApiService;
export { SYMBOLS };
