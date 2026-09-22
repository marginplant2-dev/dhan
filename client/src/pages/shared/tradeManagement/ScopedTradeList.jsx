import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { io } from 'socket.io-client';
import scopedApi from '../scoped/scopedApi';
import useLivePrices from '../scoped/useLivePrices';

/**
 * Match admin's `isIndianInstrument` — these are quoted in INR and use
 * quantity-based P/L (no contract-size multiplier).
 */
function isIndianInstrument(symbol) {
  if (!symbol) return false;
  const s = String(symbol).toUpperCase();
  return (
    s.includes('NIFTY') || s.includes('BANKNIFTY') || s.includes('SENSEX') ||
    s.includes('FINNIFTY') || s.includes('MIDCPNIFTY') ||
    s.endsWith('FUT') || s.endsWith('CE') || s.endsWith('PE') ||
    s.endsWith('-EQ') || /^[A-Z0-9]+(23|24|25|26)[A-Z]{3}\d+(CE|PE)$/.test(s)
  );
}

/**
 * Infer contract size from the symbol — mirrors admin's calculateLivePnL
 * (TradeManagement.jsx:326-333).
 *
 * IMPORTANT: The stored `Position.contractSize` defaults to 100000 for every
 * position regardless of instrument, so it's unreliable for non-forex symbols
 * (BTCUSD would compute P/L 100000× too large). Always infer fresh.
 */
function inferContractSize(symbol) {
  const s = String(symbol || '').toUpperCase();
  if (!s) return 1;
  if (s.includes('XAU') || s === 'XPTUSD') return 100;
  if (s.includes('XAG')) return 5000;
  if (s.includes('BTC') || s.includes('ETH')) return 1;
  if (s.includes('ADA')) return 1000;
  if (s === 'US100' || s === 'US30' || s === 'US2000' || s === 'US500') return 1;
  if (s === 'BRENT' || s.includes('OIL')) return 1000;
  // Default: forex standard lot
  return 100000;
}

/**
 * Scoped trade list — admin-style trade table scoped to the signed-in admin's
 * users. Supports four variants: `composed` | `open` | `pending` | `history`.
 *
 * Features (match admin TradeManagement.jsx):
 *   - Live Current price + P/L via Socket.IO (prices_batch / price_tick /
 *     zerodha-tick), same streams admin subscribes to
 *   - Push-driven list refresh — subscribes to server trade events
 *     (positionUpdate / pendingOrderUpdate / pendingOrderExecuted /
 *     positionClosedBySLTP / legClosedBySLTP / expirySettlement / binaryResult
 *     / ledgerLiquidation / stopOut) and silently refetches on any of them.
 *     No 5s polling.
 *   - Row actions: Edit / Close / Cancel / Delete, gated by permission
 *   - Edit modal: entry price, volume, close price, P/L (for closed)
 *   - All mutations go through the existing admin /api/admin/trades/:id/*
 *     endpoints — they have a scope guard that 403s out-of-scope targets
 */
const HEADS = {
  composed: ['Symbol', 'Total', 'Users', 'Buy Lots', 'Sell Lots', 'Net', 'Avg Buy', 'Avg Sell', 'Hedging (B/S)', 'Netting (B/S)', 'P/L'],
  open:     ['User', 'Symbol', 'Mode', 'Side', 'Volume', 'Entry', 'Current', 'P/L', 'Opened', 'Hold', 'Status', 'Actions'],
  pending:  ['User', 'Symbol', 'Side', 'Volume', 'Target', 'Current', 'Created', 'Actions'],
  history:  ['User', 'Symbol', 'Mode', 'Side', 'Volume', 'Entry', 'Exit', 'P/L', 'Swap', 'Closed', 'Hold', 'Closed By', 'Actions'],
};

