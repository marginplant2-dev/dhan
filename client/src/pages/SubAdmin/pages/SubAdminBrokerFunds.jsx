import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

function SubAdminBrokerFunds() {
  const { API_URL, adminAuth } = useOutletContext();
  const [fundRequests, setFundRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, pending, approved, rejected

  useEffect(() => {
    fetchBrokerFundRequests();
  }, []);

  const fetchBrokerFundRequests = async () => {
    try {
      const adminId = adminAuth?.user?._id;
      if (!adminId) {
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}/api/admin/hierarchy/${adminId}/fund-requests`);
      const data = await res.json();
      if (data.success) {
        // Filter only admin_fund_request type (broker requests)
        const brokerRequests = (data.transactions || []).filter(
          tx => tx.type === 'admin_fund_request'
        );
        setFundRequests(brokerRequests);
      }
    } catch (error) {
      console.error('Error fetching broker fund requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const approveFundRequest = async (transactionId) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/hierarchy/approve-fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          approverId: adminAuth?.user?._id
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Fund request approved successfully!');
        fetchBrokerFundRequests();
      } else {
        alert(data.error || 'Failed to approve request');
      }
    } catch (error) {
      console.error('Error approving fund request:', error);
      alert('Error approving fund request');
    }
  };

  const rejectFundRequest = async (transactionId) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    try {
      const res = await fetch(`${API_URL}/api/admin/hierarchy/reject-fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          rejectionReason: reason
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Fund request rejected');
        fetchBrokerFundRequests();
      } else {
        alert(data.error || 'Failed to reject request');
      }
    } catch (error) {
      console.error('Error rejecting fund request:', error);
      alert('Error rejecting fund request');
    }
  };

  const filteredRequests = fundRequests.filter(req => {
    return filter === 'all' || req.status === filter;
  });

  const stats = {
    total: fundRequests.length,
    pending: fundRequests.filter(r => r.status === 'pending').length,
    approved: fundRequests.filter(r => r.status === 'approved').length,
    rejected: fundRequests.filter(r => r.status === 'rejected').length,
    totalAmount: fundRequests.filter(r => r.status === 'approved').reduce((sum, r) => sum + r.amount, 0)
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading broker fund requests...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>Broker Fund Requests</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)'
            }}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            onClick={fetchBrokerFundRequests}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Total Requests</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{stats.total}</div>
        </div>
        <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Pending</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>{stats.pending}</div>
        </div>
        <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Approved</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{stats.approved}</div>
        </div>
        <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Total Disbursed</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>₹{stats.totalAmount.toLocaleString()}</div>
        </div>
      </div>

      {/* Requests Table */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)' }}>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>ID</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Broker</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Amount</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Status</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Date</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No broker fund requests found
                </td>
              </tr>
            ) : (
              filteredRequests.map((req, idx) => (
                <tr key={req._id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>
                    #{req._id?.slice(-6)}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {req.requesterName || 'N/A'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {req.requesterOderId || req.oderId}
                      <span style={{ marginLeft: 6, color: '#10b981', fontWeight: 500 }}>
                        (Broker)
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#10b981', fontWeight: 600 }}>
                    ₹{req.amount?.toLocaleString()}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 500,
                      background: req.status === 'pending' ? 'rgba(245, 158, 11, 0.15)' :
                                  req.status === 'approved' ? 'rgba(16, 185, 129, 0.15)' :
                                  'rgba(239, 68, 68, 0.15)',
                      color: req.status === 'pending' ? '#f59e0b' :
                             req.status === 'approved' ? '#10b981' : '#ef4444'
                    }}>
                      {req.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: 13 }}>
                    {new Date(req.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {req.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => approveFundRequest(req._id)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 6,
                            border: 'none',
                            background: '#10b981',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 500
                          }}
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => rejectFundRequest(req._id)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 6,
                            border: 'none',
                            background: '#ef4444',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 500
                          }}
                        >
                          ✗ Reject
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {req.status === 'approved' ? '✓ Processed' : '✗ Rejected'}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SubAdminBrokerFunds;
