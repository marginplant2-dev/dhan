import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';

function getAuthHeaders() {
  const token = localStorage.getItem('dhanfunded-admin-token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

const fmtSigned = (v) => {
  const n = Number(v) || 0;
  const sign = n >= 0 ? '+' : '−';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const STATUS_STYLE = {
  FLAG:  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  WATCH: { color: '#d97706', bg: 'rgba(245,158,11,0.14)' },
  OK:    { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
};

function TopTraders() {
  const { API_URL } = useOutletContext();
  const [data, setData] = useState({ today: [], yesterday: [], todayKey: '', yesterdayKey: '' });
  const [day, setDay] = useState('today'); // 'today' | 'yesterday'
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/prop/admin/top-traders`, { headers: getAuthHeaders() });
      const d = await res.json();
      if (d.success) setData(d);
    } catch (e) { /* ignore */ }
    setLoading(false);
  }, [API_URL]);

  useEffect(() => {
    load();
    // Auto-refresh every 20s so today's board stays live.
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  const rows = day === 'today' ? (data.today || []) : (data.yesterday || []);
  const gainers = rows.filter(r => r.dayPnl > 0);
  const losers = rows.filter(r => r.dayPnl < 0).sort((a, b) => a.dayPnl - b.dayPnl);
  const dateLabel = day === 'today' ? data.todayKey : data.yesterdayKey;

  const StatusBadge = ({ status }) => {
    const s = STATUS_STYLE[status] || STATUS_STYLE.OK;
    return (
      <span style={{ padding: '3px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, background: s.bg, color: s.color }}>
        {status}
      </span>
    );
  };

  const Table = ({ list, kind }) => {
    if (!list.length) {
      return (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-secondary)', fontSize: 13 }}>
          No {kind === 'gain' ? 'gainers' : 'losers'} on this day.
        </div>
      );
    }
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              {['TRADER', 'ACCOUNT', 'SYMBOL', '# TRADES', 'DAY P/L', '% OF PROFIT TARGET (1 DAY)', 'FIRST / LAST TRADE', 'STATUS'].map(h => (
                <th key={h} style={{ padding: '10px 10px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => {
              const s = STATUS_STYLE[r.status] || STATUS_STYLE.OK;
              const pct = Math.max(0, Math.min(100, Number(r.pctOfTarget) || 0));
              return (
                <tr key={r.accountId + i} style={{ borderBottom: '1px solid var(--border-color)', background: r.status === 'FLAG' ? 'rgba(239,68,68,0.04)' : r.status === 'WATCH' ? 'rgba(245,158,11,0.05)' : 'transparent' }}>
                  <td style={{ padding: '12px 10px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.trader}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{r.accountCode}</div>
                  </td>
                  <td style={{ padding: '12px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.accountLabel}</td>
                  <td style={{ padding: '12px 10px', fontWeight: 700, color: 'var(--text-primary)' }}>{r.symbol}</td>
                  <td style={{ padding: '12px 10px', color: 'var(--text-primary)' }}>{r.trades}</td>
                  <td style={{ padding: '12px 10px', fontWeight: 800, color: r.dayPnl >= 0 ? '#10b981' : '#ef4444', whiteSpace: 'nowrap' }}>{fmtSigned(r.dayPnl)}</td>
                  <td style={{ padding: '12px 10px', minWidth: 170 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', minWidth: 34 }}>{Number(r.pctOfTarget) || 0}%</span>
                      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--bg-tertiary, rgba(0,0,0,0.08))', overflow: 'hidden', minWidth: 70 }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: s.color }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.firstTrade} → {r.lastTrade}</td>
                  <td style={{ padding: '12px 10px' }}><StatusBadge status={r.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ padding: '0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 22, fontWeight: 800 }}>🏆 Top Traders of the Day</h2>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Ranked by daily P/L · auto-flags anyone approaching the max one-day-profit rule {dateLabel ? `· ${dateLabel}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {[{ k: 'today', l: 'Today' }, { k: 'yesterday', l: 'Yesterday' }].map(t => (
            <button
              key={t.k}
              onClick={() => setDay(t.k)}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: day === t.k ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                background: day === t.k ? 'rgba(59,130,246,0.12)' : 'var(--bg-primary)',
                color: day === t.k ? '#3b82f6' : 'var(--text-primary)'
              }}
            >{t.l}</button>
          ))}
          <button onClick={load} title="Refresh" style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>🔄 Refresh</button>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Loading…</div>
      ) : (
        <>
          {/* Top Gainers */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 18, marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontSize: 15, fontWeight: 700 }}>🟢 Top Gainers</h3>
            <Table list={gainers} kind="gain" />
          </div>

          {/* Top Losers */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 18, marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontSize: 15, fontWeight: 700 }}>🔴 Top Losers</h3>
            <Table list={losers} kind="loss" />
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)', padding: '4px 2px' }}>
            <span><span style={{ color: '#ef4444', fontWeight: 900 }}>●</span> FLAG — hit/exceeded the max one-day-profit rule. Auto-hold from passing/payout.</span>
            <span><span style={{ color: '#d97706', fontWeight: 900 }}>●</span> WATCH — over 35% of target in ≤3 trades. Needs eyeball check.</span>
            <span><span style={{ color: '#10b981', fontWeight: 900 }}>●</span> OK — normal profile.</span>
          </div>
        </>
      )}
    </div>
  );
}

export default TopTraders;
