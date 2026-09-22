import { useCallback, useEffect, useRef, useState } from 'react';
import { LuArrowRight, LuRotateCw, LuTrendingDown, LuTrendingUp, LuTriangleAlert } from 'react-icons/lu';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const num = (v) => Number(v || 0);
const money = (v) => num(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Live socket tick -> {ltp, pct}. Returns null when there's no usable price. */
function fromTick(t) {
  if (!t) return null;
  const ltp = num(t.lastPrice ?? t.last_price ?? t.ltp);
  if (!ltp) return null;
  const close = num(t.close ?? t.ohlc?.close);
  const pct = t.changePercent != null ? num(t.changePercent)
    : close ? ((ltp - close) / close) * 100
      : null;
  return { ltp, pct };
}

function Row({ row, onOpen }) {
  const [dir, setDir] = useState('');
  const prev = useRef(null);

  useEffect(() => {
    const p = prev.current;
    prev.current = row.ltp;
    if (p == null || p === row.ltp) return;
    setDir(row.ltp > p ? 'up' : 'down');
    const id = setTimeout(() => setDir(''), 600);
    return () => clearTimeout(id);
  }, [row.ltp]);

  const pct = row.pct;
  const tone = pct == null ? 'var(--text-muted)' : pct >= 0 ? 'var(--buy-color)' : 'var(--sell-color)';

  return (
    <div
      className="pf-mw-row"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row.symbol)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(row.symbol); }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="pf-mw-sym" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.symbol}
        </div>
        <div className="pf-mw-seg">{row.exchange || 'NSE'} · Simulated</div>
      </div>
      <div className={`pf-mw-ltp ${dir}`}>{money(row.ltp)}</div>
      <div className="pf-mw-chg" style={{ color: tone }}>
        {pct == null ? '—' : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
            {pct >= 0 ? <LuTrendingUp size={12} /> : <LuTrendingDown size={12} />}
            {`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Dashboard market watch.
 *
 * Instruments come from the server's Zerodha subscription list (GET
 * /api/zerodha/ltp) rather than the local watchlist — that list is the only
 * thing guaranteed to have prices, so the panel can never show dead rows.
 * Between polls the shared socket tick cache keeps the numbers moving.
 */
export default function MarketWatchPanel({
  watchlist,
  getTickBySymbolAuto,
  isZerodhaConnected,
  setSelectedSymbol,
  navigateToPage,
  limit = 6,
}) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading'); // loading | ok | empty | error
  const [feed, setFeed] = useState(null);        // /api/zerodha/status payload
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      // Status first, so an empty result can explain *why* it is empty
      // (no config vs expired session vs nothing subscribed).
      const st = await fetch(`${API_URL}/api/zerodha/status`).then((r) => r.json()).catch(() => null);
      setFeed(st);

      const r = await fetch(`${API_URL}/api/zerodha/ltp`);
      const d = await r.json();
      const ticks = Array.isArray(d?.ticks) ? d.ticks.filter((t) => t.symbol && num(t.lastPrice ?? t.ltp)) : [];
      if (!ticks.length) { setRows([]); setState('empty'); return; }

      // Show the user's own favourites first, but only the ones that really
      // have a feed; top up from the subscribed list so the panel is never short.
      const wanted = new Set((watchlist || []).map((s) => String(s).toUpperCase()));
      const mine = ticks.filter((t) => wanted.has(String(t.symbol).toUpperCase()));
      const rest = ticks.filter((t) => !wanted.has(String(t.symbol).toUpperCase()));
      const picked = [...mine, ...rest].slice(0, limit);

      setRows(picked.map((t) => ({
        symbol: t.symbol,
        exchange: t.exchange,
        ltp: num(t.lastPrice ?? t.ltp),
        pct: t.changePercent != null ? num(t.changePercent) : null,
      })));
      setState('ok');
    } catch {
      setState('error');
    }
  }, [watchlist, limit]);

  useEffect(() => { load(); }, [load]);

  // Refresh the snapshot periodically (server caches for 2s, so this is cheap).
  useEffect(() => {
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  // Overlay live socket ticks so prices move between snapshots.
  useEffect(() => {
    if (!getTickBySymbolAuto || state !== 'ok') return;
    const id = setInterval(() => {
      setRows((prev) => prev.map((r) => {
        const live = fromTick(getTickBySymbolAuto(r.symbol));
        if (!live || live.ltp === r.ltp) return r;
        return { ...r, ltp: live.ltp, pct: live.pct ?? r.pct };
      }));
    }, 1000);
    return () => clearInterval(id);
  }, [getTickBySymbolAuto, state]);

  const open = (symbol) => {
    setSelectedSymbol?.(symbol);
    navigateToPage?.('market');
  };

  const manualRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <div className="pf-mw">
      <div className="pf-mw-head">
        <span className="pf-mw-title">Market Watch</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <span className="pf-mw-live">
            <span
              className="pf-mw-dot"
              style={isZerodhaConnected && state === 'ok' ? undefined : { background: 'var(--text-muted)', animation: 'none' }}
            />
            {isZerodhaConnected && state === 'ok' ? 'LIVE' : 'OFFLINE'}
          </span>
          <button
            type="button"
            onClick={manualRefresh}
            title="Refresh prices"
            style={{
              background: 'none', border: 0, cursor: 'pointer', padding: 2,
              color: 'var(--text-muted)', display: 'inline-flex',
            }}
          >
            <LuRotateCw size={14} style={refreshing ? { animation: 'pf-spin .8s linear infinite' } : undefined} />
          </button>
        </span>
      </div>

      {state === 'loading' && [0, 1, 2].map((i) => (
        <div key={i} className="pf-mw-row">
          <div className="pf-skel" style={{ width: '60%' }} />
          <div className="pf-skel" style={{ width: 70, marginLeft: 'auto' }} />
          <div className="pf-skel" style={{ width: 50, marginLeft: 'auto' }} />
        </div>
      ))}

      {(state === 'empty' || state === 'error') && (() => {
        // Kite access tokens expire every morning, so "disconnected" is by far
        // the most common cause — name it instead of showing a blank panel.
        const msg = state === 'error'
          ? ['Could not reach the price feed.', 'Check your connection and try again.']
          : !feed?.isConfigured
            ? ['Market feed is not configured.', 'An admin needs to set up the Zerodha connection.']
            : !feed?.isConnected
              ? ['Market feed is disconnected.', 'The Zerodha session has expired — an admin needs to log in again from Admin → Zerodha Connect.']
              : !feed?.subscribedCount
                ? ['No instruments are subscribed yet.', 'An admin needs to subscribe instruments to the live feed.']
                : ['No prices available right now.', 'The feed is connected but returned no quotes.'];
        return (
          <div style={{ padding: '22px 16px', textAlign: 'center' }}>
            <LuTriangleAlert size={20} style={{ color: 'var(--warning)' }} />
            <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{msg[0]}</p>
            <p style={{ margin: '4px auto 0', fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.5 }}>{msg[1]}</p>
          </div>
        );
      })()}

      {state === 'ok' && rows.map((r) => <Row key={r.symbol} row={r} onOpen={open} />)}

      <button
        type="button"
        onClick={() => navigateToPage?.('market')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          width: '100%', padding: '12px 16px', border: 0, cursor: 'pointer',
          borderTop: '1px solid var(--border-color)', background: 'transparent',
          color: 'var(--accent-primary)', fontSize: 12.5, fontWeight: 700,
        }}
      >
        Open market terminal <LuArrowRight size={14} />
      </button>
    </div>
  );
}
