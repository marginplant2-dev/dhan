import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const HYDRATE_FETCH_MS = 12000;
const INSTRUMENTS_LIST_MS = 20000;

/** MetaAPI crypto CFDs — use Delta Exchange (Perpetual Futures) instead; hide from international All/search */
function excludeMetaCryptoPerpetual(list) {
  return (list || []).filter(
    (i) => i.category !== 'crypto_perpetual' && i.category !== 'crypto'
  );
}

function fetchWithTimeout(url, options = {}, ms = HYDRATE_FETCH_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

/**
 * Hook to fetch and search all available instruments from the broker
 * Similar to MT5/Zerodha style - fetches all 480+ instruments dynamically
 */
export function useBrokerInstruments() {
  const [allInstruments, setAllInstruments] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const searchTimeoutRef = useRef(null);
  const lastFetchRef = useRef(0);

  const fetchAllInstruments = useCallback(async () => {
    // Debounce - don't fetch more than once per 5 seconds
    const now = Date.now();
    if (now - lastFetchRef.current < 5000) return;
    lastFetchRef.current = now;

    try {
      setIsLoading(true);
      const response = await fetchWithTimeout(`${API_URL}/api/instruments`, {}, INSTRUMENTS_LIST_MS);
      const data = await response.json();
      
      if (data.success && data.instruments) {
        const raw = excludeMetaCryptoPerpetual(data.instruments);
        setAllInstruments(raw);
        const cats = [...new Set(raw.map((i) => i.category))];
        setCategories(cats.sort());
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch instruments');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllInstruments();
    const interval = setInterval(fetchAllInstruments, 30000);
    return () => clearInterval(interval);
  }, [fetchAllInstruments]);

  // Search instruments (debounced)
  const searchInstruments = useCallback((query, category = 'all') => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // If empty query, clear results
    if (!query || query.length < 1) {
      setSearchResults([]);
      return;
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        if (query) params.append('search', query);
        const apiCat =
          category === 'com'
            ? 'com'
            : category === 'forex'
              ? 'forex'
              : category;
        if (apiCat && apiCat !== 'all') params.append('category', apiCat);
        
        const response = await fetchWithTimeout(`${API_URL}/api/instruments?${params}`, {}, INSTRUMENTS_LIST_MS);
        const data = await response.json();
        
        if (data.success && data.instruments) {
          const list = data.instruments || [];
          setSearchResults(category === 'all' ? excludeMetaCryptoPerpetual(list) : list);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsLoading(false);
      }
    }, 300); // 300ms debounce
  }, []);

  // Get instruments by category
  const getByCategory = useCallback((category) => {
    if (!category || category === 'all') return excludeMetaCryptoPerpetual(allInstruments);
    if (category === 'com') {
      return allInstruments.filter((i) => i.category === 'metals' || i.category === 'energy');
    }
    if (category === 'forex') {
      return allInstruments.filter((i) => i.category === 'forex' || i.category === 'forex_yen');
    }
    return allInstruments.filter((i) => i.category === category);
  }, [allInstruments]);

  // Get instrument by symbol
  const getInstrument = useCallback((symbol) => {
    return allInstruments.find(i => i.symbol === symbol);
  }, [allInstruments]);

  // Category display names
  const categoryNames = {
    forex: 'Forex',
    forex_yen: 'Forex (JPY)',
    metals: 'Commodities',
    crypto_perpetual: 'Crypto Perpetual',
    crypto: 'Crypto Perpetual',
    stocks: 'Stocks (International)',
    indices: 'Indices',
    energy: 'Commodities',
    other: 'Other'
  };

  return {
    allInstruments,
    searchResults,
    isLoading,
    error,
    categories,
    categoryNames,
    searchInstruments,
    getByCategory,
    getInstrument,
    refreshInstruments: fetchAllInstruments
  };
}
