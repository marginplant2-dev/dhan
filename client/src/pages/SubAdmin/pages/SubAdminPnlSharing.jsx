import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { formatIndianSegmentCode } from '../../../constants/indianSegmentLabels';

function SubAdminPnlSharing() {
  const { API_URL, adminAuth } = useOutletContext();
  const admin = adminAuth?.user;
  
  const [activeTab, setActiveTab] = useState('myEarnings'); // myEarnings, configureBrokers
  const [children, setChildren] = useState([]);
  const [earnings, setEarnings] = useState({ logs: [], total: 0 });
  const [summary, setSummary] = useState(null);
  const [mySettings, setMySettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedSegment, setSelectedSegment] = useState('');
  
  // Edit modal for brokers
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({
    lossSharePercent: 0,
    profitSharePercent: 0,
    settlementMode: 'instant'
  });

  useEffect(() => {
    if (admin?.oderId) {
      fetchData();
    }
  }, [admin?.oderId, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Always fetch my settings and earnings
      await fetchMySettings();
      await fetchEarnings();
      await fetchSummary();
      
      if (activeTab === 'configureBrokers') {
        // Fetch my brokers with their settings
        const res = await fetch(`${API_URL}/api/admin/pnl-sharing/children/${admin.oderId}`);
        const data = await res.json();
        if (data.success) setChildren(data.children || []);
      }
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

  const openEditModal = (broker) => {
    setEditModal(broker);
    setEditForm({
      lossSharePercent: broker.pnlSharingSettings?.lossSharePercent || 0,
      profitSharePercent: broker.pnlSharingSettings?.profitSharePercent || 0,
      settlementMode: broker.pnlSharingSettings?.settlementMode || 'instant'
    });
  };

  const saveSettings = async () => {
    if (!editModal) return;
    setSaving(true);
    
    try {
      const res = await fetch(`${API_URL}/api/admin/pnl-sharing/settings/${editModal.oderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configuredByOderId: admin.oderId,
          ...editForm
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Broker settings saved successfully!' });
        setEditModal(null);
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving settings' });
    } finally {
      setSaving(false);
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

  if (loading && !earnings.logs.length) {
    return (
      <div className="admin-page-container">
        <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>PnL Sharing</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
          View your earnings and configure broker sharing
        </p>
      </div>

      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 20,
          background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`,
          color: message.type === 'success' ? '#10b981' : '#ef4444'
        }}>
          {message.text}
          <button onClick={() => setMessage({ type: '', text: '' })} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
        </div>
      )}

      {/* My Sharing Settings Info */}
      {mySettings && (
        <div className="admin-card" style={{ marginBottom: 20, background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)' }}>
          <h4 style={{ margin: '0 0 12px 0' }}>📋 My PnL Sharing Settings (Set by Super Admin)</h4>
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border-color)', paddingBottom: 16 }}>
        <button
          onClick={() => setActiveTab('myEarnings')}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'myEarnings' ? 'var(--primary-color)' : 'var(--card-bg)',
            color: activeTab === 'myEarnings' ? '#fff' : 'var(--text-primary)',
            fontWeight: 500
          }}
        >
          💰 My Earnings
        </button>
        <button
          onClick={() => setActiveTab('configureBrokers')}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'configureBrokers' ? 'var(--primary-color)' : 'var(--card-bg)',
            color: activeTab === 'configureBrokers' ? '#fff' : 'var(--text-primary)',
            fontWeight: 500
          }}
        >
          ⚙️ Configure Brokers
        </button>
      </div>

      {/* My Earnings Tab */}
      {activeTab === 'myEarnings' && (
        <>
          {/* Summary Cards */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div className="admin-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Total Earnings</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: summary.summary?.totalEarnings >= 0 ? '#10b981' : '#ef4444' }}>
                  {formatCurrency(summary.summary?.totalEarnings || 0)}
                </div>
              </div>
              <div className="admin-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>From User Losses</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                  {formatCurrency(summary.summary?.totalLossShare || 0)}
                </div>
              </div>
              <div className="admin-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>From User Profits</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>
                  {formatCurrency(summary.summary?.totalProfitShare || 0)}
                </div>
              </div>
              <div className="admin-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Total Positions</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {summary.summary?.tradeCount || 0}
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="admin-card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-secondary)' }}>From Date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="form-input"
                  style={{ padding: '8px 12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-secondary)' }}>To Date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="form-input"
                  style={{ padding: '8px 12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-secondary)' }}>Segment</label>
                <select
                  value={selectedSegment}
                  onChange={(e) => setSelectedSegment(e.target.value)}
                  className="form-input"
                  style={{ padding: '8px 12px' }}
                >
                  <option value="">All Segments</option>
                  {segments.map(seg => (
                    <option key={seg} value={seg}>{formatIndianSegmentCode(seg)}</option>
                  ))}
                </select>
              </div>
              <button onClick={fetchEarnings} className="btn-primary" style={{ padding: '8px 16px' }}>
                Apply
              </button>
              <button onClick={downloadReport} className="btn-secondary" style={{ padding: '8px 16px' }}>
                📥 Download CSV
              </button>
            </div>
          </div>

          {/* Segment Summary */}
          {summary?.segmentSummary?.length > 0 && (
            <div className="admin-card" style={{ marginBottom: 24 }}>
              <h4 style={{ margin: '0 0 12px 0' }}>Earnings by Segment</h4>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {summary.segmentSummary.map(seg => (
                  <div key={seg._id} style={{
                    padding: '10px 14px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    minWidth: 100
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatIndianSegmentCode(seg._id) || seg._id || 'Unknown'}</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: seg.totalEarnings >= 0 ? '#10b981' : '#ef4444' }}>
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
                      <th>User ID</th>
                      <th>Name</th>
                      <th>Positions</th>
                      <th>User P/L</th>
                      <th>My Earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.userSummary.map(user => (
                      <tr key={user._id}>
                        <td><code style={{ fontSize: 11 }}>{user._id}</code></td>
                        <td>{user.userName || '-'}</td>
                        <td>{user.tradeCount}</td>
                        <td style={{ color: user.totalTradePnL >= 0 ? '#10b981' : '#ef4444' }}>
                          {formatCurrency(user.totalTradePnL)}
                        </td>
                        <td style={{ fontWeight: 600, color: user.totalEarnings >= 0 ? '#10b981' : '#ef4444' }}>
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
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(log.closedAt)}</td>
                      <td>
                        <div style={{ fontSize: 12 }}>{log.userOderId}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{log.userName}</div>
                      </td>
                      <td><strong style={{ fontSize: 12 }}>{log.symbol}</strong></td>
                      <td style={{ color: log.tradePnL >= 0 ? '#10b981' : '#ef4444', fontSize: 12 }}>
                        {formatCurrency(log.tradePnL)}
                      </td>
                      <td style={{ fontSize: 12 }}>{log.sharePercent?.toFixed(1)}%</td>
                      <td style={{ fontWeight: 600, color: log.shareAmount >= 0 ? '#10b981' : '#ef4444', fontSize: 12 }}>
                        {formatCurrency(log.shareAmount)}
                      </td>
                      <td>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10,
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
        </>
      )}

      {/* Configure Brokers Tab */}
      {activeTab === 'configureBrokers' && (
        <div className="admin-card">
          <h4 style={{ margin: '0 0 16px 0' }}>My Brokers - PnL Sharing Settings</h4>
          
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Broker ID</th>
                  <th>Name</th>
                  <th>Loss Share %</th>
                  <th>Profit Share %</th>
                  <th>Total Earnings</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {children.map((broker) => (
                  <tr key={broker.oderId}>
                    <td><code style={{ fontSize: 11 }}>{broker.oderId}</code></td>
                    <td>{broker.name}</td>
                    <td style={{ color: '#10b981', fontWeight: 600 }}>
                      {broker.pnlSharingSettings?.lossSharePercent || 0}%
                    </td>
                    <td style={{ color: '#f59e0b', fontWeight: 600 }}>
                      {broker.pnlSharingSettings?.profitSharePercent || 0}%
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {formatCurrency(broker.pnlSummary?.totalEarnings || 0)}
                    </td>
                    <td>
                      <button
                        onClick={() => openEditModal(broker)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 4,
                          border: 'none',
                          cursor: 'pointer',
                          background: 'var(--primary-color)',
                          color: '#fff',
                          fontSize: 12
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {children.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                      No brokers found under you
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: 12,
            padding: 24,
            width: '90%',
            maxWidth: 450
          }}>
            <h4 style={{ margin: '0 0 20px 0' }}>
              Edit Broker Sharing - {editModal.name}
            </h4>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
                Loss Share %
                <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: 11, marginLeft: 6 }}>
                  (% of user loss this broker receives)
                </span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={editForm.lossSharePercent}
                onChange={(e) => setEditForm({ ...editForm, lossSharePercent: parseFloat(e.target.value) || 0 })}
                className="form-input"
                style={{ width: '100%', padding: '10px 12px' }}
              />
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
                Profit Share %
                <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: 11, marginLeft: 6 }}>
                  (% of user profit this broker pays)
                </span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={editForm.profitSharePercent}
                onChange={(e) => setEditForm({ ...editForm, profitSharePercent: parseFloat(e.target.value) || 0 })}
                className="form-input"
                style={{ width: '100%', padding: '10px 12px' }}
              />
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
                Settlement Mode
              </label>
              <select
                value={editForm.settlementMode}
                onChange={(e) => setEditForm({ ...editForm, settlementMode: e.target.value })}
                className="form-input"
                style={{ width: '100%', padding: '10px 12px' }}
              >
                <option value="instant">Instant</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditModal(null)} className="btn-secondary" style={{ padding: '8px 16px' }}>
                Cancel
              </button>
              <button onClick={saveSettings} className="btn-primary" style={{ padding: '8px 16px' }} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .admin-card { padding: 14px; }
          .admin-table th, .admin-table td { padding: 6px 4px; font-size: 11px; }
        }
      `}</style>
    </div>
  );
}

export default SubAdminPnlSharing;
