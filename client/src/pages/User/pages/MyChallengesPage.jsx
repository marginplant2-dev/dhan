import { useState, useEffect, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import socketService from '../../../services/socketService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authData.token || ''}`
  };
}

const statusConfig = {
  PENDING:   { color: '#f59e0b', bg: '#f59e0b20', label: 'Awaiting Approval', icon: '⏳' },
  ACTIVE:    { color: '#3b82f6', bg: '#3b82f620', label: 'Active',  icon: '🔵' },
  PASSED:    { color: '#10b981', bg: '#10b98120', label: 'Passed',  icon: '✅' },
  FAILED:    { color: '#ef4444', bg: '#ef444420', label: 'Failed',  icon: '❌' },
  FUNDED:    { color: '#f59e0b', bg: '#f59e0b20', label: 'Funded',  icon: '💰' },
  EXPIRED:   { color: '#6b7280', bg: '#6b728020', label: 'Expired', icon: '⏰' },
  CANCELLED: { color: '#ef4444', bg: '#ef444420', label: 'Payment Rejected', icon: '🚫' }
};

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
  const pollingRef = useRef(null);

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

  const filtered = filter === 'ALL' ? accounts : accounts.filter(a => a.status === filter);

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
    <div className="pf-my-challenges-root" style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      <style>{`
        @media (max-width: 768px) {
          .pf-my-challenges-root { background: var(--bg-primary); }
          .pf-my-challenges-root .pf-mc-inner { padding: 12px 12px 16px !important; }

          /* Header — title + "Buy New Challenge" must stay on one line.
             Shrink both so the button sits beside the heading instead of
             wrapping underneath. */
          .pf-my-challenges-root .pf-mc-header {
            flex-wrap: nowrap !important;
            margin-bottom: 10px !important;
            gap: 8px !important;
          }
          .pf-my-challenges-root .pf-mc-header h2 {
            font-size: 16px !important;
            white-space: nowrap;
          }
          .pf-my-challenges-root .pf-mc-header > button {
            padding: 6px 12px !important;
            font-size: 11px !important;
            white-space: nowrap;
            flex-shrink: 0;
          }

          /* Filter pills — all 5 on one horizontally-scrollable line. */
          .pf-my-challenges-root .pf-mc-filters {
            flex-wrap: nowrap !important;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            gap: 6px !important;
            margin-bottom: 12px !important;
            padding-bottom: 2px;
          }
          .pf-my-challenges-root .pf-mc-filters::-webkit-scrollbar {
            display: none;
          }
          .pf-my-challenges-root .pf-mc-filters button {
            padding: 5px 10px !important;
            font-size: 11px !important;
            white-space: nowrap;
            flex-shrink: 0;
          }

          /* Challenge card — tighter padding, smaller stat typography so
             the whole card takes less vertical space. */
          .pf-my-challenges-root .pf-mc-list > div {
            padding: 12px 14px !important;
            border-radius: 12px !important;
          }
          .pf-my-challenges-root .pf-mc-list > div > div:first-child {
            margin-bottom: 8px !important;
          }
          /* Stats grid: pack 2 per row with smaller values. */
          .pf-my-challenges-root .pf-mc-list > div > div:nth-child(2) {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
            margin-bottom: 10px !important;
          }
          .pf-my-challenges-root .pf-mc-list > div > div:nth-child(2) > div > div:first-child {
            font-size: 10px !important;
          }
          .pf-my-challenges-root .pf-mc-list > div > div:nth-child(2) > div > div:last-child {
            font-size: 13px !important;
          }
          .pf-my-challenges-root .pf-mc-list > div button {
            padding: 8px 16px !important;
            font-size: 12px !important;
            margin-top: 6px !important;
          }
        }
      `}</style>
    <div className="pf-mc-inner" style={{ padding: '24px 28px 60px' }}>
      {/* Header */}
      <div className="pf-mc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '20px', fontWeight: '700' }}>📊 My Challenges</h2>
        <button
          onClick={() => navigate('/app/challenges')}
          style={{
            padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            background: 'var(--gold-grad)', color: 'var(--on-gold)', fontWeight: '600', fontSize: '13px'
          }}
        >
          + Buy New Challenge
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="pf-mc-filters" style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['ALL', 'PENDING', 'ACTIVE', 'FUNDED', 'PASSED', 'FAILED'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: '600',
              background: filter === f ? (f === 'ALL' ? 'var(--gold)' : statusConfig[f]?.color || 'var(--gold)') : 'var(--bg-secondary)',
              color: filter === f ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {f === 'ALL' ? 'All' : statusConfig[f]?.label || f} ({statCounts[f] || 0})
          </button>
        ))}
      </div>

      {/* Accounts List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
          <p>{accounts.length === 0 ? 'You haven\'t purchased any challenges yet.' : 'No accounts match this filter.'}</p>
          {accounts.length === 0 && (
            <button
              onClick={() => navigate('/app/challenges')}
              style={{ marginTop: '12px', padding: '10px 24px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--gold)', color: 'var(--on-gold)', fontWeight: '600' }}
            >
              Browse Challenges
            </button>
          )}
        </div>
      ) : (
        <div className="pf-mc-list" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                        🔄 Reset
                      </button>
                    )}
                    <span style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: sc.bg, color: sc.color }}>
                      {sc.icon} {sc.label}
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
                      {acc.accountType === 'FUNDED' ? '💰 Funded' : `${acc.currentPhase}/${acc.totalPhases}`}
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
                    📈 Start Practicing
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
