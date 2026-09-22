import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * InstrumentPickerModal
 *
 * Opens from the chart-tabs "+" button. Fetches option / futures / equity
 * instruments live from the existing /api/zerodha/instruments/search
 * endpoint (the same one the side-panel Indian search uses), then groups
 * them into an option-chain table (CE | STRIKE | PE) per expiry.
 *
 * Rendered through a React portal to document.body so the card escapes
 * the page's fixed .main-content stacking context — otherwise the
 * topbar would render over the search input.
 */

const CATEGORIES = [
  { key: 'all',        label: 'All',         color: '#64748b',  kind: 'search' },
  { key: 'nifty',      label: 'Nifty',       color: '#10b981',  kind: 'chain',  query: 'NIFTY',      segment: 'nseOpt' },
  { key: 'banknifty',  label: 'BankNifty',   color: '#8b5cf6',  kind: 'chain',  query: 'BANKNIFTY',  segment: 'nseOpt' },
  { key: 'sensex',     label: 'Sensex',      color: '#ef4444',  kind: 'chain',  query: 'SENSEX',     segment: 'bseOpt' }
];

// Option-root → underlying index display label + the exact Zerodha tradingsymbol
// of the index spot (so the header chip shows the real LTP, falling back to the
// parity-derived spot when the index itself isn't subscribed).
const INDEX_LABEL  = { nifty: 'NIFTY', banknifty: 'BANKNIFTY', sensex: 'SENSEX' };
const INDEX_TICKER = { nifty: 'NIFTY 50', banknifty: 'NIFTY BANK', sensex: 'SENSEX' };

// Indian number formatting helpers (lakh/crore grouping like Zerodha/Upstox).
const fmtPrice = (n) => (Number.isFinite(n) && n > 0)
  ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : '—';
