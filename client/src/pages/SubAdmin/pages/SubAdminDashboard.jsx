import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

function SubAdminDashboard() {
  const { API_URL, adminAuth } = useOutletContext();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalBrokers: 0,
    totalTrades: 0,
    totalDeposits: 0,
    activeUsers: 0,
    pendingDeposits: 0,
    walletBalance: 0
  });
  const [recentUsers, setRecentUsers] = useState([]);
  const [recentTrades, setRecentTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const adminId = adminAuth?.user?._id;
      if (!adminId) return;

      // Fetch stats for this sub-admin's hierarchy
      const [usersRes, brokersRes, tradesRes, depositsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/hierarchy/${adminId}/users`),
        fetch(`${API_URL}/api/admin/hierarchy/${adminId}/brokers`),
        fetch(`${API_URL}/api/admin/hierarchy/${adminId}/trades`),
        fetch(`${API_URL}/api/admin/hierarchy/${adminId}/deposits`)
      ]);

      const usersData = await usersRes.json();
      const brokersData = await brokersRes.json();
      const tradesData = await tradesRes.json();
      const depositsData = await depositsRes.json();

      const users = usersData.users || [];
      const brokers = brokersData.brokers || [];
      const trades = tradesData.trades || [];
      const deposits = depositsData.transactions || [];

      setStats({
        totalUsers: users.length,
        totalBrokers: brokers.length,
        totalTrades: trades.length,
        totalDeposits: deposits.reduce((sum, d) => d.status === 'approved' ? sum + d.amount : sum, 0),
        activeUsers: users.filter(u => u.isActive).length,
        pendingDeposits: deposits.filter(d => d.status === 'pending').length,
        walletBalance: adminAuth?.user?.wallet?.balance || 0
      });

      setRecentUsers(users.slice(0, 5));
      setRecentTrades(trades.slice(0, 5));
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading dashboard...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard icon="👥" value={stats.totalUsers} label="My Users" color="#3b82f6" />
        <StatCard icon="🏢" value={stats.totalBrokers} label="My Brokers" color="#10b981" />
        <StatCard icon="📈" value={stats.totalTrades} label="Total Positions" color="#f59e0b" />
        <StatCard icon="💰" value={`₹${stats.totalDeposits.toLocaleString()}`} label="Total Deposits" color="#8b5cf6" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard icon="✅" value={stats.activeUsers} label="Active Users" color="#22c55e" />
        <StatCard icon="⏳" value={stats.pendingDeposits} label="Pending Deposits" color="#eab308" />
        <StatCard icon="💳" value={`₹${stats.walletBalance.toLocaleString()}`} label="My Wallet" color="#06b6d4" />
      </div>

      {/* Recent Users */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Recent Users</h3>
        {recentUsers.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No users yet</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: 8, color: 'var(--text-secondary)' }}>ID</th>
                <th style={{ textAlign: 'left', padding: 8, color: 'var(--text-secondary)' }}>Name</th>
                <th style={{ textAlign: 'left', padding: 8, color: 'var(--text-secondary)' }}>Email</th>
                <th style={{ textAlign: 'left', padding: 8, color: 'var(--text-secondary)' }}>Balance</th>
                <th style={{ textAlign: 'left', padding: 8, color: 'var(--text-secondary)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map(user => (
                <tr key={user._id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 8, color: 'var(--text-primary)' }}>#{user.oderId}</td>
                  <td style={{ padding: 8, color: 'var(--text-primary)' }}>{user.name}</td>
                  <td style={{ padding: 8, color: 'var(--text-secondary)' }}>{user.email}</td>
                  <td style={{ padding: 8, color: 'var(--text-primary)' }}>₹{user.wallet?.balance?.toLocaleString() || 0}</td>
                  <td style={{ padding: 8 }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      background: user.isActive ? '#22c55e' : '#ef4444',
                      color: 'white'
                    }}>
                      {user.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Positions */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20 }}>
        <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Recent Positions</h3>
        {recentTrades.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No positions yet</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: 8, color: 'var(--text-secondary)' }}>Symbol</th>
                <th style={{ textAlign: 'left', padding: 8, color: 'var(--text-secondary)' }}>Side</th>
                <th style={{ textAlign: 'left', padding: 8, color: 'var(--text-secondary)' }}>Volume</th>
                <th style={{ textAlign: 'left', padding: 8, color: 'var(--text-secondary)' }}>P/L</th>
              </tr>
            </thead>
            <tbody>
              {recentTrades.map((trade, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 8, color: 'var(--text-primary)' }}>{trade.symbol}</td>
                  <td style={{ padding: 8, color: trade.side === 'buy' ? '#22c55e' : '#ef4444' }}>{trade.side?.toUpperCase()}</td>
                  <td style={{ padding: 8, color: 'var(--text-primary)' }}>{trade.volume}</td>
                  <td style={{ padding: 8, color: (trade.profit || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                    {(trade.profit || 0) >= 0 ? '+' : ''}{trade.profit?.toFixed(2) || '0.00'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, color }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: 12,
      padding: 20,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      border: '1px solid var(--border)'
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: `${color}20`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</div>
      </div>
    </div>
  );
}

export default SubAdminDashboard;
