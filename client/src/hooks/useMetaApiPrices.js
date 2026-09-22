import { useState, useEffect, useCallback, useRef } from 'react';
import socketService from '../services/socketService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/** While a one-click order is in flight (incl. server reorder delay), dim & block the trade buttons for that symbol */
export function getOneClickTradeButtonStyle(symbol, buttonSide, pending) {
  if (!pending || pending.symbol !== symbol) return {};
  const clicked = pending.side === buttonSide;
  return {
    opacity: clicked ? 0.22 : 0.48,
    pointerEvents: 'none',
    cursor: 'wait',
    transition: 'opacity 0.2s ease',
    filter: clicked ? 'grayscale(0.35)' : 'grayscale(0.15)'
  };
}

export function isOneClickSymbolBusy(symbol, pending) {
  return Boolean(pending && pending.symbol === symbol);
}

// Custom hook for real-time price updates via Socket.IO (tick-by-tick)
// All prices (Forex, Crypto, Metals, Commodities) now come from MetaAPI via server
export function useMetaApiPrices() {
  const [prices, setPrices] = useState(() => socketService.getPrices());
  const [isConnected, setIsConnected] = useState(() => socketService.getConnectionStatus());
  const [error, setError] = useState(null);
  const [oneClickPending, setOneClickPending] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Ensure socket is initialized
    socketService.init();

    // Subscribe to socket price updates (all prices from MetaAPI + Delta Exchange)
    const unsubscribePrices = socketService.onPriceUpdate((newPrices) => {
      if (mountedRef.current) {
        setPrices(newPrices);
      }
    });

    // Subscribe to connection status
    const unsubscribeConnection = socketService.onConnectionChange((connected) => {
      if (mountedRef.current) {
        setIsConnected(connected);
      }
    });

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;
      unsubscribePrices();
      unsubscribeConnection();
    };
  }, []);

  // Get price for a specific symbol
  const getPrice = useCallback((symbol) => {
    return prices[symbol] || null;
  }, [prices]);

  // Get all prices
  const getAllPrices = useCallback(() => {
    return prices;
  }, [prices]);

  // Execute a market order via local positions API (not MetaAPI)
  const executeOrder = useCallback(async (symbol, side, volume, options = {}) => {
    setOneClickPending({ symbol, side });
    try {
      const token = localStorage.getItem('dhanfunded-token');
      if (!token) {
        return { success: false, error: 'Not authenticated' };
      }

      const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
      const userId = authData.oderId || authData.user?.oderId;

      if (!userId) {
        return { success: false, error: 'User ID not found' };
      }

      const payload = {
        userId,
        symbol,
        side,
        volume: parseFloat(volume),
        mode: options.mode || 'hedging',
        ...(options.session != null ? { session: options.session } : {}),
        ...(options.leverage != null ? { leverage: options.leverage } : {})
      };

      // 15s timeout so button doesn't stay stuck if server hangs
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${API_URL}/api/trade/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { success: false, error: errorData.error || 'Order execution failed' };
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (error) {
      const msg = error.name === 'AbortError' ? 'Order request timed out' : error.message;
      return { success: false, error: msg };
    } finally {
      setOneClickPending(null);
    }
  }, []);

  return {
    prices,
    isConnected,
    error,
    getPrice,
    getAllPrices,
    executeOrder,
    oneClickPending
  };
}

export default useMetaApiPrices;
