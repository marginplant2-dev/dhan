import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

function SubAdminTrades() {
  const { API_URL, adminAuth } = useOutletContext();
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, open, closed
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchTrades();
  }, []);

  const fetchTrades = async () => {
    try {
      const adminId = adminAuth?.user?._id;
      if (!adminId) return;

      const res = await fetch(`${API_URL}/api/admin/hierarchy/${adminId}/trades`);
      const data = await res.json();
      if (data.success) {
        setTrades(data.trades || []);
      }
    } catch (error) {
      console.error('Error fetching positions:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTrades = trades.filter(trade => {
    const matchesFilter = filter === 'all' || 
      (filter === 'open' && trade.status === 'open') ||
      (filter === 'closed' && trade.status === 'closed');
    
    const matchesSearch = !searchTerm || 
      trade.symbol?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trade.oderId?.includes(searchTerm);
    
    return matchesFilter && matchesSearch;
  });

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading positions...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>Position Management ({trades.length})</h2>
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
            <option value="all">All Positions</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
          <input
            type="text"
            placeholder="Search by symbol or user ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              width: 220
            }}
          />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Positions" value={trades.length} color="#3b82f6" />
        <StatCard label="Open Positions" value={trades.filter(t => t.status === 'open').length} color="#22c55e" />
        <StatCard label="Closed Positions" value={trades.filter(t => t.status === 'closed').length} color="#6b7280" />
        <StatCard 
          label="Total P/L" 
          value={`₹${trades.reduce((sum, t) => sum + (t.profit || 0), 0).toFixed(2)}`} 
          color={trades.reduce((sum, t) => sum + (t.profit || 0), 0) >= 0 ? '#22c55e' : '#ef4444'} 
        />
      </div>

      {/* Trades Table */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>User ID</th>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Symbol</th>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Side</th>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Volume</th>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Open Price</th>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Current/Close</th>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>P/L</th>
                <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No positions found
                  </td>
                </tr>
              ) : (
                filteredTrades.map((trade, idx) => (
                  <tr key={trade._id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 16, color: 'var(--text-primary)' }}>#{trade.oderId}</td>
                    <td style={{ padding: 16, color: 'var(--text-primary)', fontWeight: 600 }}>{trade.symbol}</td>
                    <td style={{ padding: 16 }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        background: trade.side === 'buy' ? '#22c55e20' : '#ef444420',
                        color: trade.side === 'buy' ? '#22c55e' : '#ef4444'
                      }}>
                        {trade.side?.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: 16, color: 'var(--text-primary)' }}>{trade.volume}</td>
                    <td style={{ padding: 16, color: 'var(--text-primary)' }}>{trade.openPrice?.toFixed(5)}</td>
                    <td style={{ padding: 16, color: 'var(--text-primary)' }}>
                      {trade.status === 'closed' ? trade.closePrice?.toFixed(5) : trade.currentPrice?.toFixed(5) || '-'}
                    </td>
                    <td style={{ padding: 16, color: (trade.profit || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                      {(trade.profit || 0) >= 0 ? '+' : ''}₹{(trade.profit || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: 16 }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        background: trade.status === 'open' ? '#22c55e' : '#6b7280',
                        color: 'white'
                      }}>
                        {trade.status?.toUpperCase()}
                      </span>
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

export default SubAdminTrades;
