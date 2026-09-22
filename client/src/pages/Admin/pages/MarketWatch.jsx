import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../adminConfig';
import {
  mergeQuoteObject,
  mergeZerodhaTick,
  resolveMetaapiLiveQuote
} from '../../../utils/pricePersistence';
import socketService from '../../../services/socketService';

const SEGMENTS = [
  { id: 'all', label: 'All', exchange: null, type: 'all' },
  { id: 'nseEq', label: 'NSE EQ', exchange: 'NSE', type: 'zerodha' },
  { id: 'nseFut', label: 'NSE FUT', exchange: 'NFO', type: 'zerodha' },
  { id: 'nseOpt', label: 'NSE OPT', exchange: 'NFO', type: 'zerodha' },
  { id: 'bseEq', label: 'BSE EQ', exchange: 'BSE', type: 'zerodha' },
  { id: 'bseFut', label: 'BSE FUT', exchange: 'BFO', type: 'zerodha' },
  { id: 'bseOpt', label: 'BSE OPT', exchange: 'BFO', type: 'zerodha' },
  { id: 'mcxFut', label: 'MCX FUT', exchange: 'MCX', type: 'zerodha' },
  { id: 'mcxOpt', label: 'MCX OPT', exchange: 'MCX', type: 'zerodha' },
  { id: 'forex', label: 'Forex', exchange: 'FOREX', type: 'metaapi' },
  { id: 'stocks', label: 'Stocks (International)', exchange: 'STOCKS', type: 'metaapi' },
  { id: 'cryptoPerp', label: 'Crypto Perpetual', exchange: 'CRYPTO', type: 'metaapi' },
  { id: 'indices', label: 'Indices', exchange: 'INDICES', type: 'metaapi' },
  { id: 'commodities', label: 'Commodities', exchange: 'COMMODITIES', type: 'metaapi' },
  { id: 'delta-perp', label: 'Δ Perpetual', exchange: 'DELTA', type: 'delta', deltaCategories: ['perpetual', 'futures'] },
  { id: 'delta-opt', label: 'Crypto Options', exchange: 'DELTA', type: 'delta', deltaCategory: 'options' },
];

