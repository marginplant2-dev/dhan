import { useState, useEffect, useRef, useMemo } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function TradeManagement() {
  const { API_URL, adminCurrency, usdInrRate, formatAdminCurrency } = useOutletContext();
  /** Effective USD→INR (includes markup from AdminLayout outlet) */
  const fxRate = Number(usdInrRate) || 83.5;
  
  // Check if symbol is an Indian instrument (price is already in INR)
  // Only NSE, BSE, MCX instruments are Indian - everything else (Forex, Crypto, Indices, Stocks) is USD
  const isIndianInstrument = (symbol) => {
    if (!symbol) return false;
    return (
      symbol.includes('NIFTY') || symbol.includes('BANKNIFTY') || 
      symbol.includes('SENSEX') || symbol.includes('FINNIFTY') ||
      symbol.endsWith('FUT') || symbol.endsWith('OPT') ||
      symbol.includes('26') || symbol.includes('25') || // FnO expiry dates
      // Check for common Indian stock patterns (MCX, NSE EQ)
      (symbol.length <= 15 && !symbol.includes('/') && 
       !symbol.includes('USD') && !symbol.includes('EUR') && 
       !symbol.includes('GBP') && !symbol.includes('JPY') && 
       !symbol.includes('AUD') && !symbol.includes('CAD') && 
       !symbol.includes('CHF') && !symbol.includes('NZD') &&
       !symbol.includes('BTC') && !symbol.includes('ETH') &&
       !symbol.includes('XAU') && !symbol.includes('XAG') &&
       !symbol.includes('US30') && !symbol.includes('US100') && 
       !symbol.includes('US500') && !symbol.includes('UK100') &&
       !symbol.includes('DE30') && !symbol.includes('JP225') &&
       !symbol.includes('AAPL') && !symbol.includes('TSLA') &&
       !symbol.includes('GOOGL') && !symbol.includes('AMZN') &&
       !symbol.includes('META') && !symbol.includes('MSFT') &&
       !symbol.includes('NVDA') && !symbol.includes('NFLX'))
    );
  };

  const formatInstrumentCurrency = (value) => {
    const numValue = Number(value || 0);
    return `₹${numValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const pnlToUsdBase = (pnl) => {
    const n = Number(pnl || 0);
    if (Number.isNaN(n)) return 0;
    return n;
  };

  const formatPnL = (pnl, symbol = '') => {
    const usd = pnlToUsdBase(pnl, symbol);
    return `${usd < 0 ? '-' : ''}${formatAdminCurrency(Math.abs(usd))}`;
  };

  const formatWallet = (valueInUSD) => formatAdminCurrency(valueInUSD);
  const location = useLocation();
  const [activeTrades, setActiveTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState(() => {
    // Check if there's a user filter from Fund Management
    const savedFilter = sessionStorage.getItem('tradeManagementUserFilter');
    if (savedFilter) {
      const { userId, userName } = JSON.parse(savedFilter);
      sessionStorage.removeItem('tradeManagementUserFilter'); // Clear after reading
      return { search: userName || userId || '', symbol: '', mode: 'all' };
    }
    return { search: '', symbol: '', mode: 'all' };
  });
  const [livePrices, setLivePrices] = useState({});
  const socketRef = useRef(null);
  
  // Composed positions state
  const [composedData, setComposedData] = useState([]);
  const [composedTotals, setComposedTotals] = useState({});
  const [composedLoading, setComposedLoading] = useState(false);
  const [composedFilter, setComposedFilter] = useState('all');
  const [expandedSymbol, setExpandedSymbol] = useState(null);
  
  // Edit trade modal state
  const [editModal, setEditModal] = useState({ open: false, trade: null });
  const [editForm, setEditForm] = useState({
    entryPrice: '',
    closePrice: '',
    volume: '',
    calculatedPnL: 0
  });

  // Netting legs modal state
  const [showLegsModal, setShowLegsModal] = useState(false);
  const [legsPosition, setLegsPosition] = useState(null);
  const [legsData, setLegsData] = useState([]);
  const [legsLoading, setLegsLoading] = useState(false);

  // Edited trades state
  const [editedTrades, setEditedTrades] = useState([]);
  const [editedTradesLoading, setEditedTradesLoading] = useState(false);
  const [editedTradesPage, setEditedTradesPage] = useState(1);
  const [editedTradesTotal, setEditedTradesTotal] = useState(0);

  const getActiveTab = () => {
    const segments = location.pathname.split('/').filter(Boolean);
    const i = segments.indexOf('trades');
    if (i === -1) return 'combined';
    const sub = segments[i + 1];
    if (!sub) return 'combined';
    if (sub === 'open') return 'open-positions';
    if (sub === 'closed') return 'closed-positions';
    if (sub === 'pending') return 'pending-orders';
    if (sub === 'history') return 'trade-history';
    if (sub === 'edited') return 'edited-trades';
    return 'combined';
  };

  const activeTab = getActiveTab();

  /** Total closed/history rows matching filters (from API pagination), not just current page */
  const [closedTradesGrandTotal, setClosedTradesGrandTotal] = useState(null);
  /** Closed/Trade-history pagination: 25 rows per page with prev/next navigation. */
  const CLOSED_PAGE_SIZE = 25;
  const [closedPage, setClosedPage] = useState(1);
  const closedTotalPages = closedTradesGrandTotal != null
    ? Math.max(1, Math.ceil(closedTradesGrandTotal / CLOSED_PAGE_SIZE))
    : 1;

  const fetchEditedTrades = async () => {
    setEditedTradesLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', editedTradesPage);
      params.set('limit', 20);
      if (filter.search) params.set('search', filter.search);
      const res = await fetch(`${API_URL}/api/admin/trade-edit-logs?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      if (data.success) {
        setEditedTrades(data.logs || []);
        setEditedTradesTotal(data.pages || 1);
      }
    } catch(e) {
      console.error(e);
    } finally {
      setEditedTradesLoading(false);
    }
  };

  const fetchTrades = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.search) params.set('search', filter.search);
      if (filter.symbol) params.set('symbol', filter.symbol);
      if (filter.mode !== 'all') params.set('mode', filter.mode);

      const isHistory = activeTab === 'trade-history' || activeTab === 'closed-positions';
      const endpoint = activeTab === 'pending-orders' ? 'pending' : isHistory ? 'history' : 'active';

      // Closed positions / activity history are paginated (25 per page) so the
      // admin can page through All positions, not just the most recent batch.
      if (isHistory) {
        params.set('page', closedPage);
        params.set('limit', CLOSED_PAGE_SIZE);
      }

      const res = await fetch(`${API_URL}/api/admin/trades/${endpoint}?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      if (data.success) {
        setActiveTrades(data.positions || data.trades || data.orders || []);
        if (endpoint === 'history' && data.pagination && typeof data.pagination.total === 'number') {
          setClosedTradesGrandTotal(data.pagination.total);
        } else if (endpoint === 'active') {
          const hParams = new URLSearchParams();
          if (filter.search) hParams.set('search', filter.search);
          if (filter.symbol) hParams.set('symbol', filter.symbol);
          if (filter.mode !== 'all') hParams.set('mode', filter.mode);
          hParams.set('limit', '1');
          hParams.set('page', '1');
          try {
            const hres = await fetch(`${API_URL}/api/admin/trades/history?${hParams}`, {
              headers: { Authorization: `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
            });
            const hdata = await hres.json();
            if (hdata.success && hdata.pagination && typeof hdata.pagination.total === 'number') {
              setClosedTradesGrandTotal(hdata.pagination.total);
            } else {
              setClosedTradesGrandTotal(null);
            }
          } catch {
            setClosedTradesGrandTotal(null);
          }
        } else {
          setClosedTradesGrandTotal(null);
        }
      } else {
        setActiveTrades([]);
        setClosedTradesGrandTotal(null);
      }
    } catch (error) {
      console.error('Error fetching trades:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch composed positions
  const fetchComposedPositions = async () => {
    setComposedLoading(true);
    try {
      const params = new URLSearchParams();
      if (composedFilter !== 'all') params.set('mode', composedFilter);
      
      const res = await fetch(`${API_URL}/api/admin/trades/composed?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      if (data.success) {
        setComposedData(data.composed || []);
        setComposedTotals(data.totals || {});
      }
    } catch (error) {
      console.error('Error fetching composed positions:', error);
    } finally {
      setComposedLoading(false);
    }
  };

  // Reset to the first page whenever the filter or tab changes so a stale page
  // index never hides results (e.g. searching while on page 4).
  useEffect(() => { setClosedPage(1); }, [filter, activeTab]);

  useEffect(() => {
    if (activeTab === 'combined') {
      fetchComposedPositions();
    } else if (activeTab === 'edited-trades') {
      fetchEditedTrades();
    } else {
      fetchTrades();
    }
  }, [activeTab, filter, composedFilter, editedTradesPage, closedPage]);

  // Connect to Socket.io for live prices from MetaAPI + Zerodha
  useEffect(() => {
    if (activeTrades.length === 0) return;

    // Connect to server socket
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true
      });

      // Listen for price updates from MetaAPI (Forex/Crypto/Indices)
      socketRef.current.on('prices_batch', (prices) => {
        if (prices && typeof prices === 'object') {
          const formattedPrices = {};
          Object.entries(prices).forEach(([symbol, data]) => {
            formattedPrices[symbol] = {
              bid: data.bid || data.price || 0,
              ask: data.ask || data.price || 0,
              price: data.bid || data.price || 0
            };
          });
          setLivePrices(prev => ({ ...prev, ...formattedPrices }));
        }
      });

      socketRef.current.on('price_tick', (priceData) => {
        if (priceData && priceData.symbol) {
          setLivePrices(prev => ({
            ...prev,
            [priceData.symbol]: {
              bid: priceData.bid || 0,
              ask: priceData.ask || 0,
              price: priceData.bid || 0
            }
          }));
        }
      });

      // Delta Exchange streams (crypto futures/options — BTCUSD, ETHUSD, etc.)
      // use separate event names. The server emits these every second.
      socketRef.current.on('delta_prices_batch', (prices) => {
        if (!prices || typeof prices !== 'object') return;
        const formatted = {};
        Object.entries(prices).forEach(([symbol, data]) => {
          const bid = Number(data.bid) || Number(data.last) || Number(data.mark_price) || 0;
          const ask = Number(data.ask) || Number(data.last) || Number(data.mark_price) || 0;
          const last = Number(data.last) || Number(data.mark_price) || bid || 0;
          if (bid === 0 && ask === 0 && last === 0) return;
          formatted[symbol] = { bid: bid || last, ask: ask || last, price: last };
        });
        if (Object.keys(formatted).length > 0) {
          setLivePrices(prev => ({ ...prev, ...formatted }));
        }
      });

      socketRef.current.on('delta_price_tick', (p) => {
        if (!p || !p.symbol) return;
        const bid = Number(p.bid) || Number(p.last) || Number(p.mark_price) || 0;
        const ask = Number(p.ask) || Number(p.last) || Number(p.mark_price) || 0;
        const last = Number(p.last) || Number(p.mark_price) || bid || 0;
        if (bid === 0 && ask === 0 && last === 0) return;
        setLivePrices(prev => ({
          ...prev,
          [p.symbol]: { bid: bid || last, ask: ask || last, price: last }
        }));
      });

      // Subscribe to Zerodha ticks for Indian instruments (NSE/BSE/MCX/NFO)
      socketRef.current.emit('subscribeZerodhaTicks');
      socketRef.current.on('connect', () => {
        socketRef.current.emit('subscribeZerodhaTicks');
      });

      socketRef.current.on('zerodha-tick', (tickData) => {
        if (!tickData || !Array.isArray(tickData)) return;
        const formattedPrices = {};
        tickData.forEach(tick => {
          const sym = tick.symbol || tick.tradingsymbol;
          if (sym) {
            formattedPrices[sym] = {
              bid: tick.bid || tick.lastPrice || 0,
              ask: tick.ask || tick.lastPrice || 0,
              price: tick.lastPrice || tick.bid || 0
            };
          }
        });
        if (Object.keys(formattedPrices).length > 0) {
          setLivePrices(prev => ({ ...prev, ...formattedPrices }));
        }
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('unsubscribeZerodhaTicks');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [activeTrades.length]);

  // Calculate live P/L for a trade
  const calculateLivePnL = (trade) => {
    const livePrice = livePrices[trade.symbol];
    if (!livePrice) return trade.pnl || trade.profit || trade.unrealizedPnL || 0;

    const entryPrice = trade.entryPrice || trade.openPrice || trade.avgPrice || 0;
    const currentPrice = trade.side === 'buy' ? livePrice.bid : livePrice.ask;
    if (!currentPrice || !entryPrice) return trade.pnl || trade.profit || 0;

    const volume = trade.volume || trade.lotSize || 0.01;
    const symbol = (trade.symbol || '').toUpperCase();
    const priceDiff = trade.side === 'buy' ? (currentPrice - entryPrice) : (entryPrice - currentPrice);

    // Indian instruments: P/L = priceDiff × quantity (lots × lotSize)
    if (isIndianInstrument(trade.symbol)) {
      const quantity = trade.quantity || (volume * (trade.lotSize || 1)) || volume;
      return priceDiff * quantity;
    }

    // Forex/Crypto/Indices: P/L = priceDiff × contractSize × volume
    let contractSize = 100000;
    if (symbol.includes('XAU') || symbol === 'XPTUSD') contractSize = 100;
    else if (symbol.includes('XAG')) contractSize = 5000;
    else if (symbol.includes('BTC') || symbol.includes('ETH')) contractSize = 1;
    else if (symbol.includes('ADA')) contractSize = 1000;
    else if (symbol === 'US100' || symbol === 'US30' || symbol === 'US2000') contractSize = 1;
    else if (symbol === 'BRENT' || symbol.includes('OIL')) contractSize = 1000;

    let pnl = priceDiff * volume * contractSize;

    if (symbol.includes('JPY') && !symbol.startsWith('JPY') && currentPrice > 0) {
      pnl = (priceDiff * 100000 * volume) / 100;
    }

    return pnl;
  };

  // Get live current price for a trade
  const getLivePrice = (trade) => {
    const livePrice = livePrices[trade.symbol];
    if (!livePrice) return trade.currentPrice || trade.closePrice || null;
    return trade.side === 'buy' ? livePrice.bid : livePrice.ask;
  };

  // Force close a position
  const forceClosePosition = async (positionId, positionType, tradeSymbol = '') => {
    if (!confirm('Are you sure you want to force close this position?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/trades/${positionId}/close`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
        },
        body: JSON.stringify({ positionType })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Position closed. P/L: ${formatPnL(data.profit || 0, tradeSymbol)}`);
        fetchTrades();
        if (activeTab === 'edited-trades') fetchEditedTrades();
      } else {
        alert(data.error || 'Failed to close position');
      }
    } catch (error) {
      console.error('Error force closing position:', error);
      alert('Failed to close position');
    }
  };

  // Reopen a closed trade
  const reopenTrade = async () => {
    const trade = editModal.trade;
    if (!trade) return;
    
    if (!confirm('Reopen this position? The P/L will be reversed from the user wallet.')) return;
    
    try {
      const res = await fetch(`${API_URL}/api/admin/trades/${trade._id}/reopen`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
        },
        body: JSON.stringify({
          mode: trade.mode || 'hedging',
          userId: trade.userId,
          pnl: trade.pnl || trade.profit || 0
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Position reopened successfully! P/L reversed from wallet.');
        setEditModal({ open: false, trade: null });
        fetchTrades();
        if (activeTab === 'edited-trades') fetchEditedTrades();
      } else {
        alert(data.error || 'Failed to reopen position');
      }
    } catch (error) {
      console.error('Error reopening trade:', error);
      alert('Failed to reopen position');
    }
  };

  // Cancel pending order
  const cancelPendingOrder = async (orderId) => {
    if (!confirm('Are you sure you want to cancel this pending order?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/trades/${orderId}/cancel`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
        }
      });
      const data = await res.json();
      if (data.success) {
        alert('Order cancelled successfully');
        fetchTrades();
        if (activeTab === 'edited-trades') fetchEditedTrades();
      } else {
        alert(data.error || 'Failed to cancel order');
      }
    } catch (error) {
      console.error('Error cancelling order:', error);
      alert('Failed to cancel order');
    }
  };

  // Open edit modal
  const openEditModal = (trade) => {
    // For open positions, calculate live P/L if available
    let initialPnL = trade.profit || trade.pnl || trade.unrealizedPnL || 0;
    
    // If P/L is 0 and we have live prices, calculate it
    if (initialPnL === 0 && livePrices[trade.symbol]) {
      const livePrice = livePrices[trade.symbol];
      const entryPrice = trade.entryPrice || trade.openPrice || trade.avgPrice || 0;
      const currentPrice = trade.side === 'buy' ? livePrice.bid : livePrice.ask;
      const volume = trade.volume || trade.lotSize || 0.01;
      
      let contractSize = 100000;
      const symbol = (trade.symbol || '').toUpperCase();
      if (symbol.includes('XAU')) contractSize = 100;
      else if (symbol.includes('XAG')) contractSize = 5000;
      else if (symbol.includes('BTC')) contractSize = 1;
      else if (symbol.includes('ETH')) contractSize = 1;
      
      if (trade.side === 'buy') {
        initialPnL = (currentPrice - entryPrice) * volume * contractSize;
      } else {
        initialPnL = (entryPrice - currentPrice) * volume * contractSize;
      }
      
      if (symbol.includes('JPY') && !symbol.startsWith('JPY')) {
        initialPnL = initialPnL / currentPrice;
      }
    }
    
    setEditForm({
      entryPrice: trade.entryPrice || trade.openPrice || trade.avgPrice || '',
      closePrice: trade.closePrice || trade.currentPrice || (livePrices[trade.symbol]?.price) || '',
      volume: trade.volume || trade.lotSize || 0.01,
      calculatedPnL: initialPnL
    });
    setEditModal({ open: true, trade });
  };

  // Calculate P/L based on entry and close price
  const calculatePnL = () => {
    const trade = editModal.trade;
    if (!trade) return;

    const entryPrice = parseFloat(editForm.entryPrice) || 0;
    const closePrice = parseFloat(editForm.closePrice) || 0;
    const volume = parseFloat(editForm.volume) || 0.01;
    const side = trade.side;
    const symbol = (trade.symbol || '').toUpperCase();

    // Determine multiplier (units per lot)
    //   - If the trade has a stored lotSize (Indian F&O, prop challenge
    //     positions store this), use it directly: e.g. NIFTY = 75
    //   - Indian instruments by symbol prefix: NIFTY=75, BANKNIFTY=15,
    //     SENSEX=10, FINNIFTY=40, MIDCPNIFTY=120 (fallbacks)
    //   - Forex / metals / crypto fall back to the legacy table
    let multiplier;
    if (Number(trade.lotSize) > 0) {
      multiplier = Number(trade.lotSize);
    } else if (symbol.startsWith('NIFTY') && !symbol.startsWith('NIFTYBANK')) {
      multiplier = 75;
    } else if (symbol.startsWith('BANKNIFTY')) {
      multiplier = 15;
    } else if (symbol.startsWith('SENSEX')) {
      multiplier = 10;
    } else if (symbol.startsWith('BANKEX')) {
      multiplier = 15;
    } else if (symbol.startsWith('FINNIFTY')) {
      multiplier = 40;
    } else if (symbol.startsWith('MIDCPNIFTY')) {
      multiplier = 120;
    } else if (symbol.includes('XAU')) {
      multiplier = 100;
    } else if (symbol.includes('XAG')) {
      multiplier = 5000;
    } else if (symbol.includes('BTC') || symbol.includes('ETH')) {
      multiplier = 1;
    } else if (symbol.includes('JPY')) {
      multiplier = 100000;
    } else {
      multiplier = 100000; // forex default
    }

    let pnl = 0;
    if (side === 'buy') {
      pnl = (closePrice - entryPrice) * volume * multiplier;
    } else {
      pnl = (entryPrice - closePrice) * volume * multiplier;
    }

    // For JPY cross pairs, adjust by close price
    if (symbol.includes('JPY') && !symbol.startsWith('JPY') && !trade.lotSize) {
      pnl = pnl / closePrice;
    }

    setEditForm(prev => ({ ...prev, calculatedPnL: pnl }));
  };

  // Save trade edit
  const saveTradeEdit = async () => {
    const trade = editModal.trade;
    if (!trade) return;
    
    try {
      const res = await fetch(`${API_URL}/api/admin/trades/${trade._id}/edit`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
        },
        body: JSON.stringify({
          entryPrice: parseFloat(editForm.entryPrice),
          closePrice: parseFloat(editForm.closePrice),
          volume: parseFloat(editForm.volume),
          pnl: editForm.calculatedPnL,
          mode: trade.mode || 'hedging',
          userId: trade.userId
        })
      });
      const data = await res.json();
      if (data.success) {
        const isOpen = editModal.trade?.status === 'open' || (!editModal.trade?.status && activeTab !== 'closed-positions' && activeTab !== 'trade-history');
        if (isOpen) {
          alert(`Trade updated successfully! P/L: ${formatPnL(editForm.calculatedPnL, editModal.trade?.symbol)} (wallet not affected — trade is still open).`);
        } else {
          alert(`Trade updated! P/L: ${formatPnL(editForm.calculatedPnL, editModal.trade?.symbol)} synced to user wallet.${data.newWalletBalance != null ? `\nNew Balance: ${formatWallet(data.newWalletBalance)}` : ''}`);
        }
        setEditModal({ open: false, trade: null });
        fetchTrades();
        if (activeTab === 'edited-trades') fetchEditedTrades();
      } else {
        alert(data.error || 'Failed to update position');
      }
    } catch (error) {
      console.error('Error updating trade:', error);
      alert('Failed to update position');
    }
  };

  // Close trade from edit modal
  const closeTradeFromModal = async () => {
    const trade = editModal.trade;
    if (!trade) return;
    
    if (!confirm(`Close this position with P/L: ${formatPnL(editForm.calculatedPnL, trade?.symbol)}? This will sync to user wallet.`)) return;
    
    try {
      const res = await fetch(`${API_URL}/api/admin/trades/${trade._id}/close-with-pnl`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
        },
        body: JSON.stringify({
          entryPrice: parseFloat(editForm.entryPrice),
          closePrice: parseFloat(editForm.closePrice),
          volume: parseFloat(editForm.volume),
          pnl: editForm.calculatedPnL,
          mode: trade.mode || 'hedging',
          userId: trade.userId
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Position closed! P/L: ${formatPnL(editForm.calculatedPnL, trade?.symbol)} synced to user wallet.\nNew Balance: ${formatWallet(data.newWalletBalance || 0)}`);
        setEditModal({ open: false, trade: null });
        fetchTrades();
        if (activeTab === 'edited-trades') fetchEditedTrades();
      } else {
        alert(data.error || 'Failed to close position');
      }
    } catch (error) {
      console.error('Error closing trade:', error);
      alert('Failed to close position');
    }
  };

  // Delete trade permanently
  const deleteTrade = async (tradeId, tradeType) => {
    if (!confirm('Are you sure you want to PERMANENTLY DELETE this position? This action cannot be undone and will NOT affect user wallet balance.')) return;
    
    try {
      const res = await fetch(`${API_URL}/api/admin/trades/${tradeId}/delete`, {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
        },
        body: JSON.stringify({ tradeType })
      });
      const data = await res.json();
      if (data.success) {
        alert('Position deleted successfully');
        fetchTrades();
        if (activeTab === 'edited-trades') fetchEditedTrades();
      } else {
        alert(data.error || 'Failed to delete position');
      }
    } catch (error) {
      console.error('Error deleting trade:', error);
      alert('Failed to delete position');
    }
  };

  // Fetch netting legs (individual entries + partial closes) for a position
  const fetchNettingLegs = async (trade) => {
    if (trade.mode !== 'netting') return;
    const orderId = trade.oderId || trade.orderId;
    const userId = trade.userId;
    if (!orderId || !userId) return;

    setLegsPosition({
      ...trade,
      entryPrice: trade.entryPrice || trade.avgPrice || trade.openPrice || 0,
      currentPrice: getLivePrice(trade) || trade.closePrice || trade.exitPrice || trade.entryPrice || 0,
      profit: trade.status === 'closed' ? (trade.pnl || trade.profit || 0) : calculateLivePnL(trade),
      isClosed: trade.status === 'closed' || !!trade.closePrice || trade.type === 'close'
    });
    setShowLegsModal(true);
    setLegsLoading(true);
    setLegsData([]);

    try {
      const res = await fetch(`${API_URL}/api/trades/legs/${userId}/${orderId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      setLegsData(data.legs || []);
    } catch (err) {
      console.error('Error fetching netting legs:', err);
    } finally {
      setLegsLoading(false);
    }
  };

  const getTabTitle = () => {
    const titles = {
      'combined': 'Combined Positions',
      'open-positions': 'Open Positions',
      'closed-positions': 'Closed Positions',
      'pending-orders': 'Pending Orders',
      'trade-history': 'Activity History'
    };
    return titles[activeTab] || 'Position Management';
  };

  const showTradeSummaryBar =
    activeTab === 'open-positions' || activeTab === 'closed-positions' || activeTab === 'trade-history';

  /** Open/closed counts, total volume, P/L sum in admin currency (filtered rows; Indian P/L = INR, FX = USD) */
  const tradeListSummary = useMemo(() => {
    if (!showTradeSummaryBar) {
      return { openCount: 0, closedCount: 0, totalVolume: 0, sumUsd: 0, count: 0 };
    }
    let openCount = 0;
    let closedCount = 0;
    let totalVolume = 0;
    let sumUsd = 0;
    for (const trade of activeTrades) {
      const isClosed =
        trade.status === 'closed' ||
        activeTab === 'closed-positions' ||
        activeTab === 'trade-history';
      if (isClosed) closedCount += 1;
      else openCount += 1;
      const vol = Number(trade.volume || trade.lotSize || 0);
      if (!Number.isNaN(vol)) totalVolume += vol;

      const pnl = isClosed
        ? Number(trade.pnl || trade.profit || 0)
        : calculateLivePnL(trade);
      if (Number.isNaN(pnl)) continue;
      if (isIndianInstrument(trade.symbol)) {
        sumUsd += pnl / fxRate;
      } else {
        sumUsd += pnl;
      }
    }
    const closedCountDisplay =
      closedTradesGrandTotal != null ? closedTradesGrandTotal : closedCount;
    return {
      openCount,
      closedCount: closedCountDisplay,
      totalVolume,
      sumUsd,
      count: activeTrades.length
    };
  }, [showTradeSummaryBar, activeTrades, activeTab, livePrices, fxRate, closedTradesGrandTotal]);

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>{getTabTitle()}</h2>
      </div>

      {/* Combined Positions Tab */}
      {activeTab === 'combined' ? (
        <>
          <div className="admin-filters-bar">
            <select
              value={composedFilter}
              onChange={(e) => setComposedFilter(e.target.value)}
              className="admin-select"
            >
              <option value="all">All Modes</option>
              <option value="hedging">Hedging Only</option>
              <option value="netting">Netting Only</option>
              <option value="binary">Binary Only</option>
            </select>
            <button onClick={fetchComposedPositions} className="admin-btn primary">
              Refresh
            </button>
          </div>

          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total Symbols</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{composedTotals.totalSymbols || 0}</div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total Positions</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{composedTotals.totalPositions || 0}</div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total Buy Lots</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{(composedTotals.totalBuyLots || 0).toFixed(2)}</div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total Sell Lots</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{(composedTotals.totalSellLots || 0).toFixed(2)}</div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total P/L</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: (composedTotals.totalPnL || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                {formatPnL(composedTotals.totalPnL || 0, '')}
              </div>
            </div>
          </div>

          {composedLoading ? (
            <div className="admin-loading">Loading composed positions...</div>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table admin-cards-on-mobile">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Total Positions</th>
                    <th>Users</th>
                    <th style={{ color: '#10b981' }}>Buy Lots</th>
                    <th style={{ color: '#ef4444' }}>Sell Lots</th>
                    <th>Net Lots</th>
                    <th>Avg Buy Price</th>
                    <th>Avg Sell Price</th>
                    <th>Total P/L</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {composedData.length === 0 ? (
                    <tr><td colSpan="10" className="no-data">No open positions found</td></tr>
                  ) : (
                    composedData.map((item, idx) => (
                      <>
                        <tr key={item.symbol} style={{ cursor: 'pointer' }} onClick={() => setExpandedSymbol(expandedSymbol === item.symbol ? null : item.symbol)}>
                          <td data-label="Symbol" style={{ fontWeight: 600 }}>{item.symbol}</td>
                          <td data-label="Total Positions">{item.totalCount}</td>
                          <td data-label="Users">{item.uniqueUsers}</td>
                          <td data-label="Buy Lots" style={{ color: '#10b981', fontWeight: 600 }}>{item.totalBuyLots.toFixed(2)}</td>
                          <td data-label="Sell Lots" style={{ color: '#ef4444', fontWeight: 600 }}>{item.totalSellLots.toFixed(2)}</td>
                          <td data-label="Net Lots" style={{ fontWeight: 600, color: item.netLots >= 0 ? '#10b981' : '#ef4444' }}>
                            {item.netLots >= 0 ? '+' : ''}{item.netLots.toFixed(2)}
                          </td>
                          <td data-label="Avg Buy Price">{item.avgBuyPrice > 0 ? item.avgBuyPrice.toFixed(5) : '-'}</td>
                          <td data-label="Avg Sell Price">{item.avgSellPrice > 0 ? item.avgSellPrice.toFixed(5) : '-'}</td>
                          <td data-label="Total P/L" style={{ fontWeight: 600, color: item.totalPnL >= 0 ? '#10b981' : '#ef4444' }}>
                            {formatPnL(item.totalPnL, item.symbol)}
                          </td>
                          <td>
                            <button className="admin-btn small" style={{ background: 'var(--bg-primary)' }}>
                              {expandedSymbol === item.symbol ? '▲' : '▼'}
                            </button>
                          </td>
                        </tr>
                        {expandedSymbol === item.symbol && (
                          <tr key={`${item.symbol}-details`}>
                            <td colSpan="10" style={{ background: 'var(--bg-primary)', padding: 16 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                                {/* Hedging Mode */}
                                <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8 }}>
                                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#8b5cf6' }}>📊 Hedging</div>
                                  <div style={{ fontSize: 13 }}>
                                    <div>Positions: {item.byMode.hedging.count}</div>
                                    <div style={{ color: '#10b981' }}>Buy: {item.byMode.hedging.buyLots.toFixed(2)} lots</div>
                                    <div style={{ color: '#ef4444' }}>Sell: {item.byMode.hedging.sellLots.toFixed(2)} lots</div>
                                    <div>P/L: <span style={{ color: item.byMode.hedging.pnl >= 0 ? '#10b981' : '#ef4444' }}>{formatPnL(item.byMode.hedging.pnl, item.symbol)}</span></div>
                                  </div>
                                </div>
                                {/* Netting Mode */}
                                <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8 }}>
                                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#3b82f6' }}>📈 Netting</div>
                                  <div style={{ fontSize: 13 }}>
                                    <div>Positions: {item.byMode.netting.count}</div>
                                    <div style={{ color: '#10b981' }}>Buy: {item.byMode.netting.buyLots.toFixed(2)} lots</div>
                                    <div style={{ color: '#ef4444' }}>Sell: {item.byMode.netting.sellLots.toFixed(2)} lots</div>
                                    <div>P/L: <span style={{ color: item.byMode.netting.pnl >= 0 ? '#10b981' : '#ef4444' }}>{formatPnL(item.byMode.netting.pnl, item.symbol)}</span></div>
                                  </div>
                                </div>
                                {/* Binary Mode */}
                                <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8 }}>
                                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#f59e0b' }}>🎯 Binary</div>
                                  <div style={{ fontSize: 13 }}>
                                    <div>Trades: {item.byMode.binary.count}</div>
                                    <div style={{ color: '#10b981' }}>Up: {formatPnL(item.byMode.binary.upAmount, item.symbol)}</div>
                                    <div style={{ color: '#ef4444' }}>Down: {formatPnL(item.byMode.binary.downAmount, item.symbol)}</div>
                                    <div>P/L: <span style={{ color: item.byMode.binary.pnl >= 0 ? '#10b981' : '#ef4444' }}>{formatPnL(item.byMode.binary.pnl, item.symbol)}</span></div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : activeTab === 'edited-trades' ? (
        <>
          <div className="admin-filters-bar">
            <input
              type="text"
              placeholder="Search by admin name or user name..."
              value={filter.search}
              onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
              className="admin-input"
            />
            <button onClick={fetchEditedTrades} className="admin-btn primary">
              Search
            </button>
          </div>

          {editedTradesLoading ? (
            <div className="admin-loading">Loading edited positions...</div>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Admin</th>
                    <th>Role</th>
                    <th>User</th>
                    <th>Position ID</th>
                    <th>Action</th>
                    <th>Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {editedTrades.length === 0 ? (
                    <tr><td colSpan="7" className="no-data">No explicit edits found.</td></tr>
                  ) : (
                    editedTrades.map((log) => (
                      <tr key={log._id}>
                        <td>{new Date(log.timestamp).toLocaleString()}</td>
                        <td style={{ fontWeight: 600 }}>{log.adminName}</td>
                        <td><span className="admin-badge active">{String(log.adminRole || '').replace(/_/g, ' ')}</span></td>
                        <td>{log.userName}</td>
                        <td style={{ fontFamily: 'monospace' }}>{log.tradeId}</td>
                        <td><span className="admin-badge pending">{log.action}</span></td>
                        <td>{log.remark}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {editedTradesTotal > 1 && (
                <div className="admin-pagination" style={{ marginTop: 16 }}>
                  <button
                    disabled={editedTradesPage === 1}
                    onClick={() => setEditedTradesPage(p => p - 1)}
                    className="admin-btn small"
                  >
                    Previous
                  </button>
                  <span>Page {editedTradesPage} of {editedTradesTotal}</span>
                  <button
                    disabled={editedTradesPage === editedTradesTotal}
                    onClick={() => setEditedTradesPage(p => p + 1)}
                    className="admin-btn small"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Regular Trades View */}
          <div className="admin-filters-bar">
            <input
              type="text"
              placeholder="Search by user, symbol or position Id..."
              value={filter.search}
              onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
              className="admin-input"
            />
            <select
              value={filter.mode}
              onChange={(e) => setFilter(prev => ({ ...prev, mode: e.target.value }))}
              className="admin-select"
            >
              <option value="all">All Modes</option>
              <option value="hedging">Hedging</option>
              <option value="netting">Netting</option>
              <option value="binary">Binary</option>
            </select>
            <button onClick={fetchTrades} className="admin-btn primary">
              Search
            </button>
          </div>

          {showTradeSummaryBar && !loading && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 16,
                marginBottom: 20
              }}
            >
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '16px 18px'
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>
                  Open positions
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.15 }}>
                  {tradeListSummary.openCount}
                </div>
              </div>
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '16px 18px'
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>
                  Closed positions
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.15 }}>
                  {tradeListSummary.closedCount}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, opacity: 0.85 }}>
                  {closedTradesGrandTotal != null ? 'Total in history (filtered)' : 'From current list'}
                </div>
              </div>
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '16px 18px'
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>
                  Total volume
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.15 }}>
                  {tradeListSummary.totalVolume.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, opacity: 0.85 }}>
                  Lots / qty (filtered)
                </div>
              </div>
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '16px 18px'
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>
                  Total P&amp;L
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    color: tradeListSummary.sumUsd >= 0 ? 'var(--text-primary)' : '#ef4444'
                  }}
                >
                  {formatPnL(tradeListSummary.sumUsd, '')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, opacity: 0.85 }}>
                  {tradeListSummary.count} row{tradeListSummary.count === 1 ? '' : 's'} · {adminCurrency === 'INR' ? '₹ INR' : '$ USD'}
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="admin-loading">Loading positions...</div>
          ) : (
            <>
            <div className="admin-table-wrapper tm-table-desktop">
          <table className="admin-table admin-cards-on-mobile">
            <thead>
              <tr>
                <th>User</th>
                <th>Account</th>
                <th>Position ID</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Volume</th>
                <th>Open Price</th>
                <th>{activeTab === 'closed-positions' || activeTab === 'trade-history' ? 'Close Price' : 'Current Price'}</th>
                <th>P/L</th>
                {(activeTab === 'closed-positions' || activeTab === 'trade-history') && <th>Swap</th>}
                <th>Mode</th>
                <th>Open Time</th>
                <th>{activeTab === 'closed-positions' || activeTab === 'trade-history' ? 'Close Time' : 'Hold Time'}</th>
                {(activeTab === 'closed-positions' || activeTab === 'trade-history') && <th>Closed By</th>}
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeTrades.length === 0 ? (
                <tr><td colSpan={(activeTab === 'closed-positions' || activeTab === 'trade-history') ? 16 : 14} className="no-data">No positions found</td></tr>
              ) : (
                activeTrades.map((trade, idx) => {
                  const isClosedTrade = trade.status === 'closed' || activeTab === 'closed-positions' || activeTab === 'trade-history';
                  const liveCurrentPrice = isClosedTrade ? (trade.closePrice || trade.exitPrice) : getLivePrice(trade);
                  const livePnL = isClosedTrade ? (trade.pnl || trade.profit || 0) : calculateLivePnL(trade);
                  return (
                  <tr key={trade._id || idx}
                    style={trade.mode === 'netting' ? { cursor: 'pointer' } : {}}
                    onClick={() => trade.mode === 'netting' && fetchNettingLegs(trade)}
                  >
                    <td data-label="User">{trade.userName || trade.userId}</td>
                    <td data-label="Account" style={{ fontFamily: 'monospace', fontSize: 12 }}>{trade.challengeAccountCode || trade.accountId || '—'}</td>
                    <td
                      data-label="Position ID"
                      style={{ fontFamily: 'monospace', fontSize: 12, cursor: 'pointer' }}
                      title="Click to search this Position ID"
                      onClick={(e) => { e.stopPropagation(); const id = trade.tradeId || trade.positionId; if (id) setFilter(prev => ({ ...prev, search: id })); }}
                    >{trade.tradeId || trade.positionId || '—'}</td>
                    <td data-label="Symbol">{trade.symbol}</td>
                    <td data-label="Side" style={{ color: trade.side === 'buy' ? '#10b981' : '#ef4444', fontWeight: 700 }}>{trade.side?.toUpperCase()}</td>
                    <td data-label="Volume">{trade.volume || trade.lotSize}</td>
                    <td data-label="Open Price">{formatInstrumentCurrency(trade.entryPrice || trade.openPrice || trade.avgPrice || 0, trade.symbol)}</td>
                    <td data-label={isClosedTrade ? 'Close Price' : 'Current Price'} style={{ color: !isClosedTrade && livePrices[trade.symbol] ? '#3b82f6' : 'inherit' }}>
                      {formatInstrumentCurrency(liveCurrentPrice || 0, trade.symbol)}
                      {!isClosedTrade && livePrices[trade.symbol] && <span style={{ fontSize: 10, marginLeft: 4, color: '#10b981' }}>●</span>}
                    </td>
                    <td data-label="P/L" style={{ color: livePnL >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                      {formatPnL(livePnL, trade.symbol)}
                    </td>
                    {isClosedTrade && (
                      <td data-label="Swap">{formatPnL(Number(trade.swap) || 0, trade.symbol)}</td>
                    )}
                    <td data-label="Mode"><span className="mode-badge">{trade.mode || 'hedging'}</span></td>
                    <td data-label="Open Time" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      {trade.openTime || trade.createdAt ? new Date(trade.openTime || trade.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td data-label={isClosedTrade ? 'Close Time' : 'Hold Time'} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      {isClosedTrade ? (
                        trade.closeTime || trade.closedAt ? new Date(trade.closeTime || trade.closedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'
                      ) : (
                        (() => {
                          const openTime = new Date(trade.openTime || trade.createdAt);
                          const now = new Date();
                          const diffMs = now - openTime;
                          const diffMins = Math.floor(diffMs / 60000);
                          const diffHours = Math.floor(diffMins / 60);
                          const diffDays = Math.floor(diffHours / 24);
                          if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
                          if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
                          return `${diffMins}m`;
                        })()
                      )}
                    </td>
                    {isClosedTrade && (
                      <td data-label="Closed By" style={{ fontSize: 11 }}>
                        <span className={`status-badge ${trade.closedBy === 'admin' ? 'status-pending' : 'status-open'}`}>
                          {trade.closedBy === 'admin' ? 'Admin' : trade.closedBy === 'system' ? 'System' : 'User'}
                        </span>
                      </td>
                    )}
                    <td data-label="Status"><span className={`status-badge status-${isClosedTrade ? 'closed' : (trade.status || 'open')}`}>
                      {isClosedTrade ? 'Closed' : (trade.status || 'Open')}
                    </span></td>
                    <td data-label="Actions" onClick={e => e.stopPropagation()}>
                      <div className="action-buttons">
                        <button onClick={() => openEditModal(trade)} className="admin-btn primary small">Edit</button>
                        {activeTab === 'pending-orders' ? (
                          <button onClick={() => cancelPendingOrder(trade._id)} className="admin-btn danger small">Cancel</button>
                        ) : !isClosedTrade && (
                          <button onClick={() => forceClosePosition(trade._id, trade.positionType || (trade.mode === 'hedging' ? 'HedgingPosition' : trade.mode === 'binary' ? 'BinaryTrade' : 'NettingPosition'), trade.symbol)} className="admin-btn danger small">Close</button>
                        )}
                        <button
                          onClick={() => deleteTrade(trade._id, activeTab === 'pending-orders' ? 'pending' : (isClosedTrade ? 'history' : 'open'))}
                          className="admin-btn danger small"
                          title="Permanently delete this position"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );})
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE rich card view (≤768px) — mirrors the same activeTrades + handlers */}
        <div className="tm-cards-mobile">
          {activeTrades.length === 0 ? (
            <div className="pos-card pos-card--empty">No positions found</div>
          ) : (
            activeTrades.map((trade, idx) => {
              const isClosedTrade = trade.status === 'closed' || activeTab === 'closed-positions' || activeTab === 'trade-history';
              const liveCurrentPrice = isClosedTrade ? (trade.closePrice || trade.exitPrice) : getLivePrice(trade);
              const livePnL = isClosedTrade ? (trade.pnl || trade.profit || 0) : calculateLivePnL(trade);
              const avgPrice = trade.entryPrice || trade.openPrice || trade.avgPrice || 0;
              const brokerage = trade.commission ?? trade.commissionInr ?? 0;
              const isBuy = trade.side === 'buy';
              const openedRaw = trade.openTime || trade.createdAt;
              return (
                <div
                  key={trade._id || idx}
                  className={`pos-card ${isBuy ? 'pos-card--buy' : 'pos-card--sell'}`}
                  onClick={() => trade.mode === 'netting' && fetchNettingLegs(trade)}
                  style={trade.mode === 'netting' ? { cursor: 'pointer' } : {}}
                >
                  <div className="pos-card__head">
                    <div className="pos-card__badges">
                      <span className={`pos-badge pos-badge--status ${isClosedTrade ? 'is-closed' : 'is-open'}`}>
                        {isClosedTrade ? 'CLOSED' : 'OPEN'}
                      </span>
                      <span className={`pos-badge pos-badge--side ${isBuy ? 'is-buy' : 'is-sell'}`}>
                        {trade.side?.toUpperCase() || '—'}
                      </span>
                      <span className="pos-badge pos-badge--mode">{trade.mode || 'hedging'}</span>
                    </div>
                    <div className="pos-card__pnl">
                      <span className="pos-card__pnl-label">NET P&amp;L</span>
                      <span className={`pos-card__pnl-value ${livePnL >= 0 ? 'is-pos' : 'is-neg'}`}>
                        {formatPnL(livePnL, trade.symbol)}
                      </span>
                    </div>
                  </div>

                  <div className="pos-card__symbol-row">
                    <span className="pos-card__symbol">{trade.symbol}</span>
                    {trade.exchange && <span className="pos-card__exchange">{trade.exchange}</span>}
                  </div>

                  <div className="pos-card__subline">
                    {trade.userName || trade.userId}
                    <span className="pos-card__usercode"> · {trade.challengeAccountCode || trade.accountId || '—'}</span>
                  </div>

                  <div className="pos-card__grid">
                    <div className="pos-cell">
                      <span className="pos-cell__label">QTY</span>
                      <span className="pos-cell__value">{trade.volume || trade.lotSize}</span>
                    </div>
                    <div className="pos-cell">
                      <span className="pos-cell__label">AVG</span>
                      <span className="pos-cell__value">{formatInstrumentCurrency(avgPrice, trade.symbol)}</span>
                    </div>
                    <div className="pos-cell">
                      <span className="pos-cell__label">LTP</span>
                      <span className="pos-cell__value">{formatInstrumentCurrency(liveCurrentPrice || 0, trade.symbol)}</span>
                    </div>
                  </div>

                  <div className="pos-card__grid pos-card__grid--secondary">
                    <div className="pos-cell">
                      <span className="pos-cell__label">M2M</span>
                      <span className={`pos-cell__value ${livePnL >= 0 ? 'is-pos' : 'is-neg'}`}>{formatPnL(livePnL, trade.symbol)}</span>
                    </div>
                    <div className="pos-cell">
                      <span className="pos-cell__label">BROKERAGE</span>
                      <span className="pos-cell__value">{formatInstrumentCurrency(brokerage, trade.symbol)}</span>
                    </div>
                    <div className="pos-cell">
                      <span className="pos-cell__label">OPENED</span>
                      <span className="pos-cell__value">
                        {openedRaw ? new Date(openedRaw).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="pos-card__actions" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEditModal(trade)} className="pos-act pos-act--edit">Edit</button>
                    {activeTab === 'pending-orders' ? (
                      <button onClick={() => cancelPendingOrder(trade._id)} className="pos-act pos-act--close">Cancel</button>
                    ) : !isClosedTrade && (
                      <button
                        onClick={() => forceClosePosition(trade._id, trade.positionType || (trade.mode === 'hedging' ? 'HedgingPosition' : trade.mode === 'binary' ? 'BinaryTrade' : 'NettingPosition'), trade.symbol)}
                        className="pos-act pos-act--close"
                      >
                        Close
                      </button>
                    )}
                    <button
                      onClick={() => deleteTrade(trade._id, activeTab === 'pending-orders' ? 'pending' : (isClosedTrade ? 'history' : 'open'))}
                      className="pos-act pos-act--del"
                      title="Permanently delete this position"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {(activeTab === 'closed-positions' || activeTab === 'trade-history') && closedTradesGrandTotal != null && closedTradesGrandTotal > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Showing {(closedPage - 1) * CLOSED_PAGE_SIZE + 1}
              –{Math.min(closedPage * CLOSED_PAGE_SIZE, closedTradesGrandTotal)} of {closedTradesGrandTotal} trades
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="admin-btn"
                disabled={closedPage <= 1}
                onClick={() => setClosedPage(p => Math.max(1, p - 1))}
                style={{ opacity: closedPage <= 1 ? 0.5 : 1, cursor: closedPage <= 1 ? 'not-allowed' : 'pointer' }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, minWidth: 90, textAlign: 'center' }}>
                Page {closedPage} of {closedTotalPages}
              </span>
              <button
                className="admin-btn"
                disabled={closedPage >= closedTotalPages}
                onClick={() => setClosedPage(p => Math.min(closedTotalPages, p + 1))}
                style={{ opacity: closedPage >= closedTotalPages ? 0.5 : 1, cursor: closedPage >= closedTotalPages ? 'not-allowed' : 'pointer' }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
            </>
          )}
        </>
      )}

      {/* Edit Trade Modal */}
      {editModal.open && editModal.trade && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 500,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Edit Position</h3>
              <button onClick={() => setEditModal({ open: false, trade: null })} style={{
                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)'
              }}>×</button>
            </div>

            {/* Trade Info */}
            <div style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 12, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Symbol</span>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{editModal.trade.symbol}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Side</span>
                  <div style={{ fontWeight: 600, color: editModal.trade.side === 'buy' ? '#10b981' : '#ef4444' }}>
                    {editModal.trade.side?.toUpperCase()}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Volume</span>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{editModal.trade.volume || editModal.trade.lotSize}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>User</span>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{editModal.trade.userName || editModal.trade.userId}</div>
                </div>
              </div>
            </div>

            {/* Edit Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Entry Price</label>
                  <input
                    type="number"
                    step="0.00001"
                    value={editForm.entryPrice}
                    onChange={(e) => setEditForm(prev => ({ ...prev, entryPrice: e.target.value }))}
                    className="admin-input"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Volume (Lots)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={editForm.volume}
                    onChange={(e) => setEditForm(prev => ({ ...prev, volume: e.target.value }))}
                    className="admin-input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Close Price</label>
                <input
                  type="number"
                  step="0.00001"
                  value={editForm.closePrice}
                  onChange={(e) => setEditForm(prev => ({ ...prev, closePrice: e.target.value }))}
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>

              {/* Calculate P/L Button */}
              <button
                onClick={calculatePnL}
                className="admin-btn"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff' }}
              >
                📊 Calculate P/L
              </button>

              {/* Calculated P/L Display */}
              <div style={{
                background: editForm.calculatedPnL >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                padding: 16, borderRadius: 12, textAlign: 'center',
                border: `1px solid ${editForm.calculatedPnL >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Calculated P/L</div>
                <div style={{
                  fontSize: 28, fontWeight: 700,
                  color: editForm.calculatedPnL >= 0 ? '#10b981' : '#ef4444'
                }}>
                  {formatPnL(editForm.calculatedPnL, editModal.trade?.symbol)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {(editModal.trade?.status === 'closed' || activeTab === 'closed-positions' || activeTab === 'trade-history')
                    ? 'This will be synced to user\'s wallet'
                    : '⚠️ Trade is open — wallet will NOT be updated until trade is closed'}
                </div>
              </div>

              {/* Manual P/L Override */}
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>
                  Manual P/L Override (optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.calculatedPnL}
                  onChange={(e) => setEditForm(prev => ({ ...prev, calculatedPnL: parseFloat(e.target.value) || 0 }))}
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setEditModal({ open: false, trade: null })}
                  className="admin-btn"
                  style={{ flex: 1, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveTradeEdit}
                  className="admin-btn primary"
                  style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)' }}
                >
                  {(editModal.trade?.status === 'closed' || activeTab === 'closed-positions' || activeTab === 'trade-history')
                    ? '💾 Save & Sync Wallet'
                    : '💾 Save Changes'}
                </button>
              </div>
              {(editModal.trade?.status === 'closed' || activeTab === 'closed-positions' || activeTab === 'trade-history') ? (
                <button
                  onClick={reopenTrade}
                  className="admin-btn"
                  style={{ 
                    width: '100%', 
                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)', 
                    color: '#fff',
                    padding: '12px 16px',
                    fontWeight: 600
                  }}
                >
                  🔄 Reopen Trade (Reverse P/L from Wallet)
                </button>
              ) : (editModal.trade?.status === 'open' || !editModal.trade?.status) && (
                <button
                  onClick={closeTradeFromModal}
                  className="admin-btn"
                  style={{ 
                    width: '100%', 
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)', 
                    color: '#fff',
                    padding: '12px 16px',
                    fontWeight: 600
                  }}
                >
                  ❌ Close Trade & Sync P/L to Wallet
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Netting Legs Modal */}
      {showLegsModal && legsPosition && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setShowLegsModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-secondary)', borderRadius: 16, width: '95%', maxWidth: 750,
            border: '1px solid var(--border)', overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Netting Entries — {legsPosition.symbol} <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>({legsPosition.userName || legsPosition.userId})</span></h3>
              <button onClick={() => setShowLegsModal(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
            </div>

            {/* Position Summary */}
            <div style={{ padding: '16px 20px', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Side</span>
                  <div style={{ fontWeight: 'bold', color: legsPosition.side === 'buy' ? '#10b981' : '#ef4444' }}>{legsPosition.side?.toUpperCase()}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Volume</span>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{parseFloat(Number(legsPosition.volume).toFixed(4))}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Avg Entry</span>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{formatInstrumentCurrency(legsPosition.entryPrice, legsPosition.symbol)}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{legsPosition.isClosed ? 'Close Price' : 'Current'}</span>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{formatInstrumentCurrency(legsPosition.currentPrice, legsPosition.symbol)}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total P/L</span>
                  <div style={{ fontWeight: 'bold', color: legsPosition.profit >= 0 ? '#10b981' : '#ef4444' }}>{formatPnL(legsPosition.profit, legsPosition.symbol)}</div>
                </div>
              </div>
            </div>

            {/* Legs Table */}
            <div style={{ overflowX: 'auto', maxHeight: 400 }}>
              {legsLoading ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading entries...</div>
              ) : legsData.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>No individual entry legs found (single entry position)</div>
              ) : (
                <table className="admin-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Type</th>
                      <th>Side</th>
                      <th>Time</th>
                      <th>Volume</th>
                      <th>Price</th>
                      <th>P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legsData.map((leg, idx) => {
                      const isPartialClose = leg.type === 'partial_close';
                      const isCloseLeg = leg.type === 'close';
                      const legSide = isPartialClose || isCloseLeg
                        ? (leg.side || (legsPosition.side === 'buy' ? 'sell' : 'buy'))
                        : (leg.side || legsPosition.side);
                      const ep = isPartialClose || isCloseLeg ? (leg.closePrice || leg.entryPrice || 0) : (leg.entryPrice || 0);
                      const vol = parseFloat(Number(leg.volume || 0).toFixed(4));

                      let pnl = 0;
                      if (isPartialClose || isCloseLeg) {
                        pnl = leg.profit || 0;
                      } else {
                        const cp = legsPosition.currentPrice || legsPosition.entryPrice;
                        const priceDiff = legsPosition.side === 'buy' ? (cp - ep) : (ep - cp);
                        const isIndian = isIndianInstrument(leg.symbol);
                        if (isIndian) {
                          const qty = (leg.volume || 0) * (legsPosition.lotSize || leg.lotSize || 1);
                          pnl = priceDiff * qty;
                        } else if ((leg.symbol || '').includes('JPY')) {
                          pnl = (priceDiff * 100000 * (leg.volume || 0)) / 100;
                        } else {
                          // Forex/Crypto contract size
                          const sym = leg.symbol || '';
                          let cs = 100000;
                          if (sym.includes('BTC') || sym.includes('ETH')) cs = 1;
                          else if (sym.includes('ADA')) cs = 1000;
                          else if (sym === 'XAUUSD' || sym === 'XPTUSD') cs = 100;
                          else if (sym === 'XAGUSD') cs = 5000;
                          else if (sym === 'US100' || sym === 'US30' || sym === 'US2000') cs = 1;
                          else if (sym === 'BRENT' || sym.includes('OIL')) cs = 1000;
                          pnl = priceDiff * cs * (leg.volume || 0);
                        }
                      }
                      return (
                        <tr key={leg._id || idx} style={(isPartialClose || isCloseLeg) ? { opacity: 0.85 } : {}}>
                          <td style={{ color: 'var(--text-secondary)' }}>{idx + 1}</td>
                          <td style={{ fontSize: 11, color: isCloseLeg ? '#ef4444' : isPartialClose ? '#f59e0b' : '#10b981' }}>
                            {isCloseLeg ? 'Close' : isPartialClose ? 'Partial' : 'Entry'}
                          </td>
                          <td style={{ fontWeight: 'bold', color: legSide === 'buy' ? '#10b981' : '#ef4444' }}>
                            {legSide.toUpperCase()}
                          </td>
                          <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                            {new Date(leg.executedAt || leg.closedAt || leg.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>{vol}</td>
                          <td>{formatInstrumentCurrency(ep, leg.symbol)}</td>
                          <td style={{ fontWeight: 'bold', color: pnl >= 0 ? '#10b981' : '#ef4444' }}>{formatPnL(pnl, leg.symbol)}</td>
                        </tr>
                      );
                    })}
                    {/* Totals Row */}
                    <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 'bold' }}>
                      <td colSpan="4" style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>Open Volume</td>
                      <td>{parseFloat(Number(legsPosition.volume).toFixed(4))}</td>
                      <td style={{ color: '#f59e0b' }}>Avg: {formatInstrumentCurrency(legsPosition.entryPrice, legsPosition.symbol)}</td>
                      <td style={{ color: legsPosition.profit >= 0 ? '#10b981' : '#ef4444' }}>{formatPnL(legsPosition.profit, legsPosition.symbol)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Avg Price Calculation */}
            {legsData.filter(l => l.type === 'open').length > 1 && (
              <div style={{ padding: '12px 20px', background: 'var(--bg-primary)', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)' }}>
                <strong style={{ color: '#f59e0b' }}>Avg Price Calculation:</strong>{' '}
                ({legsData.filter(l => l.type === 'open').map(l => `${parseFloat(Number(l.volume).toFixed(4))}×${formatInstrumentCurrency(l.entryPrice, l.symbol)}`).join(' + ')}) ÷ {parseFloat(legsData.filter(l => l.type === 'open').reduce((s, l) => s + (l.volume || 0), 0).toFixed(4))} = {formatInstrumentCurrency(legsPosition.entryPrice, legsPosition.symbol)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TradeManagement;
