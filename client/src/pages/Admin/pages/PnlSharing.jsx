import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { formatIndianSegmentCode } from '../../../constants/indianSegmentLabels';

function PnlSharing() {
  const { API_URL, adminAuth } = useOutletContext();
  const admin = adminAuth?.user;
  
  const [activeTab, setActiveTab] = useState('configure'); // configure, myEarnings, allDistributions
  const [admins, setAdmins] = useState([]);
  const [subAdmins, setSubAdmins] = useState([]); // List of sub-admins for selection
  const [selectedSubAdmin, setSelectedSubAdmin] = useState(null); // Selected sub-admin
  const [brokersUnderSubAdmin, setBrokersUnderSubAdmin] = useState([]); // Brokers under selected sub-admin
  const [children, setChildren] = useState([]);
  const [earnings, setEarnings] = useState({ logs: [], total: 0 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedSegment, setSelectedSegment] = useState('');
  
  // Edit modal
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({
    lossSharePercent: 0,
    profitSharePercent: 0,
    settlementMode: 'instant'
  });

  // Super admin from User model has role 'admin', from Admin model has 'super_admin'
  const isSuperAdmin = admin?.role === 'super_admin' || admin?.role === 'admin';
  const isSubAdmin = admin?.role === 'sub_admin';

  useEffect(() => {
    if (admin?.oderId) {
      fetchData();
    }
  }, [admin?.oderId, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'configure') {
        if (isSuperAdmin) {
          // Super admin: fetch all admins and separate sub-admins
          const res = await fetch(`${API_URL}/api/admin/pnl-sharing/all-admins`);
          const data = await res.json();
          if (data.success) {
            const allAdmins = data.admins || [];
            setAdmins(allAdmins);
            // Separate sub-admins for the dropdown
            const subs = allAdmins.filter(a => a.role === 'sub_admin');
            setSubAdmins(subs);
          }
        } else if (isSubAdmin) {
          // Sub-admin sees their brokers
          const res = await fetch(`${API_URL}/api/admin/pnl-sharing/children/${admin.oderId}`);
          const data = await res.json();
          if (data.success) setChildren(data.children || []);
        }
      } else if (activeTab === 'myEarnings') {
        await fetchEarnings();
        await fetchSummary();
      } else if (activeTab === 'allDistributions' && isSuperAdmin) {
        await fetchAllDistributions();
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch brokers when a sub-admin is selected
  const handleSubAdminSelect = async (subAdminOderId) => {
    if (!subAdminOderId) {
      setSelectedSubAdmin(null);
      setBrokersUnderSubAdmin([]);
      return;
    }
    
    const subAdmin = subAdmins.find(s => s.oderId === subAdminOderId);
    setSelectedSubAdmin(subAdmin);
    
    // Get brokers under this sub-admin
    const brokers = admins.filter(a => a.role === 'broker' && a.parentOderId === subAdminOderId);
    setBrokersUnderSubAdmin(brokers);
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

  const fetchAllDistributions = async () => {
    // For super admin to see all distributions
    const params = new URLSearchParams();
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    if (selectedSegment) params.append('segment', selectedSegment);
    
    const res = await fetch(`${API_URL}/api/admin/pnl-sharing/download-all?${params}`);
    // This returns CSV, we need JSON endpoint for display
    // Let's use all-admins endpoint for summary view
  };

  const openEditModal = (adminData) => {
    setEditModal(adminData);
    setEditForm({
      lossSharePercent: adminData.pnlSharingSettings?.lossSharePercent || 0,
      profitSharePercent: adminData.pnlSharingSettings?.profitSharePercent || 0,
      settlementMode: adminData.pnlSharingSettings?.settlementMode || 'instant'
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
        // If we just saved sub-admin settings, auto-update brokers to remaining %
        if (editModal.role === 'sub_admin' && brokersUnderSubAdmin.length > 0) {
          const brokerLossShare = 100 - editForm.lossSharePercent;
          const brokerProfitShare = 100 - editForm.profitSharePercent;
          
          // Update all brokers under this sub-admin
          for (const broker of brokersUnderSubAdmin) {
            await fetch(`${API_URL}/api/admin/pnl-sharing/settings/${broker.oderId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                configuredByOderId: admin.oderId,
                lossSharePercent: brokerLossShare,
                profitSharePercent: brokerProfitShare,
                settlementMode: editForm.settlementMode
              })
            });
          }
          setMessage({ type: 'success', text: `Settings saved! Sub-Admin: ${editForm.lossSharePercent}%, Brokers: ${brokerLossShare}%` });
        } else {
          setMessage({ type: 'success', text: 'Settings saved successfully!' });
        }
        
        setEditModal(null);
        // Refresh data and re-select sub-admin to see updated values
        await fetchData();
        if (selectedSubAdmin) {
          setTimeout(() => handleSubAdminSelect(selectedSubAdmin.oderId), 500);
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (error) {
      console.error('Save error:', error);
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

  const downloadAllReport = async () => {
    const params = new URLSearchParams();
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    if (selectedSegment) params.append('segment', selectedSegment);
    
    window.open(`${API_URL}/api/admin/pnl-sharing/download-all?${params}`, '_blank');
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

  if (loading && !admins.length && !earnings.logs.length) {
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
          Configure profit/loss sharing between admin hierarchy
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border-color)', paddingBottom: 16 }}>
        {(isSuperAdmin || isSubAdmin) && (
          <button
            onClick={() => setActiveTab('configure')}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'configure' ? 'var(--primary-color)' : 'var(--card-bg)',
              color: activeTab === 'configure' ? '#fff' : 'var(--text-primary)',
              fontWeight: 500
            }}
          >
            ⚙️ Configure Sharing
          </button>
        )}
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
        {isSuperAdmin && (
          <button
            onClick={() => setActiveTab('allDistributions')}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'allDistributions' ? 'var(--primary-color)' : 'var(--card-bg)',
              color: activeTab === 'allDistributions' ? '#fff' : 'var(--text-primary)',
              fontWeight: 500
            }}
          >
            📊 All Distributions
          </button>
        )}
      </div>

      {/* Configure Tab */}
      {activeTab === 'configure' && (
        <>
        {/* Info Box */}
        <div className="admin-card" style={{ marginBottom: 20, background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)' }}>
          <h4 style={{ margin: '0 0 8px 0' }}>📊 How PnL Sharing Works</h4>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            When a user closes a trade, the profit/loss is shared with Sub-Admins and Brokers based on the configured percentages.
            <br/>• <strong>Loss Share %</strong> = % of user's loss credited to admin's wallet
            <br/>• <strong>Profit Share %</strong> = % of user's profit debited from admin's wallet
          </p>
        </div>
        
        {/* Super Admin: Hierarchical Selection */}
        {isSuperAdmin && (
          <>
          {/* Step 1: Select Sub-Admin */}
          <div className="admin-card" style={{ marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 16px 0' }}>Step 1: Select Sub-Admin</h3>
            <select
              value={selectedSubAdmin?.oderId || ''}
              onChange={(e) => handleSubAdminSelect(e.target.value)}
              className="form-input pnl-select"
              style={{ 
                width: '100%', 
                maxWidth: 400, 
                padding: '12px 16px', 
                fontSize: 14,
                background: 'var(--input-bg, #1a1a2e)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color, #333)',
                borderRadius: 8,
                cursor: 'pointer',
                appearance: 'none',
                WebkitAppearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center'
              }}
            >
              <option value="">-- Select a Sub-Admin --</option>
              {subAdmins.map(sub => (
                <option key={sub.oderId} value={sub.oderId}>
                  {sub.name} ({sub.oderId})
                </option>
              ))}
            </select>
            
            {subAdmins.length === 0 && (
              <p style={{ margin: '12px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                No sub-admins found. <a href="/admin/admins" style={{ color: 'var(--primary-color)' }}>Create one first</a>
              </p>
            )}
          </div>
          
          {/* Step 2: Configure Selected Sub-Admin */}
          {selectedSubAdmin && (
            <div className="admin-card" style={{ marginBottom: 20, border: '1px solid rgba(59, 130, 246, 0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                    <h3 style={{ margin: 0 }}>Step 2: Sub-Admin Settings</h3>
                    <span style={{ padding: '4px 10px', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      Sub-Admin
                    </span>
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                    Configure PnL sharing for <strong>{selectedSubAdmin.name}</strong> ({selectedSubAdmin.oderId})
                  </p>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 20, marginBottom: 20 }}>
                <div style={{ padding: '16px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8, textAlign: 'center' }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)' }}>Loss Share %</label>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                    {selectedSubAdmin.pnlSharingSettings?.lossSharePercent || 0}%
                  </div>
                </div>
                <div style={{ padding: '16px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: 8, textAlign: 'center' }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)' }}>Profit Share %</label>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>
                    {selectedSubAdmin.pnlSharingSettings?.profitSharePercent || 0}%
                  </div>
                </div>
                <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, textAlign: 'center' }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)' }}>Total Earnings</label>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>
                    {formatCurrency(selectedSubAdmin.pnlSummary?.totalEarnings || 0)}
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => openEditModal(selectedSubAdmin)}
                className="btn-primary"
                style={{ padding: '12px 24px', width: '100%', maxWidth: 250 }}
              >
                Edit Sub-Admin Settings
              </button>
            </div>
          )}
          
          {/* Step 3: Configure Brokers under Sub-Admin */}
          {selectedSubAdmin && (
            <div className="admin-card">
              <h3 style={{ margin: '0 0 16px 0' }}>
                Step 3: Configure Brokers under {selectedSubAdmin.name}
              </h3>
              
              {brokersUnderSubAdmin.length > 0 ? (
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
                      {brokersUnderSubAdmin.map((broker) => (
                        <tr key={broker.oderId}>
                          <td><code>{broker.oderId}</code></td>
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
                              className="btn-primary"
                              style={{ padding: '6px 12px', fontSize: 13 }}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>
                  No brokers found under this Sub-Admin
                </p>
              )}
            </div>
          )}
          
          {!selectedSubAdmin && subAdmins.length > 0 && (
            <div className="admin-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
              👆 Select a Sub-Admin above to configure their PnL sharing and see their brokers
            </div>
          )}
          </>
        )}
        
        {/* Sub-Admin View: Their Brokers Only */}
        {isSubAdmin && (
          <div className="admin-card">
            <h3 style={{ margin: '0 0 20px 0' }}>Configure My Brokers</h3>
            
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
                      <td><code>{broker.oderId}</code></td>
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
                          className="btn-primary"
                          style={{ padding: '6px 12px', fontSize: 13 }}
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
        
        </>
      )}

      {/* My Earnings Tab */}
      {activeTab === 'myEarnings' && (
        <>
          {/* Summary Cards */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div className="admin-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>Total Earnings</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: summary.summary?.totalEarnings >= 0 ? '#10b981' : '#ef4444' }}>
                  {formatCurrency(summary.summary?.totalEarnings || 0)}
                </div>
              </div>
              <div className="admin-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>From User Losses</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>
                  {formatCurrency(summary.summary?.totalLossShare || 0)}
                </div>
              </div>
              <div className="admin-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>From User Profits</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>
                  {formatCurrency(summary.summary?.totalProfitShare || 0)}
                </div>
              </div>
              <div className="admin-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>Total Positions</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {summary.summary?.tradeCount || 0}
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="admin-card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>From Date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="form-input"
                  style={{ padding: '8px 12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>To Date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="form-input"
                  style={{ padding: '8px 12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>Segment</label>
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
              <button
                onClick={fetchEarnings}
                className="btn-primary"
                style={{ padding: '8px 16px' }}
              >
                Apply Filters
              </button>
              <button
                onClick={downloadReport}
                className="btn-secondary"
                style={{ padding: '8px 16px' }}
              >
                📥 Download CSV
              </button>
            </div>
          </div>

          {/* Segment Summary */}
          {summary?.segmentSummary?.length > 0 && (
            <div className="admin-card" style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 16px 0' }}>Earnings by Segment</h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {summary.segmentSummary.map(seg => (
                  <div key={seg._id} style={{
                    padding: '12px 16px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    minWidth: 120
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatIndianSegmentCode(seg._id) || seg._id || 'Unknown'}</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: seg.totalEarnings >= 0 ? '#10b981' : '#ef4444' }}>
                      {formatCurrency(seg.totalEarnings)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{seg.tradeCount} trades</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User Summary (for brokers) */}
          {summary?.userSummary?.length > 0 && (
            <div className="admin-card" style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 16px 0' }}>Earnings by User</h3>
              <table className="admin-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>User Name</th>
                    <th>Positions</th>
                    <th>User P/L</th>
                    <th>My Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.userSummary.map(user => (
                    <tr key={user._id}>
                      <td><code>{user._id}</code></td>
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
          )}

          {/* Earnings Log */}
          <div className="admin-card">
            <h3 style={{ margin: '0 0 16px 0' }}>Earnings Log ({earnings.total} records)</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>User</th>
                    <th>Symbol</th>
                    <th>Segment</th>
                    <th>Position P/L</th>
                    <th>Share %</th>
                    <th>My Earning</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {earnings.logs.map((log, idx) => (
                    <tr key={idx}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(log.closedAt)}</td>
                      <td>
                        <div>{log.userOderId}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{log.userName}</div>
                      </td>
                      <td><strong>{log.symbol}</strong></td>
                      <td>{log.segment ? formatIndianSegmentCode(log.segment) : '-'}</td>
                      <td style={{ color: log.tradePnL >= 0 ? '#10b981' : '#ef4444' }}>
                        {formatCurrency(log.tradePnL)}
                      </td>
                      <td>{log.sharePercent?.toFixed(1)}%</td>
                      <td style={{ fontWeight: 600, color: log.shareAmount >= 0 ? '#10b981' : '#ef4444' }}>
                        {formatCurrency(log.shareAmount)}
                      </td>
                      <td>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          background: log.shareType === 'loss_share' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: log.shareType === 'loss_share' ? '#10b981' : '#f59e0b'
                        }}>
                          {log.shareType === 'loss_share' ? 'Loss Share' : 'Profit Share'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {earnings.logs.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
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

      {/* All Distributions Tab (Super Admin) */}
      {activeTab === 'allDistributions' && isSuperAdmin && (
        <div className="admin-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0 }}>All PnL Distributions</h3>
            <button onClick={downloadAllReport} className="btn-primary">
              📥 Download All CSV
            </button>
          </div>
          
          {/* Filters */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="form-input"
                style={{ padding: '8px 12px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="form-input"
                style={{ padding: '8px 12px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>Segment</label>
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
          </div>

          {/* All Admins Summary */}
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Admin ID</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Loss Share %</th>
                  <th>Profit Share %</th>
                  <th>Total Earnings</th>
                  <th>Position Count</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((adminData) => (
                  <tr key={adminData.oderId}>
                    <td><code>{adminData.oderId}</code></td>
                    <td>{adminData.name}</td>
                    <td>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        background: adminData.role === 'sub_admin' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                        color: adminData.role === 'sub_admin' ? '#3b82f6' : '#10b981'
                      }}>
                        {adminData.role === 'sub_admin' ? 'Sub-Admin' : 'Broker'}
                      </span>
                    </td>
                    <td style={{ color: '#10b981', fontWeight: 600 }}>
                      {adminData.pnlSharingSettings?.lossSharePercent || 0}%
                    </td>
                    <td style={{ color: '#f59e0b', fontWeight: 600 }}>
                      {adminData.pnlSharingSettings?.profitSharePercent || 0}%
                    </td>
                    <td style={{ fontWeight: 600, color: (adminData.pnlSummary?.totalEarnings || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                      {formatCurrency(adminData.pnlSummary?.totalEarnings || 0)}
                    </td>
                    <td>{adminData.pnlSummary?.tradeCount || 0}</td>
                  </tr>
                ))}
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
            background: '#1e1e2d',
            borderRadius: 12,
            padding: 28,
            width: '90%',
            maxWidth: 480,
            border: '1px solid #333'
          }}>
            <h3 style={{ margin: '0 0 24px 0', fontSize: 18 }}>
              Edit PnL Sharing - {editModal.name} ({editModal.oderId})
            </h3>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                Loss Share Percent
              </label>
              <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12, marginBottom: 10 }}>
                % of user loss this admin receives
              </span>
              <input
                type="number"
                min="0"
                max="100"
                value={editForm.lossSharePercent}
                onChange={(e) => setEditForm({ ...editForm, lossSharePercent: parseFloat(e.target.value) || 0 })}
                className="pnl-input"
                style={{ 
                  width: '100%', 
                  padding: '12px 14px',
                  background: '#252536',
                  border: '1px solid #333',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14
                }}
              />
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                Profit Share Percent
              </label>
              <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12, marginBottom: 10 }}>
                % of user profit this admin pays
              </span>
              <input
                type="number"
                min="0"
                max="100"
                value={editForm.profitSharePercent}
                onChange={(e) => setEditForm({ ...editForm, profitSharePercent: parseFloat(e.target.value) || 0 })}
                className="pnl-input"
                style={{ 
                  width: '100%', 
                  padding: '12px 14px',
                  background: '#252536',
                  border: '1px solid #333',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14
                }}
              />
            </div>
            
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', marginBottom: 10, fontWeight: 500, fontSize: 14 }}>
                Settlement Mode
              </label>
              <select
                value={editForm.settlementMode}
                onChange={(e) => setEditForm({ ...editForm, settlementMode: e.target.value })}
                className="pnl-select"
                style={{ 
                  width: '100%', 
                  padding: '12px 14px',
                  background: '#252536',
                  border: '1px solid #333',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                <option value="instant">Instant (Credit immediately)</option>
                <option value="daily">Daily Settlement</option>
                <option value="weekly">Weekly Settlement</option>
                <option value="monthly">Monthly Settlement</option>
              </select>
            </div>
            
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditModal(null)}
                className="btn-secondary"
                style={{ padding: '10px 20px' }}
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                className="btn-primary"
                style={{ padding: '10px 20px' }}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .pnl-select, .pnl-input {
          background: #252536 !important;
          color: #fff !important;
          border: 1px solid #333 !important;
        }
        .pnl-select option {
          background: #252536;
          color: #fff;
          padding: 10px;
        }
        .pnl-select:focus, .pnl-input:focus {
          outline: none;
          border-color: var(--primary-color) !important;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
        .pnl-input::placeholder {
          color: #666;
        }
        .pnl-input::-webkit-outer-spin-button,
        .pnl-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .admin-table {
          border-collapse: collapse;
        }
        .admin-table th {
          background: rgba(255,255,255,0.05);
          padding: 12px 16px;
          text-align: left;
          font-weight: 600;
          font-size: 12px;
          text-transform: uppercase;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border-color);
        }
        .admin-table td {
          padding: 14px 16px;
          border-bottom: 1px solid var(--border-color);
        }
        .admin-table tr:hover {
          background: rgba(255,255,255,0.02);
        }
        @media (max-width: 768px) {
          .admin-card {
            padding: 16px;
          }
          .admin-table th, .admin-table td {
            padding: 8px 6px;
            font-size: 12px;
          }
        }
      `}</style>
    </div>
  );
}

export default PnlSharing;
