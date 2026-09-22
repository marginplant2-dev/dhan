import { useState, useEffect, useCallback, useRef } from 'react';
import socketService from '../services/socketService';
import { mergeQuoteObject } from '../utils/pricePersistence';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Custom hook for Delta Exchange crypto futures & options
 * Provides real-time prices and instrument search
 */
export const useDeltaExchange = () => {
  const [instruments, setInstruments] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState(null);
  
  const searchTimeoutRef = useRef(null);

  // Fetch instruments from API
  const fetchInstruments = useCallback(async (category = 'all') => {
    setLoading(true);
    setError(null);
    
    try {
      const url = `${API_BASE_URL}/api/delta/instruments?category=${category}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        setInstruments(data.instruments || []);
      } else {
        setError(data.error || 'Failed to fetch instruments');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Search instruments
  const searchInstruments = useCallback(async (query, category = 'all') => {
    if (!query || query.length < 1) {
      return fetchInstruments(category);
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const url = `${API_BASE_URL}/api/delta/instruments?search=${encodeURIComponent(query)}&category=${category}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        setInstruments(data.instruments || []);
        return data.instruments;
      } else {
        setError(data.error || 'Search failed');
        return [];
      }
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [fetchInstruments]);

  // Debounced search
  const debouncedSearch = useCallback((query, category = 'all', delay = 300) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      searchInstruments(query, category);
    }, delay);
  }, [searchInstruments]);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/delta/status`);
      const data = await response.json();
      
      if (data.success) {
        setStatus(data);
        setIsConnected(data.connected);
      }
    } catch (err) {
      console.error('Failed to fetch Delta Exchange status:', err);
    }
  }, []);

  // Get instruments by category
  const getByCategory = useCallback((category) => {
    return instruments.filter(inst => {
      switch (category) {
        case 'perpetual':
        case 'perpetual_futures':
          return inst.contract_type === 'perpetual_futures';
        case 'futures':
          return inst.contract_type === 'futures';
        case 'call_options':
          return inst.contract_type === 'call_options';
        case 'put_options':
          return inst.contract_type === 'put_options';
        case 'options':
          return inst.contract_type === 'call_options' || inst.contract_type === 'put_options';
        case 'spot':
          return inst.contract_type === 'spot';
        default:
          return true;
      }
    });
  }, [instruments]);

  // Get instrument with live price
  const getInstrumentWithPrice = useCallback((symbol) => {
    const instrument = instruments.find(i => i.symbol === symbol);
    const price = prices[symbol];
    
    if (!instrument) return null;
    
    return {
      ...instrument,
      bid: price?.bid || instrument.bid || 0,
      ask: price?.ask || instrument.ask || 0,
      last: price?.last || instrument.last || 0,
      mark_price: price?.mark_price || instrument.mark_price || 0,
      high: price?.high || instrument.high || 0,
      low: price?.low || instrument.low || 0,
      change: price?.change || instrument.change || 0,
      volume: price?.volume || instrument.volume || 0,
      open_interest: price?.open_interest || instrument.open_interest || 0,
      funding_rate: price?.funding_rate || instrument.funding_rate || 0,
      greeks: price?.greeks || instrument.greeks || null
    };
  }, [instruments, prices]);

  // Subscribe to real-time price updates
  useEffect(() => {
    // Handle batch price updates
    const handlePricesBatch = (batchPrices) => {
      setPrices((prev) => {
        const next = { ...prev };
        for (const [sym, p] of Object.entries(batchPrices || {})) {
          next[sym] = mergeQuoteObject(prev[sym], p);
        }
        return next;
      });
    };

    // Handle individual price tick
    const handlePriceTick = (priceData) => {
      if (priceData && priceData.symbol) {
        const sym = priceData.symbol;
        setPrices((prev) => ({
          ...prev,
          [sym]: mergeQuoteObject(prev[sym], priceData)
        }));
      }
    };

    // Subscribe to Delta Exchange price events
    const socket = socketService.getSocket();
    if (socket) {
      socket.on('delta_prices_batch', handlePricesBatch);
      socket.on('delta_price_tick', handlePriceTick);
    }

    // Initial fetch
    fetchInstruments();
    fetchStatus();

    // Cleanup
    return () => {
      if (socket) {
        socket.off('delta_prices_batch', handlePricesBatch);
        socket.off('delta_price_tick', handlePriceTick);
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [fetchInstruments, fetchStatus]);

  return {
    instruments,
    prices,
    loading,
    error,
    isConnected,
    status,
    fetchInstruments,
    searchInstruments,
    debouncedSearch,
    getByCategory,
    getInstrumentWithPrice,
    fetchStatus
  };
};

export default useDeltaExchange;
