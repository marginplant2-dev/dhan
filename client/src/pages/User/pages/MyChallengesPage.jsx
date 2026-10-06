import { useState, useEffect, useRef } from 'react';
import { useOutletContext, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LuTrophy, LuLayoutGrid, LuClock, LuPlay, LuCrown, LuCircleCheck, LuCircleX,
  LuSearch, LuArrowUpDown, LuChevronDown, LuList, LuShoppingCart, LuInfo, LuPlus,
  LuCalendarX, LuBan, LuRotateCw, LuWallet,
} from 'react-icons/lu';
import socketService from '../../../services/socketService';
import './MyChallenges.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authData.token || ''}`
  };
}

const statusConfig = {
  PENDING:   { color: '#D97706', bg: '#FFF7E8', label: 'Awaiting Approval', Icon: LuClock },
  ACTIVE:    { color: '#2563EB', bg: '#EEF4FF', label: 'Active',            Icon: LuPlay },
  PASSED:    { color: '#059669', bg: '#E9F9F1', label: 'Passed',            Icon: LuCircleCheck },
  FAILED:    { color: '#DC2626', bg: '#FDEDED', label: 'Failed',            Icon: LuCircleX },
  FUNDED:    { color: '#7C3AED', bg: '#F4EDFE', label: 'Funded',            Icon: LuCrown },
  EXPIRED:   { color: '#6B7280', bg: '#F1F3F7', label: 'Expired',           Icon: LuCalendarX },
  CANCELLED: { color: '#DC2626', bg: '#FDEDED', label: 'Payment Rejected',  Icon: LuBan },
};

// The filter rail and the stat cards are the same six buckets, so they read
// from one table — a count that disagrees between the two rows is the kind of
// bug that only shows up once a user actually owns accounts.
const BUCKETS = [
  { key: 'ALL',     icon: LuLayoutGrid,  label: 'All Challenges',    short: 'Total Challenges',   sub: 'View all your challenges', statSub: 'All challenges',   tint: '#EEF4FF', fg: '#2563EB' },
  { key: 'PENDING', icon: LuClock,       label: 'Awaiting Approval', short: 'Awaiting Approval',  sub: 'Pending verification',    statSub: 'Pending verification', tint: '#FFF7E8', fg: '#D97706' },
  { key: 'ACTIVE',  icon: LuPlay,        label: 'Active',            short: 'Active Challenges',  sub: 'Currently trading',       statSub: 'In progress',      tint: '#E9F9F1', fg: '#059669' },
  { key: 'FUNDED',  icon: LuCrown,       label: 'Funded',            short: 'Funded Accounts',    sub: 'Live funded accounts',    statSub: 'Live accounts',    tint: '#F4EDFE', fg: '#7C3AED' },
  { key: 'PASSED',  icon: LuCircleCheck, label: 'Passed',            short: 'Passed Challenges',  sub: 'Successfully completed',  statSub: null,               tint: '#E9F9F1', fg: '#059669' },
  { key: 'FAILED',  icon: LuCircleX,     label: 'Failed',            short: 'Failed Challenges',  sub: 'Not qualified',           statSub: 'Try again',        tint: '#FDEDED', fg: '#DC2626' },
];

// Flat line art rather than a raster: it stays crisp at any zoom and costs no
// request. Colours are the page's own, so it cannot drift from the theme.
function EmptyArt() {
  return (
    <svg width="188" height="132" viewBox="0 0 188 132" fill="none" role="presentation">
      <path d="M14 96c14-9 22-26 15-40C22 42 30 26 48 22" stroke="#C7D7F0" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 7" />
      <path d="M118 30c22 2 38 14 46 30" stroke="#C7D7F0" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 7" />
      <rect x="62" y="24" width="62" height="84" rx="9" fill="#DCE8FB" />
      <rect x="68" y="32" width="50" height="72" rx="6" fill="#fff" />
      <rect x="80" y="16" width="26" height="15" rx="5" fill="#9DB9E8" />
      <rect x="76" y="46" width="8" height="8" rx="2.5" fill="#2E5FB5" />
      <rect x="88" y="48" width="22" height="4" rx="2" fill="#D3DEEE" />
      <rect x="76" y="62" width="8" height="8" rx="2.5" fill="#2E5FB5" />
      <rect x="88" y="64" width="22" height="4" rx="2" fill="#D3DEEE" />
      <rect x="76" y="78" width="8" height="8" rx="2.5" fill="#9DB9E8" />
      <rect x="88" y="80" width="16" height="4" rx="2" fill="#E4EAF3" />
      <path d="M133 34l22 12-22 12-4-11z" fill="#3E72C9" />
      <path d="M133 34l-4 13 9 3z" fill="#2E5FB5" />
      <circle cx="46" cy="60" r="5.5" stroke="#BBD0EE" strokeWidth="2" />
      <path d="M33 44h7M36.5 40.5v7" stroke="#F2A93B" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M146 78h7M149.5 74.5v7" stroke="#F2A93B" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M126 20l3 3-3 3-3-3z" fill="#E86A6A" />
      <circle cx="152" cy="60" r="3" fill="#BBD0EE" />
    </svg>
  );
}

