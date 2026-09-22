import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { formatIndianSegmentCode } from '../../../constants/indianSegmentLabels';

function BrokerPnlSharing() {
  const { API_URL, adminAuth } = useOutletContext();
  const admin = adminAuth?.user;
  
  const [earnings, setEarnings] = useState({ logs: [], total: 0 });
  const [summary, setSummary] = useState(null);
  const [mySettings, setMySettings] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedSegment, setSelectedSegment] = useState('');

  useEffect(() => {
    if (admin?.oderId) {
      fetchData();
    }
  }, [admin?.oderId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchMySettings(),
        fetchEarnings(),
        fetchSummary()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMySettings = async () => {
    const res = await fetch(`${API_URL}/api/admin/pnl-sharing/settings/${admin.oderId}`);
    const data = await res.json();
    if (data.success) {
      setMySettings(data.settings);
    }
  };

  const fetchEarnings = async () => {
    const params = new URLSearchParams();
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    if (selectedSegment) params.append('segment', selectedSegment);
    params.append('limit', '100');
    
    const res = await fetch(`${API_URL}/api/admin/pnl-sharing/earnings/${admin.oderId}?${params}`);
    const data = await res.json();
    if (data.success) {
      setEarnings({ logs: data.logs || [], total: data.total || 0 });
    }
  };

  const fetchSummary = async () => {
    const params = new URLSearchParams();
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    
    const res = await fetch(`${API_URL}/api/admin/pnl-sharing/summary/${admin.oderId}?${params}`);
    const data = await res.json();
    if (data.success) {
      setSummary(data);
    }
  };

  const downloadReport = async () => {
    const params = new URLSearchParams();
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    if (selectedSegment) params.append('segment', selectedSegment);
    
    window.open(`${API_URL}/api/admin/pnl-sharing/download/${admin.oderId}?${params}`, '_blank');
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const segments = ['NSE_EQ', 'NSE_FUT', 'NSE_OPT', 'MCX_FUT', 'MCX_OPT', 'BSE_FUT', 'BSE_OPT'];

  if (loading) {
    return (
      <div className="admin-page-container">
        <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>My PnL Sharing</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
          View your earnings from user trades
        </p>
      </div>

      {/* My Sharing Settings Info */}
      {mySettings && (
        <div className="admin-card" style={{ marginBottom: 20, background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)' }}>
          <h4 style={{ margin: '0 0 12px 0' }}>📋 My PnL Sharing Settings</h4>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Loss Share: </span>
              <strong style={{ color: '#10b981' }}>{mySettings.lossSharePercent || 0}%</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Profit Share: </span>
              <strong style={{ color: '#f59e0b' }}>{mySettings.profitSharePercent || 0}%</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Settlement: </span>
              <strong>{mySettings.settlementMode || 'instant'}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div className="admin-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Total Earnings</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: summary.summary?.totalEarnings >= 0 ? '#10b981' : '#ef4444' }}>
              {formatCurrency(summary.summary?.totalEarnings || 0)}
            </div>
          </div>
          <div className="admin-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>From User Losses</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>
              {formatCurrency(summary.summary?.totalLossShare || 0)}
            </div>
          </div>
          <div className="admin-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>From User Profits</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>
              {formatCurrency(summary.summary?.totalProfitShare || 0)}
            </div>
          </div>
          <div className="admin-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Total Positions</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              {summary.summary?.tradeCount || 0}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="admin-card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--text-secondary)' }}>From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="form-input"
              style={{ padding: '8px 10px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--text-secondary)' }}>To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="form-input"
              style={{ padding: '8px 10px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--text-secondary)' }}>Segment</label>
            <select
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value)}
              className="form-input"
              style={{ padding: '8px 10px' }}
            >
              <option value="">All</option>
              {segments.map(seg => (
                <option key={seg} value={seg}>{formatIndianSegmentCode(seg)}</option>
              ))}
            </select>
          </div>
          <button onClick={fetchEarnings} className="btn-primary" style={{ padding: '8px 14px' }}>
            Apply
          </button>
          <button onClick={downloadReport} className="btn-secondary" style={{ padding: '8px 14px' }}>
            📥 CSV
          </button>
        </div>
      </div>

      {/* Segment Summary */}
      {summary?.segmentSummary?.length > 0 && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <h4 style={{ margin: '0 0 12px 0' }}>Earnings by Segment</h4>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {summary.segmentSummary.map(seg => (
              <div key={seg._id} style={{
                padding: '8px 12px',
                background: 'var(--bg-secondary)',
                borderRadius: 6,
                minWidth: 90
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{formatIndianSegmentCode(seg._id) || seg._id || 'Unknown'}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: seg.totalEarnings >= 0 ? '#10b981' : '#ef4444' }}>
                  {formatCurrency(seg.totalEarnings)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Summary */}
      {summary?.userSummary?.length > 0 && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <h4 style={{ margin: '0 0 12px 0' }}>Earnings by User</h4>
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Positions</th>
                  <th>User P/L</th>
                  <th>My Earnings</th>
                </tr>
              </thead>
              <tbody>
                {summary.userSummary.map(user => (
                  <tr key={user._id}>
                    <td>
                      <div style={{ fontSize: 11 }}>{user._id}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{user.userName}</div>
                    </td>
                    <td>{user.tradeCount}</td>
                    <td style={{ color: user.totalTradePnL >= 0 ? '#10b981' : '#ef4444', fontSize: 12 }}>
                      {formatCurrency(user.totalTradePnL)}
                    </td>
                    <td style={{ fontWeight: 600, color: user.totalEarnings >= 0 ? '#10b981' : '#ef4444', fontSize: 12 }}>
                      {formatCurrency(user.totalEarnings)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Earnings Log */}
      <div className="admin-card">
        <h4 style={{ margin: '0 0 12px 0' }}>Recent Earnings ({earnings.total})</h4>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>Symbol</th>
                <th>Position P/L</th>
                <th>Share %</th>
                <th>My Earning</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {earnings.logs.map((log, idx) => (
                <tr key={idx}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{formatDate(log.closedAt)}</td>
                  <td>
                    <div style={{ fontSize: 11 }}>{log.userOderId}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{log.userName}</div>
                  </td>
                  <td><strong style={{ fontSize: 11 }}>{log.symbol}</strong></td>
                  <td style={{ color: log.tradePnL >= 0 ? '#10b981' : '#ef4444', fontSize: 11 }}>
                    {formatCurrency(log.tradePnL)}
                  </td>
                  <td style={{ fontSize: 11 }}>{log.sharePercent?.toFixed(1)}%</td>
                  <td style={{ fontWeight: 600, color: log.shareAmount >= 0 ? '#10b981' : '#ef4444', fontSize: 11 }}>
                    {formatCurrency(log.shareAmount)}
                  </td>
                  <td>
                    <span style={{
                      padding: '2px 5px',
                      borderRadius: 3,
                      fontSize: 9,
                      background: log.shareType === 'loss_share' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      color: log.shareType === 'loss_share' ? '#10b981' : '#f59e0b'
                    }}>
                      {log.shareType === 'loss_share' ? 'Loss' : 'Profit'}
                    </span>
                  </td>
                </tr>
              ))}
              {earnings.logs.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                    No earnings records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .admin-card { padding: 12px; }
          .admin-table th, .admin-table td { padding: 5px 3px; font-size: 10px; }
        }
      `}</style>
    </div>
  );
}

export default BrokerPnlSharing;
