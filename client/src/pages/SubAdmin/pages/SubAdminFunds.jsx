import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

function SubAdminFunds() {
  const { API_URL, adminAuth } = useOutletContext();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, pending, approved, rejected
  const [type, setType] = useState('all'); // all, deposit, withdrawal

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const adminId = adminAuth?.user?._id;
      if (!adminId) return;

      const res = await fetch(`${API_URL}/api/admin/hierarchy/${adminId}/all-transactions`);
      const data = await res.json();
      if (data.success) {
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const processTransaction = async (txId, status) => {
    try {
      const res = await fetch(`${API_URL}/api/transactions/${txId}/process`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, processedBy: adminAuth?.user?.oderId })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Transaction ${status}!`);
        fetchTransactions();
      } else {
        alert(data.error || 'Failed to process transaction');
      }
    } catch (error) {
      console.error('Error processing transaction:', error);
      alert('Error processing transaction');
    }
  };

  const filteredTransactions = transactions.filter(tx => {
    const matchesFilter = filter === 'all' || tx.status === filter;
    const matchesType = type === 'all' || tx.type === type;
    return matchesFilter && matchesType;
  });

  const stats = {
    totalDeposits: transactions.filter(t => t.type === 'deposit' && t.status === 'approved').reduce((sum, t) => sum + t.amount, 0),
    totalWithdrawals: transactions.filter(t => t.type === 'withdrawal' && t.status === 'approved').reduce((sum, t) => sum + t.amount, 0),
    pendingDeposits: transactions.filter(t => t.type === 'deposit' && t.status === 'pending').length,
    pendingWithdrawals: transactions.filter(t => t.type === 'withdrawal' && t.status === 'pending').length
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading transactions...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>Fund Management</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)'
            }}
          >
            <option value="all">All Types</option>
            <option value="deposit">Deposits</option>
            <option value="withdrawal">Withdrawals</option>
          </select>
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
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Deposits" value={`₹${stats.totalDeposits.toLocaleString()}`} color="#22c55e" />
        <StatCard label="Total Withdrawals" value={`₹${stats.totalWithdrawals.toLocaleString()}`} color="#ef4444" />
        <StatCard label="Pending Deposits" value={stats.pendingDeposits} color="#eab308" />
        <StatCard label="Pending Withdrawals" value={stats.pendingWithdrawals} color="#f97316" />
      </div>

      {/* Transactions Table */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Date</th>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>User ID</th>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Type</th>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Amount</th>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Method</th>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Status</th>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No transactions found
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(tx => (
                  <tr key={tx._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 16, color: 'var(--text-secondary)' }}>
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: 16, color: 'var(--text-primary)' }}>#{tx.oderId}</td>
                    <td style={{ padding: 16 }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        background: tx.type === 'deposit' ? '#22c55e20' : '#ef444420',
                        color: tx.type === 'deposit' ? '#22c55e' : '#ef4444'
                      }}>
                        {tx.type?.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: 16, color: 'var(--text-primary)', fontWeight: 600 }}>
                      ₹{tx.amount?.toLocaleString()}
                    </td>
                    <td style={{ padding: 16, color: 'var(--text-secondary)' }}>
                      {tx.paymentMethod || 'N/A'}
                    </td>
                    <td style={{ padding: 16 }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        background: tx.status === 'approved' ? '#22c55e' : tx.status === 'rejected' ? '#ef4444' : '#eab308',
                        color: 'white'
                      }}>
                        {tx.status?.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: 16 }}>
                      {tx.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => processTransaction(tx._id, 'approved')}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 6,
                              border: 'none',
                              background: '#22c55e',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: 12
                            }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => processTransaction(tx._id, 'rejected')}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 6,
                              border: 'none',
                              background: '#ef4444',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: 12
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Processed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: 12,
      padding: 16,
      border: '1px solid var(--border)'
    }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export default SubAdminFunds;