const fmtVol = (n) => (Number.isFinite(n) && n > 0) ? Number(n).toLocaleString('en-IN') : '—';
const fmtChg = (n) => Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` : '';

/** Pull the full live quote (ltp/bid/ask/volume/change%) for one option leg. */
function optData(inst, livePriceOf) {
  if (!inst) return null;
  const live = livePriceOf ? livePriceOf(inst) : null;
  const s = live || inst;
  const ltp = Number(s?.lastPrice ?? s?.last_price ?? s?.ltp ?? 0) || 0;
  return {
    sym: inst.tradingsymbol || inst.symbol || '',
    ltp,
    bid: Number(s?.bid ?? 0) || 0,
    ask: Number(s?.ask ?? 0) || 0,
    vol: Number(s?.volume ?? s?.vol ?? 0) || 0,
    chg: Number(s?.change ?? s?.chg ?? 0) || 0,
  };
}

/**
 * The server's search endpoint returns expiry pre-formatted as
 * "30 Apr 2026". Accept either that, a raw ISO string, or anything Date
 * can parse, and output a compact "30 APR 26" pill label.
 */
function formatExpiryDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const year = String(d.getFullYear()).slice(-2);
    return `${day} ${month} ${year}`;
  }
  // Already a formatted string — normalise "30 Apr 2026" → "30 APR 26".
  return String(value)
    .replace(/(\w{3})/g, (m) => m.toUpperCase())
    .replace(/(\d{4})$/, (y) => y.slice(-2));
}

function pickLtp(inst, livePriceOf) {
  if (!inst) return 0;
  const live = livePriceOf ? livePriceOf(inst) : null;
  const src = live || inst;
  return Number(src?.lastPrice ?? src?.last ?? src?.ltp ?? src?.bid ?? src?.ask ?? 0) || 0;
}

export default function InstrumentPickerModal({
  open,
  onClose,
  onSelect,
  apiUrl,
  getInstrumentWithLivePrice,
  zerodhaTicks,
  getTickBySymbolAuto
}) {
  const [category, setCategory] = useState('nifty');
  const [expiry, setExpiry] = useState(null);
  const [query, setQuery] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  // Cache fetched instruments per category so re-opening is instant.
  const [cache, setCache] = useState({});        // { [catKey]: Instrument[] }
  // Flat-mode search results (separate from the category cache).
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  // Per-index FUTURES cache (separate segment from the option chain).
  const [futCache, setFutCache] = useState({});   // { [catKey]: Instrument[] }
  // Selected commodity sub-tab (CRUDEOIL / GOLD / SILVER / COPPER).
  const [commoditySub, setCommoditySub] = useState('CRUDEOIL');

  const searchRef = useRef(null);
  const atmRowRef = useRef(null);
  const fetchAbortRef = useRef(null);
  const searchAbortRef = useRef(null);
  // Track tokens we've already asked the server to subscribe to this
  // session so we don't spam /subscribe-bulk on every re-render.
  const subscribedTokensRef = useRef(new Set());

  const activeCategory = useMemo(
    () => CATEGORIES.find(c => c.key === category) || CATEGORIES[1],
    [category]
  );

  // Focus search on open + reset transient state.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setQuery('');
      searchRef.current?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [open]);

  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /* ── Per-category instrument fetch ────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    if (activeCategory.kind === 'search') return;                 // "All"
    if (activeCategory.kind === 'commodityFut') return;           // futures-only tab
    if (cache[category]) return;                                  // cached
    if (!activeCategory.query && !activeCategory.segment) return; // nothing to fetch

    // Abort any in-flight fetch from a prior category switch.
    fetchAbortRef.current?.abort();
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;

    const params = new URLSearchParams();
    // Server requires `query` ≥ 2 chars. For flat categories without an
    // obvious query, use a broad prefix so we get a first page of rows.
    const q = activeCategory.query
      || (activeCategory.segment === 'nseEq' ? 'A' : 'GOLD');
    params.set('query', q);
    if (activeCategory.segment) params.set('segment', activeCategory.segment);
    // Option chains only want THIS index's contracts — ask the server to match
    // the underlying name exactly so it doesn't ship BANKNIFTY/FINNIFTY/etc.
    // (≈4x smaller payload → the chain opens much faster).
    if (activeCategory.kind === 'chain' && activeCategory.query) params.set('exact', 'true');

    // Defer the initial setState + network call so the setState isn't
    // synchronous-in-effect (react-hooks linter complains otherwise). The
    // microtask runs before the browser paints so the user still sees the
    // loading spinner on the next frame.
    queueMicrotask(() => {
      if (ctrl.signal.aborted) return;
      setFetching(true);
      setFetchError(null);
      fetch(`${apiUrl}/api/zerodha/instruments/search?${params.toString()}`, { signal: ctrl.signal })
        .then(r => r.json())
        .then(data => {
          if (ctrl.signal.aborted) return;
          if (data?.success) {
            const list = Array.isArray(data.instruments) ? data.instruments : [];
            setCache(prev => ({ ...prev, [category]: list }));
          } else {
            setFetchError(data?.error || 'Failed to load instruments');
          }
        })
        .catch(err => {
          if (err?.name === 'AbortError') return;
          setFetchError(err?.message || 'Network error');
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setFetching(false);
        });
    });

    return () => ctrl.abort();
  }, [open, category, activeCategory, cache, apiUrl]);

  /* ── Per-index FUTURES fetch (separate segment) + auto-subscribe so the
     picker shows a FUTURES section above the option chain with live LTP.
     Reuses the SAME search endpoint — no backend change. ─────────────── */
  useEffect(() => {
    if (!open) return;
    const isChain = activeCategory.kind === 'chain' && activeCategory.query;
    const isComm = activeCategory.kind === 'commodityFut';
    if (!isChain && !isComm) return;
    if (futCache[category]) return;
    // One fetch per underlying (commodity has 4; index has 1).
    const jobs = isComm
      ? (activeCategory.roots || []).map(r => ({ q: r, seg: activeCategory.segment || 'mcxFut' }))
      : [{ q: activeCategory.query, seg: activeCategory.segment === 'bseOpt' ? 'bseFut' : 'nseFut' }];
    const ctrl = new AbortController();
    queueMicrotask(() => {
      if (ctrl.signal.aborted) return;
      Promise.all(jobs.map((j) => {
        const params = new URLSearchParams();
        params.set('query', j.q);
        params.set('segment', j.seg);
        params.set('exact', 'true');
        return fetch(`${apiUrl}/api/zerodha/instruments/search?${params.toString()}`, { signal: ctrl.signal })
          .then(r => r.json())
          .then(data => (Array.isArray(data?.instruments) ? data.instruments : []))
          .catch(() => []);
      })).then((lists) => {
        if (ctrl.signal.aborted) return;
        const list = lists.flat();
        setFutCache(prev => ({ ...prev, [category]: list }));
        // Subscribe the futures so their LTP streams into the list.
        const fresh = list
          .filter(i => Number(i?.token) > 0)
          .map(i => ({
            token: Number(i.token), symbol: i.tradingsymbol || i.symbol, name: i.name,
            exchange: i.exchange, segment: i.segment, lotSize: i.lotSize || 1,
            tickSize: i.tickSize || 0.05, instrumentType: i.instrumentType || 'FUT'
          }));
        if (fresh.length) {
          fetch(`${apiUrl}/api/zerodha/instruments/subscribe-bulk`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instruments: fresh })
          }).catch(() => {});
        }
      });
    });
    return () => ctrl.abort();
  }, [open, category, activeCategory, futCache, apiUrl]);

  // This index's futures (name-exact, FUT only, soonest expiry first).
  const futures = useMemo(() => {
    const list = futCache[category] || [];
    const isComm = activeCategory.kind === 'commodityFut';
    const root = String(activeCategory.query || '').toUpperCase();
    const sub = String(commoditySub || '').toUpperCase();
    return list
      .filter(i => {
        const t = String(i.instrumentType || i.instrument_type || '').toUpperCase();
        if (t !== 'FUT') return false;
        const nm = String(i.name || '').toUpperCase();
        // Commodity: only the selected sub-tab's contract. Index: this index only.
        if (isComm) return nm === sub;
        return nm ? nm === root : String(i.tradingsymbol || i.symbol || '').toUpperCase().startsWith(root);
      })
      .sort((a, b) => (new Date(a.expiry).getTime() || 0) - (new Date(b.expiry).getTime() || 0));
  }, [futCache, category, activeCategory, commoditySub]);

  /* ── Flat-mode search (All tab OR user types anywhere) ────────────── */
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const shouldSkip =
      (activeCategory.kind === 'chain' && (q === '' || /^\d+$/.test(q))) ||
      q.length < 2;

    searchAbortRef.current?.abort();
    const ctrl = new AbortController();
    searchAbortRef.current = ctrl;

    // Defer all setState to a microtask so the effect body stays clean
    // (react-hooks lint rule).
    let timer = null;
    queueMicrotask(() => {
      if (ctrl.signal.aborted) return;
      if (shouldSkip) {
        setSearchResults([]);
        setSearchLoading(false);
        return;
      }
      const params = new URLSearchParams();
      params.set('query', q);
      const seg = activeCategory.segment || 'nseEq';
      params.set('segment', seg);

      setSearchLoading(true);
      timer = setTimeout(() => {
        fetch(`${apiUrl}/api/zerodha/instruments/search?${params.toString()}`, { signal: ctrl.signal })
          .then(r => r.json())
          .then(data => {
            if (ctrl.signal.aborted) return;
            setSearchResults(Array.isArray(data?.instruments) ? data.instruments : []);
          })
          .catch(err => { if (err?.name !== 'AbortError') setSearchResults([]); })
          .finally(() => { if (!ctrl.signal.aborted) setSearchLoading(false); });
      }, 220);
    });

    return () => { if (timer) clearTimeout(timer); ctrl.abort(); };
  }, [open, query, category, activeCategory, apiUrl]);

  const scopedInstruments = useMemo(() => {
    const list = cache[category] || [];
    // For an index option chain keep ONLY that index's own contracts. The
    // server matches the query as a substring, so a "NIFTY" search also returns
    // BANKNIFTY / FINNIFTY / MIDCPNIFTY (their names contain "NIFTY") — and
    // FINNIFTY's strikes overlap NIFTY's range, polluting the chain with stray
    // strikes. Match the underlying `name` exactly (symbol-prefix as fallback).
    if (activeCategory.kind !== 'chain' || !activeCategory.query) return list;
    const root = String(activeCategory.query).toUpperCase();
    return list.filter(i => {
      const nm = String(i.name || '').toUpperCase();
      if (nm) return nm === root;
      const sym = String(i.tradingsymbol || i.symbol || '').toUpperCase();
      return sym.startsWith(root);
    });
  }, [cache, category, activeCategory]);

  // Expiries for the current chain category, sorted ascending.
  const expiries = useMemo(() => {
    if (activeCategory.kind !== 'chain') return [];
    const set = new Set();
    for (const i of scopedInstruments) {
      const t = String(i.instrumentType || i.instrument_type || '').toUpperCase();
      if ((t === 'CE' || t === 'PE') && i.expiry) set.add(i.expiry);
    }
    const arr = Array.from(set);
    arr.sort((a, b) => {
      const da = new Date(a).getTime();
      const db = new Date(b).getTime();
      if (Number.isNaN(da) && Number.isNaN(db)) return a.localeCompare(b);
      if (Number.isNaN(da)) return 1;
      if (Number.isNaN(db)) return -1;
      return da - db;
    });
    return arr;
  }, [scopedInstruments, activeCategory]);

  // Derive the effective expiry so we don't need a useEffect to keep it
  // in sync with the category switch.
  const effectiveExpiry = useMemo(() => {
    if (expiries.length === 0) return null;
    if (expiry && expiries.includes(expiry)) return expiry;
    return expiries[0];
  }, [expiries, expiry]);

  /* ── Live-price resolver ──────────────────────────────────────────── */
  const livePriceOf = useMemo(() => {
    return (inst) => {
      if (!inst) return null;
      // 1. Zerodha ticks by numeric instrument token (WS stream).
      if (zerodhaTicks && inst.token && zerodhaTicks[inst.token]) {
        return zerodhaTicks[inst.token];
      }
      // 2. The useZerodhaTicks hook also stores ticks under
      //    `sym_<tradingsymbol>` so some symbols (rarely) only resolve
      //    via this fallback. Try both plausible symbol fields.
      if (zerodhaTicks) {
        const sym = inst.tradingsymbol || inst.symbol;
        if (sym && zerodhaTicks[`sym_${sym}`]) return zerodhaTicks[`sym_${sym}`];
      }
      // 3. Outlet helper merges static + live, used elsewhere in MarketPage.
      if (getInstrumentWithLivePrice) {
        try { return getInstrumentWithLivePrice(inst); } catch { /* ignore */ }
      }
      return inst;
    };
  }, [zerodhaTicks, getInstrumentWithLivePrice]);

  /* ── Option-chain rows for the selected expiry ───────────────────── */
  const chainRows = useMemo(() => {
    if (activeCategory.kind !== 'chain' || !effectiveExpiry) return [];
    const byStrike = new Map();
    for (const i of scopedInstruments) {
      if (i.expiry !== effectiveExpiry) continue;
      const t = String(i.instrumentType || i.instrument_type || '').toUpperCase();
      if (t !== 'CE' && t !== 'PE') continue;
      const strike = Number(i.strike);
      if (!Number.isFinite(strike) || strike <= 0) continue;
      if (!byStrike.has(strike)) byStrike.set(strike, { strike, ce: null, pe: null });
      byStrike.get(strike)[t === 'CE' ? 'ce' : 'pe'] = i;
    }
    return Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
  }, [scopedInstruments, effectiveExpiry, activeCategory]);

  /* ── Subscribe the underlying INDEX spot (NIFTY 50 / NIFTY BANK / SENSEX)
     so its live LTP drives accurate ATM detection and the header chip.
     subscribe-by-symbol resolves the token server-side. ─────────────── */
  useEffect(() => {
    if (!open || activeCategory.kind !== 'chain') return;
    const ticker = INDEX_TICKER[category];
    if (!ticker) return;
    const ctrl = new AbortController();
    fetch(`${apiUrl}/api/zerodha/instruments/subscribe-by-symbol`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: ticker }),
      signal: ctrl.signal
    }).catch(() => { /* non-fatal — chip falls back to parity spot */ });
    return () => ctrl.abort();
  }, [open, category, activeCategory, apiUrl]);

  // ATM detection + live underlying spot, both derived from option LTPs
  // via put-call parity: for any strike with both CE & PE quoted,
  //   spot ≈ strike + (CE_LTP − PE_LTP)
  // We pick the strike whose CE ≈ PE as the ATM row (tightest spread =
  // nearest to spot), then average the parity estimate across the handful
  // of strikes closest to that one so the spot number is stable and ticks
  // live as LTPs change. Falls back to the chain midpoint / null if
  // nothing's streaming yet.
  // Real index spot LTP (from the subscribed index — see the index-subscribe
  // effect below). Computed independently so ATM detection can use it directly
  // without depending on option-leg prices (avoids a parity chicken-and-egg).
  const indexSpot = useMemo(() => {
    const ticker = INDEX_TICKER[category];
    if (ticker && typeof getTickBySymbolAuto === 'function') {
      const t = getTickBySymbolAuto(ticker);
      return Number(t?.lastPrice ?? t?.last_price ?? t?.ltp ?? 0) || 0;
    }
    return 0;
  }, [category, getTickBySymbolAuto, zerodhaTicks]);

  const { atmStrike, atmSpot } = useMemo(() => {
    if (chainRows.length === 0) return { atmStrike: null, atmSpot: null };

    // Preferred: the real index spot → ATM is simply the nearest strike.
    if (indexSpot > 0) {
      let nearest = chainRows[0].strike;
      let dist = Infinity;
      for (const r of chainRows) {
        const d = Math.abs(r.strike - indexSpot);
        if (d < dist) { dist = d; nearest = r.strike; }
      }
      return { atmStrike: nearest, atmSpot: indexSpot };
    }

    // Fallback (index not subscribed yet): put-call parity. Find the strike
    // where CE and PE are closest (ATM proxy), then average the parity spot
    // estimate across the 5 nearest strikes.
    let best = null;
    let bestSpread = Infinity;
    const parityEstimates = [];
    for (const r of chainRows) {
      const ce = pickLtp(r.ce, livePriceOf);
      const pe = pickLtp(r.pe, livePriceOf);
      if (ce > 0 && pe > 0) {
        parityEstimates.push({ strike: r.strike, spot: r.strike + (ce - pe) });
        const spread = Math.abs(ce - pe);
        if (spread < bestSpread) { bestSpread = spread; best = r; }
      }
    }

    const strike = best
      ? best.strike
      : (chainRows[Math.floor(chainRows.length / 2)]?.strike ?? null);

    if (parityEstimates.length === 0) return { atmStrike: strike, atmSpot: null };

    const near = [...parityEstimates]
      .sort((a, b) => Math.abs(a.strike - strike) - Math.abs(b.strike - strike))
      .slice(0, 5);
    const spot = near.reduce((s, x) => s + x.spot, 0) / near.length;

    return { atmStrike: strike, atmSpot: Number.isFinite(spot) ? spot : null };
  }, [chainRows, livePriceOf, indexSpot]);

  // Underlying index spot for the header chip (real LTP, else parity spot).
  const underlying = useMemo(() => {
    const label = INDEX_LABEL[category] || String(activeCategory.query || '').toUpperCase();
    const price = indexSpot > 0
      ? indexSpot
      : (Number.isFinite(atmSpot) && atmSpot > 0 ? atmSpot : 0);
    return { label, price };
  }, [category, activeCategory, indexSpot, atmSpot]);

  // Show only ATM ± 10 strikes (21 rows) like Zerodha/Upstox. This both gives
  // the focused view the user wants AND fixes the "—" gaps: we then subscribe
  // only these ~42 option legs (instead of the whole chain), so every visible
  // strike reliably receives a live tick.
  const STRIKE_WINDOW = 10;
  const windowedRows = useMemo(() => {
    if (chainRows.length === 0) return chainRows;
    let center = chainRows.findIndex(r => r.strike === atmStrike);
    if (center < 0) center = Math.floor(chainRows.length / 2);
    const start = Math.max(0, center - STRIKE_WINDOW);
    const end = Math.min(chainRows.length, center + STRIKE_WINDOW + 1);
    return chainRows.slice(start, end);
  }, [chainRows, atmStrike]);

  /* ── Auto-subscribe only the VISIBLE (ATM ±10) option legs to the Zerodha
     tick stream. Subscribing the whole chain (hundreds of legs) was
     unreliable — some legs never ticked and showed "—". A focused ~42-leg
     set subscribes cleanly so every visible strike gets a live price. We
     cache tokens in a ref so re-centering only subscribes the new edges. ── */
  useEffect(() => {
    if (!open) return;
    const visible = [];
    if (activeCategory.kind === 'chain') {
      for (const r of windowedRows) {
        if (r.ce) visible.push(r.ce);
        if (r.pe) visible.push(r.pe);
      }
    } else if (activeCategory.kind === 'flat') {
      // Flat list (equity / commodity / search) — subscribe the first page.
      for (const i of (cache[category] || []).slice(0, 200)) visible.push(i);
    }

    const seen = subscribedTokensRef.current;
    const fresh = [];
    for (const inst of visible) {
      const tok = Number(inst?.token);
      if (!Number.isFinite(tok) || tok <= 0) continue;
      if (seen.has(tok)) continue;
      seen.add(tok);
      fresh.push({
        token: tok,
        symbol: inst.tradingsymbol || inst.symbol,
        name: inst.name,
        exchange: inst.exchange,
        segment: inst.segment,
        lotSize: inst.lotSize || 1,
        tickSize: inst.tickSize || 0.05,
        instrumentType: inst.instrumentType || ''
      });
    }
    if (fresh.length === 0) return;

    // Fire-and-forget bulk subscribe, then an LTP fetch so the server
    // HTTP-fetches + broadcasts current prices immediately (instead of the
    // user waiting up to 30s for the next poll).
    const ctrl = new AbortController();
    fetch(`${apiUrl}/api/zerodha/instruments/subscribe-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruments: fresh }),
      signal: ctrl.signal
    })
      .then(() => fetch(`${apiUrl}/api/zerodha/ltp`, { signal: ctrl.signal }))
      .catch(() => { /* non-fatal — next 30-sec poll will recover */ });
    return () => ctrl.abort();
  }, [open, windowedRows, category, activeCategory, cache, apiUrl]);

  // Scroll ATM into view when the chain (re)loads.
  useEffect(() => {
    if (!open || !atmStrike) return;
    const t = setTimeout(() => {
      atmRowRef.current?.scrollIntoView({ behavior: 'auto', block: 'center' });
    }, 120);
    return () => clearTimeout(t);
  }, [open, atmStrike, effectiveExpiry, category]);

  /* ── What to render ──────────────────────────────────────────────── */
  const showSearchList = (
    activeCategory.kind === 'search' ||
    activeCategory.kind === 'flat' ||
    (activeCategory.kind === 'chain' && query.trim().length >= 2 && !/^\d+$/.test(query.trim()))
  );

  const flatRows = showSearchList
    ? (query.trim().length >= 2 ? searchResults : scopedInstruments)
    : [];

  if (!open) return null;

  const body = (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
          zIndex: 99998
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(1150px, 97vw)', height: 'min(780px, 92vh)',
          background: 'var(--bg-primary, #0f172a)',
          border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
          borderRadius: 16,
          boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          zIndex: 99999
        }}
      >
        {/* Header: search + close */}
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0
        }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 10, padding: '10px 14px'
          }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>🔍</span>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search instruments..."
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                color: 'var(--text-primary)', fontSize: 14
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}
              >
                ×
              </button>
            )}
          </div>
          {/* LIVE badge */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 8,
            background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)',
            color: '#10b981', fontSize: 11, fontWeight: 800, letterSpacing: 0.6
          }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: '#10b981', display: 'inline-block' }} />
            LIVE
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)', cursor: 'pointer', fontSize: 16
            }}
          >
            ×
          </button>
        </div>

        {/* Category pills + underlying spot chip */}
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, flexShrink: 0
        }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {CATEGORIES.map(c => {
              const active = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => { setCategory(c.key); setExpiry(null); }}
                  style={{
                    flex: '0 0 auto', padding: '6px 14px', borderRadius: 999,
                    border: `1px solid ${active ? 'var(--text-primary)' : 'var(--border-color)'}`,
                    background: active ? 'var(--bg-secondary)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    whiteSpace: 'nowrap'
                  }}
                >
                  {c.color && c.key !== 'all' && (
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: c.color }} />
                  )}
                  {c.label}
                </button>
              );
            })}
          </div>

          {activeCategory.kind === 'chain' && underlying.price > 0 && (
            <span style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'baseline', gap: 8,
              padding: '6px 14px', borderRadius: 10,
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
              whiteSpace: 'nowrap'
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-secondary)' }}>
                {underlying.label}
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
                ₹{fmtPrice(underlying.price)}
              </span>
            </span>
          )}
        </div>

        {/* Commodity sub-tabs — one chip per underlying (futures-only). */}
        {activeCategory.kind === 'commodityFut' && (activeCategory.roots || []).length > 0 && (
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border-color)',
            display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0
          }}>
            {activeCategory.roots.map(r => {
              const active = commoditySub === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setCommoditySub(r)}
                  style={{
                    flex: '0 0 auto', padding: '6px 14px', borderRadius: 999,
                    border: `1px solid ${active ? '#f59e0b' : 'var(--border-color)'}`,
                    background: active ? 'rgba(245,158,11,0.12)' : 'transparent',
                    color: active ? '#f59e0b' : 'var(--text-secondary)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
        )}

        {/* Expiry pills (chain mode only) */}
        {activeCategory.kind === 'chain' && expiries.length > 0 && (
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border-color)',
            display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0
          }}>
            {expiries.map(e => {
              const active = e === effectiveExpiry;
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => setExpiry(e)}
                  style={{
                    flex: '0 0 auto', padding: '6px 12px', borderRadius: 999,
                    border: `1px solid ${active ? 'var(--text-primary)' : 'var(--border-color)'}`,
                    background: active ? 'var(--bg-secondary)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {formatExpiryDate(e)}
                </button>
              );
            })}
          </div>
        )}

        {/* Body: chain / flat / empty / loading */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
          {(fetching || searchLoading) && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>⏳</div>
              Loading instruments…
            </div>
          )}

          {!fetching && fetchError && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#ef4444', fontSize: 13 }}>
              Failed to load: {fetchError}
            </div>
          )}

          {/* FUTURES section — above the option chain (index), or the whole body (commodity). */}
          {!fetching && !fetchError && (activeCategory.kind === 'chain' || activeCategory.kind === 'commodityFut') && !showSearchList && futures.length > 0 && (
            <div style={{ padding: '10px 16px 4px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-secondary)', margin: '0 0 8px' }}>{activeCategory.kind === 'commodityFut' ? 'COMMODITY FUTURES' : 'FUTURES'}</div>
              {futures.map((f) => {
                const q = optData(f, livePriceOf);
                const sym = f.tradingsymbol || f.symbol;
                return (
                  <button
                    key={f.token || sym}
                    type="button"
                    onClick={() => { onSelect?.(sym, f); onClose?.(); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '11px 12px', marginBottom: 6, borderRadius: 10,
                      border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                      cursor: 'pointer', textAlign: 'left'
                    }}
                  >
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {(f.name || sym)} FUT {formatExpiryDate(f.expiry)}
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', background: 'rgba(59,130,246,0.12)', padding: '1px 6px', borderRadius: 6 }}>FUT</span>
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{sym} · Lot {f.lotSize || 1}</span>
                    </span>
                    {q?.ltp > 0 && (
                      <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', flexShrink: 0 }}>₹{fmtPrice(q.ltp)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Option chain */}
          {!fetching && !fetchError && activeCategory.kind === 'chain' && !showSearchList && chainRows.length > 0 && (
            <OptionChain
              rows={windowedRows}
              expiry={effectiveExpiry}
              atmStrike={atmStrike}
              atmSpot={atmSpot}
              atmRowRef={atmRowRef}
              query={query}
              livePriceOf={livePriceOf}
              onPick={(sym, inst) => { onSelect?.(sym, inst); onClose?.(); }}
            />
          )}

          {/* Flat list / search-results view */}
          {!fetching && !fetchError && !searchLoading && showSearchList && flatRows.length > 0 && (
            <FlatList
              rows={flatRows}
              livePriceOf={livePriceOf}
              onPick={(sym, inst) => { onSelect?.(sym, inst); onClose?.(); }}
            />
          )}

          {/* Empty states */}
          {!fetching && !fetchError && !searchLoading && activeCategory.kind === 'chain' && !showSearchList && chainRows.length === 0 && futures.length === 0 && (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
                No contracts found
              </div>
              <div style={{ fontSize: 12 }}>
                {scopedInstruments.length === 0
                  ? 'Nothing returned for this index — the Zerodha instrument list may still be syncing.'
                  : 'Pick another expiry or category.'}
              </div>
            </div>
          )}

          {!fetching && !fetchError && !searchLoading && showSearchList && flatRows.length === 0 && (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔎</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
                {query.trim().length < 2 ? 'Start typing to search' : 'No matches'}
              </div>
              <div style={{ fontSize: 12 }}>
                {query.trim().length < 2
                  ? 'Search across every tradable symbol.'
                  : 'Try a different keyword.'}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  // Portal to body so the modal escapes MarketPage's fixed .main-content
  // stacking context — otherwise the topbar would paint over the header.
  return createPortal(body, document.body);
}

/* ────────────────────────────────────────────────────────────────────── */
/* Option chain                                                          */
/* ────────────────────────────────────────────────────────────────────── */
// Column template: CE(VOL CHG% BID ASK LTP) | STRIKE | PE(LTP BID ASK CHG% VOL)
const CHAIN_GRID = 'minmax(0,1fr) minmax(0,0.85fr) minmax(0,0.95fr) minmax(0,0.95fr) minmax(0,1fr) 78px minmax(0,1fr) minmax(0,0.95fr) minmax(0,0.95fr) minmax(0,0.85fr) minmax(0,1fr)';
// Mobile: 11 columns don't fit a phone, so every cell truncated to "3..". We
// drop VOL / BID / ASK and keep only what a person picks a leg by — CHG% + LTP
// on each side — giving a clean 5-column layout: CE(CHG% LTP) | STRIKE | PE(LTP CHG%).
const CHAIN_GRID_MOBILE = 'minmax(0,0.8fr) minmax(0,1.1fr) 62px minmax(0,1.1fr) minmax(0,0.8fr)';

// Tracks whether the viewport is phone-width so the option chain can switch to
// its condensed 5-column layout. Uses matchMedia (cheap, no resize thrash).
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);
  return isMobile;
}

function OptionChain({ rows, expiry, atmStrike, atmSpot, atmRowRef, query, livePriceOf, onPick }) {
  const isMobile = useIsMobile();
  const grid = isMobile ? CHAIN_GRID_MOBILE : CHAIN_GRID;
  const rowPad = isMobile ? '8px 10px' : '8px 16px';
  const expiryLabel = formatExpiryDate(expiry);
  // Prefer the live parity-derived spot; fall back to the ATM strike itself so
  // the pill always shows a number. Switches from strike → live spot seamlessly.
  const atmLabel = Number.isFinite(atmSpot)
    ? `ATM ${Number(atmSpot).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`
    : Number.isFinite(atmStrike)
      ? `ATM ${Number(atmStrike).toLocaleString('en-IN')}`
      : 'ATM';

  const filteredRows = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    if (/^\d+$/.test(q)) return rows.filter(r => String(r.strike).includes(q));
    return rows;
  }, [rows, query]);

  const headCell = (text, color, align = 'right') => (
    <span style={{ textAlign: align, color: color || 'var(--text-secondary)' }}>{text}</span>
  );

  return (
    <div>
      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: grid, alignItems: 'center',
        padding: isMobile ? '9px 10px' : '9px 16px', gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
        color: 'var(--text-secondary)', background: 'var(--bg-secondary)',
        position: 'sticky', top: 0, zIndex: 2, borderBottom: '1px solid var(--border-color)'
      }}>
        {isMobile ? (
          <>
            {headCell('CHG%')}{headCell('LTP', '#10b981')}
            {headCell('STRIKE', 'var(--text-secondary)', 'center')}
            {headCell('LTP', '#ef4444', 'left')}{headCell('CHG%', null, 'left')}
          </>
        ) : (
          <>
            {headCell('VOL')}{headCell('CHG%')}{headCell('BID')}{headCell('ASK')}{headCell('LTP', '#10b981')}
            {headCell('STRIKE', 'var(--text-secondary)', 'center')}
            {headCell('LTP', '#ef4444', 'left')}{headCell('BID', null, 'left')}{headCell('ASK', null, 'left')}{headCell('CHG%', null, 'left')}{headCell('VOL', null, 'left')}
          </>
        )}
      </div>

      {filteredRows.map(r => {
        const isATM = r.strike === atmStrike;
        const ce = optData(r.ce, livePriceOf);
        const pe = optData(r.pe, livePriceOf);
        // ITM shading: CE in-the-money when strike < spot, PE when strike > spot.
        const ceItm = Number.isFinite(atmStrike) && r.strike < atmStrike;
        const peItm = Number.isFinite(atmStrike) && r.strike > atmStrike;
        const ceBg = ceItm ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.045)';
        const peBg = peItm ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.045)';

        return (
          <div
            key={r.strike}
            ref={isATM ? atmRowRef : null}
            style={{
              display: 'grid', gridTemplateColumns: grid, alignItems: 'center', gap: 6,
              padding: rowPad, fontSize: 12,
              borderBottom: '1px solid var(--border-color)',
              boxShadow: isATM ? 'inset 0 0 0 1px rgba(245,158,11,0.45)' : 'none',
              position: 'relative'
            }}
          >
            {isATM && (
              <div style={{
                position: 'absolute', top: -1, left: '50%', transform: 'translate(-50%, -100%)',
                background: '#f59e0b', color: '#fff', padding: '2px 12px', borderRadius: '8px 8px 0 0',
                fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, pointerEvents: 'none',
                whiteSpace: 'nowrap', boxShadow: '0 -2px 8px rgba(245,158,11,0.3)', zIndex: 1
              }}>
                {atmLabel}
              </div>
            )}

            {/* CALL side (clickable → add CE). Mobile shows only CHG% + LTP. */}
            {!isMobile && <ChainNum value={ce} field="vol"  bg={ceBg} align="right" onClick={() => r.ce && onPick?.(ce.sym, r.ce)} />}
            <ChainNum value={ce} field="chg"  bg={ceBg} align="right" onClick={() => r.ce && onPick?.(ce.sym, r.ce)} />
            {!isMobile && <ChainNum value={ce} field="bid"  bg={ceBg} align="right" onClick={() => r.ce && onPick?.(ce.sym, r.ce)} />}
            {!isMobile && <ChainNum value={ce} field="ask"  bg={ceBg} align="right" onClick={() => r.ce && onPick?.(ce.sym, r.ce)} />}
            <ChainNum value={ce} field="ltp"  bg={ceBg} align="right" side="ce" onClick={() => r.ce && onPick?.(ce.sym, r.ce)} />

            {/* Strike */}
            <div title={expiryLabel} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: isMobile ? 12 : 13, fontWeight: 800, color: isATM ? '#f59e0b' : 'var(--text-primary)'
            }}>
              {r.strike.toLocaleString('en-IN')}
            </div>

            {/* PUT side (clickable → add PE). Mobile shows only LTP + CHG%. */}
            <ChainNum value={pe} field="ltp"  bg={peBg} align="left" side="pe" onClick={() => r.pe && onPick?.(pe.sym, r.pe)} />
            {!isMobile && <ChainNum value={pe} field="bid"  bg={peBg} align="left" onClick={() => r.pe && onPick?.(pe.sym, r.pe)} />}
            {!isMobile && <ChainNum value={pe} field="ask"  bg={peBg} align="left" onClick={() => r.pe && onPick?.(pe.sym, r.pe)} />}
            <ChainNum value={pe} field="chg"  bg={peBg} align="left" onClick={() => r.pe && onPick?.(pe.sym, r.pe)} />
            {!isMobile && <ChainNum value={pe} field="vol"  bg={peBg} align="left" onClick={() => r.pe && onPick?.(pe.sym, r.pe)} />}
          </div>
        );
      })}
    </div>
  );
}

