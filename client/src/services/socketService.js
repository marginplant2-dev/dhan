import { io } from 'socket.io-client';
import { mergeQuoteObject } from '../utils/pricePersistence';
import tradingSounds from '../utils/sounds';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Use window global to ensure single socket across HMR reloads
const SOCKET_KEY = '__dhanfunded_socket__';
const CACHE_KEY = '__dhanfunded_price_cache__';
const LISTENERS_KEY = '__dhanfunded_listeners__';

// Initialize globals if not exists
if (typeof window !== 'undefined') {
  if (!window[CACHE_KEY]) window[CACHE_KEY] = {};
  if (!window[LISTENERS_KEY]) window[LISTENERS_KEY] = { price: new Set(), connection: new Set() };
}

class SocketService {
  constructor() {
    this._isConnected = false;
  }

  get socket() { 
    return typeof window !== 'undefined' ? window[SOCKET_KEY] : null; 
  }
  
  set socket(val) { 
    if (typeof window !== 'undefined') window[SOCKET_KEY] = val; 
  }
  
  get priceCache() { 
    return typeof window !== 'undefined' ? window[CACHE_KEY] : {}; 
  }
  
  set priceCache(val) { 
    if (typeof window !== 'undefined') window[CACHE_KEY] = val; 
  }
  
  get priceListeners() { 
    return typeof window !== 'undefined' ? window[LISTENERS_KEY].price : new Set(); 
  }
  
  get connectionListeners() { 
    return typeof window !== 'undefined' ? window[LISTENERS_KEY].connection : new Set(); 
  }
  
  get isConnected() { 
    return this.socket ? this.socket.connected : false; 
  }

  init() {
    if (!this.socket) {
      this.socket = io(API_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
      });
    } else if (!this.socket.connected) {
      this.socket.connect();
    }

    // Attach once per socket instance (survives HMR / early init() returns)
    if (!this.socket._dhanfundedCoreListenersAttached) {
      this.socket._dhanfundedCoreListenersAttached = true;
      this._attachCoreSocketListeners(this.socket);
    }

    // If we're already connected (e.g. post-login after socket was created
    // anonymously on app boot), make sure we're in the user's room.
    if (this.socket.connected) {
      this._joinUserRoom(this.socket);
    }