/** Format a Date (or ISO string) as "Apr 20, 14:32" — matches admin's style. */
function formatDateShort(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

/** Duration between two dates — "2d 3h" / "4h 12m" / "45m". Matches admin. */
function formatDuration(start, end) {
  if (!start) return '—';
  const a = new Date(start); const b = end ? new Date(end) : new Date();
  const ms = b - a;
  if (Number.isNaN(ms) || ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

const VARIANT_LABEL = {
  composed: 'Combined Positions',
  open: 'Open Positions',
  pending: 'Pending Orders',
  history: 'Activity History',
};

function hasPerm(user, key) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return !!user.permissions?.[key];
}

export default function ScopedTradeList({ variant = 'open' }) {
  const ctx = useOutletContext();
  const API_URL = ctx?.API_URL;
  const authUser = ctx?.adminAuth?.user;

  const formatAdminCurrency = ctx?.formatAdminCurrency
    || ((v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  const formatPnL = (pnl) => {
    const n = Number(pnl || 0);
    return `${n < 0 ? '-' : ''}${formatAdminCurrency(Math.abs(n))}`;
  };

  const formatInstrumentCurrency = (value) => {
    const n = Number(value || 0);
    return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [summary, setSummary] = useState(null);
  const [historySummary, setHistorySummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({ search: '', symbol: '', mode: 'all', dateFrom: '', dateTo: '' });
  const [busyId, setBusyId] = useState(null);
  const [editModal, setEditModal] = useState({ open: false, trade: null });
  const [editForm, setEditForm] = useState({ entryPrice: '', closePrice: '', volume: '', calculatedPnL: 0 });

  // Netting-legs modal state (ported from admin TradeManagement.jsx:96-99)
  const [showLegsModal, setShowLegsModal] = useState(false);
  const [legsPosition, setLegsPosition] = useState(null);
  const [legsData, setLegsData] = useState([]);
  const [legsLoading, setLegsLoading] = useState(false);

  const canEdit   = hasPerm(authUser, 'trades.modify');
  const canClose  = hasPerm(authUser, 'trades.close');
  const canDelete = hasPerm(authUser, 'trades.modify');

  const livePrices = useLivePrices(API_URL);
  const pageRef = useRef(1);

  // Number of symbols the price socket has reported so far — drives the
  // live-connection indicator pill. `livePrices` updates on every tick, so
  // this value reflects real stream health.
  const liveSymbolCount = Object.keys(livePrices || {}).length;
  const priceStatus = (livePrices && livePrices.__status) || { connected: false, lastTickAt: 0 };
  // 3 possible states: disconnected / connected-but-idle / live.
  const streamState = !priceStatus.connected
    ? 'disconnected'
    : liveSymbolCount > 0
      ? 'live'
      : 'idle';
  const streamDot = streamState === 'live' ? '#10b981'
                  : streamState === 'idle' ? '#f59e0b'
                  : '#ef4444';
  const streamLabel = streamState === 'live'
    ? `Live · ${liveSymbolCount} symbol${liveSymbolCount === 1 ? '' : 's'} streaming`
    : streamState === 'idle'
      ? 'Socket connected · waiting for price feed (MetaAPI/Zerodha)'
      : 'Socket disconnected · reconnecting…';

  const fetchRows = useCallback(async (page = 1) => {
    pageRef.current = page;
    setLoading(true); setError(null);
    try {
      if (variant === 'composed') {
        const r = await scopedApi.listComposedTrades(API_URL, { mode: filter.mode });
        setRows(r.composed || []); setSummary(r.totals || null);
        setPagination({ total: r.composed?.length || 0, page: 1, limit: 0, totalPages: 1 });
      } else if (variant === 'open') {
        const r = await scopedApi.listOpenTrades(API_URL, { search: filter.search, symbol: filter.symbol, mode: filter.mode });
        setRows(r.positions || []); setSummary(r.summary || null);
        setPagination({ total: r.positions?.length || 0, page: 1, limit: 0, totalPages: 1 });
      } else if (variant === 'pending') {
        const r = await scopedApi.listPendingTrades(API_URL, { search: filter.search, symbol: filter.symbol });
        setRows(r.orders || []); setSummary(null);
        setPagination({ total: r.total || 0, page: 1, limit: 0, totalPages: 1 });
      } else if (variant === 'history') {
        const r = await scopedApi.listTradeHistory(API_URL, {
          search: filter.search, symbol: filter.symbol, mode: filter.mode,
          dateFrom: filter.dateFrom, dateTo: filter.dateTo, page, limit: 50,
        });
        setRows(r.trades || []); setSummary(null);
        setHistorySummary(r.summary || null);
        setPagination(r.pagination || { total: 0, page: 1, limit: 50, totalPages: 0 });
      }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [API_URL, variant, filter]);

  useEffect(() => { fetchRows(1); }, [fetchRows]);

  // Push-driven live updates (no more 5s polling). Subscribes to the same
  // trade event channels the server already broadcasts. Price ticks keep the
  // Current + P/L columns live via `useLivePrices`; these events only fire
  // when the underlying row set actually changes (new trade, close, execute,
  // SL/TP hit) so we don't hammer the API.
  useEffect(() => {
    if (!API_URL || variant === 'history') return undefined;
    const sock = io(API_URL, { transports: ['websocket', 'polling'], reconnection: true });

    // Debounced silent refresh — coalesces bursts (e.g. stop-out closing many
    // positions at once) into a single fetch ~200ms after the last event.
    let timer = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fetchRows(pageRef.current || 1), 200);
    };

    const tradeEvents = [
      'positionUpdate',         // position open / close / modify
      'pendingOrderUpdate',     // pending cancelled
      'pendingOrderExecuted',   // pending filled -> became open
      'positionClosedBySLTP',   // parent SL/TP fired
      'legClosedBySLTP',        // per-leg SL/TP fired
      'expirySettlement',       // option/futures expiry auto-close
      'binaryResult',           // binary trade settled
      'ledgerLiquidation',      // ledger-balance-based liquidation
      'stopOut',                // margin stop-out
    ];
    tradeEvents.forEach(evt => sock.on(evt, refresh));

    return () => {
      if (timer) clearTimeout(timer);
      tradeEvents.forEach(evt => sock.off(evt, refresh));
      sock.disconnect();
    };
  }, [API_URL, variant, fetchRows]);

  // Compute live floating P/L for an open-position row — EXACT mirror of
  // admin's calculateLivePnL (TradeManagement.jsx:307-340). Key rules:
  //   1. ALWAYS infer contractSize from symbol (stored value is unreliable)
  //   2. Indian instruments: pnl = priceDiff × quantity (no contractSize)
  //   3. Forex/Crypto/Indices: pnl = priceDiff × volume × contractSize
  //   4. JPY quote pairs get the /100 denomination adjustment
  //   5. No swap/commission — those are realized fees, applied on close
  const computeLive = (r) => {
    const live = livePrices[r.symbol];
    const storedPnl = Number(r.profit ?? r.pnl ?? r.unrealizedPnL) || 0;
    if (!live) return { current: r.currentPrice, pnl: storedPnl };

    const currentPrice = r.side === 'buy' ? (live.bid || live.price) : (live.ask || live.price);
    const entryPrice = Number(r.entryPrice ?? r.openPrice ?? r.avgPrice) || 0;
    if (!currentPrice || !entryPrice) return { current: currentPrice, pnl: storedPnl };

    const volume = Number(r.volume ?? r.lotSize) || 0.01;
    const priceDiff = r.side === 'buy' ? (currentPrice - entryPrice) : (entryPrice - currentPrice);

    // Indian instruments: quantity-based (already denominated in INR)
    if (isIndianInstrument(r.symbol)) {
      const quantity = Number(r.quantity) || (volume * (Number(r.lotSize) || 1)) || volume;
      return { current: currentPrice, pnl: priceDiff * quantity };
    }

    // Forex / Crypto / Indices / Commodities
    const contractSize = inferContractSize(r.symbol);
    let pnl = priceDiff * volume * contractSize;

    // JPY cross-pair adjustment (pnl is in quote-ccy, needs /current to get USD)
    const sym = String(r.symbol || '').toUpperCase();
    if (sym.includes('JPY') && !sym.startsWith('JPY') && currentPrice > 0) {
      pnl = (priceDiff * 100000 * volume) / 100;
    }

    return { current: currentPrice, pnl };
  };

  /**
   * Compute a P/L estimate from entry/close/volume/side using the same
   * contract-size table admin uses (TradeManagement.jsx:505-536). Returns a
   * number; does not mutate state.
   */
  const computePnL = ({ entryPrice, closePrice, volume, side, symbol }) => {
    const ep = parseFloat(entryPrice) || 0;
    const cp = parseFloat(closePrice) || 0;
    const vol = parseFloat(volume) || 0.01;
    const sym = (symbol || '').toUpperCase();

    let contractSize = 100000; // Default forex
    if (sym.includes('XAU')) contractSize = 100;
    else if (sym.includes('XAG')) contractSize = 5000;
    else if (sym.includes('BTC')) contractSize = 1;
    else if (sym.includes('ETH')) contractSize = 1;
    else if (sym.includes('JPY')) contractSize = 100000;

    let pnl = side === 'buy'
      ? (cp - ep) * vol * contractSize
      : (ep - cp) * vol * contractSize;

    // JPY-quote pairs (e.g. USDJPY): normalize by close price
    if (sym.includes('JPY') && !sym.startsWith('JPY') && cp > 0) pnl = pnl / cp;
    return pnl;
  };

  const openEditModal = (trade) => {
    // Seed initial P/L from stored value, falling back to a live computation
    // (matches admin's TradeManagement.jsx openEditModal:466-502).
    let initialPnL = Number(trade.profit ?? trade.pnl ?? trade.unrealizedPnL) || 0;
    if (initialPnL === 0 && livePrices[trade.symbol]) {
      const live = livePrices[trade.symbol];
      const ep = trade.entryPrice || trade.openPrice || trade.avgPrice || 0;
      const cp = trade.side === 'buy' ? (live.bid || live.price) : (live.ask || live.price);
      initialPnL = computePnL({
        entryPrice: ep, closePrice: cp,
        volume: trade.volume || trade.lotSize || 0.01,
        side: trade.side, symbol: trade.symbol,
      });
    }
    setEditForm({
      entryPrice: String(trade.entryPrice ?? trade.avgPrice ?? trade.openPrice ?? ''),
      closePrice: String(trade.closePrice ?? trade.currentPrice ?? (livePrices[trade.symbol]?.price ?? '')),
      volume: String(trade.volume ?? trade.lotSize ?? 0.01),
      calculatedPnL: initialPnL,
    });
    setEditModal({ open: true, trade });
  };

  /** "📊 Calculate P/L" button — recomputes from current inputs */
  const calculatePnL = () => {
    const t = editModal.trade;
    if (!t) return;
    const pnl = computePnL({
      entryPrice: editForm.entryPrice,
      closePrice: editForm.closePrice,
      volume: editForm.volume,
      side: t.side,
      symbol: t.symbol,
    });
    setEditForm(p => ({ ...p, calculatedPnL: pnl }));
  };

  const submitEdit = async () => {
    if (!editModal.trade) return;
    const t = editModal.trade;
    setBusyId(t._id); setError(null);
    try {
      const payload = {
        mode: t.mode || 'hedging',
        userId: t.userId,
      };
      if (editForm.entryPrice !== '') payload.entryPrice = Number(editForm.entryPrice);
      if (editForm.closePrice !== '') payload.closePrice = Number(editForm.closePrice);
      if (editForm.volume !== '') payload.volume = Number(editForm.volume);
      payload.pnl = Number(editForm.calculatedPnL) || 0;
      const res = await fetch(`${API_URL}/api/admin/trades/${t._id}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) throw new Error(data?.error || `HTTP ${res.status}`);
      setEditModal({ open: false, trade: null });
      await fetchRows(pagination.page || 1);
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  /**
   * Close the trade from inside the edit modal using the computed P/L.
   * Syncs to user wallet server-side. Mirrors admin closeTradeFromModal
   * (TradeManagement.jsx:580-615).
   */
  const closeTradeFromModal = async () => {
    const t = editModal.trade;
    if (!t) return;
    if (!confirm(`Close this position with P/L ${Number(editForm.calculatedPnL).toFixed(2)}? This will sync to user wallet.`)) return;
    setBusyId(t._id); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/trades/${t._id}/close-with-pnl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryPrice: parseFloat(editForm.entryPrice),
          closePrice: parseFloat(editForm.closePrice),
          volume:     parseFloat(editForm.volume),
          pnl:        Number(editForm.calculatedPnL) || 0,
          mode:       t.mode || 'hedging',
          userId:     t.userId,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) throw new Error(data?.error || `HTTP ${res.status}`);
      setEditModal({ open: false, trade: null });
      await fetchRows(pagination.page || 1);
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  /**
   * Reopen a closed trade; server reverses the previously-synced P/L from
   * the user wallet. Mirrors admin reopenTrade (TradeManagement.jsx:406-438).
   */
  const reopenTrade = async () => {
    const t = editModal.trade;
    if (!t) return;
    if (!confirm('Reopen this position? The P/L will be reversed from the user wallet.')) return;
    setBusyId(t._id); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/trades/${t._id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode:   t.mode || 'hedging',
          userId: t.userId,
          pnl:    Number(t.pnl ?? t.profit) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) throw new Error(data?.error || `HTTP ${res.status}`);
      setEditModal({ open: false, trade: null });
      await fetchRows(pagination.page || 1);
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  /**
   * Fetch individual entry/partial-close legs for a netting position and
   * open the Netting Entries modal. Ported from admin's TradeManagement.jsx
   * fetchNettingLegs (lines 645-673) — uses the same public /api/trades/legs
   * endpoint so sub-admin / broker see identical leg breakdowns to admin.
   */
  const fetchNettingLegs = async (trade) => {
    if (trade.mode !== 'netting') return;
    const orderId = trade.oderId || trade.orderId;
    const userId = trade.userId;
    if (!orderId || !userId) return;

    const { current, pnl } = computeLive(trade);
    const isClosed = trade.status === 'closed' || !!trade.closePrice || trade.type === 'close';
    setLegsPosition({
      ...trade,
      entryPrice: trade.entryPrice || trade.avgPrice || trade.openPrice || 0,
      currentPrice: current || trade.closePrice || trade.exitPrice || trade.entryPrice || 0,
      profit: isClosed ? (trade.pnl || trade.profit || 0) : pnl,
      isClosed,
    });
    setShowLegsModal(true);
    setLegsLoading(true);
    setLegsData([]);

    try {
      const token =
        sessionStorage.getItem('dhanfunded-impersonate-token') ||
        localStorage.getItem('dhanfunded-admin-token') ||
        '';
      const res = await fetch(`${API_URL}/api/trades/legs/${userId}/${orderId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setLegsData(data.legs || []);
    } catch (err) {
      console.error('[ScopedTradeList] fetchNettingLegs error:', err);
    } finally {
      setLegsLoading(false);
    }
  };

  const forceClose = async (trade) => {
    if (!confirm(`Force-close ${trade.symbol} for ${trade.userId}?`)) return;
    setBusyId(trade._id); setError(null);
    try {
      const positionType = trade.positionType || (trade.mode === 'hedging' ? 'HedgingPosition'
                          : trade.mode === 'netting' ? 'NettingPosition'
                          : 'HedgingPosition');
      const live = livePrices[trade.symbol];
      const currentPrice = live ? (trade.side === 'buy' ? (live.bid || live.price) : (live.ask || live.price)) : trade.currentPrice;
      const res = await fetch(`${API_URL}/api/admin/trades/${trade._id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionType, currentPrice }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) throw new Error(data?.error || `HTTP ${res.status}`);
      await fetchRows(pagination.page || 1);
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  const cancelPending = async (trade) => {
    if (!confirm(`Cancel pending order ${trade.symbol} for ${trade.userId}?`)) return;
    setBusyId(trade._id); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/trades/${trade._id}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) throw new Error(data?.error || `HTTP ${res.status}`);
      await fetchRows(pagination.page || 1);
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  const deleteTrade = async (trade) => {
    if (!confirm(`Permanently delete this position? This cannot be undone.`)) return;
    setBusyId(trade._id); setError(null);
    try {
      const tradeType = variant === 'pending' ? 'pending' : variant === 'history' ? 'history' : 'open';
      const res = await fetch(`${API_URL}/api/admin/trades/${trade._id}/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeType }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) throw new Error(data?.error || `HTTP ${res.status}`);
      await fetchRows(pagination.page || 1);
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  const heads = HEADS[variant];

  const renderActions = (r) => {
    if (variant === 'composed') return null;
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', whiteSpace: 'nowrap', alignItems: 'center' }}
           onClick={(e) => e.stopPropagation()}>
        {canEdit && variant !== 'pending' && (
          <button onClick={() => openEditModal(r)} disabled={busyId === r._id} style={styles.btnEdit}>
            ✏️ Edit
          </button>
        )}
        {canClose && variant === 'open' && (
          <button onClick={() => forceClose(r)} disabled={busyId === r._id} style={styles.btnReject}>
            × Close
          </button>
        )}
        {canClose && variant === 'pending' && (
          <button onClick={() => cancelPending(r)} disabled={busyId === r._id} style={styles.btnReject}>
            × Cancel
          </button>
        )}
        {canDelete && (
          <button onClick={() => deleteTrade(r)} disabled={busyId === r._id} style={styles.btnIcon} title="Delete permanently">
            🗑
          </button>
        )}
      </div>
    );
  };

  const renderRow = (r) => {
    if (variant === 'composed') {
      const net = r.netLots || 0;
      const pnl = Number(r.totalPnL || 0);
      const h = r.byMode?.hedging || {};
      const n = r.byMode?.netting || {};
      return (
        <tr key={r.symbol} style={{ borderBottom: '1px solid var(--border-color)' }}>
          <td style={styles.td}><strong>{r.symbol}</strong></td>
          <td style={styles.td}>{r.totalCount}</td>
          <td style={styles.td}>{r.uniqueUsers}</td>
          <td style={{ ...styles.td, color: '#10b981' }}>{(r.totalBuyLots || 0).toFixed(2)}</td>
          <td style={{ ...styles.td, color: '#ef4444' }}>{(r.totalSellLots || 0).toFixed(2)}</td>
          <td style={{ ...styles.td, color: net >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
            {net >= 0 ? '+' : ''}{net.toFixed(2)}
          </td>
          <td style={styles.td}>{(r.avgBuyPrice || 0).toFixed(4)}</td>
          <td style={styles.td}>{(r.avgSellPrice || 0).toFixed(4)}</td>
          <td style={styles.td}>
            <span style={{ color: '#10b981' }}>{(h.buyLots || 0).toFixed(2)}</span>
            {' / '}
            <span style={{ color: '#ef4444' }}>{(h.sellLots || 0).toFixed(2)}</span>
          </td>
          <td style={styles.td}>
            <span style={{ color: '#10b981' }}>{(n.buyLots || 0).toFixed(2)}</span>
            {' / '}
            <span style={{ color: '#ef4444' }}>{(n.sellLots || 0).toFixed(2)}</span>
          </td>
          <td style={{ ...styles.td, color: pnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
            {pnl >= 0 ? '+' : ''}{formatPnL(pnl, r.symbol)}
          </td>
        </tr>
      );
    }

    if (variant === 'open') {
      const side = r.side || r.direction || '—';
      const { current, pnl } = computeLive(r);
      const isLive = !!livePrices[r.symbol];
      const openTime = r.openTime || r.createdAt;
      const isNetting = r.mode === 'netting';
      return (
        <tr key={r._id}
            style={{ borderBottom: '1px solid var(--border-color)', cursor: isNetting ? 'pointer' : 'default' }}
            onClick={isNetting ? () => fetchNettingLegs(r) : undefined}
            title={isNetting ? 'Click to view netting entries' : undefined}>
          <td style={styles.td}>
            <div style={{ fontWeight: 600 }}>{r.userName || r.userId}</div>
            {r.userName && <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{r.userId}</div>}
          </td>
          <td style={styles.td}><strong>{r.symbol}</strong></td>
          <td style={styles.td}><span style={styles.chip}>{r.mode}</span></td>
          <td style={styles.td}>
            <span style={{ ...styles.sideChip, background: side === 'buy' || side === 'long' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: side === 'buy' || side === 'long' ? '#10b981' : '#ef4444' }}>
              {String(side).toUpperCase()}
            </span>
          </td>
          <td style={styles.td}>{r.volume ?? r.lots ?? '—'}</td>
          <td style={styles.td}>{Number.isFinite(Number(r.entryPrice ?? r.avgPrice)) ? Number(r.entryPrice ?? r.avgPrice).toFixed(4) : '—'}</td>
          <td style={{ ...styles.td, color: isLive ? '#3b82f6' : 'inherit', fontWeight: isLive ? 600 : 400 }}>
            {Number.isFinite(Number(current)) ? Number(current).toFixed(4) : '—'}
            {isLive && <span style={{ marginLeft: 4, color: '#10b981' }}>●</span>}
          </td>
          <td style={{ ...styles.td, color: pnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
            {pnl >= 0 ? '+' : ''}{formatPnL(pnl || 0, r.symbol)}
          </td>
          <td style={{ ...styles.td, fontSize: 11 }}>{formatDateShort(openTime)}</td>
          <td style={{ ...styles.td, fontSize: 11 }}>{formatDuration(openTime)}</td>
          <td style={styles.td}>
            <span style={{ ...styles.statusChip, background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
              OPEN
            </span>
          </td>
          <td style={styles.td}>{renderActions(r)}</td>
        </tr>
      );
    }

    if (variant === 'pending') {
      const live = livePrices[r.symbol];
      const currentPrice = live ? (r.side === 'buy' ? (live.bid || live.price) : (live.ask || live.price)) : r.currentPrice;
      return (
        <tr key={r._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
          <td style={styles.td}>
            <div style={{ fontWeight: 600 }}>{r.userName || r.userId}</div>
            {r.userName && <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{r.userId}</div>}
          </td>
          <td style={styles.td}><strong>{r.symbol}</strong></td>
          <td style={styles.td}>
            <span style={{ ...styles.sideChip, background: r.side === 'buy' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: r.side === 'buy' ? '#10b981' : '#ef4444' }}>
              {String(r.side || '').toUpperCase()}
            </span>
          </td>
          <td style={styles.td}>{r.volume ?? '—'}</td>
          <td style={styles.td}>{r.targetPrice ?? r.limitPrice ?? r.entryPrice ?? '—'}</td>
          <td style={{ ...styles.td, color: live ? '#3b82f6' : 'inherit' }}>
            {Number.isFinite(Number(currentPrice)) ? Number(currentPrice).toFixed(4) : '—'}
            {live && <span style={{ marginLeft: 4, color: '#10b981' }}>●</span>}
          </td>
          <td style={styles.td}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td>
          <td style={styles.td}>{renderActions(r)}</td>
        </tr>
      );
    }

    // history
    const pnl = Number(r.profit ?? r.pnl) || 0;
    const swap = Number(r.swap) || 0;
    const executed = r.executedAt || r.closeTime || r.closedAt;
    const opened = r.openTime || r.createdAt;
    const closedBy = r.closedBy || r.closeReason || 'user';
    const closedByLabel = /admin/i.test(closedBy) ? 'Admin'
                       : /system|expiry|sl|tp|liquidation|stop/i.test(closedBy) ? 'System'
                       : 'User';
    const isNetting = r.mode === 'netting';
    return (
      <tr key={r._id}
          style={{ borderBottom: '1px solid var(--border-color)', cursor: isNetting ? 'pointer' : 'default' }}
          onClick={isNetting ? () => fetchNettingLegs(r) : undefined}
          title={isNetting ? 'Click to view netting entries' : undefined}>
        <td style={styles.td}>
          <div style={{ fontWeight: 600 }}>{r.userName || r.userId}</div>
          {r.userName && <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{r.userId}</div>}
        </td>
        <td style={styles.td}><strong>{r.symbol}</strong></td>
        <td style={styles.td}><span style={styles.chip}>{r.mode || '—'}</span></td>
        <td style={styles.td}>
          <span style={{ ...styles.sideChip, background: r.side === 'buy' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: r.side === 'buy' ? '#10b981' : '#ef4444' }}>
            {String(r.side || '').toUpperCase()}
          </span>
        </td>
        <td style={styles.td}>{r.volume ?? '—'}</td>
        <td style={styles.td}>{Number.isFinite(Number(r.entryPrice)) ? Number(r.entryPrice).toFixed(4) : '—'}</td>
        <td style={styles.td}>{Number.isFinite(Number(r.exitPrice ?? r.closePrice)) ? Number(r.exitPrice ?? r.closePrice).toFixed(4) : '—'}</td>
        <td style={{ ...styles.td, color: pnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
          {pnl >= 0 ? '+' : ''}{formatPnL(pnl, r.symbol)}
        </td>
        <td style={{ ...styles.td, color: swap === 0 ? 'var(--text-secondary)' : (swap > 0 ? '#10b981' : '#ef4444') }}>
          {formatPnL(swap, r.symbol)}
        </td>
        <td style={{ ...styles.td, fontSize: 11 }}>{formatDateShort(executed)}</td>
        <td style={{ ...styles.td, fontSize: 11 }}>{formatDuration(opened, executed)}</td>
        <td style={styles.td}>
          <span style={{
            ...styles.statusChip,
            background: closedByLabel === 'Admin' ? 'rgba(251,191,36,0.15)'
                     : closedByLabel === 'System' ? 'rgba(239,68,68,0.15)'
                     : 'rgba(59,130,246,0.15)',
            color:     closedByLabel === 'Admin' ? '#f59e0b'
                     : closedByLabel === 'System' ? '#ef4444'
                     : '#3b82f6',
          }}>{closedByLabel}</span>
        </td>
        <td style={styles.td}>{renderActions(r)}</td>
      </tr>
    );
  };

  // Summary live-P/L using the live prices we already fetch.
  // Sum live floating P/L across all rows, normalized to USD base so that
  // Indian-instrument P/L (which is in INR) does not dwarf forex/crypto P/L
  // (which is already in USD). Mirrors admin's tradeListSummary.sumUsd
  // pattern in /client/src/pages/Admin/pages/TradeManagement.jsx:707-716.
  const liveUnrealized = useMemo(() => {
    if (variant !== 'open') return null;
    let totalUsd = 0;
    for (const r of rows) {
      const { pnl } = computeLive(r);
      if (!Number.isFinite(pnl)) continue;
      totalUsd += isIndianInstrument(r.symbol) ? pnl / fxRate : pnl;
    }
    return totalUsd;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, livePrices, variant, fxRate]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>{VARIANT_LABEL[variant]}</h2>
          {/* Live connection indicator — three states:
             live (green), idle/feed-down (amber), disconnected (red) */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'var(--text-secondary)',
            padding: '4px 10px', borderRadius: 999,
            background: `${streamDot}1f`,
            border: `1px solid ${streamDot}59`,
          }} title={streamLabel}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: streamDot,
              boxShadow: streamState === 'live' ? `0 0 6px ${streamDot}` : 'none',
              animation: streamState === 'live' ? 'pulse 1.2s ease-in-out infinite' : 'none',
            }} />
            {streamLabel}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Trades filtered to users in your scope. Prices &amp; P/L update live via websocket · list auto-refreshes on trade events.
        </div>
      </div>

      {/* ── Big admin-style summary bar (open variant) ───────────────────────
         - Open positions count
         - Hedging / Netting split
         - Total volume (lots/qty)
         - Total Unrealized P/L — LIVE, re-renders on every price tick
         */}
      {summary && variant === 'open' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
          <BigCard label="Open Positions" value={summary.total} />
          <BigCard label="Hedging / Netting" value={`${summary.hedging} / ${summary.netting}`} subtitle="positions" />
          <BigCard label="Total Volume" value={(summary.totalVolume ?? rows.reduce((s, r) => s + (Number(r.volume) || 0), 0)).toLocaleString('en-US', { maximumFractionDigits: 4 })} subtitle="lots / qty" />
          <BigCard
            label="Total P/L (live)"
            value={`${liveUnrealized >= 0 ? '+' : ''}${formatPnL(liveUnrealized || 0, '')}`}
            color={liveUnrealized >= 0 ? '#10b981' : '#ef4444'}
            subtitle={
              streamState === 'live' ? 'updates on every tick'
              : streamState === 'idle' ? 'server has no feed yet — showing stored P/L'
              : 'socket disconnected — using last-known P/L'
            }
            pulse={streamState === 'live'}
          />
        </div>
      )}

      {/* History summary bar — totals across the filtered page */}
      {variant === 'history' && historySummary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
          <BigCard label="Total Positions" value={historySummary.totalTrades ?? rows.length} />
          <BigCard label="Winning" value={historySummary.winningTrades ?? 0} color="#10b981" />
          <BigCard label="Losing" value={historySummary.losingTrades ?? 0} color="#ef4444" />
          <BigCard
            label="Total P/L"
            value={`${(historySummary.totalPnL || 0) >= 0 ? '+' : ''}${formatPnL(historySummary.totalPnL || 0, '')}`}
            color={(historySummary.totalPnL || 0) >= 0 ? '#10b981' : '#ef4444'}
            subtitle={`win rate ${(historySummary.winRate || 0).toFixed(1)}%`}
          />
        </div>
      )}
      {summary && variant === 'composed' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
          <Tile label="Symbols" value={summary.totalSymbols} />
          <Tile label="Positions" value={summary.totalPositions} />
          <Tile label="Unique Users" value={summary.totalUniqueUsers} />
          <Tile label="Total Buy Lots" value={(summary.totalBuyLots || 0).toFixed(2)} color="#10b981" />
          <Tile label="Total Sell Lots" value={(summary.totalSellLots || 0).toFixed(2)} color="#ef4444" />
          <Tile label="Total P/L" value={`${summary.totalPnL >= 0 ? '+' : ''}${formatPnL(summary.totalPnL || 0, '')}`} color={summary.totalPnL >= 0 ? '#10b981' : '#ef4444'} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {variant !== 'composed' && (
          <>
            <input type="text" placeholder="User ID…" value={filter.search}
              onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))} style={styles.input} />
            <input type="text" placeholder="Symbol…" value={filter.symbol}
              onChange={(e) => setFilter(f => ({ ...f, symbol: e.target.value }))} style={styles.input} />
          </>
        )}
        {(variant === 'open' || variant === 'history' || variant === 'composed') && (
          <select value={filter.mode} onChange={(e) => setFilter(f => ({ ...f, mode: e.target.value }))} style={styles.input}>
            <option value="all">All modes</option>
            <option value="netting">Netting</option>
            <option value="hedging">Hedging</option>
          </select>
        )}
        {variant === 'history' && (
          <>
            <input type="date" value={filter.dateFrom}
              onChange={(e) => setFilter(f => ({ ...f, dateFrom: e.target.value }))} style={styles.input} />
            <input type="date" value={filter.dateTo}
              onChange={(e) => setFilter(f => ({ ...f, dateTo: e.target.value }))} style={styles.input} />
          </>
        )}
        <button onClick={() => fetchRows(1)} disabled={loading} style={styles.btnPrimary}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.tableWrap}>
        {loading && rows.length === 0 ? (
          <div style={styles.empty}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={styles.empty}>No rows.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{heads.map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>{rows.map(renderRow)}</tbody>
          </table>
        )}
      </div>

      {variant === 'history' && pagination.totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
          <button onClick={() => fetchRows(pagination.page - 1)} disabled={pagination.page === 1 || loading} style={styles.btnPage}>‹</button>
          <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
            Page {pagination.page} / {pagination.totalPages} · {pagination.total} total
          </span>
          <button onClick={() => fetchRows(pagination.page + 1)} disabled={pagination.page === pagination.totalPages || loading} style={styles.btnPage}>›</button>
        </div>
      )}

      {editModal.open && editModal.trade && (() => {
        const t = editModal.trade;
        const isClosed = t.status === 'closed' || variant === 'history' || !!t.closePrice;
        const pnl = Number(editForm.calculatedPnL) || 0;
        const busy = busyId === t._id;
        return (
        <div style={modalStyles.overlay} onClick={() => setEditModal({ open: false, trade: null })}>
          <div style={{ ...modalStyles.panel, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Edit Position</h3>
              <button onClick={() => setEditModal({ open: false, trade: null })}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
            </div>

            {/* Trade Info */}
            <div style={{ padding: 14, background: 'var(--bg-primary)', borderRadius: 10, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Symbol</div>
                  <div style={{ fontWeight: 600 }}>{t.symbol}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Side</div>
                  <div style={{ fontWeight: 600, color: t.side === 'buy' ? '#10b981' : '#ef4444' }}>
                    {String(t.side || '').toUpperCase()}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Volume</div>
                  <div style={{ fontWeight: 600 }}>{t.volume ?? t.lotSize ?? '—'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>User</div>
                  <div style={{ fontWeight: 600 }}>{t.userName || t.userId}</div>
                </div>
              </div>
            </div>

            {/* Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Entry Price" type="number" step="0.00001"
                  value={editForm.entryPrice}
                  onChange={(v) => setEditForm(p => ({ ...p, entryPrice: v }))} />
                <Field label="Volume (Lots)" type="number" step="0.01"
                  value={editForm.volume}
                  onChange={(v) => setEditForm(p => ({ ...p, volume: v }))} />
              </div>
              <Field label="Close Price" type="number" step="0.00001"
                value={editForm.closePrice}
                onChange={(v) => setEditForm(p => ({ ...p, closePrice: v }))} />

              {/* Calculate P/L button */}
              <button onClick={calculatePnL}
                style={{
                  padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff',
                  fontWeight: 600, fontSize: 13,
                }}>
                📊 Calculate P/L
              </button>

              {/* Calculated P/L display */}
              <div style={{
                background: pnl >= 0 ? 'rgba(16, 185, 129, 0.10)' : 'rgba(239, 68, 68, 0.10)',
                padding: 14, borderRadius: 10, textAlign: 'center',
                border: `1px solid ${pnl >= 0 ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Calculated P/L</div>
                <div style={{
                  fontSize: 26, fontWeight: 700,
                  color: pnl >= 0 ? '#10b981' : '#ef4444',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}>
                  {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {isClosed
                    ? "This will be synced to user's wallet"
                    : '⚠️ Trade is open — wallet will NOT be updated until trade is closed'}
                </div>
              </div>

              {/* Manual P/L Override */}
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                  Manual P/L Override (optional)
                </label>
                <input type="number" step="0.01" value={editForm.calculatedPnL}
                  onChange={(e) => setEditForm(p => ({ ...p, calculatedPnL: parseFloat(e.target.value) || 0 }))}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 6,
                    border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                    color: 'var(--text-primary)', fontSize: 13,
                  }} />
              </div>
            </div>

            {/* Footer actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setEditModal({ open: false, trade: null })}
                  style={{ ...styles.btnSecondary, flex: 1 }} disabled={busy}>
                  Cancel
                </button>
                <button onClick={submitEdit} disabled={busy}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                    fontWeight: 600, fontSize: 13,
                  }}>
                  {busy ? 'Saving…' : (isClosed ? '💾 Save & Sync Wallet' : '💾 Save Changes')}
                </button>
              </div>

              {isClosed ? (
                <button onClick={reopenTrade} disabled={busy}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff',
                    fontWeight: 600, fontSize: 13,
                  }}>
                  🔄 Reopen Trade (Reverse P/L from Wallet)
                </button>
              ) : (
                canClose && (
                  <button onClick={closeTradeFromModal} disabled={busy}
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff',
                      fontWeight: 600, fontSize: 13,
                    }}>
                    ❌ Close Trade & Sync P/L to Wallet
                  </button>
                )
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Netting Entries modal — shows every entry / partial_close leg that
          makes up a netting position. Ported from admin TradeManagement.jsx
          lines 1346-1481. */}
      {showLegsModal && legsPosition && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowLegsModal(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--bg-secondary)', borderRadius: 16, width: '95%', maxWidth: 750,
            border: '1px solid var(--border-color)', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                Netting Entries — {legsPosition.symbol}{' '}
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  ({legsPosition.userName || legsPosition.userId})
                </span>
              </h3>
              <button onClick={() => setShowLegsModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
            </div>

            {/* Position Summary */}
            <div style={{ padding: '14px 20px', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Side</span>
                  <div style={{ fontWeight: 'bold', color: legsPosition.side === 'buy' ? '#10b981' : '#ef4444' }}>
                    {String(legsPosition.side || '').toUpperCase()}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Volume</span>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {parseFloat(Number(legsPosition.volume || 0).toFixed(4))}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Avg Entry</span>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {formatInstrumentCurrency(legsPosition.entryPrice, legsPosition.symbol)}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {legsPosition.isClosed ? 'Close Price' : 'Current'}
                  </span>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {formatInstrumentCurrency(legsPosition.currentPrice, legsPosition.symbol)}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total P/L</span>
                  <div style={{ fontWeight: 'bold', color: legsPosition.profit >= 0 ? '#10b981' : '#ef4444' }}>
                    {formatPnL(legsPosition.profit, legsPosition.symbol)}
                  </div>
                </div>
              </div>
            </div>

            {/* Legs Table */}
            <div style={{ overflowX: 'auto', maxHeight: 400 }}>
              {legsLoading ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading entries…</div>
              ) : legsData.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No individual entry legs found (single entry position)
                </div>
              ) : (
                <table style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['#', 'Type', 'Side', 'Time', 'Volume', 'Price', 'P/L'].map(h => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {legsData.map((leg, idx) => {
                      const isPartialClose = leg.type === 'partial_close';
                      const isCloseLeg = leg.type === 'close';
                      const legSide = isPartialClose || isCloseLeg
                        ? (leg.side || (legsPosition.side === 'buy' ? 'sell' : 'buy'))
                        : (leg.side || legsPosition.side);
                      const ep = isPartialClose || isCloseLeg
                        ? (leg.closePrice || leg.entryPrice || 0)
                        : (leg.entryPrice || 0);
                      const vol = parseFloat(Number(leg.volume || 0).toFixed(4));

                      // For partial/close legs: use stored realized P/L.
                      // For open legs: recompute live P/L from position's live current price.
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
                        <tr key={leg._id || idx} style={(isPartialClose || isCloseLeg) ? { opacity: 0.85, borderBottom: '1px solid var(--border-color)' } : { borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{idx + 1}</td>
                          <td style={{ ...styles.td, fontSize: 11, color: isCloseLeg ? '#ef4444' : isPartialClose ? '#f59e0b' : '#10b981' }}>
                            {isCloseLeg ? 'Close' : isPartialClose ? 'Partial' : 'Entry'}
                          </td>
                          <td style={{ ...styles.td, fontWeight: 'bold', color: legSide === 'buy' ? '#10b981' : '#ef4444' }}>
                            {String(legSide).toUpperCase()}
                          </td>
                          <td style={{ ...styles.td, fontSize: 11 }}>
                            {new Date(leg.executedAt || leg.closedAt || leg.createdAt).toLocaleString('en-IN', {
                              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                            })}
                          </td>
                          <td style={styles.td}>{vol}</td>
                          <td style={styles.td}>{formatInstrumentCurrency(ep, leg.symbol)}</td>
                          <td style={{ ...styles.td, fontWeight: 'bold', color: pnl >= 0 ? '#10b981' : '#ef4444' }}>
                            {formatPnL(pnl, leg.symbol)}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals Row */}
                    <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 'bold' }}>
                      <td colSpan="4" style={{ ...styles.td, textAlign: 'right', color: 'var(--text-secondary)' }}>Open Volume</td>
                      <td style={styles.td}>{parseFloat(Number(legsPosition.volume || 0).toFixed(4))}</td>
                      <td style={{ ...styles.td, color: '#f59e0b' }}>
                        Avg: {formatInstrumentCurrency(legsPosition.entryPrice, legsPosition.symbol)}
                      </td>
                      <td style={{ ...styles.td, color: legsPosition.profit >= 0 ? '#10b981' : '#ef4444' }}>
                        {formatPnL(legsPosition.profit, legsPosition.symbol)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Avg Price Calculation (when 2+ open legs) */}
            {legsData.filter(l => l.type === 'open').length > 1 && (
              <div style={{ padding: '12px 20px', background: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-secondary)' }}>
                <strong style={{ color: '#f59e0b' }}>Avg Price Calculation:</strong>{' '}
                ({legsData.filter(l => l.type === 'open').map(l => `${parseFloat(Number(l.volume || 0).toFixed(4))}×${formatInstrumentCurrency(l.entryPrice, l.symbol)}`).join(' + ')})
                {' ÷ '}
                {parseFloat(legsData.filter(l => l.type === 'open').reduce((s, l) => s + (l.volume || 0), 0).toFixed(4))}
                {' = '}
                {formatInstrumentCurrency(legsPosition.entryPrice, legsPosition.symbol)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, color }) {
  return (
    <div style={{ padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text-primary)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

/** Admin-style large summary card. Optional pulse ring when a live stream
 *  is feeding the underlying value (used for "Total P/L (live)").
 */
function BigCard({ label, value, subtitle, color, pulse }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: `1px solid ${pulse ? 'rgba(16,185,129,0.35)' : 'var(--border-color)'}`,
      borderRadius: 12,
      padding: '16px 18px',
      position: 'relative',
      boxShadow: pulse ? '0 0 0 1px rgba(16,185,129,0.12), 0 0 12px rgba(16,185,129,0.15)' : 'none',
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, color: color || 'var(--text-primary)' }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, opacity: 0.85 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

// Inject the pulse keyframes once — small utility for the live dot.
if (typeof document !== 'undefined' && !document.getElementById('scoped-trade-list-keyframes')) {
  const style = document.createElement('style');
  style.id = 'scoped-trade-list-keyframes';
  style.textContent = `
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.4); opacity: 0.6; }
    }
  `;
  document.head.appendChild(style);
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>
      <input type="number" step="0.00001" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 }} />
    </div>
  );
}

const styles = {
  input: { padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 },
  btnPrimary: { padding: '8px 14px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  btnSecondary: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 },
  btnEdit: { padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: '1px solid #3b82f6', background: 'rgba(59,130,246,0.12)', color: '#3b82f6', cursor: 'pointer' },
  btnReject: { padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer' },
  btnIcon: { padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' },
  btnPage: { padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' },
  errorBox: { padding: 10, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', marginBottom: 12, fontSize: 13 },
  tableWrap: { border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'auto', background: 'var(--bg-secondary)' },
  th: { textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' },
  td: { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle', whiteSpace: 'nowrap' },
  empty: { padding: 24, textAlign: 'center', color: 'var(--text-secondary)' },
  chip: { padding: '2px 8px', borderRadius: 10, background: 'rgba(127,127,127,0.12)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, textTransform: 'capitalize' },
  sideChip: { padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 },
  statusChip: { padding: '3px 10px', borderRadius: 10, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 },
};

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  panel: { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20, width: '92%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' },
};
