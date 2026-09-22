import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import './BusinessPage.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const BusinessPage = () => {
  const ctx = useOutletContext();
  const { user } = ctx;
  // IB values are stored natively as INR on the server — display as-is.
  const fmtInr = (inr) => `₹${Number(inr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ibProfile, setIbProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showApplyModal, setShowApplyModal] = useState(false);
  
  // Dashboard data
  const [referrals, setReferrals] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchIBProfile();
  }, []);

  const fetchIBProfile = async () => {
    setLoading(true);
    const token = localStorage.getItem('dhanfunded-token');
    
    try {
      const res = await fetch(`${API_URL}/api/ib/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (data.success && data.data) {
        setIbProfile(data.data);
        if (data.data.status === 'active') {
          fetchDashboardData();
        }
      }
    } catch (err) {
      console.error('Error fetching IB profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    const token = localStorage.getItem('dhanfunded-token');
    
    try {
      // Fetch dashboard
      const dashRes = await fetch(`${API_URL}/api/ib/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const dashData = await dashRes.json();
      if (dashData.success) {
        setStats(dashData.data.referralStats);
      }

      // Fetch referrals
      const refRes = await fetch(`${API_URL}/api/ib/referrals?limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const refData = await refRes.json();
      if (refData.success) {
        setReferrals(refData.data.referrals || []);
      }

      // Fetch commissions
      const commRes = await fetch(`${API_URL}/api/ib/commissions?limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const commData = await commRes.json();
      if (commData.success) {
        setCommissions(commData.data.commissions || []);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    }
  };

  const handleApply = async (formData) => {
    const token = localStorage.getItem('dhanfunded-token');
    setError(null);
    
    try {
      const res = await fetch(`${API_URL}/api/ib/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      const data = await res.json();
      if (data.success) {
        setIbProfile(data.data);
        setShowApplyModal(false);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const copyReferralCode = () => {
    if (ibProfile?.referralCode) {
      navigator.clipboard.writeText(ibProfile.referralCode);
      alert('Referral code copied!');
    }
  };

  const copyReferralLink = () => {
    if (ibProfile?.referralCode) {
      const link = `${window.location.origin}/register?ref=${ibProfile.referralCode}`;
      navigator.clipboard.writeText(link);
      alert('Referral link copied!');
    }
  };

  if (loading) {
    return (
      <div className="business-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Not an IB yet - show apply section
  if (!ibProfile) {
    return (
      <div className="business-page">
        <div className="page-header">
          <h1>🤝 IB Partner Program</h1>
          <p>Earn commissions by referring people to our platform</p>
        </div>

        <div className="ib-benefits">
          <h2>Why Become an IB?</h2>
          <div className="benefits-grid">
            <div className="benefit-card">
              <span className="icon">💰</span>
              <h3>Earn Commissions</h3>
              <p>Get paid for every order your referrals make</p>
            </div>
            <div className="benefit-card">
              <span className="icon">📈</span>
              <h3>Multi-Level Earnings</h3>
              <p>Earn from your sub-IBs' referrals too</p>
            </div>
            <div className="benefit-card">
              <span className="icon">🎯</span>
              <h3>Real-Time Tracking</h3>
              <p>Monitor your referrals and earnings in real-time</p>
            </div>
            <div className="benefit-card">
              <span className="icon">💳</span>
              <h3>Easy Withdrawals</h3>
              <p>Withdraw your earnings anytime</p>
            </div>
          </div>
        </div>

        <div className="apply-section">
          <button className="btn-apply" onClick={() => setShowApplyModal(true)}>
            Apply to Become an IB
          </button>
        </div>

        {showApplyModal && (
          <ApplyModal 
            onClose={() => setShowApplyModal(false)} 
            onSubmit={handleApply}
            error={error}
          />
        )}
      </div>
    );
  }

  // Pending status
  if (ibProfile.status === 'pending') {
    return (
      <div className="business-page">
        <div className="page-header">
          <h1>🤝 IB Application</h1>
        </div>
        <div className="status-card pending">
          <span className="icon">⏳</span>
          <h2>Application Pending</h2>
          <p>Your IB application is being reviewed. We'll notify you once it's approved.</p>
          <p className="applied-date">Applied: {new Date(ibProfile.appliedAt).toLocaleDateString()}</p>
        </div>
      </div>
    );
  }

  // Rejected status
  if (ibProfile.status === 'rejected') {
    return (
      <div className="business-page">
        <div className="page-header">
          <h1>🤝 IB Application</h1>
        </div>
        <div className="status-card rejected">
          <span className="icon">❌</span>
          <h2>Application Rejected</h2>
          <p>Unfortunately, your IB application was not approved.</p>
          {ibProfile.rejectedReason && (
            <p className="reason">Reason: {ibProfile.rejectedReason}</p>
          )}
          <button className="btn-reapply" onClick={() => setShowApplyModal(true)}>
            Apply Again
          </button>
        </div>
        {showApplyModal && (
          <ApplyModal
            onClose={() => setShowApplyModal(false)}
            onSubmit={handleApply}
            error={error}
          />
        )}
      </div>
    );
  }

  // Suspended status — admin has suspended this IB. Hide the dashboard and offer reapply.
  if (ibProfile.status === 'suspended') {
    return (
      <div className="business-page">
        <div className="page-header">
          <h1>🤝 IB Program</h1>
        </div>
        <div className="status-card rejected" style={{ borderColor: '#f59e0b' }}>
          <span className="icon">🚫</span>
          <h2>You have been suspended from the IB program</h2>
          <p>Your IB account has been suspended by an administrator. You cannot access the IB dashboard until you reapply and get approved again.</p>
          {ibProfile.adminNotes && (
            <p className="reason"><strong>Reason:</strong> {ibProfile.adminNotes}</p>
          )}
          <button className="btn-reapply" onClick={() => setShowApplyModal(true)}>
            Reapply to IB Program
          </button>
        </div>
        {showApplyModal && (
          <ApplyModal
            onClose={() => setShowApplyModal(false)}
            onSubmit={handleApply}
            error={error}
          />
        )}
      </div>
    );
  }

  // Active IB Dashboard
  return (
    <div className="business-page">
      <div className="page-header">
        <h1>🤝 IB Dashboard</h1>
        <div className="referral-code-box">
          <span>Your Referral Code:</span>
          <code>{ibProfile.referralCode}</code>
          <button onClick={copyReferralCode} title="Copy Code">📋</button>
          <button onClick={copyReferralLink} title="Copy Link">🔗</button>
        </div>
      </div>

      <div className="tabs">
        <button 
          className={activeTab === 'overview' ? 'active' : ''} 
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={activeTab === 'referrals' ? 'active' : ''} 
          onClick={() => setActiveTab('referrals')}
        >
          Referrals
        </button>
        <button 
          className={activeTab === 'commissions' ? 'active' : ''} 
          onClick={() => setActiveTab('commissions')}
        >
          Commissions
        </button>
        <button 
          className={activeTab === 'withdraw' ? 'active' : ''} 
          onClick={() => setActiveTab('withdraw')}
        >
          Withdraw
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="overview-tab">
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{fmtInr(ibProfile.wallet?.balance)}</span>
              <span className="stat-label">Available Balance</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{fmtInr(ibProfile.stats?.totalCommissionEarned)}</span>
              <span className="stat-label">Total Earned</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{ibProfile.stats?.totalReferrals || 0}</span>
              <span className="stat-label">Total Referrals</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{ibProfile.stats?.activeReferrals || 0}</span>
              <span className="stat-label">Active Referrals</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{(ibProfile.stats?.totalLotsTraded || 0).toFixed(2)}</span>
              <span className="stat-label">Total Lots Executed</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{fmtInr(ibProfile.stats?.thisMonthCommission)}</span>
              <span className="stat-label">This Month</span>
            </div>
          </div>

          <div className="commission-info">
            <h3>Your Commission Settings</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">Commission Type:</span>
                <span className="value">{ibProfile.commissionSettings?.type || 'per_lot'}</span>
              </div>
              {ibProfile.commissionSettings?.type === 'per_lot' && (
                <div className="info-item">
                  <span className="label">Per Lot:</span>
                  <span className="value">{fmtInr(ibProfile.commissionSettings?.perLotAmount)}</span>
                </div>
              )}
              {ibProfile.commissionSettings?.type === 'revenue_percent' && (
                <div className="info-item">
                  <span className="label">Revenue Share:</span>
                  <span className="value">{ibProfile.commissionSettings?.revenuePercent || 0}%</span>
                </div>
              )}
              <div className="info-item">
                <span className="label">IB Level:</span>
                <span className="value">Level {ibProfile.level}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'referrals' && (
        <div className="referrals-tab">
          <h3>Your Referrals</h3>
          {referrals.length === 0 ? (
            <div className="empty-state">
              <p>No referrals yet. Share your referral code to start earning!</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th>Total Orders</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map(ref => (
                  <tr key={ref._id}>
                    <td>{ref.name}</td>
                    <td>{new Date(ref.createdAt).toLocaleDateString()}</td>
                    <td>
                      <span className={`status ${ref.isActive ? 'active' : 'inactive'}`}>
                        {ref.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{ref.stats?.totalTrades || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'commissions' && (
        <div className="commissions-tab">
          <h3>Commission History</h3>
          {commissions.length === 0 ? (
            <div className="empty-state">
              <p>No commissions yet. Your referrals need to start practicing!</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>From</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map(comm => (
                  <tr key={comm._id}>
                    <td>{new Date(comm.createdAt).toLocaleDateString()}</td>
                    <td>{comm.commissionType}</td>
                    <td>{comm.referredUserId?.name || 'Sub-IB'}</td>
                    <td className="amount">{fmtInr(comm.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'withdraw' && (
        <div className="withdraw-tab">
          <h3>Withdraw Funds</h3>
          <div className="balance-display">
            <span className="label">Available Balance:</span>
            <span className="amount">{fmtInr(ibProfile.wallet?.balance)}</span>
          </div>
          <WithdrawForm balance={ibProfile.wallet?.balance || 0} />
        </div>
      )}
    </div>
  );
};

// Apply Modal Component
const ApplyModal = ({ onClose, onSubmit, error }) => {
  const [formData, setFormData] = useState({
    businessName: '',
    website: '',
    marketingPlan: '',
    expectedMonthlyReferrals: 0,
    experience: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Apply to Become an IB</h2>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Business Name (Optional)</label>
            <input 
              type="text"
              value={formData.businessName}
              onChange={e => setFormData({...formData, businessName: e.target.value})}
              placeholder="Your business or brand name"
            />
          </div>
          <div className="form-group">
            <label>Website (Optional)</label>
            <input 
              type="url"
              value={formData.website}
              onChange={e => setFormData({...formData, website: e.target.value})}
              placeholder="https://yourwebsite.com"
            />
          </div>
          <div className="form-group">
            <label>Marketing Plan</label>
            <textarea 
              value={formData.marketingPlan}
              onChange={e => setFormData({...formData, marketingPlan: e.target.value})}
              placeholder="How do you plan to refer people?"
              rows="3"
            />
          </div>
          <div className="form-group">
            <label>Expected Monthly Referrals</label>
            <input 
              type="number"
              value={formData.expectedMonthlyReferrals}
              onChange={e => setFormData({...formData, expectedMonthlyReferrals: parseInt(e.target.value)})}
              min="0"
            />
          </div>
          <div className="form-group">
            <label>Market/IB Experience</label>
            <textarea 
              value={formData.experience}
              onChange={e => setFormData({...formData, experience: e.target.value})}
              placeholder="Describe your experience in the markets or as an IB"
              rows="3"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Submit Application</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Withdraw Form Component
const WithdrawForm = ({ balance }) => {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // IB wallet balance and amount are both in INR.
  const handleWithdraw = async (e) => {
    e.preventDefault();
    const inrAmount = parseFloat(amount);
    if (!inrAmount || inrAmount <= 0) return;
    if (inrAmount > Number(balance || 0)) {
      setMessage({ type: 'error', text: 'Insufficient balance' });
      return;
    }

    setLoading(true);
    const token = localStorage.getItem('dhanfunded-token');

    try {
      const res = await fetch(`${API_URL}/api/ib/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount: inrAmount })
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Withdrawal request submitted!' });
        setAmount('');
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="withdraw-form" onSubmit={handleWithdraw}>
      {message && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}
      <div className="form-group">
        <label>Amount to Withdraw (₹)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          max={balance}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Enter amount in ₹"
        />
      </div>
      <button type="submit" className="btn-primary" disabled={loading || !amount}>
        {loading ? 'Processing...' : 'Request Withdrawal'}
      </button>
      <p className="note">Minimum withdrawal: ₹50. Withdrawals require admin approval.</p>
    </form>
  );
};

export default BusinessPage;
