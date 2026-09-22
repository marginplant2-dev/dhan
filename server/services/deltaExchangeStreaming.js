const WebSocket = require('ws');
const axios = require('axios');

// Delta Exchange API Configuration from .env
const DELTA_API_URL = process.env.DELTA_API_URL || 'https://api.india.delta.exchange';
const DELTA_WS_URL = process.env.DELTA_WS_URL || 'wss://socket.india.delta.exchange';
const DELTA_API_KEY = process.env.DELTA_API_KEY;
const DELTA_API_SECRET = process.env.DELTA_API_SECRET;

class DeltaExchangeStreamingService {
  constructor(io) {
    this.io = io;
    this.ws = null;
    this.isConnected = false;
    this.prices = {};
    this.products = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    this.heartbeatInterval = null;
    this.lastMessageTime = Date.now();
    this._priceBroadcastStarted = false;
  }

  async initialize() {
    console.log('🔷 Initializing Delta Exchange streaming service...');
    console.log(`📡 API URL: ${DELTA_API_URL}`);
    console.log(`📡 WS URL: ${DELTA_WS_URL}`);
    
    try {
      // First fetch all available products
      await this.fetchProducts();
      
      // Start price broadcast (REST-based initially)
      this.startPriceBroadcast();
      
      // Then try to connect to WebSocket (non-blocking)
      this.connectWebSocket().catch(err => {
        console.log('⚠️ WebSocket connection failed, using REST API fallback:', err.message);
      });
      
      console.log('✅ Delta Exchange streaming service initialized with', this.products.length, 'products');
    } catch (error) {
      console.error('❌ Failed to initialize Delta Exchange:', error.message);
      // Still try to start with REST API fallback
      this.startPriceBroadcast();
    }
  }

  async fetchProducts() {
    try {
      console.log('📦 Fetching Delta Exchange products...');
      
      const response = await axios.get(`${DELTA_API_URL}/v2/products`, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (response.data && response.data.result) {
        this.products = response.data.result.filter(p => 
          p.state === 'live' && 
          (p.contract_type === 'perpetual_futures' || 
           p.contract_type === 'futures' || 
           p.contract_type === 'call_options' || 
           p.contract_type === 'put_options' ||
           p.contract_type === 'spot')
        );
        
        console.log(`📊 Found ${this.products.length} Delta Exchange products`);
        
        // Categorize products
        const categories = {
          perpetual: this.products.filter(p => p.contract_type === 'perpetual_futures').length,
          futures: this.products.filter(p => p.contract_type === 'futures').length,
          callOptions: this.products.filter(p => p.contract_type === 'call_options').length,
          putOptions: this.products.filter(p => p.contract_type === 'put_options').length,
          spot: this.products.filter(p => p.contract_type === 'spot').length
        };
        console.log('📈 Product categories:', categories);
      }
    } catch (error) {
      console.error('❌ Failed to fetch Delta Exchange products:', error.message);
      throw error;
    }
  }

  async fetchTickers() {
    try {
      const response = await axios.get(`${DELTA_API_URL}/v2/tickers`, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (response.data && response.data.result) {
        response.data.result.forEach(ticker => {
          this.handleTickerUpdate(ticker);
        });
      }
    } catch (error) {
      console.error('❌ Failed to fetch Delta Exchange tickers:', error.message);
    }
  }

  connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔌 Connecting to Delta Exchange WebSocket...');
        
        this.ws = new WebSocket(DELTA_WS_URL);
        
        this.ws.on('open', () => {
          console.log('✅ Connected to Delta Exchange WebSocket');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // Subscribe to ticker channel for all symbols
          this.subscribeToTickers();
          
          // Start heartbeat
          this.startHeartbeat();
          
          resolve();
        });
        
        this.ws.on('message', (data) => {
          this.lastMessageTime = Date.now();
          this.handleMessage(data);
        });
        
        this.ws.on('error', (error) => {
          console.error('❌ Delta Exchange WebSocket error:', error.message);
          reject(error);
        });
        
        this.ws.on('close', () => {
          console.log('🔴 Delta Exchange WebSocket disconnected');
          this.isConnected = false;
          this.stopHeartbeat();
          this.scheduleReconnect();
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }

  subscribeToTickers() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    // Get symbols for perpetual futures (main trading instruments)
    const perpetualSymbols = this.products
      .filter(p => p.contract_type === 'perpetual_futures')
      .map(p => p.symbol);
    
    // Subscribe to v2/ticker for all perpetual futures
    const subscribeMessage = {
      type: 'subscribe',
      payload: {
        channels: [
          {
            name: 'v2/ticker',
            symbols: perpetualSymbols.length > 0 ? perpetualSymbols : ['all']
          }
        ]
      }
    };
    
    this.ws.send(JSON.stringify(subscribeMessage));
    console.log(`📡 Subscribed to ${perpetualSymbols.length} Delta Exchange tickers`);
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'subscriptions') {
        console.log('📋 Delta Exchange subscriptions:', message.channels?.map(c => c.name).join(', '));
      } else if (message.type === 'v2/ticker') {
        this.handleTickerUpdate(message);
      } else if (message.symbol) {
        // Direct ticker update
        this.handleTickerUpdate(message);
      }
    } catch (error) {
      // Ignore parse errors for non-JSON messages
    }
  }