const STATIC_INSTRUMENTS = {
  forex: [
    // Major Pairs
    { symbol: 'EURUSD', name: 'Euro / US Dollar', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'GBPUSD', name: 'GBP / USD', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'USDJPY', name: 'USD / JPY', exchange: 'FOREX', lotSize: 100000, tickSize: 0.001 },
    { symbol: 'USDCHF', name: 'USD / CHF', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'AUDUSD', name: 'AUD / USD', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'USDCAD', name: 'USD / CAD', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'NZDUSD', name: 'NZD / USD', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    // Cross Pairs
    { symbol: 'EURGBP', name: 'EUR / GBP', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'EURJPY', name: 'EUR / JPY', exchange: 'FOREX', lotSize: 100000, tickSize: 0.001 },
    { symbol: 'GBPJPY', name: 'GBP / JPY', exchange: 'FOREX', lotSize: 100000, tickSize: 0.001 },
    { symbol: 'EURCHF', name: 'EUR / CHF', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'EURAUD', name: 'EUR / AUD', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'GBPAUD', name: 'GBP / AUD', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'AUDNZD', name: 'AUD / NZD', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'CADJPY', name: 'CAD / JPY', exchange: 'FOREX', lotSize: 100000, tickSize: 0.001 },
    { symbol: 'AUDCAD', name: 'AUD / CAD', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'EURNZD', name: 'EUR / NZD', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'GBPNZD', name: 'GBP / NZD', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'CHFJPY', name: 'CHF / JPY', exchange: 'FOREX', lotSize: 100000, tickSize: 0.001 },
    { symbol: 'AUDJPY', name: 'AUD / JPY', exchange: 'FOREX', lotSize: 100000, tickSize: 0.001 },
    { symbol: 'NZDJPY', name: 'NZD / JPY', exchange: 'FOREX', lotSize: 100000, tickSize: 0.001 },
    { symbol: 'GBPCAD', name: 'GBP / CAD', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'EURCAD', name: 'EUR / CAD', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'CADCHF', name: 'CAD / CHF', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'GBPCHF', name: 'GBP / CHF', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'AUDCHF', name: 'AUD / CHF', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'NZDCAD', name: 'NZD / CAD', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
    { symbol: 'NZDCHF', name: 'NZD / CHF', exchange: 'FOREX', lotSize: 100000, tickSize: 0.00001 },
  ],
  stocks: [
    { symbol: 'AAPL.US', name: 'Apple Inc.', exchange: 'STOCKS', lotSize: 1, tickSize: 0.01 },
    { symbol: 'MSFT.US', name: 'Microsoft', exchange: 'STOCKS', lotSize: 1, tickSize: 0.01 },
    { symbol: 'GOOGL.US', name: 'Alphabet', exchange: 'STOCKS', lotSize: 1, tickSize: 0.01 },
    { symbol: 'TSLA.US', name: 'Tesla', exchange: 'STOCKS', lotSize: 1, tickSize: 0.01 },
  ],
  cryptoSpot: [],
  cryptoPerp: [
    { symbol: 'BTCUSD', name: 'Bitcoin', exchange: 'CRYPTO', lotSize: 1, tickSize: 0.01 },
    { symbol: 'ETHUSD', name: 'Ethereum', exchange: 'CRYPTO', lotSize: 1, tickSize: 0.01 },
    { symbol: 'LTCUSD', name: 'Litecoin', exchange: 'CRYPTO', lotSize: 1, tickSize: 0.01 },
    { symbol: 'XRPUSD', name: 'Ripple', exchange: 'CRYPTO', lotSize: 1, tickSize: 0.0001 },
    { symbol: 'BCHUSD', name: 'Bitcoin Cash', exchange: 'CRYPTO', lotSize: 1, tickSize: 0.01 },
    { symbol: 'ADAUSD', name: 'Cardano', exchange: 'CRYPTO', lotSize: 1, tickSize: 0.0001 },
    { symbol: 'DOTUSD', name: 'Polkadot', exchange: 'CRYPTO', lotSize: 1, tickSize: 0.01 },
    { symbol: 'SOLUSD', name: 'Solana', exchange: 'CRYPTO', lotSize: 1, tickSize: 0.01 },
    { symbol: 'DOGEUSD', name: 'Dogecoin', exchange: 'CRYPTO', lotSize: 1, tickSize: 0.0001 },
    { symbol: 'AVAXUSD', name: 'Avalanche', exchange: 'CRYPTO', lotSize: 1, tickSize: 0.01 },
    { symbol: 'LINKUSD', name: 'Chainlink', exchange: 'CRYPTO', lotSize: 1, tickSize: 0.01 },
    { symbol: 'MATICUSD', name: 'Polygon', exchange: 'CRYPTO', lotSize: 1, tickSize: 0.0001 },
  ],
  indices: [
    { symbol: 'US30', name: 'Dow Jones', exchange: 'INDICES', lotSize: 1, tickSize: 1 },
    { symbol: 'US100', name: 'NASDAQ 100', exchange: 'INDICES', lotSize: 1, tickSize: 0.25 },
    { symbol: 'US500', name: 'S&P 500', exchange: 'INDICES', lotSize: 1, tickSize: 0.25 },
    { symbol: 'DE40', name: 'DAX 40', exchange: 'INDICES', lotSize: 1, tickSize: 0.5 },
    { symbol: 'UK100', name: 'FTSE 100', exchange: 'INDICES', lotSize: 1, tickSize: 0.5 },
    { symbol: 'JP225', name: 'Nikkei 225', exchange: 'INDICES', lotSize: 1, tickSize: 1 },
  ],
  commodities: [
    { symbol: 'XAUUSD', name: 'Gold', exchange: 'COMMODITIES', lotSize: 100, tickSize: 0.01 },
    { symbol: 'XAGUSD', name: 'Silver', exchange: 'COMMODITIES', lotSize: 5000, tickSize: 0.001 },
    { symbol: 'XPTUSD', name: 'Platinum', exchange: 'COMMODITIES', lotSize: 100, tickSize: 0.01 },
    { symbol: 'XPDUSD', name: 'Palladium', exchange: 'COMMODITIES', lotSize: 100, tickSize: 0.01 },
    { symbol: 'USOIL', name: 'WTI Crude Oil', exchange: 'COMMODITIES', lotSize: 1000, tickSize: 0.01 },
    { symbol: 'UKOIL', name: 'Brent Crude Oil', exchange: 'COMMODITIES', lotSize: 1000, tickSize: 0.01 },
    { symbol: 'NATGAS', name: 'Natural Gas', exchange: 'COMMODITIES', lotSize: 10000, tickSize: 0.001 },
  ],
};

const AVATAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

/** Map MetaAPI socket payload → Market Watch row (Change vs session open when available). */
function mergeMetaWatchRow(prev, p, rowSymbol) {
  const bid = Number(p.bid);
  const ask = Number(p.ask);
  const ltp = bid > 0 || ask > 0 ? bid || ask : Number(prev?.ltp || 0);
  const open = Number(p.sessionOpen ?? p.open ?? prev?.open);
  const cls = Number(p.previousClose ?? p.close ?? prev?.close);
  let change;
  let changePercent;
  if (ltp > 0 && open > 0) {
    change = ltp - open;
    changePercent = (change / open) * 100;
  } else {
    change = Number(p.pointChange);
    if (!Number.isFinite(change)) change = Number(prev?.change ?? 0);
    changePercent = Number(p.change);
    if (!Number.isFinite(changePercent)) changePercent = Number(prev?.changePercent ?? 0);
  }
  return mergeQuoteObject(prev, {
    symbol: rowSymbol,
    ltp,
    bid: p.bid,
    ask: p.ask,
    low: p.low,
    high: p.high,
    open: open > 0 ? open : prev?.open,
    close: cls > 0 ? cls : prev?.close,
    change,
    changePercent
  });
}

function MarketWatch({ adminType = 'admin' }) {
  const [activeSegment, setActiveSegment] = useState('forex');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [watchlist, setWatchlist] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState(null);
  const [tradeForm, setTradeForm] = useState({
    orderType: 'market',
    price: '',
    lots: 1
  });
  const [submitting, setSubmitting] = useState(false);
  const [ticks, setTicks] = useState({});
  const [loading, setLoading] = useState(false);
  const [segmentSettings, setSegmentSettings] = useState({});
  const watchlistRef = useRef(watchlist);
  watchlistRef.current = watchlist;

  // Segment ID to segment name mapping
  const segmentIdToName = {
    forex: 'FOREX',
    stocks: 'STOCKS',
    cryptoSpot: 'CRYPTO',
    cryptoPerp: 'CRYPTO_PERPETUAL',
    'delta-perp': 'CRYPTO_PERPETUAL',
    'delta-opt': 'CRYPTO_OPTIONS',
    indices: 'INDICES',
    commodities: 'COMMODITIES',
    nseEq: 'NSE_EQ',
    bseEq: 'BSE_EQ',
    nseFut: 'NSE_FUT',
    nseOpt: 'NSE_OPT',
    mcxFut: 'MCX_FUT',
    mcxOpt: 'MCX_OPT',
    bseFut: 'BSE_FUT',
    bseOpt: 'BSE_OPT'
  };

  // Fetch segment settings on mount
  useEffect(() => {
    const fetchSegmentSettings = async () => {
      try {
        const res = await fetch(`${API_URL}/api/user/all-segment-settings`);
        const data = await res.json();
        if (data.success) {
          setSegmentSettings(data.settings);
        }
      } catch (error) {
        console.error('Error fetching segment settings:', error);
      }
    };
    fetchSegmentSettings();
  }, []);



  // Fetch users based on admin type
  useEffect(() => {
    fetchUsers();
  }, [adminType]);

  // Real-time MetaAPI + Delta (same Socket.IO feed as user market terminal)
  useEffect(() => {
    socketService.init();
    const unsub = socketService.onPriceUpdate((allPrices) => {
      const list = watchlistRef.current;
      if (!list.length || !allPrices || typeof allPrices !== 'object') return;
      setTicks((prev) => {
        let next = { ...prev };
        let changed = false;
        for (const w of list) {
          if (w.token && w.source !== 'delta_exchange') continue;
          if (w.source === 'delta_exchange') {
            const p = allPrices[w.symbol];
            const ltp = p?.last || p?.mark_price || p?.bid || p?.ask;
            if (p && Number(ltp) > 0) {
              const changePercent =
                p.open && ltp ? ((ltp - p.open) / p.open) * 100 : Number(p.changePercent) || 0;
              next[w.symbol] = mergeQuoteObject(next[w.symbol], {
                symbol: w.symbol,
                bid: p.bid || ltp,
                ask: p.ask || ltp,
                ltp,
                high: p.high,
                low: p.low,
                open: p.open,
                change: p.change || 0,
                changePercent
              });
              changed = true;
            }
            continue;
          }
          const p = resolveMetaapiLiveQuote(allPrices, w.symbol);
          if (p && (Number(p.bid) > 0 || Number(p.ask) > 0)) {
            next[w.symbol] = mergeMetaWatchRow(next[w.symbol], p, w.symbol);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    return () => unsub();
  }, []);

  // Hydrate from socket cache when watchlist changes (instant paint if server already streaming)
  useEffect(() => {
    const list = watchlist;
    if (!list.length) return;
    const allPrices = socketService.getPrices();
    if (!allPrices || !Object.keys(allPrices).length) return;
    setTicks((prev) => {
      let next = { ...prev };
      let changed = false;
      for (const w of list) {
        if (w.token && w.source !== 'delta_exchange') continue;
        if (w.source === 'delta_exchange') {
          const p = allPrices[w.symbol];
          const ltp = p?.last || p?.mark_price || p?.bid || p?.ask;
          if (p && Number(ltp) > 0) {
            const changePercent =
              p.open && ltp ? ((ltp - p.open) / p.open) * 100 : Number(p.changePercent) || 0;
            next[w.symbol] = mergeQuoteObject(next[w.symbol], {
              symbol: w.symbol,
              bid: p.bid || ltp,
              ask: p.ask || ltp,
              ltp,
              high: p.high,
              low: p.low,
              open: p.open,
              change: p.change || 0,
              changePercent
            });
            changed = true;
          }
          continue;
        }
        const p = resolveMetaapiLiveQuote(allPrices, w.symbol);
        if (p && (Number(p.bid) > 0 || Number(p.ask) > 0)) {
          next[w.symbol] = mergeMetaWatchRow(next[w.symbol], p, w.symbol);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [watchlist]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('dhanfunded-admin-token');

      // Admin gets the global users listing. Sub-admin and broker must go
      // through the scoped endpoint (/api/admin/scoped/users-list) so the
      // server filters to their subtree — the old /api/subadmin/users and
      // /api/broker/users paths never existed and returned 404, which is
      // what made the dropdown stay empty.
      const endpoint =
        adminType === 'admin'
          ? `${API_URL}/api/admin/users?limit=500&status=active`
          : `${API_URL}/api/admin/scoped/users-list?limit=500&status=active`;

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success || Array.isArray(data)) {
        setUsers(Array.isArray(data) ? data : (data.users || []));
      } else {
        console.warn('[MarketWatch] fetchUsers non-success response:', data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchLTP = useCallback(async () => {
    try {
      const list = watchlistRef.current;
      const deltaInstruments = list.filter((w) => w.source === 'delta_exchange');
      const zerodhaInstruments = list.filter((w) => w.token && w.source !== 'delta_exchange');
      const metaApiInstruments = list.filter((w) => !w.token && w.source !== 'delta_exchange');

      let zerodhaTicks = [];
      if (zerodhaInstruments.length > 0) {
        const res = await fetch(`${API_URL}/api/zerodha/ltp`);
        const data = await res.json();
        if (data.success && data.ticks) zerodhaTicks = data.ticks;
      }

      let deltaPrices = null;
      if (deltaInstruments.length > 0) {
        try {
          const res = await fetch(`${API_URL}/api/delta/prices`);
          const data = await res.json();
          if (data.success && data.prices) deltaPrices = data.prices;
        } catch (e) {
          console.warn('Delta prices fetch failed', e);
        }
      }

      let streamPrices = null;
      let metaapiPostPrices = null;
      if (metaApiInstruments.length > 0) {
        const symbols = metaApiInstruments.map((w) => w.symbol);
        try {
          const streamRes = await fetch(`${API_URL}/api/instruments/prices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols })
          });
          const streamData = await streamRes.json();
          if (streamData.success && streamData.prices) streamPrices = streamData.prices;
        } catch (e) {
          console.warn('MetaAPI streaming price fetch failed', e);
        }
        try {
          const res = await fetch(`${API_URL}/api/metaapi/prices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols })
          });
          const data = await res.json();
          if (data.prices) metaapiPostPrices = data.prices;
        } catch (e) {
          console.warn('MetaAPI proxy prices failed', e);
        }
      }

      setTicks((prev) => {
        const tickMap = { ...prev };
        zerodhaTicks.forEach((tick) => {
          tickMap[tick.token] = mergeZerodhaTick(tickMap[tick.token], tick);
        });
        if (deltaPrices && deltaInstruments.length > 0) {
          deltaInstruments.forEach((w) => {
            const p = deltaPrices[w.symbol];
            if (!p) return;
            const ltp = p.last || p.mark_price || p.bid || p.ask || 0;
            const changePercent =
              p.open && ltp ? ((ltp - p.open) / p.open) * 100 : 0;
            tickMap[w.symbol] = mergeQuoteObject(tickMap[w.symbol], {
              symbol: w.symbol,
              bid: p.bid || ltp,
              ask: p.ask || ltp,
              ltp,
              high: p.high,
              low: p.low,
              open: p.open,
              change: p.change || 0,
              changePercent
            });
          });
        }
        if (streamPrices && metaApiInstruments.length > 0) {
          Object.entries(streamPrices).forEach(([symbol, priceData]) => {
            const ltp =
              priceData.bid ||
              priceData.ask ||
              priceData.last ||
              priceData.lastPrice ||
              0;
            const tickPct = Number(priceData.change);
            const pt = Number(priceData.pointChange);
            tickMap[symbol] = mergeQuoteObject(tickMap[symbol], {
              symbol,
              ltp,
              bid: priceData.bid,
              ask: priceData.ask,
              low: priceData.low,
              high: priceData.high,
              open: priceData.open ?? priceData.sessionOpen,
              close: priceData.close ?? priceData.previousClose,
              change: Number.isFinite(pt) ? pt : 0,
              changePercent: Number.isFinite(tickPct) ? tickPct : 0
            });
          });
        }
        if (metaapiPostPrices && metaApiInstruments.length > 0) {
          Object.entries(metaapiPostPrices).forEach(([symbol, priceData]) => {
            const ltp =
              priceData.bid ||
              priceData.ask ||
              priceData.last ||
              priceData.lastPrice ||
              0;
            const patch = { symbol, ltp, bid: priceData.bid, ask: priceData.ask };
            if (priceData.low != null && Number(priceData.low) > 0) patch.low = priceData.low;
            if (priceData.high != null && Number(priceData.high) > 0) patch.high = priceData.high;
            if (priceData.sessionOpen != null && Number(priceData.sessionOpen) > 0) {
              patch.open = priceData.sessionOpen;
            }
            if (priceData.previousClose != null && Number(priceData.previousClose) > 0) {
              patch.close = priceData.previousClose;
            }
            tickMap[symbol] = mergeQuoteObject(tickMap[symbol], patch);
          });
        }
        metaApiInstruments.forEach((w) => {
          const sym = w.symbol;
          const t = tickMap[sym];
          if (!t) return;
          const ltp = Number(t.ltp || t.bid || 0);
          const cls = Number(t.close);
          const ch = Number(t.change);
          const cp = Number(t.changePercent);
          if (ltp > 0 && cls > 0 && ch === 0 && cp === 0) {
            const dailyPts = ltp - cls;
            tickMap[sym] = mergeQuoteObject(t, {
              change: dailyPts,
              changePercent: (dailyPts / cls) * 100
            });
          }
        });
        return tickMap;
      });
    } catch (error) {
      console.error('Error fetching LTP:', error);
    }
  }, []);

  useEffect(() => {
    if (watchlist.length === 0) return;
    fetchLTP();
    const interval = setInterval(fetchLTP, 30000);
    return () => clearInterval(interval);
  }, [watchlist, fetchLTP]);

  const searchInstruments = useCallback(async (query) => {
    const segment = SEGMENTS.find(s => s.id === activeSegment);

    if (segment?.type === 'all') {
      setSearchResults([]);
      return;
    }
    
    // For MetaAPI segments (Forex, Stocks, Crypto, Indices, Com), use static instruments
    if (segment?.type === 'metaapi') {
      const staticList = STATIC_INSTRUMENTS[activeSegment] || [];
      if (!query || query.length < 1) {
        setSearchResults(staticList);
        return;
      }
      const filtered = staticList.filter(inst => 
        inst.symbol.toLowerCase().includes(query.toLowerCase()) ||
        inst.name.toLowerCase().includes(query.toLowerCase())
      );
      setSearchResults(filtered);
      return;
    }

    if (segment?.type === 'delta') {
      setSearching(true);
      try {
        const search = query && query.trim() ? query.trim() : '';
        const categories =
          segment.deltaCategories?.length > 0
            ? segment.deltaCategories
            : segment.deltaCategory
              ? [segment.deltaCategory]
              : [];
        const merged = [];
        for (const cat of categories) {
          const params = new URLSearchParams();
          params.set('category', cat);
          if (search) params.set('search', search);
          const res = await fetch(`${API_URL}/api/delta/instruments?${params}`);
          const data = await res.json();
          merged.push(...(data.instruments || []));
        }
        const seen = new Set();
        const deduped = merged.filter((inst) => {
          if (!inst.symbol || seen.has(inst.symbol)) return false;
          seen.add(inst.symbol);
          return true;
        });
        deduped.sort((a, b) => a.symbol.localeCompare(b.symbol));
        setSearchResults(deduped.slice(0, 300));
      } catch (error) {
        console.error('Error searching Delta instruments:', error);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
      return;
    }

    // For Zerodha segments, search via API
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(
        `${API_URL}/api/zerodha/instruments/search?query=${encodeURIComponent(query)}&segment=${activeSegment}&exchange=${segment?.exchange || 'NFO'}`
      );
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.instruments || []);
      }
    } catch (error) {
      console.error('Error searching instruments:', error);
    } finally {
      setSearching(false);
    }
  }, [activeSegment]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInstruments(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchInstruments]);

  // Load static instruments when switching to MetaAPI segments
  useEffect(() => {
    const segment = SEGMENTS.find(s => s.id === activeSegment);
    if (segment?.type === 'metaapi') {
      setSearchResults(STATIC_INSTRUMENTS[activeSegment] || []);
    } else if (segment?.type === 'all') {
      setSearchResults([]);
    } else if (segment?.type === 'zerodha' || segment?.type === 'delta') {
      setSearchResults([]);
    }
  }, [activeSegment]);

  // Fetch watchlist from DB
  const fetchWatchlist = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('dhanfunded-admin-token');

      if (activeSegment === 'all') {
        const merged = [];
        for (const seg of SEGMENTS) {
          if (seg.type === 'all') continue;
          const res = await fetch(`${API_URL}/api/admin/watchlist/${seg.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.success && data.instruments?.length) {
            for (const inst of data.instruments) {
              merged.push({
                ...inst,
                _mwSegment: seg.id,
                _mwSegmentLabel: seg.label
              });
            }
          }
        }
        // Old split tab removed: still surface saved rows from `delta-fut` in All
        try {
          const legacyRes = await fetch(`${API_URL}/api/admin/watchlist/delta-fut`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const legacyData = await legacyRes.json();
          if (legacyData.success && legacyData.instruments?.length) {
            for (const inst of legacyData.instruments) {
              merged.push({
                ...inst,
                _mwSegment: 'delta-fut',
                _mwSegmentLabel: 'Δ Futures (legacy)'
              });
            }
          }
        } catch (_) {
          /* ignore */
        }
        try {
          const legacyCryptoRes = await fetch(`${API_URL}/api/admin/watchlist/crypto`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const legacyCryptoData = await legacyCryptoRes.json();
          if (legacyCryptoData.success && legacyCryptoData.instruments?.length) {
            for (const inst of legacyCryptoData.instruments) {
              merged.push({
                ...inst,
                _mwSegment: 'crypto',
                _mwSegmentLabel: 'Crypto Perpetual (legacy)'
              });
            }
          }
        } catch (_) {
          /* ignore */
        }
        setWatchlist(merged);
        for (const inst of merged) {
          if (inst.token) {
            fetch(`${API_URL}/api/zerodha/instruments/subscribe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ instrument: inst })
            }).catch((err) => console.error('Error subscribing:', err));
          }
        }
        return;
      }

      const res = await fetch(`${API_URL}/api/admin/watchlist/${activeSegment}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        let instruments = data.instruments || [];
        if (activeSegment === 'cryptoPerp') {
          try {
            const legRes = await fetch(`${API_URL}/api/admin/watchlist/crypto`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const legData = await legRes.json();
            if (legData.success && legData.instruments?.length) {
              const seen = new Set(instruments.map((i) => i.symbol));
              for (const i of legData.instruments) {
                if (!seen.has(i.symbol)) {
                  seen.add(i.symbol);
                  instruments.push(i);
                }
              }
            }
          } catch (_) {
            /* ignore */
          }
        }
        setWatchlist(instruments);
        
        // Subscribe Zerodha instruments for live prices
        const segment = SEGMENTS.find(s => s.id === activeSegment);
        if (segment?.type === 'zerodha') {
          const zerodhaInstruments = instruments.filter(inst => inst.token);
          for (const inst of zerodhaInstruments) {
            fetch(`${API_URL}/api/zerodha/instruments/subscribe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ instrument: inst })
            }).catch(err => console.error('Error subscribing:', err));
          }
        }
      }
    } catch (error) {
      console.error('Error fetching watchlist:', error);
      setWatchlist([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch watchlist when segment changes
  useEffect(() => {
    fetchWatchlist();
  }, [activeSegment]);

  const addToWatchlist = async (instrument) => {
    if (activeSegment === 'all') {
      alert('Select a segment tab (e.g. Forex, NSE FUT) to search and add symbols. The All tab shows every saved watchlist together.');
      return;
    }
    const key = instrument.token || instrument.symbol;
    if (watchlist.some(w => (w.token || w.symbol) === key)) return;

    try {
      const token = localStorage.getItem('dhanfunded-admin-token');
      const segment = SEGMENTS.find(s => s.id === activeSegment);
      const normalized =
        segment?.type === 'delta'
          ? {
              symbol: instrument.symbol,
              name: instrument.name || instrument.symbol,
              exchange: 'DELTA',
              lotSize: instrument.lot_size ?? instrument.lotSize ?? 1,
              tickSize: instrument.tick_size ?? instrument.tickSize ?? 0.01,
              source: 'delta_exchange',
              contract_type: instrument.contract_type,
              expiry: instrument.expiry
            }
          : instrument;
      
      // For Zerodha segments, subscribe to instrument for live prices
      if (segment?.type === 'zerodha' && normalized.token) {
        await fetch(`${API_URL}/api/zerodha/instruments/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instrument: normalized })
        });
      }
      
      // Add to admin watchlist
      await fetch(`${API_URL}/api/admin/watchlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ segment: activeSegment, instrument: normalized })
      });
      setWatchlist(prev => [...prev, normalized]);
      setShowSearchDropdown(false);
      setSearchQuery('');
    } catch (error) {
      console.error('Error adding to watchlist:', error);
    }
  };

  const removeFromWatchlist = async (instrument) => {
    const seg = instrument._mwSegment || activeSegment;
    const key = instrument.token || instrument.symbol;
    try {
      const token = localStorage.getItem('dhanfunded-admin-token');
      await fetch(`${API_URL}/api/admin/watchlist`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ segment: seg, symbol: instrument.symbol })
      });
      if (activeSegment === 'all') {
        setWatchlist((prev) =>
          prev.filter(
            (w) =>
              !(
                (w.token || w.symbol) === key &&
                (w._mwSegment || '') === (instrument._mwSegment || '')
              )
          )
        );
      } else {
        setWatchlist((prev) => prev.filter((w) => (w.token || w.symbol) !== key));
      }
    } catch (error) {
      console.error('Error removing from watchlist:', error);
    }
  };

  const openTradeModal = (instrument) => {
    setSelectedInstrument(instrument);
    const tick = ticks[instrument.token] || ticks[instrument.symbol];
    setTradeForm({
      orderType: 'market',
      price: tick?.ltp || tick?.lastPrice || '',
      lots: '0.01'
    });
    setSelectedUsers([]);
    setShowTradeModal(true);
  };

  const handleTrade = async (side) => {
    if (selectedUsers.length === 0) {
      alert('Please select at least one user');
      return;
    }
    if (!selectedInstrument) return;

    setSubmitting(true);
    try {
      const token = localStorage.getItem('dhanfunded-admin-token');
      const tick = ticks[selectedInstrument.token] || ticks[selectedInstrument.symbol];
      
      const results = [];
      const errors = [];

      // Place orders for all selected users
      for (const user of selectedUsers) {
        const orderData = {
          userId: user._id || user.id,
          symbol: selectedInstrument.symbol,
          side,
          type: tradeForm.orderType,
          volume: parseFloat(tradeForm.lots),
          price: tradeForm.orderType === 'market' ? (tick?.ltp || tick?.lastPrice || 0) : parseFloat(tradeForm.price),
          tradeMode: 'netting',
          instrument: {
            token: selectedInstrument.token,
            exchange: selectedInstrument.exchange,
            lotSize: selectedInstrument.lotSize,
            tickSize: selectedInstrument.tickSize
          }
        };

        try {
          const res = await fetch(`${API_URL}/api/admin/trades/place`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(orderData)
          });

          const data = await res.json();
          if (data.success) {
            results.push(user.name || user.email);
          } else {
            errors.push(`${user.name || user.email}: ${data.error}`);
          }
        } catch (err) {
          errors.push(`${user.name || user.email}: Network error`);
        }
      }

      if (results.length > 0) {
        alert(`Orders placed for ${results.length} user(s): ${results.join(', ')}${errors.length > 0 ? `\n\nFailed: ${errors.join(', ')}` : ''}`);
      } else {
        alert(`All orders failed:\n${errors.join('\n')}`);
      }
      
      if (results.length > 0) {
        setShowTradeModal(false);
      }
    } catch (error) {
      console.error('Error placing order:', error);
      alert('Error placing order');
    } finally {
      setSubmitting(false);
    }
  };

  const getTick = (instrument) => {
    return ticks[instrument.token] || ticks[instrument.symbol] || {};
  };

  const getAvatarColor = (symbol) => {
    const index = symbol.charCodeAt(0) % AVATAR_COLORS.length;
    return AVATAR_COLORS[index];
  };

  const formatExpiry = (expiry) => {
    if (!expiry) return '';
    const date = new Date(expiry);
    const day = date.getDate();
    const month = date.toLocaleString('en', { month: 'short' }).toUpperCase();
    return `${day} ${month}`;
  };

  const formatPrice = (price) => {
    if (!price) return '0.00';
    return Number(price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatChange = (change) => {
    if (!change) return '0.00';
    const val = Number(change);
    return (val >= 0 ? '+' : '') + val.toFixed(2);
  };

  const formatChangePercent = (percent) => {
    if (!percent) return '0.00%';
    const val = Number(percent);
    return val.toFixed(2) + '%';
  };

  return (
    <div className="mw-container">
      <div className="mw-header">
        <span className="mw-title">Real-time market data and execution</span>
      </div>

      {/* Segment Tabs */}
      <div className="mw-tabs">
        <button className="mw-add-btn" onClick={() => { setShowSearchDropdown(true); searchInstruments(searchQuery); }}>+</button>
        {SEGMENTS.map(segment => (
          <button
            key={segment.id}
            className={`mw-tab ${activeSegment === segment.id ? 'active' : ''}`}
            onClick={() => {
              setActiveSegment(segment.id);
              setSearchQuery('');
              setShowSearchDropdown(false);
            }}
          >
            {segment.label}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="mw-search-bar">
        <div className="mw-search-wrapper">
          <span className="mw-search-icon">🔍</span>
          <input
            type="text"
            placeholder={activeSegment === 'all' ? 'Select a segment tab to search & add symbols…' : 'Search symbols...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => { setShowSearchDropdown(true); searchInstruments(searchQuery); }}
            className="mw-search-input"
          />
          {showSearchDropdown && (
            <div className="mw-search-dropdown">
              {searching && <div className="mw-dropdown-loading">Searching...</div>}
              {!searching && searchResults.length === 0 && (
                <div className="mw-dropdown-empty">
                  {activeSegment === 'all'
                    ? 'Use a segment tab (Forex, NSE, …) to search. All combines saved watchlists only.'
                    : SEGMENTS.find(s => s.id === activeSegment)?.type === 'zerodha'
                      ? 'Type at least 2 characters to search'
                      : SEGMENTS.find(s => s.id === activeSegment)?.type === 'delta'
                        ? 'No instruments (check Delta service / API)'
                        : 'No instruments found'}
                </div>
              )}
              {!searching && searchResults.map(inst => (
                <div
                  key={inst.token || inst.symbol}
                  className="mw-dropdown-item"
                  onClick={() => addToWatchlist(inst)}
                >
                  <div className="mw-dropdown-info">
                    <span className="mw-dropdown-symbol">{inst.symbol}</span>
                    <span className="mw-dropdown-name">
                      {inst.name || inst.tradingsymbol}
                      {inst.expiry && <span className="mw-dropdown-expiry"> • {formatExpiry(inst.expiry)}</span>}
                      {(inst.lotSize ?? inst.lot_size) > 1 && (
                        <span className="mw-dropdown-lot"> • Lot: {inst.lotSize ?? inst.lot_size}</span>
                      )}
                    </span>
                  </div>
                  <span className="mw-dropdown-add">+ Add</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showSearchDropdown && <div className="mw-backdrop" onClick={() => setShowSearchDropdown(false)} />}

      {/* Data Table */}
      <div className="mw-table-container">
        <table className="mw-table">
          <thead>
            <tr>
              {activeSegment === 'all' && <th>Segment</th>}
              <th>Script</th>
              <th>Bid</th>
              <th>Ask</th>
              <th>LTP</th>
              <th>Change</th>
              <th>Change%</th>
              <th>High</th>
              <th>Low</th>
              <th>Open</th>
              <th>Close</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={activeSegment === 'all' ? 12 : 11} className="mw-loading">Loading...</td></tr>
            ) : watchlist.length === 0 ? (
              <tr><td colSpan={activeSegment === 'all' ? 12 : 11} className="mw-empty">No instruments added. Search above to add.</td></tr>
            ) : (
              watchlist.map((inst) => {
                const tick = getTick(inst);
                const change = tick.change || 0;
                const changePercent = tick.changePercent || tick.change_percent || 0;
                const isPositive = change >= 0;
                return (
                  <tr key={`${inst._mwSegment || activeSegment}-${inst.token || inst.symbol}`} onClick={() => openTradeModal(inst)} className="mw-row">
                    {activeSegment === 'all' && (
                      <td>
                        <span className="mw-seg-badge">{inst._mwSegmentLabel || inst._mwSegment}</span>
                      </td>
                    )}
                    <td>
                      <div className="mw-script">
                        <div className="mw-avatar" style={{ background: getAvatarColor(inst.symbol) }}>
                          {inst.symbol.charAt(0)}
                        </div>
                        <div className="mw-script-info">
                          <span className="mw-script-name">{inst.symbol}</span>
                          <span className="mw-script-expiry">
                            {formatExpiry(inst.expiry)}
                            {inst.lotSize && inst.lotSize > 1 && <span className="mw-script-lot"> • Lot: {inst.lotSize}</span>}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="mw-bid">{formatPrice(tick.bid || tick.ltp)}</td>
                    <td className="mw-ask">{formatPrice(tick.ask || tick.ltp)}</td>
                    <td>{formatPrice(tick.ltp || tick.lastPrice)}</td>
                    <td className={isPositive ? 'mw-positive' : 'mw-negative'}>{formatChange(change)}</td>
                    <td className={isPositive ? 'mw-positive' : 'mw-negative'}>{formatChangePercent(changePercent)}</td>
                    <td>{formatPrice(tick.high)}</td>
                    <td>{formatPrice(tick.low)}</td>
                    <td>{formatPrice(tick.open)}</td>
                    <td>{formatPrice(tick.close)}</td>
                    <td>
                      <button className="mw-remove-btn" onClick={(e) => { e.stopPropagation(); removeFromWatchlist(inst); }}>×</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Trade Modal */}
      {showTradeModal && selectedInstrument && (
        <div className="mw-modal-overlay" onClick={() => setShowTradeModal(false)}>
          <div className="mw-modal" onClick={e => e.stopPropagation()}>
            <div className="mw-modal-header">
              <div className="mw-modal-title">
                <span className="mw-modal-icon">↕</span>
                <div>
                  <h3>Place Order</h3>
                  <p>Execute buy or sell order for {selectedInstrument.symbol}</p>
                </div>
              </div>
              <button className="mw-modal-close" onClick={() => setShowTradeModal(false)}>×</button>
            </div>

            <div className="mw-modal-body">
              <div className="mw-modal-instrument">
                <div className="mw-modal-inst-left">
                  <span className="mw-modal-symbol">{selectedInstrument.symbol}</span>
                  <span className="mw-modal-expiry">{formatExpiry(selectedInstrument.expiry)}</span>
                </div>
                <div className="mw-modal-inst-right">
                  <span className="mw-modal-price">{formatPrice(getTick(selectedInstrument).ltp)}</span>
                  <span className={`mw-modal-change ${(getTick(selectedInstrument).change || 0) >= 0 ? 'positive' : 'negative'}`}>
                    {formatChange(getTick(selectedInstrument).change)} ({formatChangePercent(getTick(selectedInstrument).changePercent)})
                  </span>
                </div>
              </div>

              <div className="mw-modal-bidask">
                <span>Bid: {formatPrice(getTick(selectedInstrument).bid)}</span>
                <span>Ask: {formatPrice(getTick(selectedInstrument).ask)}</span>
              </div>

              <div className="mw-form-group">
                <label>Users ({selectedUsers.length} selected)</label>
                <div className="mw-multi-select">
                  <div className="mw-selected-users">
                    {selectedUsers.length === 0 ? (
                      <span className="mw-placeholder">Click to select users...</span>
                    ) : (
                      selectedUsers.map(user => (
                        <span key={user._id} className="mw-user-tag">
                          {user.name || user.email}
                          <button onClick={() => setSelectedUsers(prev => prev.filter(u => u._id !== user._id))}>×</button>
                        </span>
                      ))
                    )}
                  </div>
                  <div className="mw-user-list">
                    <div className="mw-select-all">
                      <button 
                        onClick={() => setSelectedUsers(users)} 
                        className="mw-select-all-btn"
                      >Select All</button>
                      <button 
                        onClick={() => setSelectedUsers([])} 
                        className="mw-clear-btn"
                      >Clear</button>
                    </div>
                    {users.map(user => (
                      <label key={user._id} className="mw-user-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedUsers.some(u => u._id === user._id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUsers(prev => [...prev, user]);
                            } else {
                              setSelectedUsers(prev => prev.filter(u => u._id !== user._id));
                            }
                          }}
                        />
                        <span>{user.name || user.email} ({user.oderId})</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mw-form-group">
                <label>Order Type</label>
                <div className="mw-order-types">
                  <button
                    className={`mw-type-btn ${tradeForm.orderType === 'market' ? 'active' : ''}`}
                    onClick={() => setTradeForm(prev => ({ ...prev, orderType: 'market' }))}
                  >Market</button>
                  <button
                    className={`mw-type-btn ${tradeForm.orderType === 'limit' ? 'active' : ''}`}
                    onClick={() => setTradeForm(prev => ({ ...prev, orderType: 'limit' }))}
                  >Manual</button>
                </div>
              </div>

              <div className="mw-form-row">
                <div className="mw-form-group">
                  <label>Price</label>
                  <input
                    type="text"
                    value={tradeForm.orderType === 'market' ? 'Market' : tradeForm.price}
                    onChange={(e) => setTradeForm(prev => ({ ...prev, price: e.target.value }))}
                    disabled={tradeForm.orderType === 'market'}
                    className="mw-input"
                  />
                </div>
                <div className="mw-form-group">
                  <label>Lots</label>
                  <input
                    type="number"
                    value={tradeForm.lots}
                    onChange={(e) => setTradeForm(prev => ({ ...prev, lots: e.target.value }))}
                    min="0.01"
                    step="0.01"
                    className="mw-input"
                  />
                </div>
              </div>

              <div className="mw-lot-info">
                Lot Size: {selectedInstrument.lotSize || 1} | Qty: {((parseFloat(tradeForm.lots) || 0.01) * (selectedInstrument.lotSize || 1)).toFixed(0)} | Margin: 25%
              </div>

              <div className="mw-action-btns">
                <button className="mw-buy-btn" onClick={() => handleTrade('buy')} disabled={submitting}>
                  {submitting ? '...' : 'BUY'}
                </button>
                <button className="mw-sell-btn" onClick={() => handleTrade('sell')} disabled={submitting}>
                  {submitting ? '...' : 'SELL'}
                </button>
              </div>
            </div>

            <div className="mw-modal-footer">
              <span className="mw-footer-bid">{formatPrice(getTick(selectedInstrument).bid)}</span>
              <span>{formatPrice(getTick(selectedInstrument).ask)}</span>
              <span className={(getTick(selectedInstrument).change || 0) >= 0 ? 'mw-positive' : 'mw-negative'}>
                {formatChange(getTick(selectedInstrument).change)}
              </span>
              <span className={(getTick(selectedInstrument).changePercent || 0) >= 0 ? 'mw-positive' : 'mw-negative'}>
                {formatChangePercent(getTick(selectedInstrument).changePercent)}
              </span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .mw-container { padding: 16px; background: var(--bg-primary); min-height: 100vh; color: var(--text-primary); }
        .mw-header { margin-bottom: 16px; }
        .mw-title { color: var(--text-secondary); font-size: 14px; }
        .mw-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
        .mw-add-btn { width: 36px; height: 36px; border: 1px dashed var(--border-color); border-radius: 6px; background: transparent; color: var(--text-secondary); font-size: 20px; cursor: pointer; transition: all 0.2s; }
        .mw-add-btn:hover { background: var(--bg-hover); border-color: #238636; color: #238636; }
        .mw-tab { padding: 8px 16px; border: none; border-radius: 6px; background: var(--bg-tertiary); color: var(--text-secondary); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .mw-tab:hover { background: var(--bg-hover); }
        .mw-tab.active { background: #238636; color: #fff; }
        .mw-search-bar { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; max-width: 400px; }
        .mw-search-wrapper { flex: 1; position: relative; }
        .mw-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); opacity: 0.5; }
        .mw-search-input { width: 100%; padding: 10px 12px 10px 40px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 14px; }
        .mw-search-input:focus { outline: none; border-color: var(--accent-primary); }
        .mw-search-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; max-height: 300px; overflow-y: auto; z-index: 100; margin-top: 4px; }
        .mw-dropdown-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; cursor: pointer; border-bottom: 1px solid var(--border-color); }
        .mw-dropdown-item:hover { background: var(--bg-hover); }
        .mw-dropdown-info { display: flex; flex-direction: column; }
        .mw-dropdown-symbol { font-weight: 600; color: var(--text-primary); }
        .mw-dropdown-name { font-size: 12px; color: var(--text-secondary); }
        .mw-dropdown-expiry { color: #f97316; font-weight: 500; }
        .mw-dropdown-lot { color: #3b82f6; font-weight: 500; }
        .mw-dropdown-add { color: #238636; font-weight: 500; }
        .mw-dropdown-loading, .mw-dropdown-empty { padding: 20px; text-align: center; color: var(--text-secondary); }
        .mw-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 99; }
        .mw-table-container { background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; overflow-x: auto; }
        .mw-table { width: 100%; border-collapse: collapse; min-width: 900px; }
        .mw-table th { padding: 12px 16px; text-align: left; font-weight: 500; color: var(--text-secondary); font-size: 13px; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); }
        .mw-table td { padding: 16px; border-bottom: 1px solid var(--border-color); font-size: 14px; }
        .mw-seg-badge { font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 6px; background: rgba(59, 130, 246, 0.2); color: #93c5fd; white-space: nowrap; }
        .mw-row { cursor: pointer; transition: background 0.2s; }
        .mw-row:hover { background: var(--bg-hover); }
        .mw-script { display: flex; align-items: center; gap: 12px; }
        .mw-avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #fff; font-size: 14px; }
        .mw-script-info { display: flex; flex-direction: column; }
        .mw-script-name { font-weight: 600; color: var(--text-primary); }
        .mw-script-expiry { font-size: 12px; color: var(--text-secondary); }
        .mw-script-lot { color: #3b82f6; font-weight: 500; }
        .mw-bid { color: #22c55e; }
        .mw-ask { color: #ef4444; }
        .mw-positive { color: #22c55e; }
        .mw-negative { color: #ef4444; }
        .mw-remove-btn { width: 28px; height: 28px; border: none; border-radius: 4px; background: transparent; color: var(--text-secondary); font-size: 18px; cursor: pointer; }
        .mw-remove-btn:hover { background: #ef4444; color: #fff; }
        .mw-loading, .mw-empty { text-align: center; color: var(--text-secondary); padding: 40px !important; }
        .mw-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .mw-modal { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; width: 90%; max-width: 420px; }
        .mw-modal-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 20px; border-bottom: 1px solid var(--border-color); }
        .mw-modal-title { display: flex; gap: 12px; }
        .mw-modal-icon { font-size: 20px; color: var(--accent-primary); }
        .mw-modal-title h3 { margin: 0; color: var(--text-primary); font-size: 18px; }
        .mw-modal-title p { margin: 4px 0 0; color: var(--text-secondary); font-size: 13px; }
        .mw-modal-close { width: 32px; height: 32px; border: none; border-radius: 6px; background: var(--bg-tertiary); color: var(--text-secondary); font-size: 20px; cursor: pointer; }
        .mw-modal-body { padding: 20px; }
        .mw-modal-instrument { display: flex; justify-content: space-between; margin-bottom: 16px; }
        .mw-modal-inst-left { display: flex; flex-direction: column; }
        .mw-modal-symbol { font-weight: 700; font-size: 18px; color: var(--text-primary); }
        .mw-modal-expiry { font-size: 13px; color: var(--text-secondary); }
        .mw-modal-inst-right { text-align: right; }
        .mw-modal-price { font-size: 18px; font-weight: 600; color: var(--text-primary); }
        .mw-modal-change { font-size: 13px; }
        .mw-modal-change.positive { color: #22c55e; }
        .mw-modal-change.negative { color: #ef4444; }
        .mw-modal-bidask { display: flex; justify-content: space-between; padding: 12px; background: var(--bg-primary); border-radius: 6px; margin-bottom: 20px; font-size: 14px; color: var(--text-secondary); }
        .mw-form-group { margin-bottom: 16px; }
        .mw-form-group label { display: block; margin-bottom: 8px; color: var(--text-secondary); font-size: 13px; }
        .mw-select, .mw-input { width: 100%; padding: 12px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 14px; box-sizing: border-box; }
        .mw-order-types { display: flex; gap: 8px; }
        .mw-type-btn { flex: 1; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-tertiary); color: var(--text-secondary); font-weight: 500; cursor: pointer; }
        .mw-type-btn.active { background: #238636; border-color: #238636; color: #fff; }
        .mw-form-row { display: flex; gap: 12px; }
        .mw-form-row .mw-form-group { flex: 1; }
        .mw-lot-info { text-align: center; color: var(--text-secondary); font-size: 13px; margin-bottom: 20px; }
        .mw-action-btns { display: flex; gap: 12px; }
        .mw-buy-btn, .mw-sell-btn { flex: 1; padding: 14px; border: none; border-radius: 6px; font-weight: 600; font-size: 16px; cursor: pointer; color: #fff; }
        .mw-buy-btn { background: #238636; }
        .mw-buy-btn:hover { background: #2ea043; }
        .mw-sell-btn { background: #ef4444; }
        .mw-sell-btn:hover { background: #dc2626; }
        .mw-buy-btn:disabled, .mw-sell-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .mw-modal-footer { display: flex; justify-content: space-between; padding: 12px 20px; border-top: 1px solid var(--border-color); font-size: 14px; }
        .mw-footer-bid { color: #22c55e; }
        
        /* Multi-select user styles */
        .mw-multi-select { background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; }
        .mw-selected-users { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px; min-height: 42px; border-bottom: 1px solid var(--border-color); }
        .mw-placeholder { color: var(--text-secondary); font-size: 13px; }
        .mw-user-tag { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: #238636; color: #fff; border-radius: 4px; font-size: 12px; }
        .mw-user-tag button { background: none; border: none; color: #fff; cursor: pointer; font-size: 14px; padding: 0 2px; opacity: 0.8; }
        .mw-user-tag button:hover { opacity: 1; }
        .mw-user-list { max-height: 150px; overflow-y: auto; padding: 8px; }
        .mw-select-all { display: flex; gap: 8px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color); }
        .mw-select-all-btn, .mw-clear-btn { flex: 1; padding: 6px 12px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; }
        .mw-select-all-btn { background: #3b82f6; color: #fff; }
        .mw-clear-btn { background: var(--bg-primary); color: var(--text-secondary); border: 1px solid var(--border-color); }
        .mw-user-checkbox { display: flex; align-items: center; gap: 8px; padding: 6px 4px; cursor: pointer; font-size: 13px; color: var(--text-primary); border-radius: 4px; }
        .mw-user-checkbox:hover { background: var(--bg-hover); }
        .mw-user-checkbox input { width: 16px; height: 16px; accent-color: #238636; cursor: pointer; }
      `}</style>
    </div>
  );
}

export default MarketWatch;
