import { useState, useEffect, useCallback, useRef } from 'react';
import {
  mergeWatchlistBrokerVariants,
  stripBrokerInstrumentSuffix,
  canonicalBrokerSymbolForBase,
  isBrokerVariantInWatchlist
} from '../utils/brokerSymbolUtils';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Custom hook to manage user preferences
 * Uses database as primary storage, with localStorage as fallback for guests/offline
 * 
 * Preferences stored in DB:
 * - displayCurrency (USD/INR)
 * - darkMode (boolean)
 * - activePage (string)
 * - watchlist (array of symbols)
 * - chartInterval (string)
 * - orderPanelSide (left/right)
 * - lastSelectedSymbol, chartTabs (market page — persist across reload)
 */
export const useUserPreferences = (user) => {
  const [preferences, setPreferences] = useState({
    // Every instrument on this platform is Indian and priced in rupees. The old
    // default was USD, so P/L flashed in dollars on every load until the saved
    // preference arrived — and stuck in dollars for anyone whose account saved
    // that default once.
    displayCurrency: 'INR',
    darkMode: true,
    activePage: 'home',
    watchlist: [],
    lastSelectedSymbol: '',
    chartTabs: [],
    chartInterval: '1h',
    orderPanelSide: 'right'
  });
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false);
  const saveTimeoutRef = useRef(null);

  // Get auth token
  const getToken = () => {
    return localStorage.getItem('dhanfunded-token');
  };

  // Check if user is logged in
  const isLoggedIn = () => {
    return !!(user?.id || user?.oderId || getToken());
  };

  // Fetch preferences from database
  const fetchPreferences = useCallback(async () => {
    if (!isLoggedIn()) {
      // Load from localStorage for guests
      loadFromLocalStorage();
      setLoading(false);
      return;
    }

    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/api/auth/preferences`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.preferences) {
          const dbPrefs = data.preferences;
          const rawWl = Array.isArray(dbPrefs.watchlist) ? dbPrefs.watchlist : [];
          const normWl = mergeWatchlistBrokerVariants(rawWl.length ? rawWl : []);

          // Merge with defaults
          const dbTabs = Array.isArray(dbPrefs.chartTabs) ? dbPrefs.chartTabs.map(String).filter(Boolean) : [];
          const dbLast = dbPrefs.lastSelectedSymbol != null ? String(dbPrefs.lastSelectedSymbol).trim() : '';

          setPreferences(prev => ({
            ...prev,
            // A stored 'USD' is almost always the old default that got written back,
            // not a choice. An admin who genuinely wants USD sets it per user via
            // allowedCurrencyDisplay, which is applied after this and still wins.
            displayCurrency: dbPrefs.displayCurrency === 'INR' ? 'INR' : (prev.displayCurrency || 'INR'),
            darkMode: dbPrefs.darkMode !== undefined ? dbPrefs.darkMode : prev.darkMode,
            activePage: dbPrefs.activePage || prev.activePage,
            watchlist: rawWl.length ? normWl : prev.watchlist,
            lastSelectedSymbol: dbLast || prev.lastSelectedSymbol,
            chartTabs: dbTabs.length ? dbTabs.slice(0, 20) : prev.chartTabs,
            chartInterval: dbPrefs.chartInterval || prev.chartInterval,
            orderPanelSide: dbPrefs.orderPanelSide || prev.orderPanelSide
          }));

          if (rawWl.length && JSON.stringify(normWl) !== JSON.stringify(rawWl)) {
            fetch(`${API_URL}/api/auth/preferences`, {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ watchlist: normWl })
            }).catch(() => {});
          }
          
          setSynced(true);
          
          // Migrate localStorage data to DB if exists and DB is empty
          migrateLocalStorageToDb(dbPrefs);
        }
      } else {
        // Fallback to localStorage
        loadFromLocalStorage();
      }
    } catch (error) {
      console.warn('Could not fetch preferences from server, using localStorage:', error.message);
      loadFromLocalStorage();
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.oderId]);

  // Load preferences from localStorage (fallback)
  const loadFromLocalStorage = () => {
    try {
      const displayCurrency = localStorage.getItem('dhanfunded-display-currency') || 'INR';
      const darkMode = localStorage.getItem('dhanfunded-dark-mode');
      const activePage = localStorage.getItem('dhanfunded-active-page') || 'home';
      const watchlistStr = localStorage.getItem('dhanfunded-watchlist');
      setPreferences(prev => {
        let wl = watchlistStr ? JSON.parse(watchlistStr) : prev.watchlist;
        if (Array.isArray(wl)) {
          const merged = mergeWatchlistBrokerVariants(wl);
          if (JSON.stringify(merged) !== JSON.stringify(wl)) {
            wl = merged;
            localStorage.setItem('dhanfunded-watchlist', JSON.stringify(wl));
          }
        }
        return {
          ...prev,
          displayCurrency,
          darkMode: darkMode === null ? true : darkMode === 'true',
          activePage,
          watchlist: wl
        };
      });
    } catch (error) {
      console.warn('Error loading preferences from localStorage:', error);
    }
  };

  // Migrate localStorage preferences to database (one-time)
  const migrateLocalStorageToDb = async (dbPrefs) => {
    // Only migrate if DB preferences are empty/default
    const hasDbWatchlist = Array.isArray(dbPrefs.watchlist) && dbPrefs.watchlist.length > 0;
    
    if (!hasDbWatchlist) {
      const localWatchlist = localStorage.getItem('dhanfunded-watchlist');
      if (localWatchlist) {
        try {
          const parsed = JSON.parse(localWatchlist);
          const watchlist = mergeWatchlistBrokerVariants(parsed);
          if (Array.isArray(watchlist) && watchlist.length > 0) {
            await updatePreference('watchlist', watchlist);
            console.log('Migrated watchlist from localStorage to database');
          }
        } catch (e) {}
      }
    }
    
    // Migrate display currency
    const localCurrency = localStorage.getItem('dhanfunded-display-currency');
    if (localCurrency && !dbPrefs.displayCurrency) {
      await updatePreference('displayCurrency', localCurrency);
    }
    
    // Migrate dark mode
    const localDarkMode = localStorage.getItem('dhanfunded-dark-mode');
    if (localDarkMode !== null && dbPrefs.darkMode === undefined) {
      await updatePreference('darkMode', localDarkMode === 'true');
    }
  };

  // Save preferences to database (debounced)
  const saveToDatabase = useCallback(async (updates) => {
    if (!isLoggedIn()) {
      // Save to localStorage for guests
      Object.entries(updates).forEach(([key, value]) => {
        if (key === 'watchlist') {
          localStorage.setItem('dhanfunded-watchlist', JSON.stringify(value));
        } else if (key === 'displayCurrency') {
          localStorage.setItem('dhanfunded-display-currency', value);
        } else if (key === 'darkMode') {
          localStorage.setItem('dhanfunded-dark-mode', String(value));
        } else if (key === 'activePage') {
          localStorage.setItem('dhanfunded-active-page', value);
        }
      });
      return;
    }

    try {
      const token = getToken();
      await fetch(`${API_URL}/api/auth/preferences`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
    } catch (error) {
      console.warn('Could not save preferences to server:', error.message);
      // Save to localStorage as backup
      Object.entries(updates).forEach(([key, value]) => {
        if (key === 'watchlist') {
          localStorage.setItem('dhanfunded-watchlist', JSON.stringify(value));
        } else if (key === 'displayCurrency') {
          localStorage.setItem('dhanfunded-display-currency', value);
        } else if (key === 'darkMode') {
          localStorage.setItem('dhanfunded-dark-mode', String(value));
        }
      });
    }
  }, [user?.id, user?.oderId]);

  // Update a single preference
  const updatePreference = useCallback((key, value) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    
    // Debounce save to database
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveToDatabase({ [key]: value });
    }, 500);
  }, [saveToDatabase]);

  // Update multiple preferences at once
  const updatePreferences = useCallback((updates) => {
    setPreferences(prev => ({ ...prev, ...updates }));
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveToDatabase(updates);
    }, 500);
  }, [saveToDatabase]);

  // Watchlist helpers (collapse XAUUSD + XAUUSD.c into one favourite)
  const addToWatchlist = useCallback((symbol) => {
    setPreferences(prev => {
      const base = stripBrokerInstrumentSuffix(symbol);
      const variants = prev.watchlist.filter((s) => stripBrokerInstrumentSuffix(s) === base);
      const canonical =
        canonicalBrokerSymbolForBase([...variants, symbol], base) || symbol;
      const rest = prev.watchlist.filter((s) => stripBrokerInstrumentSuffix(s) !== base);
      const newWatchlist = [...rest, canonical];
      if (
        newWatchlist.length === prev.watchlist.length &&
        newWatchlist.every((s, i) => s === prev.watchlist[i])
      ) {
        return prev;
      }
      saveToDatabase({ watchlist: newWatchlist });
      return { ...prev, watchlist: newWatchlist };
    });
  }, [saveToDatabase]);

  const removeFromWatchlist = useCallback((symbol) => {
    setPreferences(prev => {
      const base = stripBrokerInstrumentSuffix(symbol);
      const newWatchlist = prev.watchlist.filter(
        (s) => stripBrokerInstrumentSuffix(s) !== base
      );
      if (newWatchlist.length === prev.watchlist.length) return prev;
      saveToDatabase({ watchlist: newWatchlist });
      return { ...prev, watchlist: newWatchlist };
    });
  }, [saveToDatabase]);

  const isInWatchlist = useCallback(
    (symbol) => isBrokerVariantInWatchlist(preferences.watchlist, symbol),
    [preferences.watchlist]
  );

  // Fetch on mount and when user changes
  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    preferences,
    loading,
    synced,
    updatePreference,
    updatePreferences,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
    refreshPreferences: fetchPreferences
  };
};

export default useUserPreferences;