function formatINR(n) {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function MyChallengesPage() {
  const { user, setActiveChallengeAccountId } = useOutletContext();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('latest');
  const [view, setView] = useState('grid');
  const [searchParams, setSearchParams] = useSearchParams();
  const [payNote, setPayNote] = useState(null);
  const pollingRef = useRef(null);

  // Coming back from the UPIQR payment page. The id is the only thing the
  // browser carries; the server asks the gateway what actually happened, so a
  // crafted query string cannot activate anything. The callback settles it
  // anyway if the browser never makes it back, hence the short poll rather
  // than a single try.
  useEffect(() => {
    let stored = null;
    try { stored = localStorage.getItem('dhanfunded-upiqr-pending'); } catch (_) { /* private mode */ }
    const clientTxnId = searchParams.get('upiqr') || stored;
    if (!clientTxnId) return;

    let cancelled = false;
    const clear = () => {
      try { localStorage.removeItem('dhanfunded-upiqr-pending'); } catch (_) { /* private mode */ }
      if (searchParams.get('upiqr')) {
        searchParams.delete('upiqr');
        setSearchParams(searchParams, { replace: true });
      }
    };

    (async () => {
      setPayNote({ kind: 'wait', text: 'Confirming your payment…' });
      // UPI settlement can lag the redirect by a few seconds.
      for (let attempt = 0; attempt < 6 && !cancelled; attempt++) {
        try {
          const res = await fetch(`${API_URL}/api/prop/upiqr/verify`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ clientTxnId }),
          });
          const data = await res.json();
          if (cancelled) return;
          if (data.success) {
            setPayNote({ kind: 'ok', text: 'Payment received — your challenge account is active.' });
            clear();
            fetchAccounts(false);
            return;
          }
          if (data.failed) {
            setPayNote({ kind: 'err', text: data.message || 'That payment did not go through.' });
            clear();
            return;
          }
        } catch (_) { /* keep trying */ }
        await new Promise(r => setTimeout(r, 2500));
      }
      if (!cancelled) {
        setPayNote({ kind: 'wait', text: 'Payment is still being confirmed. If money was debited this activates on its own shortly.' });
        clear();
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetchAccounts(true);
    // Poll so the cards reflect live floating P&L + DD as trades move — every
    // 5s, and not at all while the tab is in the background. Opens and closes
    // already arrive instantly over the socket listener below.
    pollingRef.current = setInterval(() => { if (!document.hidden) fetchAccounts(false); }, 5000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // Live Socket.IO push updates — merge by account _id so we don't wait for
  // the poll to show the latest equity after a trade opens/closes.
  useEffect(() => {
    const socket = socketService.getSocket && socketService.getSocket();
    if (!socket) return;
    const handler = (payload) => {
      if (!payload?.account) return;
      setAccounts(prev => prev.map(a => {
        if (String(a._id) !== String(payload.account._id || payload.challengeAccountId)) return a;
        const merged = { ...a, ...payload.account };
        return merged;
      }));
    };
    socket.on('challengeAccountUpdate', handler);
    return () => { socket.off('challengeAccountUpdate', handler); };
  }, []);

  const fetchAccounts = async (showSpinner) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/prop/my-accounts`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) setAccounts(data.accounts);
    } catch (err) {
      console.error('Error loading accounts:', err);
    }
    if (showSpinner) setLoading(false);
  };

  const q = query.trim().toLowerCase();
  const filtered = accounts
    .filter(a => filter === 'ALL' || a.status === filter)
    .filter(a => !q || `${a.accountId || ''} ${a.challengeId?.name || ''}`.toLowerCase().includes(q))
    .sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return sortBy === 'oldest' ? ta - tb : tb - ta;
    });

  const statCounts = {
    ALL: accounts.length,
    PENDING: accounts.filter(a => a.status === 'PENDING').length,
    ACTIVE: accounts.filter(a => a.status === 'ACTIVE').length,
    PASSED: accounts.filter(a => a.status === 'PASSED').length,
    FAILED: accounts.filter(a => a.status === 'FAILED').length,
    FUNDED: accounts.filter(a => a.status === 'FUNDED').length
  };

  if (loading) {
    const shimmer = {
      background: 'linear-gradient(90deg, var(--bg-secondary) 0%, var(--bg-tertiary, var(--bg-primary)) 50%, var(--bg-secondary) 100%)',
      backgroundSize: '200% 100%',
      animation: 'pf-shimmer 1.2s ease-in-out infinite',
      borderRadius: '10px'
    };
    return (
      <div style={{ padding: '20px', maxWidth: 960, margin: '0 auto' }}>
        <style>{`@keyframes pf-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
        <div style={{ ...shimmer, height: 32, width: 200, marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {[1,2,3,4,5].map(i => <div key={i} style={{ ...shimmer, height: 34, width: 92 }} />)}
        </div>
        {[1,2,3].map(i => <div key={i} style={{ ...shimmer, height: 180, marginBottom: 12 }} />)}
      </div>
    );
  }

  return (
    <div className="mc-root">
    <div className="mc-inner">

      <div className="mc-head">
        <div className="mc-head-left">
          <span className="mc-chip mc-head-chip"><LuTrophy size={19} /></span>
          <div>
            <h1>My Challenges</h1>
            <p>Track, manage and continue your trading challenges</p>
          </div>
        </div>
        <button className="mc-btn-primary" onClick={() => navigate('/app/challenges')}>
          <LuPlus size={15} /> Buy New Challenge
        </button>
      </div>

      {payNote && (
        <div
          className="mc-card"
          style={{
            padding: '12px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600,
            borderColor: payNote.kind === 'ok' ? '#9FE3C4' : payNote.kind === 'err' ? '#F3BDBD' : '#CBDEFA',
            background: payNote.kind === 'ok' ? '#EAF9F1' : payNote.kind === 'err' ? '#FDEDED' : '#EEF4FF',
            color: payNote.kind === 'ok' ? '#06734C' : payNote.kind === 'err' ? '#B42318' : '#123C87',
          }}
        >
          {payNote.text}
        </div>
      )}

      <div className="mc-card mc-filters">
        {BUCKETS.map(b => {
          const Icon = b.icon;
          const active = filter === b.key;
          return (
            <button
              key={b.key}
              className={`mc-pill${active ? ' is-active' : ''}`}
              onClick={() => setFilter(b.key)}
            >
              <span className="mc-chip mc-pill-chip" style={{ background: b.tint, color: b.fg }}>
                <Icon size={15} />
              </span>
              <span>
                <span className="mc-pill-label">{b.label}</span>
                <span className="mc-pill-sub">{b.sub}</span>
              </span>
              <span className="mc-pill-count">{statCounts[b.key] || 0}</span>
            </button>
          );
        })}
      </div>

      <div className="mc-stats">
        {BUCKETS.map(b => {
          const Icon = b.icon;
          const count = statCounts[b.key] || 0;
          const sub = b.key === 'PASSED'
            ? `Success rate: ${accounts.length ? Math.round((count / accounts.length) * 100) : 0}%`
            : b.statSub;
          return (
            <div key={b.key} className="mc-stat" style={{ background: b.tint, borderColor: `${b.fg}1F` }}>
              <span className="mc-chip mc-stat-chip" style={{ background: '#ffffffcc', color: b.fg }}>
                <Icon size={15} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="mc-stat-label" style={{ color: b.fg }}>{b.short}</div>
                <div className="mc-stat-value">{count}</div>
                <div className="mc-stat-sub">{sub}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mc-toolbar">
        <div className="mc-search">
          <LuSearch size={15} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search your challenges..."
            aria-label="Search your challenges"
          />
        </div>
        <div className="mc-toolbar-right">
          <span className="mc-sort-label">Sort by:</span>
          <div className="mc-sort">
            <LuArrowUpDown size={14} />
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort challenges">
              <option value="latest">Latest First</option>
              <option value="oldest">Oldest First</option>
            </select>
            <LuChevronDown size={15} />
          </div>
          <button
            className={`mc-view${view === 'grid' ? ' is-active' : ''}`}
            onClick={() => setView('grid')}
            aria-label="Grid view"
          >
            <LuLayoutGrid size={16} />
          </button>
          <button
            className={`mc-view${view === 'list' ? ' is-active' : ''}`}
            onClick={() => setView('list')}
            aria-label="List view"
          >
            <LuList size={16} />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mc-card mc-empty">
          <EmptyArt />
          <h3>
            {accounts.length === 0
              ? "You haven't purchased any challenges yet."
              : 'No challenges match this filter.'}
          </h3>
          <p>
            {accounts.length === 0
              ? 'Start your trading journey today and prove your skills with our funded challenges.'
              : 'Try a different status, or clear the search box.'}
          </p>
          {accounts.length === 0 && (
            <div className="mc-empty-actions">
              <button className="mc-btn-primary" onClick={() => navigate('/app/challenges')}>
                <LuShoppingCart size={15} /> Browse Challenges
              </button>
              <button className="mc-btn-ghost" onClick={() => navigate('/how-it-works')}>
                <LuInfo size={15} /> Learn More
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={`mc-list${view === 'grid' ? ' is-grid' : ''}`} style={{ gap: '12px' }}>
          {filtered.map(acc => {
            const ch = acc.challengeId || {};
            const sc = statusConfig[acc.status] || statusConfig.ACTIVE;
            const remainMs = new Date(acc.expiresAt) - new Date();
            const remainDays = Math.max(0, Math.ceil(remainMs / (1000 * 60 * 60 * 24)));

            const balance = Number(acc.walletBalance ?? acc.currentBalance ?? 0);
            const liveEquity = Number(acc.liveEquity ?? acc.walletEquity ?? acc.currentEquity ?? balance);
            const floatingPnl = Number(acc.floatingPnl ?? (liveEquity - balance));
            const totalPnl = Number(acc.totalPnl ?? (liveEquity - Number(acc.initialBalance || 0)));
            const totalPnlPct = acc.initialBalance > 0 ? (totalPnl / acc.initialBalance) * 100 : 0;
            const openCount = Number(acc.openCount ?? (Array.isArray(acc.openPositions) ? acc.openPositions.length : 0));

            const targetPct = ch?.stepsCount === 0
              ? Number(ch?.rules?.profitTargetInstantPercent || 0)
              : acc.currentPhase === 1
                ? Number(ch?.rules?.profitTargetPhase1Percent || 0)
                : Number(ch?.rules?.profitTargetPhase2Percent || 0);
            // Use the backend's CAPPED profit % (one-day-profit cap applied) so the
            // bar matches the Objectives panel / pass engine. The raw stored
            // currentProfitPercent is uncapped and can be stale — a single big day
            // would otherwise show the bar "100% achieved" when it isn't.
            const profitPct = Number(acc.cappedProfitPercent ?? acc.currentProfitPercent ?? 0);
            const targetProgress = targetPct > 0 ? Math.max(0, Math.min(100, (profitPct / targetPct) * 100)) : 0;

            // DD bars use the backend's FRESH current-loss % (0 when in profit),
            // matching the Objectives panel — not the stale stored watermark
            // fields, which showed a non-zero bar even at −₹0 (0% of limit).
            const maxDailyDD = Number(ch?.rules?.maxDailyDrawdownPercent || 5);
            const dailyDD = Number(acc.dailyDDPercent ?? acc.currentDailyDrawdownPercent ?? 0);
            const dailyDDUsage = maxDailyDD > 0 ? Math.min(100, (dailyDD / maxDailyDD) * 100) : 0;
            const maxOverallDD = Number(ch?.rules?.maxOverallDrawdownPercent || 10);
            const overallDD = Number(acc.overallDDPercent ?? acc.currentOverallDrawdownPercent ?? 0);
            const overallDDUsage = maxOverallDD > 0 ? Math.min(100, (overallDD / maxOverallDD) * 100) : 0;

            const pnlColor = totalPnl >= 0 ? '#10b981' : '#ef4444';

            return (
              <div
                key={acc._id}
                onClick={() => navigate(`/app/challenge/${acc._id}`)}
                style={{
                  padding: '16px 20px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  border: `1px solid ${floatingPnl !== 0 ? (floatingPnl > 0 ? '#10b98144' : '#ef444444') : 'var(--border-color)'}`,
                  cursor: 'pointer',
                  transition: 'border-color 0.25s, box-shadow 0.25s',
                  boxShadow: floatingPnl !== 0 ? `0 0 0 1px ${floatingPnl > 0 ? '#10b98122' : '#ef444422'}` : 'none'
                }}
              >
                {/* Top Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)', background: 'var(--bg-tertiary, var(--bg-primary))', padding: '2px 8px', borderRadius: '4px' }}>{acc.accountId}</span>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '15px' }}>{ch.name || 'Challenge'}</span>
                    {openCount > 0 && (
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: 'rgba(0,51,102,0.10)', color: 'var(--accent-primary)' }}>
                        {openCount} OPEN
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* One-time reset, same rule as the server's reset-info:
                        resetCount >= 1 means it has been used. Opens the
                        challenge page with the reset popup already up. */}
                    {acc.status === 'FAILED' && !((Number(acc.resetCount) || 0) >= 1) && (
                      <button
                        type="button"
                        className="pf-reset-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/app/challenge/${acc._id}?reset=1`);
                        }}
                        style={{ padding: '5px 14px', borderRadius: 999, fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                      >
                        <LuRotateCw size={13} style={{ verticalAlign: '-2px' }} /> Reset
                      </button>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: sc.bg, color: sc.color }}>
                      <sc.Icon size={13} /> {sc.label}
                    </span>
                  </div>
                </div>

                {/* Stats Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>Balance</div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>{formatINR(balance)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>Equity (live)</div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: floatingPnl > 0 ? '#10b981' : floatingPnl < 0 ? '#ef4444' : 'var(--text-primary)' }}>
                      {formatINR(liveEquity)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>Floating P&L</div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: floatingPnl >= 0 ? '#10b981' : '#ef4444' }}>
                      {floatingPnl >= 0 ? '+' : ''}{formatINR(floatingPnl)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>Total P&L</div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: pnlColor }}>
                      {totalPnl >= 0 ? '+' : ''}{formatINR(totalPnl)} ({totalPnlPct.toFixed(2)}%)
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>Phase</div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
                      {acc.accountType === 'FUNDED'
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><LuWallet size={14} /> Funded</span>
                        : `${acc.currentPhase}/${acc.totalPhases}`}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>Positions</div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>{acc.totalTrades || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                      {acc.status === 'FUNDED' ? 'Profit Split' : 'Remaining'}
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: acc.status === 'FUNDED' ? '#f59e0b' : remainDays < 7 ? '#ef4444' : 'var(--text-primary)' }}>
                      {acc.status === 'FUNDED' ? `${acc.profitSplitPercent || 80}%` : `${remainDays}d`}
                    </div>
                  </div>
                </div>

                {/* Profit target progress */}
                {acc.status === 'ACTIVE' && targetPct > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>Target Progress ({profitPct.toFixed(2)}% / {targetPct}%)</span>
                      <span>{targetProgress.toFixed(0)}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-tertiary, var(--bg-primary))', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${targetProgress}%`,
                        background: targetProgress >= 100 ? '#10b981' : 'linear-gradient(90deg, var(--accent-primary), #10b981)',
                        transition: 'width 0.5s'
                      }} />
                    </div>
                  </div>
                )}

                {/* DD bars */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>Daily DD ({dailyDD.toFixed(2)}% / {maxDailyDD}%)</span>
                      <span>{dailyDDUsage.toFixed(0)}%</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--bg-tertiary, var(--bg-primary))', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${dailyDDUsage}%`,
                        background: dailyDDUsage > 80 ? '#ef4444' : dailyDDUsage > 50 ? '#f59e0b' : '#10b981',
                        transition: 'width 0.5s'
                      }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>Overall DD ({overallDD.toFixed(2)}% / {maxOverallDD}%)</span>
                      <span>{overallDDUsage.toFixed(0)}%</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--bg-tertiary, var(--bg-primary))', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${overallDDUsage}%`,
                        background: overallDDUsage > 80 ? '#ef4444' : overallDDUsage > 50 ? '#f59e0b' : '#10b981',
                        transition: 'width 0.5s'
                      }} />
                    </div>
                  </div>
                </div>

                {/* Fail reason */}
                {acc.status === 'FAILED' && acc.failReason && (
                  <div style={{ marginTop: '10px', padding: '8px 12px', background: '#ef444410', borderRadius: '8px', fontSize: '12px', color: '#ef4444' }}>
                    Reason: {acc.failReason}
                  </div>
                )}

                {/* Start Practicing button — set active challenge context before navigating */}
                {(acc.status === 'ACTIVE' || acc.status === 'FUNDED') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveChallengeAccountId?.(acc._id);
                      navigate('/app/market');
                    }}
                    style={{
                      marginTop: '8px', padding: '8px 20px', borderRadius: '8px', border: 'none',
                      cursor: 'pointer', fontWeight: '600', fontSize: '12px', color: '#fff',
                      background: 'var(--gold-grad)',
                    }}
                  >
                    Start Practicing
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}

export default MyChallengesPage;