/** One numeric cell of the option chain (a leg's vol/chg/bid/ask/ltp). */
function ChainNum({ value, field, bg, align, side, onClick }) {
  let text = '—';
  let color = 'var(--text-secondary)';
  let weight = 500;
  if (value) {
    if (field === 'ltp') {
      text = fmtPrice(value.ltp);
      color = side === 'ce' ? '#10b981' : '#ef4444';
      weight = 800;
    } else if (field === 'chg') {
      text = value.ltp > 0 || value.vol > 0 ? fmtChg(value.chg) : '—';
      color = value.chg >= 0 ? '#10b981' : '#ef4444';
      weight = 600;
    } else if (field === 'bid') {
      text = fmtPrice(value.bid);
    } else if (field === 'ask') {
      text = fmtPrice(value.ask);
    } else if (field === 'vol') {
      text = fmtVol(value.vol);
    }
  }
  return (
    <div
      onClick={onClick}
      style={{
        textAlign: align, padding: '6px 8px', borderRadius: 5,
        background: bg, color, fontWeight: weight,
        cursor: value ? 'pointer' : 'default',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
      }}
    >
      {text}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Flat list — equity / commodity / search                               */
/* ────────────────────────────────────────────────────────────────────── */
function FlatList({ rows, livePriceOf, onPick }) {
  return (
    <div>
      {rows.slice(0, 500).map((inst, idx) => {
        const sym = inst.tradingsymbol || inst.symbol || '';
        const ltp = pickLtp(inst, livePriceOf);
        const live = livePriceOf ? livePriceOf(inst) : null;
        const change = Number(live?.change) || 0;
        return (
          <button
            key={`${sym}-${idx}`}
            type="button"
            onClick={() => onPick?.(sym, inst)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              width: '100%', padding: '12px 20px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-primary)', textAlign: 'left',
              borderBottom: '1px solid var(--border-color)'
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {sym}
              </div>
              {inst.name && inst.name !== sym && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {inst.name}{inst.expiry ? ` · ${formatExpiryDate(inst.expiry)}` : ''}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {ltp > 0 ? `₹${ltp.toFixed(2)}` : '—'}
              </div>
              {change !== 0 && (
                <div style={{ fontSize: 10, color: change >= 0 ? '#10b981' : '#ef4444' }}>
                  {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
