import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL, API_URL } from '../adminConfig';

const IBManagement = () => {
  const { tab } = useParams();
  const navigate = useNavigate();
  // IB values are stored and transmitted as INR natively — no conversion here.
  const fmtInr = (inr) => `₹${Number(inr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const [activeTab, setActiveTab] = useState(tab || 'applications');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Data states
  const [applications, setApplications] = useState([]);
  // Which pending application row is expanded to show full form details.
  const [expandedAppId, setExpandedAppId] = useState(null);
  const [activeIBs, setActiveIBs] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [activeCoupons, setActiveCoupons] = useState([]);
  const [pendingCoupons, setPendingCoupons] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [redemptionSummary, setRedemptionSummary] = useState({ count: 0, totalDiscount: 0, totalCommission: 0, totalGross: 0, totalNet: 0 });
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawalSummary, setWithdrawalSummary] = useState({ pending: 0, approved: 0, rejected: 0, totalApproved: 0, totalPending: 0 });
  const [settings, setSettings] = useState({
    enabled: true,
    autoApprove: false,
    defaultCommission: { type: 'per_lot', perLotAmount: 2, revenuePercent: 10 },
    minWithdrawal: 50,
    maxLevels: 5
  });
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, totalCommissionPaid: 0 });
  const [commissionSummary, setCommissionSummary] = useState({ totalAmount: 0, pendingAmount: 0, creditedAmount: 0, paidAmount: 0, count: 0 });

  // Modal states
  const [selectedIB, setSelectedIB] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [modalError, setModalError] = useState(null);

  // Coupon form state — used by Approve modal and the standalone Issue
  // Coupon modal. Defaults match the most common offer (20% off, 30 days,
  // 20% IB cut).
  const [couponForm, setCouponForm] = useState({
    code: '',
    discountPercent: 20,
    validityDays: 30,
    challengePurchaseCommissionPercent: 20,
    maxRedemptions: 0
  });

  const tabs = [
    { id: 'applications', label: 'Applications', path: '' },
    { id: 'active', label: 'Active IBs', path: 'active' },
    { id: 'coupons', label: 'Coupons', path: 'coupons' },
    { id: 'global-coupons', label: 'Global Coupons', path: 'global-coupons' },
    { id: 'redemptions', label: 'Redemptions', path: 'redemptions' },
    { id: 'withdrawals', label: 'Withdrawals', path: 'withdrawals' },
    { id: 'commissions', label: 'Commissions', path: 'commissions' },
    { id: 'settings', label: 'Settings', path: 'settings' }
  ];

  // ─── Global coupons state ───────────────────────────────────────
  const [globalCoupons, setGlobalCoupons] = useState([]);
  const [globalForm, setGlobalForm] = useState({
    code: 'WELCOME10',
    discountPercent: 10,
    validityDays: 30,
    maxRedemptions: 0,
    firstTimeOnly: true,
    showOnBanner: true,
    bannerText: ''
  });
  const [editingGlobalId, setEditingGlobalId] = useState(null);
  const [globalMsg, setGlobalMsg] = useState(null);

  const fetchGlobalCoupons = async () => {
    const token = localStorage.getItem('dhanfunded-admin-token');
    try {
      const res = await fetch(`${API_URL}/api/global-coupons/admin/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await res.json();
      if (d.success) setGlobalCoupons(d.rows || []);
    } catch (e) { /* ignore */ }
  };

  const saveGlobalCoupon = async () => {
    setGlobalMsg(null);
    const token = localStorage.getItem('dhanfunded-admin-token');
    const url = editingGlobalId
      ? `${API_URL}/api/global-coupons/admin/${editingGlobalId}`
      : `${API_URL}/api/global-coupons/admin/create`;
    const method = editingGlobalId ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(globalForm)
      });
      const d = await res.json();
      if (d.success) {
        setGlobalMsg({ type: 'ok', text: editingGlobalId ? 'Updated' : 'Created' });
        setEditingGlobalId(null);
        setGlobalForm({
          code: 'WELCOME10', discountPercent: 10, validityDays: 30,
          maxRedemptions: 0, firstTimeOnly: true, showOnBanner: true, bannerText: ''
        });
        fetchGlobalCoupons();
      } else {
        setGlobalMsg({ type: 'err', text: d.message || 'Failed' });
      }
    } catch (e) { setGlobalMsg({ type: 'err', text: e.message }); }
  };

  const editGlobalCoupon = (c) => {
    setEditingGlobalId(c._id);
    setGlobalForm({
      code: c.code,
      discountPercent: c.discountPercent,
      validityDays: c.validityDays || 0,
      maxRedemptions: c.maxRedemptions || 0,
      firstTimeOnly: !!c.firstTimeOnly,
      showOnBanner: !!c.showOnBanner,
      bannerText: c.bannerText || ''
    });
    setGlobalMsg(null);
    // Scroll the form into view so admin clearly sees what they're editing.
    setTimeout(() => {
      const el = document.getElementById('global-coupon-form');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const toggleGlobalStatus = async (c) => {
    const token = localStorage.getItem('dhanfunded-admin-token');
    try {
      await fetch(`${API_URL}/api/global-coupons/admin/${c._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: c.status === 'active' ? 'admin_disabled' : 'active' })
      });
      fetchGlobalCoupons();
    } catch (e) { /* ignore */ }
  };

  const deleteGlobalCoupon = async (id) => {
    if (!window.confirm('Delete this coupon? This cannot be undone.')) return;
    const token = localStorage.getItem('dhanfunded-admin-token');
    try {
      await fetch(`${API_URL}/api/global-coupons/admin/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchGlobalCoupons();
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    if (activeTab === 'global-coupons') fetchGlobalCoupons();
  }, [activeTab]);

  const renderGlobalCoupons = () => (
    <div className="admin-table-container">
      <div id="global-coupon-form" style={{
        background: 'var(--bg-secondary)',
        border: editingGlobalId ? '2px solid #3b82f6' : '1px solid var(--border-color)',
        borderRadius: 12, padding: 18, marginBottom: 18,
        boxShadow: editingGlobalId ? '0 0 0 4px rgba(59,130,246,0.12)' : 'none'
      }}>
        <h3 style={{ margin: '0 0 12px', color: editingGlobalId ? '#3b82f6' : 'var(--text-primary)' }}>
          {editingGlobalId ? '✏️ Edit Global Coupon' : '➕ Create Global Coupon'}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Code *</label>
            <input
              type="text" value={globalForm.code}
              onChange={e => setGlobalForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
              placeholder="WELCOME10"
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Discount %</label>
            <input type="number" min="1" max="100" value={globalForm.discountPercent}
              onChange={e => setGlobalForm(p => ({ ...p, discountPercent: Number(e.target.value) }))}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Validity (days, 0 = no expiry)</label>
            <input type="number" min="0" value={globalForm.validityDays}
              onChange={e => setGlobalForm(p => ({ ...p, validityDays: Number(e.target.value) }))}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Max Redemptions (0 = unlimited)</label>
            <input type="number" min="0" value={globalForm.maxRedemptions}
              onChange={e => setGlobalForm(p => ({ ...p, maxRedemptions: Number(e.target.value) }))}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Banner Text (optional, leave blank for default)</label>
          <input type="text" value={globalForm.bannerText}
            onChange={e => setGlobalForm(p => ({ ...p, bannerText: e.target.value }))}
            placeholder="e.g. Limited time offer — flat 10% off all challenges"
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)', fontSize: 13 }}>
            <input type="checkbox" checked={globalForm.firstTimeOnly}
              onChange={e => setGlobalForm(p => ({ ...p, firstTimeOnly: e.target.checked }))}
            /> First-time buyers only
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)', fontSize: 13 }}>
            <input type="checkbox" checked={globalForm.showOnBanner}
              onChange={e => setGlobalForm(p => ({ ...p, showOnBanner: e.target.checked }))}
            /> Show on landing page banner
          </label>
        </div>
        {globalMsg && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 13,
            background: globalMsg.type === 'err' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
            color: globalMsg.type === 'err' ? '#ef4444' : '#10b981'
          }}>{globalMsg.text}</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={saveGlobalCoupon} className="btn btn-primary">
            {editingGlobalId ? 'Update Coupon' : 'Create Coupon'}
          </button>
          {editingGlobalId && (
            <button onClick={() => { setEditingGlobalId(null); setGlobalForm({ code: 'WELCOME10', discountPercent: 10, validityDays: 30, maxRedemptions: 0, firstTimeOnly: true, showOnBanner: true, bannerText: '' }); }} className="btn btn-secondary">Cancel</button>
          )}
        </div>
      </div>

      <div className="table-header">
        <h3>All Global Coupons ({globalCoupons.length})</h3>
      </div>
      {globalCoupons.length === 0 ? (
        <div style={{ padding: 24, color: 'var(--text-secondary)', textAlign: 'center' }}>No global coupons yet</div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Discount</th>
              <th>Status</th>
              <th>Used / Cap</th>
              <th>Expires</th>
              <th>First Time</th>
              <th>Banner</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {globalCoupons.map(c => (
              <tr key={c._id}>
                <td><strong>{c.code}</strong></td>
                <td>{c.discountPercent}%</td>
                <td>
                  <span style={{
                    padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: c.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(156,163,175,0.15)',
                    color: c.status === 'active' ? '#10b981' : '#9ca3af'
                  }}>{c.status}</span>
                </td>
                <td>{c.redemptionCount} / {c.maxRedemptions || '∞'}</td>
                <td>{c.validUntil ? new Date(c.validUntil).toLocaleDateString() : 'Never'}</td>
                <td>{c.firstTimeOnly ? '✅' : '—'}</td>
                <td>{c.showOnBanner ? '✅' : '—'}</td>
                <td>
                  <button onClick={() => editGlobalCoupon(c)} className="btn btn-sm btn-secondary" style={{ marginRight: 6 }}>Edit</button>
                  <button onClick={() => toggleGlobalStatus(c)} className="btn btn-sm btn-secondary" style={{ marginRight: 6 }}>
                    {c.status === 'active' ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => deleteGlobalCoupon(c._id)} className="btn btn-sm btn-danger">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );

  // Helper to compute days remaining for an active coupon.
  const daysUntil = (date) => {
    if (!date) return null;
    const ms = new Date(date).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  };

  const couponPreview = (() => {
    const fee = 1000;
    const disc = (Number(couponForm.discountPercent) || 0) * fee / 100;
    const finalFee = Math.max(0, fee - disc);
    const ibCut = finalFee * (Number(couponForm.challengePurchaseCommissionPercent) || 0) / 100;
    return { fee, disc, finalFee, ibCut };
  })();

  useEffect(() => {
    const currentTab = tab || 'applications';
    setActiveTab(currentTab);
    fetchData(currentTab);
  }, [tab]);

  const fetchData = async (currentTab) => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('dhanfunded-admin-token');

    try {
      switch (currentTab) {
        case 'applications':
          const appRes = await fetch(`${API_BASE_URL}/ib/admin/pending`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const appData = await appRes.json();
          if (appData.success) setApplications(appData.data.ibs || []);
          break;

        case 'active':
          const activeRes = await fetch(`${API_BASE_URL}/ib/admin/list?status=active`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const activeData = await activeRes.json();
          if (activeData.success) setActiveIBs(activeData.data.ibs || []);
          break;

        case 'commissions':
          const commRes = await fetch(`${API_BASE_URL}/ib/admin/commissions`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const commData = await commRes.json();
          if (commData.success) {
            setCommissions(commData.data.commissions || []);
            setCommissionSummary(commData.data.summary || {});
          }
          break;

        case 'coupons':
          const [activeRes2, pendingRes] = await Promise.all([
            fetch(`${API_BASE_URL}/ib/admin/coupons/active`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${API_BASE_URL}/ib/admin/coupons/pending-issue`, { headers: { Authorization: `Bearer ${token}` } })
          ]);
          const activeJson = await activeRes2.json();
          const pendingJson = await pendingRes.json();
          if (activeJson.success) setActiveCoupons(activeJson.data.rows || []);
          if (pendingJson.success) setPendingCoupons(pendingJson.data.rows || []);
          break;

        case 'redemptions':
          const redRes = await fetch(`${API_BASE_URL}/ib/admin/coupon-redemptions`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const redJson = await redRes.json();
          if (redJson.success) {
            setRedemptions(redJson.data.rows || []);
            setRedemptionSummary(redJson.data.summary || { count: 0, totalDiscount: 0, totalCommission: 0 });
          }
          break;

        case 'withdrawals':
          const wdRes = await fetch(`${API_BASE_URL}/ib/admin/withdrawals`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const wdJson = await wdRes.json();
          if (wdJson.success) {
            setWithdrawals(wdJson.data.rows || []);
            setWithdrawalSummary(wdJson.data.summary || { pending: 0, approved: 0, rejected: 0, totalApproved: 0, totalPending: 0 });
          }
          break;

        case 'settings':
          const settingsRes = await fetch(`${API_BASE_URL}/ib/admin/settings`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const settingsData = await settingsRes.json();
          if (settingsData.success && settingsData.data) {
            setSettings(prev => ({ ...prev, ...settingsData.data }));
          }
          
          const statsRes = await fetch(`${API_BASE_URL}/ib/admin/stats/summary`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const statsData = await statsRes.json();
          if (statsData.success && statsData.data) {
            setStats(prev => ({ ...prev, ...statsData.data }));
          }
          break;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tabId) => {
    const tabConfig = tabs.find(t => t.id === tabId);
    navigate(`/admin/ib${tabConfig.path ? '/' + tabConfig.path : ''}`);
  };

  const handleApprove = async (ibId) => {
    const token = localStorage.getItem('dhanfunded-admin-token');
    try {
      const res = await fetch(`${API_BASE_URL}/ib/admin/${ibId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          coupon: {
            discountPercent: Number(couponForm.discountPercent) || 0,
            validityDays: Number(couponForm.validityDays) || 30,
            challengePurchaseCommissionPercent: Number(couponForm.challengePurchaseCommissionPercent) || 0,
            maxRedemptions: Math.max(0, Number(couponForm.maxRedemptions) || 0)
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        fetchData('applications');
        setShowModal(false);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleIssueCoupon = async (couponId) => {
    const token = localStorage.getItem('dhanfunded-admin-token');
    setModalError(null);
    try {
      const body = {
        discountPercent: Number(couponForm.discountPercent) || 0,
        validityDays: Number(couponForm.validityDays) || 30,
        challengePurchaseCommissionPercent: Number(couponForm.challengePurchaseCommissionPercent) || 0,
        maxRedemptions: Math.max(0, Number(couponForm.maxRedemptions) || 0)
      };
      // Only forward custom code if admin actually changed it from the
      // existing one — empty/blank means "auto-generate or keep".
      const customCode = String(couponForm.code || '').trim().toUpperCase();
      if (customCode && customCode !== (selectedIB.code || '').toUpperCase()) {
        body.code = customCode;
      }
      const res = await fetch(`${API_BASE_URL}/ib/admin/coupons/${couponId}/issue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        fetchData(activeTab);
        setShowModal(false);
      } else {
        setModalError(data.error || 'Failed');
      }
    } catch (err) {
      setModalError(err.message);
    }
  };

  const handleRevokeCoupon = async (couponId) => {
    const reason = window.prompt('Reason for revoking this coupon?');
    if (reason === null) return;
    const token = localStorage.getItem('dhanfunded-admin-token');
    try {
      const res = await fetch(`${API_BASE_URL}/ib/admin/coupons/${couponId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.success) {
        fetchData(activeTab);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleWithdrawalAction = async (txId, action) => {
    let rejectionReason = '';
    if (action === 'reject') {
      rejectionReason = window.prompt('Reason for rejecting this withdrawal?') || '';
      if (!rejectionReason.trim()) return;
    } else {
      if (!window.confirm('Approve this IB withdrawal? IB wallet will be debited.')) return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/transactions/${txId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: action === 'approve' ? 'approved' : 'rejected',
          adminNote: '',
          rejectionReason,
          processedBy: 'admin'
        })
      });
      const data = await res.json();
      if (data.success !== false) {
        fetchData('withdrawals');
      } else {
        setError(data.error || 'Failed');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // The Coupons tab now lists individual IBCoupon docs (not IBs). The
  // modal uses `selectedIB` as a generic carrier for the row's identity
  // — for coupon flows it's actually the coupon doc (with _id, code, ibUserId).
  const openIssueCouponModal = (coupon) => {
    setSelectedIB(coupon);
    setCouponForm({
      code: coupon.code || '',
      discountPercent: coupon.discountPercent || 20,
      validityDays: coupon.validityDays || 30,
      challengePurchaseCommissionPercent: coupon.challengePurchaseCommissionPercent || 20,
      maxRedemptions: coupon.maxRedemptions || 0
    });
    setModalError(null);
    setModalType('issue-coupon');
    setShowModal(true);
  };

  const handleReject = async (ibId, reason) => {
    const token = localStorage.getItem('dhanfunded-admin-token');
    try {
      const res = await fetch(`${API_BASE_URL}/ib/admin/${ibId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.success) {
        fetchData('applications');
        setShowModal(false);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSuspend = async (ibId, reason) => {
    const token = localStorage.getItem('dhanfunded-admin-token');
    try {
      const res = await fetch(`${API_BASE_URL}/ib/admin/${ibId}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.success) {
        fetchData('active');
        setShowModal(false);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateSettings = async (newSettings) => {
    const token = localStorage.getItem('dhanfunded-admin-token');
    try {
      const res = await fetch(`${API_BASE_URL}/ib/admin/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newSettings)
      });
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const renderApplications = () => (
    <div className="admin-table-container">
      <div className="table-header">
        <h3>Pending IB Applications</h3>
        <span className="badge">{applications.length} pending</span>
      </div>
      
      {applications.length === 0 ? (
        <div className="empty-state">
          <span className="icon">📋</span>
          <p>No pending applications</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Referral Code</th>
              <th>Business Name</th>
              <th>Applied At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {applications.map(ib => {
              const d = ib.applicationDetails || {};
              const isOpen = expandedAppId === ib._id;
              const lblStyle = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: 4 };
              const valStyle = { fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
              return (
              <React.Fragment key={ib._id}>
              <tr>
                <td>
                  <div className="user-info">
                    <strong>{ib.userId?.name || 'N/A'}</strong>
                    <small>{ib.userId?.email}</small>
                  </div>
                </td>
                <td><code>{ib.referralCode}</code></td>
                <td>{d.businessName || '-'}</td>
                <td>{new Date(ib.appliedAt).toLocaleDateString()}</td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setExpandedAppId(isOpen ? null : ib._id)}
                    >
                      {isOpen ? '▲ Hide' : '▼ View Details'}
                    </button>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => {
                        setSelectedIB(ib);
                        setModalType('approve');
                        setShowModal(true);
                      }}
                    >
                      Approve
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        setSelectedIB(ib);
                        setModalType('reject');
                        setShowModal(true);
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
              {isOpen && (
                <tr>
                  <td colSpan={5} style={{ background: 'var(--bg-secondary, #f8fafc)', padding: '16px 20px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                      📋 IB Application — {ib.userId?.name || 'N/A'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px 28px' }}>
                      <div>
                        <div style={lblStyle}>Business / Channel Name</div>
                        <div style={valStyle}>{d.businessName || '—'}</div>
                      </div>
                      <div>
                        <div style={lblStyle}>Website / Social Profile</div>
                        <div style={valStyle}>
                          {d.website
                            ? <a href={d.website} target="_blank" rel="noreferrer">{d.website}</a>
                            : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={lblStyle}>Expected Monthly Referrals</div>
                        <div style={valStyle}>{d.expectedMonthlyReferrals ?? '—'}</div>
                      </div>
                      <div>
                        <div style={lblStyle}>User Email</div>
                        <div style={valStyle}>{ib.userId?.email || '—'}</div>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={lblStyle}>Marketing Plan</div>
                        <div style={valStyle}>{d.marketingPlan || '—'}</div>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={lblStyle}>Past Experience</div>
                        <div style={valStyle}>{d.experience || '—'}</div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );

  const renderActiveIBs = () => (
    <div className="admin-table-container">
      <div className="table-header">
        <h3>Active IBs</h3>
        <span className="badge badge-success">{activeIBs.length} active</span>
      </div>
      
      {activeIBs.length === 0 ? (
        <div className="empty-state">
          <span className="icon">🤝</span>
          <p>No active IBs</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Coupons</th>
              <th>Total Commission</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeIBs.map(ib => (
              <tr key={ib._id}>
                <td>
                  <div className="user-info">
                    <strong>{ib.userId?.name || 'N/A'}</strong>
                    <small>{ib.oderId}</small>
                  </div>
                </td>
                <td>
                  <small style={{ color: 'var(--text-secondary)' }}>See Coupons tab</small>
                </td>
                <td className="text-success">{fmtInr(ib.stats?.totalCommissionEarned)}</td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="btn btn-warning btn-sm"
                      onClick={() => {
                        setSelectedIB(ib);
                        setModalType('suspend');
                        setShowModal(true);
                      }}
                    >
                      Suspend
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );

  const renderCoupons = () => (
    <div className="admin-table-container">
      {pendingCoupons.length > 0 && (
        <>
          <div className="table-header">
            <h3>Pending Coupon Requests</h3>
            <span className="badge badge-warning">{pendingCoupons.length}</span>
          </div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table className="admin-table" style={{ marginBottom: 24 }}>
            <thead>
              <tr>
                <th>IB</th>
                <th>Code</th>
                <th>Requested</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingCoupons.map(c => (
                <tr key={c._id}>
                  <td>
                    <div className="user-info">
                      <strong>{c.ibUserId?.name || 'N/A'}</strong>
                      <small>{c.ibUserId?.email || c.ibOderId}</small>
                    </div>
                  </td>
                  <td><code>{c.code}</code></td>
                  <td>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '-'}</td>
                  <td style={{ maxWidth: 240, fontSize: 12 }}>{c.applicationNote || '-'}</td>
                  <td>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => openIssueCouponModal(c)}
                    >
                      Approve &amp; Issue
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      <div className="table-header">
        <h3>Active Coupons</h3>
        <span className="badge badge-success">{activeCoupons.length}</span>
      </div>
      {activeCoupons.length === 0 ? (
        <div className="empty-state">
          <span className="icon">🎟️</span>
          <p>No active coupons</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>IB</th>
              <th>Code</th>
              <th>Discount %</th>
              <th>IB Commission %</th>
              <th>Expires In</th>
              <th>Redemptions</th>
              <th>Earned</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeCoupons.map(c => {
              const days = daysUntil(c.validUntil);
              return (
                <tr key={c._id}>
                  <td>
                    <div className="user-info">
                      <strong>{c.ibUserId?.name || 'N/A'}</strong>
                      <small>{c.ibUserId?.email || c.ibOderId}</small>
                    </div>
                  </td>
                  <td><code>{c.code}</code></td>
                  <td>{c.discountPercent}%</td>
                  <td>{c.challengePurchaseCommissionPercent}%</td>
                  <td>
                    <span className={`badge ${days <= 3 ? 'badge-warning' : 'badge-info'}`}>
                      {days} day{days === 1 ? '' : 's'}
                    </span>
                  </td>
                  <td>
                    {c.redemptionCount || 0}
                    <small style={{ color: 'var(--text-secondary)' }}>
                      {' / '}{c.maxRedemptions > 0 ? c.maxRedemptions : '∞'}
                    </small>
                  </td>
                  <td className="text-success">{fmtInr(c.totalCommissionEarned)}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => openIssueCouponModal(c)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRevokeCoupon(c._id)}
                      >
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );

  const renderRedemptions = () => (
    <div className="admin-table-container">
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <span className="stat-value">{redemptionSummary.count || 0}</span>
          <span className="stat-label">Total Redemptions</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#f59e0b' }}>{fmtInr(redemptionSummary.totalDiscount)}</span>
          <span className="stat-label">Total Discount</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#10b981' }}>{fmtInr(redemptionSummary.totalCommission)}</span>
          <span className="stat-label">Total IB Commission</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#3b82f6' }}>{fmtInr(redemptionSummary.totalNet)}</span>
          <span className="stat-label">Net Revenue</span>
        </div>
      </div>

      <div className="table-header">
        <h3>Coupon Redemptions</h3>
        <span className="badge">{redemptions.length} records</span>
      </div>
      {redemptions.length === 0 ? (
        <div className="empty-state">
          <span className="icon">💸</span>
          <p>No redemptions yet</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Coupon</th>
              <th>Buyer</th>
              <th>Challenge</th>
              <th>Original</th>
              <th>Discount</th>
              <th>Final</th>
              <th>IB Commission</th>
              <th>Account ID</th>
            </tr>
          </thead>
          <tbody>
            {redemptions.map(r => (
              <tr key={r._id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td><code>{r.couponSnapshot?.code}</code></td>
                <td>
                  <div className="user-info">
                    <strong>{r.userId?.name || 'N/A'}</strong>
                    <small>{r.userId?.oderId}</small>
                  </div>
                </td>
                <td>{r.challengeId?.name || '-'}</td>
                <td>{fmtInr(r.couponSnapshot?.originalFee)}</td>
                <td className="text-warning">−{fmtInr(r.couponSnapshot?.discountAmount)}</td>
                <td>{fmtInr(r.couponSnapshot?.finalFee)}</td>
                <td className="text-success">{fmtInr(r.couponSnapshot?.ibCommissionAmount)}</td>
                <td><code>{r.accountId}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );

  const renderWithdrawals = () => (
    <div className="admin-table-container">
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#f59e0b' }}>{withdrawalSummary.pending || 0}</span>
          <span className="stat-label">Pending</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#f59e0b' }}>{fmtInr(withdrawalSummary.totalPending)}</span>
          <span className="stat-label">Pending Amount</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#10b981' }}>{withdrawalSummary.approved || 0}</span>
          <span className="stat-label">Approved</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#10b981' }}>{fmtInr(withdrawalSummary.totalApproved)}</span>
          <span className="stat-label">Total Paid Out</span>
        </div>
      </div>

      <div className="table-header">
        <h3>IB Withdrawal Requests</h3>
        <span className="badge">{withdrawals.length} records</span>
      </div>

      {withdrawals.length === 0 ? (
        <div className="empty-state">
          <span className="icon">💸</span>
          <p>No IB withdrawal requests</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>IB</th>
              <th>Amount</th>
              <th>UPI ID</th>
              <th>Holder</th>
              <th>Note</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {withdrawals.map(w => (
              <tr key={w._id}>
                <td>{new Date(w.createdAt).toLocaleString()}</td>
                <td>
                  <div className="user-info">
                    <strong>{w.userName || w.oderId}</strong>
                    <small>{w.oderId}</small>
                  </div>
                </td>
                <td className="text-success" style={{ fontWeight: 700 }}>{fmtInr(w.amount)}</td>
                <td><code>{w.withdrawalInfo?.upiDetails?.upiId || w.paymentDetails?.upiId || '-'}</code></td>
                <td>{w.withdrawalInfo?.upiDetails?.name || '-'}</td>
                <td style={{ maxWidth: 220, fontSize: 12 }}>{w.userNote || '-'}</td>
                <td>
                  <span className={`badge ${
                    w.status === 'approved' || w.status === 'completed' ? 'badge-success' :
                    w.status === 'pending' ? 'badge-warning' :
                    w.status === 'rejected' ? 'badge-danger' :
                    'badge-secondary'
                  }`}>
                    {w.status}
                  </span>
                  {w.rejectionReason && (
                    <div style={{ fontSize: 10, color: '#ef4444', marginTop: 4 }}>{w.rejectionReason}</div>
                  )}
                </td>
                <td>
                  {w.status === 'pending' ? (
                    <div className="action-buttons">
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleWithdrawalAction(w._id, 'approve')}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleWithdrawalAction(w._id, 'reject')}
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <small style={{ color: 'var(--text-secondary)' }}>
                      {w.processedAt ? new Date(w.processedAt).toLocaleDateString() : '—'}
                    </small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );

  const renderCommissions = () => (
    <div className="admin-table-container">
      {/* Commission Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#10b981' }}>{fmtInr(commissionSummary.totalAmount)}</span>
          <span className="stat-label">Total Commission</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#f59e0b' }}>{fmtInr(commissionSummary.pendingAmount)}</span>
          <span className="stat-label">Pending</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#3b82f6' }}>{fmtInr(commissionSummary.creditedAmount)}</span>
          <span className="stat-label">Credited</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#8b5cf6' }}>{fmtInr(commissionSummary.paidAmount)}</span>
          <span className="stat-label">Paid Out</span>
        </div>
      </div>

      <div className="table-header">
        <h3>Commission Records</h3>
        <span className="badge">{commissions.length} records</span>
      </div>
      
      {commissions.length === 0 ? (
        <div className="empty-state">
          <span className="icon">💰</span>
          <p>No commission records found</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>IB</th>
              <th>Referred User</th>
              <th>Type</th>
              <th>Position Details</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {commissions.map(comm => (
              <tr key={comm._id}>
                <td>{new Date(comm.createdAt).toLocaleDateString()}</td>
                <td>
                  <div className="user-info">
                    <code>{comm.ibId?.referralCode || 'N/A'}</code>
                  </div>
                </td>
                <td>
                  <div className="user-info">
                    <strong>{comm.referredUserId?.name || 'N/A'}</strong>
                    <small>{comm.referredOderId || comm.referredUserId?.oderId}</small>
                  </div>
                </td>
                <td>
                  <span className="badge badge-info">{comm.commissionType}</span>
                  {comm.levelDepth > 1 && <small style={{ marginLeft: 4 }}>L{comm.levelDepth}</small>}
                </td>
                <td>
                  {comm.tradeDetails?.symbol ? (
                    <div>
                      <strong>{comm.tradeDetails.symbol}</strong>
                      <small style={{ display: 'block' }}>
                        {comm.tradeDetails.volume} lots | P/L: {fmtInr(comm.tradeDetails.profit)}
                      </small>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)' }}>{comm.sourceType}</span>
                  )}
                </td>
                <td className="text-success" style={{ fontWeight: 600 }}>
                  {fmtInr(comm.amount)}
                </td>
                <td>
                  <span className={`badge ${
                    comm.status === 'credited' ? 'badge-success' : 
                    comm.status === 'pending' ? 'badge-warning' : 
                    comm.status === 'paid' ? 'badge-info' : 
                    'badge-secondary'
                  }`}>
                    {comm.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );

  const renderSettings = () => (
    <div className="settings-container">
      <div className="settings-section">
        <h3>IB System Settings</h3>
        
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.total || 0}</span>
            <span className="stat-label">Total IBs</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.active || 0}</span>
            <span className="stat-label">Active IBs</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.pending || 0}</span>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{fmtInr(stats.totalCommissionPaid)}</span>
            <span className="stat-label">Total Commission Paid</span>
          </div>
        </div>

        <div className="settings-form">
            <div className="form-group">
              <label>
                <input 
                  type="checkbox" 
                  checked={settings.enabled}
                  onChange={(e) => handleUpdateSettings({ enabled: e.target.checked })}
                />
                Enable IB System
              </label>
            </div>
            
            <div className="form-group">
              <label>
                <input 
                  type="checkbox" 
                  checked={settings.autoApprove}
                  onChange={(e) => handleUpdateSettings({ autoApprove: e.target.checked })}
                />
                Auto-approve IB Applications
              </label>
            </div>

          </div>
      </div>
    </div>
  );

  const renderModal = () => {
    if (!showModal || !selectedIB) return null;

    return (
      <div className="modal-overlay" onClick={() => setShowModal(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          {modalType === 'approve' && (
            <>
              <h3>Approve IB &amp; Issue First Coupon</h3>
              <p>Approve <strong>{selectedIB.userId?.name}</strong> as an Introducing Broker?</p>
              <div className="ib-details">
                <p><strong>Referral Code:</strong> <code>{selectedIB.referralCode}</code></p>
                <p><strong>Business:</strong> {selectedIB.applicationDetails?.businessName || 'N/A'}</p>
              </div>
              <h4 style={{ marginTop: 16, marginBottom: 8 }}>First Coupon Settings</h4>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 0, marginBottom: 12 }}>
                Set the terms for this IB's first coupon. Code will auto-generate from the referral code (e.g. <code>{selectedIB.referralCode}-XX</code>). IB can request additional coupons later from their dashboard.
              </p>
              <div className="form-group">
                <label>Buyer Discount %</label>
                <input
                  type="number" min="0" max="100" step="0.1"
                  value={couponForm.discountPercent}
                  onChange={(e) => setCouponForm({ ...couponForm, discountPercent: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Validity (days)</label>
                <input
                  type="number" min="1" max="3650"
                  value={couponForm.validityDays}
                  onChange={(e) => setCouponForm({ ...couponForm, validityDays: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>IB Commission % on each purchase</label>
                <input
                  type="number" min="0" max="100" step="0.1"
                  value={couponForm.challengePurchaseCommissionPercent}
                  onChange={(e) => setCouponForm({ ...couponForm, challengePurchaseCommissionPercent: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Max Redemptions (0 = unlimited)</label>
                <input
                  type="number" min="0" step="1"
                  value={couponForm.maxRedemptions}
                  onChange={(e) => setCouponForm({ ...couponForm, maxRedemptions: e.target.value })}
                  placeholder="e.g. 10 — leave 0 for no cap"
                />
                <small style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                  Coupon auto-expires once this many uses are reached. IB can request a new one anytime.
                </small>
              </div>
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, padding: '10px 12px', fontSize: 13 }}>
                <strong>Code:</strong>{' '}
                <code>{(selectedIB.referralCode || selectedIB.code || '').toUpperCase().replace(/[-_]?\d+[A-Z]*$/, '').replace(/[-_]+$/, '').replace(/[^A-Z0-9]/g, '') || 'IB'}{Math.round(Number(couponForm.discountPercent) || 0)}</code>
                <br />
                <strong>Preview (₹{couponPreview.fee} challenge):</strong>{' '}
                Buyer pays <strong>{fmtInr(couponPreview.finalFee)}</strong> · IB earns <strong>{fmtInr(couponPreview.ibCut)}</strong>
                {Number(couponForm.maxRedemptions) > 0 && (
                  <> · Cap <strong>{couponForm.maxRedemptions}</strong> uses</>
                )}
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-success" onClick={() => handleApprove(selectedIB._id)}>Approve &amp; Issue Coupon</button>
              </div>
            </>
          )}

          {modalType === 'issue-coupon' && (
            <>
              <h3>{selectedIB.status === 'active' ? 'Edit' : 'Issue'} Coupon</h3>
              <p>
                For <strong>{selectedIB.ibUserId?.name || '—'}</strong>
              </p>
              {selectedIB.status === 'active' && (
                <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <strong>Note:</strong> Saving will reset the expiry to today + new validity days. Redemption count and earnings stay intact.
                </div>
              )}
              {selectedIB.status === 'pending_issue' && selectedIB.applicationNote && (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>
                  <strong>IB note:</strong> {selectedIB.applicationNote}
                </div>
              )}
              <div className="form-group">
                <label>Coupon Code</label>
                <input
                  type="text"
                  value={couponForm.code}
                  onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. VIBHOOTI20 — leave blank to auto-generate"
                  style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                />
                <small style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                  Edit if you want a custom code. Must be unique. Leave blank to auto-generate from name + discount %.
                </small>
              </div>
              <div className="form-group">
                <label>Buyer Discount %</label>
                <input
                  type="number" min="0" max="100" step="0.1"
                  value={couponForm.discountPercent}
                  onChange={(e) => setCouponForm({ ...couponForm, discountPercent: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Validity (days)</label>
                <input
                  type="number" min="1" max="3650"
                  value={couponForm.validityDays}
                  onChange={(e) => setCouponForm({ ...couponForm, validityDays: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>IB Commission % on each purchase</label>
                <input
                  type="number" min="0" max="100" step="0.1"
                  value={couponForm.challengePurchaseCommissionPercent}
                  onChange={(e) => setCouponForm({ ...couponForm, challengePurchaseCommissionPercent: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Max Redemptions (0 = unlimited)</label>
                <input
                  type="number" min="0" step="1"
                  value={couponForm.maxRedemptions}
                  onChange={(e) => setCouponForm({ ...couponForm, maxRedemptions: e.target.value })}
                  placeholder="e.g. 10 — leave 0 for no cap"
                />
                <small style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                  Coupon auto-expires once this many uses are reached. IB can then request a new coupon.
                </small>
              </div>
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, padding: '10px 12px', fontSize: 13 }}>
                <strong>Code:</strong>{' '}
                <code>{(selectedIB.referralCode || selectedIB.code || '').toUpperCase().replace(/[-_]?\d+[A-Z]*$/, '').replace(/[-_]+$/, '').replace(/[^A-Z0-9]/g, '') || 'IB'}{Math.round(Number(couponForm.discountPercent) || 0)}</code>
                <br />
                <strong>Preview (₹{couponPreview.fee} challenge):</strong>{' '}
                Buyer pays <strong>{fmtInr(couponPreview.finalFee)}</strong> · IB earns <strong>{fmtInr(couponPreview.ibCut)}</strong>
                {Number(couponForm.maxRedemptions) > 0 && (
                  <> · Cap <strong>{couponForm.maxRedemptions}</strong> uses</>
                )}
              </div>
              {modalError && (
                <div style={{
                  marginTop: 12, padding: '10px 12px', borderRadius: 6,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#ef4444', fontSize: 13
                }}>
                  ⚠ {modalError}
                </div>
              )}
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-success" onClick={() => handleIssueCoupon(selectedIB._id)}>
                  {selectedIB.status === 'active' ? 'Save Changes' : 'Issue Coupon'}
                </button>
              </div>
            </>
          )}

          {modalType === 'reject' && (
            <>
              <h3>Reject IB Application</h3>
              <p>Reject {selectedIB.userId?.name}'s application?</p>
              <div className="form-group">
                <label>Rejection Reason</label>
                <textarea 
                  id="rejectReason"
                  placeholder="Enter reason for rejection..."
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button 
                  className="btn btn-danger" 
                  onClick={() => handleReject(selectedIB._id, document.getElementById('rejectReason').value)}
                >
                  Reject
                </button>
              </div>
            </>
          )}

          {modalType === 'suspend' && (
            <>
              <h3>Suspend IB</h3>
              <p>Suspend {selectedIB.userId?.name}?</p>
              <div className="form-group">
                <label>Suspension Reason</label>
                <textarea 
                  id="suspendReason"
                  placeholder="Enter reason for suspension..."
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button 
                  className="btn btn-warning" 
                  onClick={() => handleSuspend(selectedIB._id, document.getElementById('suspendReason').value)}
                >
                  Suspend
                </button>
              </div>
            </>
          )}

          {modalType === 'edit' && (
            <>
              <h3>Edit IB Commission Settings</h3>
              <div className="form-group">
                <label>Commission Type</label>
                <select defaultValue={selectedIB.commissionSettings?.type}>
                  <option value="per_lot">Per Lot</option>
                  <option value="revenue_percent">Revenue Percent</option>
                  <option value="spread_share">Spread Share</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div className="form-group">
                <label>Per Lot Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  defaultValue={selectedIB.commissionSettings?.perLotAmount || 0}
                />
              </div>
              <div className="form-group">
                <label>Revenue Percent (%)</label>
                <input 
                  type="number" 
                  step="0.1"
                  defaultValue={selectedIB.commissionSettings?.revenuePercent || 0}
                />
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary">Save Changes</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="admin-page ib-management">
      <div className="page-header">
        <h2>🤝 IB Management</h2>
        <p>Manage Introducing Brokers and commission settings</p>
      </div>

      <div className="tabs-container">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => handleTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="error-message">{error}</div>}
      
      {loading ? (
        <div className="loading-spinner">Loading...</div>
      ) : (
        <div className="tab-content">
          {activeTab === 'applications' && renderApplications()}
          {activeTab === 'active' && renderActiveIBs()}
          {activeTab === 'coupons' && renderCoupons()}
          {activeTab === 'global-coupons' && renderGlobalCoupons()}
          {activeTab === 'redemptions' && renderRedemptions()}
          {activeTab === 'withdrawals' && renderWithdrawals()}
          {activeTab === 'commissions' && renderCommissions()}
          {activeTab === 'settings' && renderSettings()}
        </div>
      )}

      {renderModal()}
    </div>
  );
};

export default IBManagement;