    return this.socket;
  }

  _joinUserRoom(socket) {
    try {
      const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
      const userId = authData?.user?._id || authData?.user?.id || authData?.userId;
      if (userId) {
        socket.emit('join', String(userId));
      }
    } catch (_) { /* optional */ }
  }

  _attachCoreSocketListeners(socket) {
    socket.on('connect', () => {
      this._joinUserRoom(socket);
      this.notifyConnectionListeners();
    });

    socket.on('disconnect', () => {
      this.notifyConnectionListeners();
    });

    socket.on('connect_error', (err) => {
      console.error('Socket.IO error:', err.message);
    });

    socket.on('price_tick', (priceData) => {
      if (priceData && priceData.symbol) {
        const sym = priceData.symbol;
        this.priceCache[sym] = mergeQuoteObject(this.priceCache[sym], priceData);
        this.notifyPriceListeners();
      }
    });

    socket.on('prices_batch', (allPrices) => {
      if (allPrices && typeof allPrices === 'object') {
        const count = Object.keys(allPrices).length;
        if (count > 0 && Object.keys(this.priceCache).length === 0) {
          console.log(`📈 MetaAPI prices received: ${count} symbols`);
        }
        const next = { ...this.priceCache };
        for (const [sym, p] of Object.entries(allPrices)) {
          next[sym] = mergeQuoteObject(this.priceCache[sym], p);
        }
        this.priceCache = next;
        this.notifyPriceListeners();
      }
    });

    socket.on('delta_prices_batch', (allPrices) => {
      if (allPrices && typeof allPrices === 'object') {
        const next = { ...this.priceCache };
        for (const [sym, p] of Object.entries(allPrices)) {
          next[sym] = mergeQuoteObject(this.priceCache[sym], p);
        }
        this.priceCache = next;
        this.notifyPriceListeners();
      }
    });

    socket.on('delta_price_tick', (priceData) => {
      if (priceData && priceData.symbol) {
        const sym = priceData.symbol;
        this.priceCache[sym] = mergeQuoteObject(this.priceCache[sym], priceData);
        this.notifyPriceListeners();
      }
    });

    // Expiry settlement notifications
    socket.on('expirySettlement', (data) => {
      console.log('[Socket] Expiry settlement notification:', data);
      // Show notification to user
      if (data.type === 'position_closed') {
        this.showExpiryNotification(data.message, data.profit >= 0 ? 'success' : 'warning');
      } else if (data.type === 'pending_cancelled') {
        this.showExpiryNotification(data.message, 'info');
      }
    });

    // Margin call warning
    socket.on('marginCall', (data) => {
      console.log('[Socket] Margin call warning:', data);
      this.showExpiryNotification(data.message, 'warning');
    });

    // Stop out notification
    socket.on('stopOut', (data) => {
      console.log('[Socket] Stop out notification:', data);
      try { tradingSounds.playSLHit(); } catch (_) {}
      this.showExpiryNotification(data.message, 'error');
    });

    // Per-fill SL/TP hit (Fix 19) — emitted by metaApiStreaming when a single
    // open Trade leg's stopLoss/takeProfit gets crossed by the price tick.
    socket.on('legClosedBySLTP', (data) => {
      console.log('[Socket] Leg closed by SL/TP:', data);
      try {
        if (data?.reason === 'tp') tradingSounds.playTPHit();
        else if (data?.reason === 'sl') tradingSounds.playSLHit();
        else tradingSounds.playTradeClosed();
      } catch (_) {}
      const profit = Number(data?.profit) || 0;
      const reasonLabel = data?.reason === 'tp' ? 'Take Profit' : 'Stop Loss';
      const profitStr = profit >= 0 ? `+${profit.toFixed(2)}` : profit.toFixed(2);
      this.showExpiryNotification(
        `${reasonLabel} hit on ${data?.symbol || 'position'} (${profitStr})`,
        profit >= 0 ? 'success' : 'warning'
      );
    });

    // Position-level SL/TP hit (Fix 19) — emitted by metaApiStreaming when
    // the parent NettingPosition's stopLoss/takeProfit fires. Closes every
    // remaining open leg of that parent.
    socket.on('positionClosedBySLTP', (data) => {
      console.log('[Socket] Position closed by SL/TP:', data);
      try {
        if (data?.reason === 'tp') tradingSounds.playTPHit();
        else if (data?.reason === 'sl') tradingSounds.playSLHit();
        else tradingSounds.playTradeClosed();
      } catch (_) {}
      const reasonLabel = data?.reason === 'tp' ? 'Take Profit' : 'Stop Loss';
      this.showExpiryNotification(
        `${reasonLabel} closed position ${data?.symbol || ''}`,
        data?.reason === 'tp' ? 'success' : 'warning'
      );
    });
  }

  showExpiryNotification(message, type = 'info') {
    // Dispatch custom event for UI components to handle
    window.dispatchEvent(new CustomEvent('tradeNotification', {
      detail: { message, type }
    }));
  }

  notifyPriceListeners() {
    const prices = { ...this.priceCache };
    this.priceListeners.forEach(listener => {
      try {
        listener(prices);
      } catch (e) {
        console.error('Price listener error:', e);
      }
    });
  }

  notifyConnectionListeners() {
    this.connectionListeners.forEach(listener => {
      try {
        listener(this.isConnected);
      } catch (e) {
        console.error('Connection listener error:', e);
      }
    });
  }

  onPriceUpdate(callback) {
    this.priceListeners.add(callback);
    // Immediately send current cache
    if (Object.keys(this.priceCache).length > 0) {
      callback({ ...this.priceCache });
    }
    return () => this.priceListeners.delete(callback);
  }

  onConnectionChange(callback) {
    this.connectionListeners.add(callback);
    // Immediately send current state
    callback(this.isConnected);
    return () => this.connectionListeners.delete(callback);
  }

  updatePrice(symbol, priceData) {
    this.priceCache[symbol] = priceData;
    this.notifyPriceListeners();
  }

  getPrices() {
    return { ...this.priceCache };
  }

  getConnectionStatus() {
    return this.isConnected;
  }

  getSocket() {
    // Ensure socket is initialized
    if (!this.socket) {
      this.init();
    }
    return this.socket;
  }
}

// Create singleton instance
const socketService = new SocketService();

// Initialize immediately when module loads (outside React)
socketService.init();

export default socketService;
