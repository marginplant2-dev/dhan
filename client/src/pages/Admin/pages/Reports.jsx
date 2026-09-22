import { useState, useEffect } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';

function Reports() {
  const { API_URL, formatAdminCurrency, formatAdminCurrencyCompact } = useOutletContext();
  const location = useLocation();

  /** Report API amounts are treated as USD (wallet, commissions, aggregates); display follows admin header toggle. */
  const fmt = (usd) => formatAdminCurrency(usd);
  const fmtSigned = (usd) => {
    const n = Number(usd || 0);
    return `${n < 0 ? '-' : ''}${formatAdminCurrency(Math.abs(n))}`;
  };
  // Compact display for KPI cards. Falls back to the full formatter if compact helper isn't available.
  const fmtC = (usd) => (formatAdminCurrencyCompact ? formatAdminCurrencyCompact(usd) : formatAdminCurrency(usd));
  const fmtCSigned = (usd) => {
    const n = Number(usd || 0);
    return fmtC(n);
  };
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [activeQuickRange, setActiveQuickRange] = useState('all'); // 7 | 30 | 90 | 'all' | null(custom)
  const [expandedUser, setExpandedUser] = useState(null); // userId currently expanded
  const [userTrades, setUserTrades] = useState([]); // trades for expanded user
  const [loadingTrades, setLoadingTrades] = useState(false);

  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('/users')) return 'user-reports';
    if (path.includes('/trades')) return 'trade-reports';
    if (path.includes('/commissions')) return 'commission-reports';
    if (path.includes('/brokers')) return 'broker-reports';
    if (path.includes('/subadmins')) return 'subadmin-reports';
    return 'financial-reports';
  };

  const activeTab = getActiveTab();

  const getTabTitle = () => {
    const titles = {
      'financial-reports': 'Financial Reports',
      'user-reports': 'User Reports',
      'trade-reports': 'Position Reports',
      'commission-reports': 'Commission Reports',
      'broker-reports': 'Broker Analytics',
      'subadmin-reports': 'Sub-Admin Analytics'
    };
    return titles[activeTab] || 'Reports';
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateRange.from) params.set('from', dateRange.from);
      if (dateRange.to) params.set('to', dateRange.to);
      const tabToEndpoint = {
        'financial-reports': 'financial-reports',
        'user-reports': 'user-reports',
        'trade-reports': 'trade-reports',
        'commission-reports': 'commission-reports',
        'broker-reports': 'broker-reports',
        'subadmin-reports': 'subadmin-reports'
      };
      const endpoint = tabToEndpoint[activeTab] || activeTab;
      const res = await fetch(`${API_URL}/api/admin/reports/${endpoint}?${params}`);
      const data = await res.json();
      if (data.success) {
        setReportData(data.report);
      }
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserTrades = async (userId) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      setUserTrades([]);
      return;
    }
    setExpandedUser(userId);
    setLoadingTrades(true);
    try {
      const params = new URLSearchParams();
      if (dateRange.from) params.set('from', dateRange.from);
      if (dateRange.to) params.set('to', dateRange.to);
      const res = await fetch(`${API_URL}/api/admin/reports/user-commission-trades/${userId}?${params}`);
      const data = await res.json();
      if (data.success) setUserTrades(data.trades);
      else setUserTrades([]);
    } catch {
      setUserTrades([]);
    } finally {
      setLoadingTrades(false);
    }
  };

  // Auto-fetch whenever the tab or date range changes — no more "Apply Filter" click.
  useEffect(() => {
    fetchReport();
    setExpandedUser(null);
    setUserTrades([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dateRange.from, dateRange.to]);

  const setQuickRange = (days) => {
    setActiveQuickRange(days);
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setDateRange({
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0]
    });
  };

  const setAllTime = () => {
    setActiveQuickRange('all');
    setDateRange({ from: '', to: '' });
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>{getTabTitle()}</h2>
        <button className="admin-btn primary" onClick={fetchReport}>🔄 Refresh Report</button>
      </div>

      {/* Date Filters */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 16,
          marginBottom: 24,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
        }}
      >
        {/* Custom date range */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>From</label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => { setActiveQuickRange(null); setDateRange(prev => ({ ...prev, from: e.target.value })); }}
              className="admin-input"
              style={{ padding: '8px 12px', minWidth: 150 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>To</label>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => { setActiveQuickRange(null); setDateRange(prev => ({ ...prev, to: e.target.value })); }}
              className="admin-input"
              style={{ padding: '8px 12px', minWidth: 150 }}
            />
          </div>
        </div>

        {/* Quick range segmented control */}
        <div
          style={{
            display: 'inline-flex',
            padding: 4,
            gap: 4,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
          }}
        >
          {[
            { key: 7, label: '7 Days' },
            { key: 30, label: '30 Days' },
            { key: 90, label: '90 Days' },
            { key: 'all', label: 'All Time' },
          ].map((opt) => {
            const isActive = activeQuickRange === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => (opt.key === 'all' ? setAllTime() : setQuickRange(opt.key))}
                style={{
                  padding: '8px 14px',
                  border: 'none',
                  borderRadius: 7,
                  background: isActive ? 'var(--accent-primary, #3b82f6)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease, color 0.15s ease',
                  fontFamily: 'inherit',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="admin-loading">Generating report...</div>
      ) : (
        <>
          {/* Financial Reports — prop-only model */}
          {activeTab === 'financial-reports' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Challenge Buys</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#10b981', margin: '12px 0 8px' }}>{fmtC(reportData?.totalChallengeBuys)}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Approved evaluation fees</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>No. of Challenge Buys</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, color: '#3b82f6', margin: '12px 0 8px' }}>{reportData?.challengeBuyCount || 0}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Approved purchases</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Challenge Resets</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#10b981', margin: '12px 0 8px' }}>{fmtC(reportData?.totalResets)}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{reportData?.resetCount || 0} approved resets</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>AI Subscriptions</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#10b981', margin: '12px 0 8px' }}>{fmtC(reportData?.totalAiSubs)}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{reportData?.aiSubCount || 0} approved subscriptions</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Payouts</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#ef4444', margin: '12px 0 8px' }}>{fmtC(reportData?.totalPayouts)}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{reportData?.payoutCount || 0} funded withdrawals</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Net Revenue</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: (reportData?.netRevenue || 0) >= 0 ? '#10b981' : '#ef4444', margin: '12px 0 8px' }}>
                    {fmtCSigned(reportData?.netRevenue)}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Buys + Resets + AI − Payouts</p>
                </div>
              </div>

              {/* Account status snapshot */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Active Accounts</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6', margin: '8px 0 0' }}>{reportData?.activeAccounts || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Funded Accounts</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b', margin: '8px 0 0' }}>{reportData?.fundedAccounts || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Passed Accounts</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: '#10b981', margin: '8px 0 0' }}>{reportData?.passedAccounts || 0}</p>
                </div>
              </div>
            </>
          )}

          {/* User Reports — per-user prop activity breakdown */}
          {activeTab === 'user-reports' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Users</p>
                  <p style={{ fontSize: 26, fontWeight: 700, color: '#3b82f6', margin: '12px 0 0' }}>{reportData?.totalUsers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>New Users (Period)</p>
                  <p style={{ fontSize: 26, fontWeight: 700, color: '#f59e0b', margin: '12px 0 0' }}>{reportData?.newUsers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Active Buyers</p>
                  <p style={{ fontSize: 26, fontWeight: 700, color: '#10b981', margin: '12px 0 0' }}>{(reportData?.userRows || []).filter(u => u.challengeBuyCount > 0).length}</p>
                </div>
              </div>

              {/* Per-user prop activity */}
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
                <h4 style={{ marginTop: 0, marginBottom: 16 }}>User Activity (Prop Evaluation)</h4>
                {(reportData?.userRows || []).length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>No prop activity in selected period.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table" style={{ minWidth: 900 }}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>User</th>
                          <th>Order ID</th>
                          <th>Challenge Buys</th>
                          <th>Buy Amount</th>
                          <th>Payouts</th>
                          <th>Payout Amount</th>
                          <th>Net Spent</th>
                          <th>Active</th>
                          <th>Funded</th>
                          <th>Passed</th>
                          <th>Failed</th>
                          <th>Pending</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.userRows.map((u, idx) => (
                          <tr key={u._id || idx}>
                            <td>{idx + 1}</td>
                            <td>
                              <strong>{u.name || '—'}</strong>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{u.email}</div>
                            </td>
                            <td><code style={{ fontSize: 11 }}>{u.oderId}</code></td>
                            <td>{u.challengeBuyCount}</td>
                            <td style={{ color: '#10b981', fontWeight: 600 }}>{fmt(u.challengeBuyAmount)}</td>
                            <td>{u.payoutCount}</td>
                            <td style={{ color: '#ef4444', fontWeight: 600 }}>{fmt(u.payoutAmount)}</td>
                            <td style={{ color: u.netSpent >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{fmtSigned(u.netSpent)}</td>
                            <td><span className="badge badge-info">{u.accountsActive}</span></td>
                            <td><span className="badge badge-success">{u.accountsFunded}</span></td>
                            <td><span className="badge badge-success">{u.accountsPassed}</span></td>
                            <td><span className="badge badge-danger">{u.accountsFailed}</span></td>
                            <td><span className="badge badge-warning">{u.accountsPending}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Position Reports */}
          {activeTab === 'trade-reports' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Positions</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#3b82f6', margin: '12px 0 0' }}>{reportData?.totalTrades || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Open Positions</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#f59e0b', margin: '12px 0 0' }}>{reportData?.openTrades || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Closed Positions</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#8b5cf6', margin: '12px 0 0' }}>{reportData?.closedTrades || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Volume</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#3b82f6', margin: '12px 0 0' }}>{(reportData?.totalVolume || 0).toFixed(2)} lots</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Winning Positions</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#10b981', margin: '12px 0 0' }}>{reportData?.winningTrades || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Losing Positions</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#ef4444', margin: '12px 0 0' }}>{reportData?.losingTrades || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Win Rate</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#10b981', margin: '12px 0 0' }}>{reportData?.winRate || 0}%</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total P/L</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: (reportData?.totalPnL || 0) >= 0 ? '#10b981' : '#ef4444', margin: '12px 0 0' }}>
                    {fmtCSigned(reportData?.totalPnL)}
                  </p>
                </div>
              </div>

              {/* Trades by Mode */}
              {reportData?.byMode && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
                    <h4 style={{ marginTop: 0, marginBottom: 16 }}>Positions by Mode</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Hedging</span>
                        <span style={{ fontWeight: 600, color: '#3b82f6' }}>{reportData.byMode.hedging || 0}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Netting</span>
                        <span style={{ fontWeight: 600, color: '#10b981' }}>{reportData.byMode.netting || 0}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Binary</span>
                        <span style={{ fontWeight: 600, color: '#f59e0b' }}>{reportData.byMode.binary || 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Top Symbols */}
                  {reportData?.topSymbols?.length > 0 && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
                      <h4 style={{ marginTop: 0, marginBottom: 16 }}>Top Symbols</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {reportData.topSymbols.slice(0, 5).map((sym, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontWeight: 600 }}>{sym.symbol}</span>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{sym.count} trades</span>
                              <span style={{ marginLeft: 12, color: sym.pnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{fmtSigned(sym.pnl)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Commission Reports */}
          {activeTab === 'commission-reports' && (
            <>
              {/* Platform Earnings */}
              <div style={{ marginBottom: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>Platform Earnings (from Positions)</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Commission</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#10b981', margin: '12px 0 8px' }}>{fmtC(reportData?.totalCommission)}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{reportData?.tradeCount || 0} trades</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Swap</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#3b82f6', margin: '12px 0 0' }}>{fmtC(reportData?.totalSwap)}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Revenue</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#8b5cf6', margin: '12px 0 0' }}>{fmtC(reportData?.totalRevenue)}</p>
                </div>
              </div>

              {/* By Mode */}
              {reportData?.byMode && Object.keys(reportData.byMode).length > 0 && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border)', marginBottom: 20 }}>
                  <h4 style={{ marginTop: 0, marginBottom: 16 }}>Commission by Mode</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                    {Object.entries(reportData.byMode).map(([mode, data]) => (
                      <div key={mode} style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 8, minWidth: 180 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize', fontWeight: 600 }}>{mode}</span>
                        <p style={{ fontSize: 18, fontWeight: 700, color: '#10b981', margin: '8px 0 2px' }}>{fmt(data.commission)} <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>comm</span></p>
                        <p style={{ fontSize: 14, color: '#3b82f6', margin: 0 }}>{fmt(data.swap)} <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>swap</span></p>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{data.count} trades</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* IB Commission Payouts */}
              <div style={{ marginBottom: 8, marginTop: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>IB Commission Payouts (owed to IBs)</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total IB Payout</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#f59e0b', margin: '12px 0 0' }}>{fmtC(reportData?.ibTotal)}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Pending</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#ef4444', margin: '12px 0 0' }}>{fmtC(reportData?.ibPending)}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Credited</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#10b981', margin: '12px 0 0' }}>{fmtC(reportData?.ibCredited)}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Paid Out</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#8b5cf6', margin: '12px 0 0' }}>{fmtC(reportData?.ibPaid)}</p>
                </div>
              </div>

              {/* Top Users by Commission */}
              {reportData?.topUsers?.length > 0 && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
                  <h4 style={{ marginTop: 0, marginBottom: 16 }}>Top Users by Commission Paid</h4>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>User ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Positions</th>
                        <th>Commission</th>
                        <th>Swap</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.topUsers.map((u, idx) => (
                        <tr key={idx} onClick={() => fetchUserTrades(u.oderId)} style={{ cursor: 'pointer' }} title="Click to view position details">
                          <td>{idx + 1}</td>
                          <td><code style={{ color: '#3b82f6' }}>{u.oderId}</code></td>
                          <td><strong>{u.name}</strong></td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{u.email}</td>
                          <td>{u.tradeCount}</td>
                          <td style={{ color: '#10b981', fontWeight: 600 }}>{fmt(u.totalCommission)}</td>
                          <td style={{ color: '#3b82f6', fontWeight: 600 }}>{fmt(u.totalSwap)}</td>
                          <td style={{ color: '#8b5cf6', fontWeight: 700 }}>{fmt(u.totalCommission + u.totalSwap)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>

                  {/* Expanded User Position Details */}
                  {expandedUser && (
                    <div style={{ marginTop: 16, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary, var(--bg-secondary))' }}>
                        <h4 style={{ margin: 0, fontSize: 14 }}>
                          Position Details for <code style={{ color: '#3b82f6' }}>{expandedUser}</code>
                          {' '}({userTrades.length} trades with commission/swap)
                        </h4>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {userTrades.length > 0 && <button onClick={() => {
                            const hdr = ['Date','Symbol','Mode','Type','Side','Size','Entry','Close','P/L','Commission','Swap','Closed By'];
                            const rows = userTrades.map(t => [
                              new Date(t.executedAt || t.createdAt).toLocaleString(), t.symbol, t.mode, t.type, t.side,
                              t.volume || t.quantity || (t.amount != null ? fmt(t.amount) : ''), t.entryPrice ?? '', t.closePrice ?? '',
                              fmtSigned(t.profit), fmt(t.commission), fmt(t.swap), t.remark || t.closedBy || ''
                            ]);
                            const tot = ['','','','','','','','Totals:', fmtSigned(userTrades.reduce((s,t)=>s+(t.profit||0),0)),
                              fmt(userTrades.reduce((s,t)=>s+(t.commission||0),0)), fmt(userTrades.reduce((s,t)=>s+(t.swap||0),0)), ''];
                            const csv = [hdr,...rows,tot].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
                            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
                            a.download = `commission_${expandedUser}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
                          }} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Download CSV</button>}
                          <button onClick={() => { setExpandedUser(null); setUserTrades([]); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                        </div>
                      </div>
                      {loadingTrades ? (
                        <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading positions...</p>
                      ) : userTrades.length === 0 ? (
                        <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>No positions found</p>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table className="admin-table" style={{ margin: 0 }}>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Symbol</th>
                                <th>Mode</th>
                                <th>Type</th>
                                <th>Side</th>
                                <th>Size</th>
                                <th>Entry</th>
                                <th>Close</th>
                                <th>P/L</th>
                                <th>Commission</th>
                                <th>Swap</th>
                                <th>Closed By</th>
                              </tr>
                            </thead>
                            <tbody>
                              {userTrades.map((t, i) => (
                                <tr key={t.tradeId || i}>
                                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(t.executedAt || t.createdAt).toLocaleString()}</td>
                                  <td><strong>{t.symbol}</strong></td>
                                  <td style={{ textTransform: 'capitalize', fontSize: 12 }}>{t.mode}</td>
                                  <td style={{ textTransform: 'capitalize', fontSize: 12 }}>{t.type}</td>
                                  <td style={{ color: t.side === 'buy' || t.side === 'up' ? '#10b981' : '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>{t.side}</td>
                                  <td>{t.volume || t.quantity || (t.amount != null ? fmt(t.amount) : '-')}</td>
                                  <td>{t.entryPrice?.toFixed(t.entryPrice < 10 ? 4 : 2) || '-'}</td>
                                  <td>{t.closePrice?.toFixed(t.closePrice < 10 ? 4 : 2) || '-'}</td>
                                  <td style={{ color: (t.profit || 0) >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                    {fmtSigned(t.profit)}
                                  </td>
                                  <td style={{ color: '#f59e0b', fontWeight: 600 }}>{fmt(t.commission)}</td>
                                  <td style={{ color: '#3b82f6', fontWeight: 600 }}>{fmt(t.swap)}</td>
                                  <td style={{ fontSize: 12, textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{t.remark || t.closedBy || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                                <td colSpan="8" style={{ textAlign: 'right' }}>Totals:</td>
                                <td style={{ color: userTrades.reduce((s, t) => s + (t.profit || 0), 0) >= 0 ? '#10b981' : '#ef4444' }}>
                                  {fmtSigned(userTrades.reduce((s, t) => s + (t.profit || 0), 0))}
                                </td>
                                <td style={{ color: '#f59e0b' }}>{fmt(userTrades.reduce((s, t) => s + (t.commission || 0), 0))}</td>
                                <td style={{ color: '#3b82f6' }}>{fmt(userTrades.reduce((s, t) => s + (t.swap || 0), 0))}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {/* Broker Reports */}
          {activeTab === 'broker-reports' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Brokers</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#3b82f6', margin: '12px 0 0' }}>{reportData?.totalBrokers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Active Brokers</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#10b981', margin: '12px 0 0' }}>{reportData?.activeBrokers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Users</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#8b5cf6', margin: '12px 0 0' }}>{reportData?.totalUsers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total User Balance</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#10b981', margin: '12px 0 0' }}>{fmtC(reportData?.totalBalance)}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Deposits</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#f59e0b', margin: '12px 0 0' }}>{fmtC(reportData?.totalDeposits)}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Positions</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#3b82f6', margin: '12px 0 0' }}>{reportData?.totalTrades || 0}</p>
                </div>
              </div>

              {reportData?.brokerList?.length > 0 && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
                  <h4 style={{ marginTop: 0, marginBottom: 16 }}>Broker-wise Breakdown</h4>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Broker ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Users</th>
                        <th>Total Balance</th>
                        <th>Total Deposits</th>
                        <th>Positions</th>
                        <th>P/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.brokerList.map((broker, idx) => (
                        <tr key={broker._id || idx}>
                          <td>{idx + 1}</td>
                          <td><code>{broker.oderId}</code></td>
                          <td><strong>{broker.name}</strong></td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{broker.email}</td>
                          <td>
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                              background: broker.isActive ? '#10b98120' : '#ef444420',
                              color: broker.isActive ? '#10b981' : '#ef4444' }}>
                              {broker.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{broker.userCount}</td>
                          <td style={{ color: '#10b981', fontWeight: 600 }}>{fmt(broker.totalBalance)}</td>
                          <td style={{ color: '#f59e0b', fontWeight: 600 }}>{fmt(broker.totalDeposits)}</td>
                          <td>{broker.tradeCount}</td>
                          <td style={{ color: broker.totalPnL >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                            {fmtSigned(broker.totalPnL)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
              {(!reportData?.brokerList || reportData.brokerList.length === 0) && !loading && (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>No brokers found.</div>
              )}
            </>
          )}

          {/* Sub-Admin Reports */}
          {activeTab === 'subadmin-reports' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Sub-Admins</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#3b82f6', margin: '12px 0 0' }}>{reportData?.totalSubAdmins || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Active Sub-Admins</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#10b981', margin: '12px 0 0' }}>{reportData?.activeSubAdmins || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Brokers</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#8b5cf6', margin: '12px 0 0' }}>{reportData?.totalBrokers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Users</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#f59e0b', margin: '12px 0 0' }}>{reportData?.totalUsers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total User Balance</p>
                  <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#10b981', margin: '12px 0 0' }}>{fmtC(reportData?.totalBalance)}</p>
                </div>
              </div>

              {reportData?.subAdminList?.length > 0 && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
                  <h4 style={{ marginTop: 0, marginBottom: 16 }}>Sub-Admin Breakdown</h4>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Brokers</th>
                        <th>Users</th>
                        <th>Total Balance</th>
                        <th>Total Deposits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.subAdminList.map((sa, idx) => (
                        <tr key={sa._id || idx}>
                          <td>{idx + 1}</td>
                          <td><code>{sa.oderId}</code></td>
                          <td><strong>{sa.name}</strong></td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{sa.email}</td>
                          <td>
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                              background: sa.isActive ? '#10b98120' : '#ef444420',
                              color: sa.isActive ? '#10b981' : '#ef4444' }}>
                              {sa.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{sa.brokerCount}</td>
                          <td style={{ fontWeight: 600 }}>{sa.userCount}</td>
                          <td style={{ color: '#10b981', fontWeight: 600 }}>{fmt(sa.totalBalance)}</td>
                          <td style={{ color: '#f59e0b', fontWeight: 600 }}>{fmt(sa.totalDeposits)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
              {(!reportData?.subAdminList || reportData.subAdminList.length === 0) && !loading && (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>No sub-admins found.</div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Reports;
