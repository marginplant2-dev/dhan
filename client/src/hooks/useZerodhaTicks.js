import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { mergeZerodhaTick } from '../utils/pricePersistence';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Ticks arrive several times a second for every subscribed instrument.
const TICK_FLUSH_MS = 200;                    // apply queued ticks to state at most 5x/sec
const CACHE_SAVE_MS = 10000;                  // localStorage write at most every 10s
const INSTRUMENTS_REFRESH_MS = 10 * 60 * 1000; // ~145KB list, changes only when admin subscribes

// Singleton socket instance
let socket = null;

const getSocket = () => {
  if (!socket) {
    socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
  }
  return socket;
};

// Cache key for localStorage
const TICKS_CACHE_KEY = 'dhanfunded-zerodha-ticks';

// Load cached ticks from localStorage
const loadCachedTicks = () => {
  try {
    const cached = localStorage.getItem(TICKS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Last-known LTP cache (7d) — used when live feed returns zeros
      if (parsed.timestamp && Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
        return parsed.ticks || {};
      }
    }
  } catch (e) {
    // Ignore cache errors
  }
  return {};
};

// Save ticks to localStorage
const saveCachedTicks = (ticks) => {
  try {
    localStorage.setItem(TICKS_CACHE_KEY, JSON.stringify({
      ticks,
      timestamp: Date.now()
    }));
  } catch (e) {
    // Ignore cache errors
  }
};