  handleTickerUpdate(ticker) {
    if (!ticker || !ticker.symbol) return;
    
    const product = this.products.find(p => p.symbol === ticker.symbol);
    
    const priceData = {
      symbol: ticker.symbol,
      bid: parseFloat(ticker.quotes?.best_bid || ticker.close || 0),
      ask: parseFloat(ticker.quotes?.best_ask || ticker.close || 0),
      last: parseFloat(ticker.close || ticker.mark_price || 0),
      mark_price: parseFloat(ticker.mark_price || 0),
      high: parseFloat(ticker.high || 0),
      low: parseFloat(ticker.low || 0),
      open: parseFloat(ticker.open || 0),
      volume: parseFloat(ticker.volume || 0),
      turnover_usd: parseFloat(ticker.turnover_usd || 0),
      open_interest: parseFloat(ticker.oi || 0),
      change: parseFloat(ticker.mark_change_24h || 0),
      funding_rate: parseFloat(ticker.funding_rate || 0),
      contract_type: product?.contract_type || 'unknown',
      underlying: product?.underlying_asset?.symbol || '',
      expiry: product?.settlement_time || null,
      time: new Date().toISOString(),
      source: 'delta_exchange'
    };
    
    // Add Greeks for options
    if (ticker.greeks) {
      priceData.greeks = {
        delta: parseFloat(ticker.greeks.delta || 0),
        gamma: parseFloat(ticker.greeks.gamma || 0),
        theta: parseFloat(ticker.greeks.theta || 0),
        vega: parseFloat(ticker.greeks.vega || 0),
        rho: parseFloat(ticker.greeks.rho || 0),
        iv: parseFloat(ticker.quotes?.mark_iv || 0)
      };
    }
    
    this.prices[ticker.symbol] = priceData;
    
    // Emit individual price update — only to sockets that asked for Delta
    // prices (see 'subscribeDeltaPrices' in index.js), not to every browser.
    this.io.to('delta-prices').emit('delta_price_tick', priceData);
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Check if we haven't received any message in 30 seconds
        if (Date.now() - this.lastMessageTime > 30000) {
          console.log('⚠️ No Delta Exchange messages for 30s, reconnecting...');
          this.ws.close();
          return;
        }
        
        // Send ping
        try {
          this.ws.ping();
        } catch (error) {
          console.error('❌ Delta Exchange ping failed:', error.message);
        }
      }
    }, 15000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnect attempts reached for Delta Exchange');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
    
    console.log(`🔄 Reconnecting to Delta Exchange in ${delay/1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.initialize();
    }, delay);
  }

  startPriceBroadcast() {
    if (this._priceBroadcastStarted) return;
    this._priceBroadcastStarted = true;
    // Broadcast all prices every second — to the 'delta-prices' room only.
    // io.emit sent this ~560 KB map, plus every individual tick, to every
    // connected browser: measured at 686 KB/s per tab during market hours on a
    // platform that trades NSE/BSE only. The trade engines are unaffected —
    // they read prices in memory via getPrice(), not from this broadcast.
    setInterval(() => {
      if (Object.keys(this.prices).length > 0) {
        this.io.to('delta-prices').emit('delta_prices_batch', this.prices);
      }
    }, 1000);
    
    // Fetch tickers via REST every 5 seconds (always, as primary data source)
    setInterval(async () => {
      await this.fetchTickers();
    }, 5000);
    
    // Initial ticker fetch
    this.fetchTickers();
  }

  // Get all products with current prices
  getAllInstruments() {
    return this.products.map(product => {
      const price = this.prices[product.symbol] || {};
      return {
        symbol: product.symbol,
        name: product.description || product.symbol,
        contract_type: product.contract_type,
        underlying: product.underlying_asset?.symbol || '',
        settling_asset: product.settling_asset?.symbol || '',
        tick_size: parseFloat(product.tick_size || 0),
        contract_value: parseFloat(product.contract_value || 1),
        lot_size: parseFloat(product.lot_size || 1),
        expiry: product.settlement_time || null,
        state: product.state,
        bid: price.bid || 0,
        ask: price.ask || 0,
        last: price.last || 0,
        mark_price: price.mark_price || 0,
        high: price.high || 0,
        low: price.low || 0,
        volume: price.volume || 0,
        open_interest: price.open_interest || 0,
        change: price.change || 0,
        funding_rate: price.funding_rate || 0,
        greeks: price.greeks || null,
        source: 'delta_exchange'
      };
    });
  }

  // Get instruments by category
  getInstrumentsByCategory(category) {
    const categoryMap = {
      'perpetual': 'perpetual_futures',
      'perpetual_futures': 'perpetual_futures',
      'futures': 'futures',
      'call_options': 'call_options',
      'put_options': 'put_options',
      'options': ['call_options', 'put_options'],
      'spot': 'spot'
    };
    
    const contractTypes = categoryMap[category];
    if (!contractTypes) return this.getAllInstruments();
    
    const types = Array.isArray(contractTypes) ? contractTypes : [contractTypes];
    
    return this.products
      .filter(p => types.includes(p.contract_type))
      .map(product => {
        const price = this.prices[product.symbol] || {};
        return {
          symbol: product.symbol,
          name: product.description || product.symbol,
          contract_type: product.contract_type,
          underlying: product.underlying_asset?.symbol || '',
          expiry: product.settlement_time || null,
          bid: price.bid || 0,
          ask: price.ask || 0,
          last: price.last || 0,
          mark_price: price.mark_price || 0,
          change: price.change || 0,
          volume: price.volume || 0,
          open_interest: price.open_interest || 0,
          greeks: price.greeks || null,
          source: 'delta_exchange'
        };
      });
  }

  // Search instruments
  searchInstruments(query) {
    const lowerQuery = query.toLowerCase();
    return this.getAllInstruments().filter(inst => 
      inst.symbol.toLowerCase().includes(lowerQuery) ||
      inst.name.toLowerCase().includes(lowerQuery) ||
      inst.underlying.toLowerCase().includes(lowerQuery)
    );
  }

  // Get current prices
  getPrices() {
    return this.prices;
  }

  // Get price for a specific symbol (for trading)
  getPrice(symbol) {
    const price = this.prices[symbol];
    if (!price) return null;
    
    return {
      symbol: price.symbol,
      bid: price.bid || price.last || 0,
      ask: price.ask || price.last || 0,
      last: price.last || 0,
      lastPrice: price.last || price.mark_price || 0,
      mark_price: price.mark_price || 0,
      time: price.time
    };
  }

  // Check if symbol is a Delta Exchange instrument
  isDeltaSymbol(symbol) {
    // Delta Exchange symbols typically have patterns like:
    // C-BTC-100000-240426 (call option)
    // P-BTC-100000-240426 (put option)
    // BTCUSD (perpetual)
    // ETHUSD (perpetual)
    return this.products.some(p => p.symbol === symbol) || 
           this.prices[symbol] !== undefined ||
           /^[CP]-[A-Z]+-\d+-\d+$/.test(symbol) || // Options pattern
           /^[A-Z]+USD$/.test(symbol); // Perpetual pattern
  }

  // Get connection status
  getStatus() {
    return {
      connected: this.isConnected,
      productsCount: this.products.length,
      pricesCount: Object.keys(this.prices).length,
      lastUpdate: this.lastMessageTime
    };
  }
}

module.exports = DeltaExchangeStreamingService;
