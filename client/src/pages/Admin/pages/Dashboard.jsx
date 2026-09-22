import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  LuUsers, LuBanknote, LuShoppingCart, LuClock, LuHourglass, LuRefreshCw
} from 'react-icons/lu';

// Auto-shrink stat value: full font at <=10 chars, scales down for longer text
function StatValue({ children, style, title }) {
  const text = String(children ?? '');
  const len = text.length;
  let fontSize = 22;
  if (len > 16) fontSize = 13;
  else if (len > 14) fontSize = 14;
  else if (len > 12) fontSize = 16;
  else if (len > 10) fontSize = 18;
  return <div className="fund-stat-card__value" style={{ fontSize, ...style }} title={title}>{text}</div>;
}

function Dashboard() {
  const { API_URL } = useOutletContext();
  const navigate = useNavigate();

  // INR formatter (all prop money is INR)
  const formatCurrency = (value) => {
    const numValue = Number(value || 0);
    return `₹${numValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Compact ₹ for the stat tiles so big amounts never get truncated in the
  // narrow 2-up mobile cards (e.g. ₹5,69,835.40 → ₹5.70 L). The card's title
  // attribute keeps the exact figure on hover, and the detail page shows full.
  const formatCompact = (value) => {
    const n = Number(value || 0);
    const sign = n < 0 ? '-' : '';
    const a = Math.abs(n);
    if (a >= 1_00_00_000) return `${sign}₹${(a / 1_00_00_000).toFixed(2)} Cr`;
    if (a >= 1_00_000) return `${sign}₹${(a / 1_00_000).toFixed(2)} L`;
    if (a >= 1_000) return `${sign}₹${(a / 1_000).toFixed(2)} K`;
    return `${sign}₹${a.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  };

  const [statsLoading, setStatsLoading] = useState(false);
  const [dashboardStats, setDashboardStats] = useState({
    totalUsers: 0,
    // Money in: evaluation fees, paid resets and AI subscriptions
    totalRevenue: 0,
    totalChallengeBuys: 0,
    challengeBuyCount: 0,
    totalResets: 0,
    resetCount: 0,
    totalAiSubs: 0,
    aiSubCount: 0,
    // Queues waiting on the admin
    pendingChallengeBuys: 0,
    pendingResets: 0
  });
  const [recentTrades, setRecentTrades] = useState([]);

  const fetchDashboardStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/stats`);
      const data = await res.json();
      if (data.success) {
        setDashboardStats(data.stats);
        setRecentTrades(data.recentTrades || []);
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Purchase-intent leads — people who tapped "Pay via UPI" (buying intent).
  const [intents, setIntents] = useState([]);
  const [intentPending, setIntentPending] = useState(0);
  const fetchIntents = async () => {
    try {
      const token = localStorage.getItem('dhanfunded-admin-token');
      const res = await fetch(`${API_URL}/api/prop/admin/purchase-intents?limit=200`, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) { setIntents(data.rows || []); setIntentPending(data.pending || 0); }
    } catch (_) { /* ignore */ }
  };

  useEffect(() => {
    fetchDashboardStats();
    fetchIntents();
    const id = setInterval(fetchIntents, 30000);
    return () => clearInterval(id);
  }, []);

  if (statsLoading) {
    return <div className="loading-spinner">Loading dashboard...</div>;
  }

  return (
    <div className="admin-dashboard">
      {/* Row 1 — the headline numbers and what is waiting for approval */}
      <div className="fund-stats-row">
        <div className="fund-stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/users')}>
          <div className="fund-stat-card__top">
            <div className="fund-stat-card__icon" style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.35)', color: '#60a5fa' }}><LuUsers size={18} /></div>
            <div className="fund-stat-card__meta">
              <div className="fund-stat-card__label">Total Users</div>
              <StatValue>{Number(dashboardStats.totalUsers || 0).toLocaleString()}</StatValue>
            </div>
          </div>
        </div>

        <div className="fund-stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/reports')}>
          <div className="fund-stat-card__top">
            <div className="fund-stat-card__icon" style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.35)', color: '#4ade80' }}><LuBanknote size={18} /></div>
            <div className="fund-stat-card__meta">
              <div className="fund-stat-card__label">Total Revenue</div>
              <StatValue title={formatCurrency(dashboardStats.totalRevenue)}>{formatCompact(dashboardStats.totalRevenue)}</StatValue>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>buys + resets + AI subscriptions</div>
        </div>

        <div className="fund-stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/funds')}>
          <div className="fund-stat-card__top">
            <div className="fund-stat-card__icon" style={{ background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.35)', color: '#fbbf24' }}><LuClock size={18} /></div>
            <div className="fund-stat-card__meta">
              <div className="fund-stat-card__label">Challenge Requests</div>
              <StatValue>{dashboardStats.pendingChallengeBuys}</StatValue>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>waiting for approval</div>
        </div>

        <div className="fund-stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/funds/challenge-resets')}>
          <div className="fund-stat-card__top">
            <div className="fund-stat-card__icon" style={{ background: 'rgba(251, 146, 60, 0.15)', border: '1px solid rgba(251, 146, 60, 0.35)', color: '#fb923c' }}><LuHourglass size={18} /></div>
            <div className="fund-stat-card__meta">
              <div className="fund-stat-card__label">Reset Requests</div>
              <StatValue>{dashboardStats.pendingResets}</StatValue>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>waiting for approval</div>
        </div>
      </div>

      {/* Row 2 — where the revenue came from */}
      <div className="fund-stats-row">
        <div className="fund-stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/funds/challenge-buys')}>
          <div className="fund-stat-card__top">
            <div className="fund-stat-card__icon" style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.35)', color: '#4ade80' }}><LuShoppingCart size={18} /></div>
            <div className="fund-stat-card__meta">
              <div className="fund-stat-card__label">Total Challenge Buys</div>
              <StatValue title={formatCurrency(dashboardStats.totalChallengeBuys)}>{formatCompact(dashboardStats.totalChallengeBuys)}</StatValue>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>{dashboardStats.challengeBuyCount} purchases</div>
        </div>

        <div className="fund-stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/funds/challenge-resets')}>
          <div className="fund-stat-card__top">
            <div className="fund-stat-card__icon" style={{ background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.35)', color: '#c084fc' }}><LuRefreshCw size={18} /></div>
            <div className="fund-stat-card__meta">
              <div className="fund-stat-card__label">Total Resets</div>
              <StatValue title={formatCurrency(dashboardStats.totalResets)}>{formatCompact(dashboardStats.totalResets)}</StatValue>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>{dashboardStats.resetCount} approved resets</div>
        </div>
      </div>

      <div className="dashboard-charts">
        <div className="chart-card">
          <h3>Quick Stats</h3>
          <div style={{ padding: '20px' }}>
            <p><strong>Total Revenue:</strong> {formatCurrency(dashboardStats.totalRevenue)}</p>
            <p><strong>Challenge buys:</strong> {formatCurrency(dashboardStats.totalChallengeBuys)} ({dashboardStats.challengeBuyCount})</p>
            <p><strong>Challenge resets:</strong> {formatCurrency(dashboardStats.totalResets)} ({dashboardStats.resetCount})</p>
            <p><strong>AI subscriptions:</strong> {formatCurrency(dashboardStats.totalAiSubs)} ({dashboardStats.aiSubCount})</p>
            <p><strong>Pending approvals:</strong> {dashboardStats.pendingChallengeBuys + dashboardStats.pendingResets}</p>
          </div>
        </div>
        <div className="chart-card">
          <h3>Recent Positions</h3>
          {recentTrades.length === 0 ? (
            <p style={{ padding: '20px', color: '#888' }}>No positions yet</p>
          ) : (
            <div style={{ maxHeight: '200px', overflow: 'auto' }}>
              <table className="admin-table" style={{ fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Volume</th>
                    <th>P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.slice(0, 5).map((trade, idx) => (
                    <tr key={idx}>
                      <td>{trade.symbol}</td>
                      <td className={trade.side === 'buy' ? 'text-green' : 'text-red'}>{trade.side?.toUpperCase()}</td>
                      <td>{trade.volume}</td>
                      <td className={trade.profit >= 0 ? 'text-green' : 'text-red'}>
                        {trade.profit >= 0 ? '+' : ''}{formatCurrency(Math.abs(trade.profit || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Purchase Intent / Leads — people who tapped "Pay via UPI" (buying intent).
          Team calls these to follow up, especially the ones who didn't complete. */}
      <div className="dashboard-tables">
        <div className="table-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>💳 Purchase Intent — Follow-up Leads</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(245,158,11,0.15)', color: '#d97706' }}>
                {intentPending} not purchased
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{intents.length} total</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Users who tapped “Pay via UPI”. Call the ones marked <b style={{ color: '#d97706' }}>Not purchased</b> to find out why they dropped off.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Account Type</th>
                  <th>Fund / Fee</th>
                  <th>Taps</th>
                  <th>Last Tried</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {intents.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', color: '#888' }}>No purchase intents yet</td></tr>
                ) : (
                  intents.map((it, idx) => {
                    const d = new Date(it.lastClickedAt || it.createdAt);
                    return (
                      <tr key={it._id || idx} style={!it.purchased ? { background: 'rgba(245,158,11,0.05)' } : undefined}>
                        <td style={{ fontWeight: 600 }}>{it.userName || '—'}</td>
                        <td>
                          {it.phone
                            ? <a href={`tel:${it.phone}`} style={{ color: '#2563eb', textDecoration: 'none' }}>📞 {it.phone}</a>
                            : <span style={{ color: '#aaa' }}>no phone</span>}
                        </td>
                        <td>{it.accountType || '—'}{it.challengeName ? <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{it.challengeName}</div> : null}</td>
                        <td>
                          <div>₹{Number(it.fundSize || 0).toLocaleString('en-IN')}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>fee ₹{Number(it.fee || 0).toLocaleString('en-IN')}</div>
                        </td>
                        <td style={{ textAlign: 'center' }}>{it.clickCount || 1}</td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{d.toLocaleDateString()}<div style={{ color: 'var(--text-secondary)' }}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></td>
                        <td>
                          {it.purchased
                            ? <span className="status-badge active">Purchased ✓</span>
                            : <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: 'rgba(245,158,11,0.15)', color: '#d97706' }}>Not purchased</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}

export default Dashboard;