export function useZerodhaTicks() {
  const [ticks, setTicks] = useState(loadCachedTicks);
  const [isConnected, setIsConnected] = useState(false);
  const [subscribedInstruments, setSubscribedInstruments] = useState([]);
  const [zerodhaStatus, setZerodhaStatus] = useState({
    isConfigured: false,
    isConnected: false,
    wsStatus: 'disconnected'
  });

  const lastInstrumentsFetch = useRef(0);

  // Fetch Zerodha status and subscribed instruments
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/zerodha/status`);
      const data = await res.json();
      if (data.success) {
        setZerodhaStatus({
          isConfigured: data.isConfigured,
          isConnected: data.isConnected,
          wsStatus: data.wsStatus,
          subscribedCount: data.subscribedCount
        });
      }
      
      // Subscribed instruments for token mapping. ~145KB and it only changes
      // when an admin subscribes something, so: on load, then every 10 min —
      // not on every 30s status poll.
      if (Date.now() - lastInstrumentsFetch.current > INSTRUMENTS_REFRESH_MS) {
        try {
          const instRes = await fetch(`${API_URL}/api/zerodha/instruments/subscribed`);
          if (instRes.ok) {
            const instData = await instRes.json();
            if (instData.success) {
              setSubscribedInstruments(instData.instruments || []);
              lastInstrumentsFetch.current = Date.now();
            }
          }
        } catch (instError) {
          console.warn('Could not fetch subscribed instruments:', instError.message);
        }
      }

      // LTP (~65KB) fills prices when the socket is not delivering them. While
      // connected it is redundant: the server pushes LTP for every instrument
      // the moment we subscribe, and live ticks after that.
      if (getSocket().connected) return;
      try {
        const ltpRes = await fetch(`${API_URL}/api/zerodha/ltp`);
        if (ltpRes.ok) {
          const ltpData = await ltpRes.json();
          if (ltpData.success && ltpData.ticks?.length > 0) {
            setTicks(prev => {
              const updated = { ...prev };
              ltpData.ticks.forEach(tick => {
                const merged = mergeZerodhaTick(updated[tick.token], tick);
                updated[tick.token] = {
                  ...merged,
                  timestamp: Date.now()
                };
              });
              saveCachedTicks(updated);
              return updated;
            });
          }
        }
      } catch (ltpError) {
        console.warn('Could not fetch LTP:', ltpError.message);
      }
    } catch (error) {
      console.error('Error fetching Zerodha status:', error);
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();

    // Each batch used to be applied to state on arrival — re-rendering the
    // whole user shell several times a second — and the full tick map was
    // JSON-serialised into localStorage on every batch, blocking the main
    // thread. Batches now queue here and are applied at most 5x a second;
    // the cache is written at most every 10 seconds.
    let pending = [];
    let flushTimer = null;
    let lastSave = 0;

    const flush = () => {
      flushTimer = null;
      if (!pending.length) return;
      const batch = pending;
      pending = [];
      setTicks(prev => {
        const updated = { ...prev };
        const ts = Date.now();
        for (const tick of batch) {
          if (tick.token) {
            updated[tick.token] = { ...mergeZerodhaTick(updated[tick.token], tick), timestamp: ts };
          }
          if (tick.symbol) {
            const k = `sym_${tick.symbol}`;
            updated[k] = { ...mergeZerodhaTick(updated[k], tick), timestamp: ts };
          }
          if (tick.tradingsymbol) {
            const k = `sym_${tick.tradingsymbol}`;
            updated[k] = { ...mergeZerodhaTick(updated[k], tick), timestamp: ts };
          }
        }
        if (ts - lastSave > CACHE_SAVE_MS) {
          lastSave = ts;
          saveCachedTicks(updated);
        }
        return updated;
      });
    };

    const onTick = (tickData) => {
      if (!Array.isArray(tickData) || tickData.length === 0) return;
      for (const t of tickData) pending.push(t);
      if (!flushTimer) flushTimer = setTimeout(flush, TICK_FLUSH_MS);
    };
    const onConnect = () => {
      setIsConnected(true);
      socket.emit('subscribeZerodhaTicks');
    };
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('zerodha-tick', onTick);

    // Subscribe on mount
    if (socket.connected) {
      socket.emit('subscribeZerodhaTicks');
    }

    // Fetch initial status
    fetchStatus();

    // Poll status every 30 seconds
    const statusInterval = setInterval(fetchStatus, 30000);

    return () => {
      socket.emit('unsubscribeZerodhaTicks');
      // Remove only this hook's listeners — a bare off('zerodha-tick') also
      // detached every other component listening on the shared socket.
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('zerodha-tick', onTick);
      clearInterval(statusInterval);
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [fetchStatus]);

  // Get tick by instrument token
  const getTickByToken = useCallback((token) => {
    return ticks[token] || null;
  }, [ticks]);

  // Get tick by symbol (requires mapping)
  const getTickBySymbol = useCallback((symbol, subscribedInstruments) => {
    const instrument = subscribedInstruments?.find(i => i.symbol === symbol);
    if (instrument) {
      return ticks[instrument.token] || null;
    }
    return null;
  }, [ticks]);

  // Get all ticks as array
  const getAllTicks = useCallback(() => {
    return Object.values(ticks);
  }, [ticks]);

  // Get tick by symbol using subscribedInstruments for token lookup
  const getTickBySymbolAuto = useCallback((symbol) => {
    if (!symbol) return null;
    
    // Try direct symbol lookup first
    if (ticks[`sym_${symbol}`]) {
      return ticks[`sym_${symbol}`];
    }
    
    // Try uppercase symbol lookup
    if (ticks[`sym_${symbol.toUpperCase()}`]) {
      return ticks[`sym_${symbol.toUpperCase()}`];
    }
    
    // Try exact match in subscribedInstruments
    let instrument = subscribedInstruments.find(i => i.symbol === symbol);
    
    // Try case-insensitive match
    if (!instrument) {
      instrument = subscribedInstruments.find(i => 
        i.symbol?.toUpperCase() === symbol.toUpperCase()
      );
    }
    
    // Try matching by tradingsymbol (some instruments have different format)
    if (!instrument) {
      instrument = subscribedInstruments.find(i => 
        i.tradingsymbol === symbol || i.tradingsymbol?.toUpperCase() === symbol.toUpperCase()
      );
    }
    
    // Try partial match (symbol might be stored as "SBIN" but position has "SBIN").
    // CRITICAL: when the CALLER did NOT ask for an option contract, never return one
    // here — otherwise a lookup like getTickBySymbolAuto('NIFTY') will pick up
    // 'NIFTY25APR22700CE' (some random option) and return its premium as if it were
    // the underlying spot. That breaks the options strike-percentage validator.
    if (!instrument) {
      const isOptionLike = (s) => /\d+[CP]E$/.test(s || '');
      const callerWantsOption = isOptionLike(symbol);
      instrument = subscribedInstruments.find(i => {
        if (!i?.symbol) return false;
        if (!callerWantsOption && isOptionLike(i.symbol)) return false;
        return i.symbol.startsWith(symbol) || symbol.startsWith(i.symbol);
      });
    }
    
    if (instrument) {
      const tick = ticks[instrument.token];
      if (tick) {
        return tick;
      }
    }
    
    // Also try direct lookup in ticks by iterating (in case token mapping is different)
    for (const [key, tick] of Object.entries(ticks)) {
      if (tick.symbol === symbol || tick.tradingsymbol === symbol || 
          tick.symbol?.toUpperCase() === symbol.toUpperCase()) {
        return tick;
      }
    }
    
    return null;
  }, [ticks, subscribedInstruments]);

  return {
    ticks,
    isConnected,
    zerodhaStatus,
    subscribedInstruments,
    getTickByToken,
    getTickBySymbol,
    getTickBySymbolAuto,
    getAllTicks,
    refreshStatus: fetchStatus
  };
}

// Hook to fetch subscribed instruments
export function useZerodhaInstruments() {
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchInstruments = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/zerodha/instruments/subscribed`);
      const data = await res.json();
      if (data.success) {
        setInstruments(data.instruments || []);
      }
    } catch (error) {
      console.error('Error fetching subscribed instruments:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstruments();
  }, [fetchInstruments]);

  return {
    instruments,
    loading,
    refresh: fetchInstruments
  };
}

// Hook to search instruments
export function useZerodhaSearch() {
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (query, segment = null) => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      const params = new URLSearchParams({ query });
      if (segment) params.set('segment', segment);
      
      const res = await fetch(`${API_URL}/api/zerodha/instruments/search?${params}`);
      const data = await res.json();
      if (data.success) {
        setResults(data.instruments || []);
      }
    } catch (error) {
      console.error('Error searching instruments:', error);
    } finally {
      setSearching(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
  }, []);

  return {
    results,
    searching,
    search,
    clearResults
  };
}

export default useZerodhaTicks;
