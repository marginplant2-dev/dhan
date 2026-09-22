import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

function BrokerWallet() {
  const { API_URL, adminAuth } = useOutletContext();
  const [wallet, setWallet] = useState({ balance: 0, credit: 0, totalDeposits: 0, totalWithdrawals: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    try {
      const adminId = adminAuth?.user?._id;
      if (!adminId) return;

      // Get admin details for wallet
      const adminRes = await fetch(`${API_URL}/api/admin/hierarchy/${adminId}`);
      const adminData = await adminRes.json();
      if (adminData.success && adminData.admin) {
        setWallet(adminData.admin.wallet || { balance: 0, credit: 0, totalDeposits: 0, totalWithdrawals: 0 });
      }

      // Get fund request transactions
      const txRes = await fetch(`${API_URL}/api/admin/hierarchy/${adminId}/my-fund-requests`);
      const txData = await txRes.json();
      if (txData.success) {
        setTransactions(txData.transactions || []);
      }
    } catch (error) {
      console.error('Error fetching wallet data:', error);
    } finally {
      setLoading(false);
    }
  };

  const requestFunds = async () => {
    const amount = parseFloat(requestAmount);
    if (!amount || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      const adminId = adminAuth?.user?._id;
      
      const res = await fetch(`${API_URL}/api/admin/hierarchy/request-fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: adminId,
          amount
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Fund request submitted to your parent admin!');
        setShowRequestModal(false);
        setRequestAmount('');
        fetchWalletData();
      } else {
        alert(data.error || 'Failed to submit request');
      }
    } catch (error) {
      console.error('Error requesting funds:', error);
      alert('Error submitting request');
    }
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading wallet...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Wallet Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <WalletCard icon="💰" value={`₹${wallet.balance.toLocaleString()}`} label="Balance" color="#3b82f6" />
        <WalletCard icon="🎁" value={`₹${wallet.credit.toLocaleString()}`} label="Credit" color="#10b981" />
        <WalletCard icon="📥" value={`₹${wallet.totalDeposits.toLocaleString()}`} label="Total Received" color="#8b5cf6" />
        <WalletCard icon="📤" value={`₹${wallet.totalWithdrawals.toLocaleString()}`} label="Total Given" color="#f59e0b" />
      </div>

      {/* Request Funds Button */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => setShowRequestModal(true)}
          style={{
            padding: '12px 24px',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 14
          }}
        >
          Request Funds from Parent Admin
        </button>
      </div>

      {/* Transaction History */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20 }}>
        <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Fund Request History</h3>
        
        {transactions.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>No fund requests yet</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: 12, color: 'var(--text-secondary)' }}>Date</th>
                <th style={{ textAlign: 'left', padding: 12, color: 'var(--text-secondary)' }}>Amount</th>
                <th style={{ textAlign: 'left', padding: 12, color: 'var(--text-secondary)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx._id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 12, color: 'var(--text-primary)' }}>
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
                    ₹{tx.amount?.toLocaleString()}
                  </td>
                  <td style={{ padding: 12 }}>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 400,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Request Funds</h3>
              <button onClick={() => setShowRequestModal(false)} style={{
                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)'
              }}>×</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-secondary)' }}>Amount (₹)</label>
              <input
                type="number"
                value={requestAmount}
                onChange={(e) => setRequestAmount(e.target.value)}
                placeholder="Enter amount"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: 16
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowRequestModal(false)} style={{
                flex: 1, padding: '12px', borderRadius: 8, border: 'none',
                background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer'
              }}>Cancel</button>
              <button onClick={requestFunds} style={{
                flex: 1, padding: '12px', borderRadius: 8, border: 'none',
                background: '#10b981', color: 'white', cursor: 'pointer', fontWeight: 600
              }}>Submit Request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WalletCard({ icon, value, label, color }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: 12,
      padding: 20,
      border: '1px solid var(--border)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: `${color}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

export default BrokerWallet;
