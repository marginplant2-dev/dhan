import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import scopedApi from '../scoped/scopedApi';

/**
 * Scoped user activity logs — mirrors admin's user activity table but filtered
 * to users in the signed-in admin's subtree. Filter by user, activity type,
 * date range. Requires permission `admin.viewAuditLog`.
 */
const ACTIVITY_TYPES = [
  'login', 'logout', 'register', 'failed_login',
  'deposit_request', 'deposit_approved', 'deposit_rejected',
  'withdrawal_request', 'withdrawal_approved', 'withdrawal_rejected',
  'trade_placed', 'trade_closed', 'trade_modified',
  'wallet_credit', 'wallet_debit',
  'kyc_submitted', 'kyc_approved', 'kyc_rejected',
  'password_change', 'profile_update',
];

const ICON = {
  login: '🔑', logout: '🚪', register: '📝', failed_login: '⚠️',
  deposit_approved: '✅', deposit_rejected: '❌', deposit_request: '💰',
  withdrawal_approved: '✅', withdrawal_rejected: '❌', withdrawal_request: '💸',
  trade_placed: '📈', trade_closed: '📉', trade_modified: '🔄',
  wallet_credit: '💵', wallet_debit: '💳',
  kyc_submitted: '📋', kyc_approved: '✅', kyc_rejected: '❌',
  password_change: '🔐', profile_update: '👤',
};

export default function ScopedUserActivityLogs() {
  const { API_URL } = useOutletContext();
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({ userId: '', activityType: '', search: '', startDate: '', endDate: '' });

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true); setError(null);
    try {
      const r = await scopedApi.listScopedActivityLogs(API_URL, {
        userId: filter.userId, activityType: filter.activityType, search: filter.search,
        startDate: filter.startDate, endDate: filter.endDate, page, limit: 20,
      });
      setLogs(r.logs || []);
      setUsers(r.users || []);
      setPagination(r.pagination || { total: 0, page: 1, limit: 20, totalPages: 0 });
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [API_URL, filter]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>User Activity Logs</h2>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Activity trail for users in your scope — logins, deposits, trades, KYC, wallet changes.
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          value={filter.userId}
          onChange={(e) => setFilter(f => ({ ...f, userId: e.target.value }))}
          style={styles.input}
        >
          <option value="">All users</option>
          {users.map(u => <option key={u._id} value={u._id}>{u.name || u.oderId}</option>)}
        </select>
        <select
          value={filter.activityType}
          onChange={(e) => setFilter(f => ({ ...f, activityType: e.target.value }))}
          style={styles.input}
        >
          <option value="">All activity types</option>
          {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <input
          type="date" value={filter.startDate}
          onChange={(e) => setFilter(f => ({ ...f, startDate: e.target.value }))}
          style={styles.input}
        />
        <input
          type="date" value={filter.endDate}
          onChange={(e) => setFilter(f => ({ ...f, endDate: e.target.value }))}
          style={styles.input}
        />
        <input
          type="text" placeholder="Search description / ID…"
          value={filter.search} onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
          style={{ ...styles.input, flex: 1, minWidth: 180 }}
        />
        <button onClick={() => fetchLogs(1)} disabled={loading} style={styles.btnPrimary}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.tableWrap}>
        {loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : logs.length === 0 ? (
          <div style={styles.empty}>No activity in this range.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={styles.th}>When</th>
                <th style={styles.th}>User</th>
                <th style={styles.th}>Activity</th>
                <th style={styles.th}>Description</th>
                <th style={styles.th}>Session</th>
                <th style={styles.th}>IP</th>
                <th style={styles.th}>OS / Browser</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={styles.td}>{l.timestamp ? new Date(l.timestamp).toLocaleString() : '—'}</td>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 600 }}>{l.user?.name || l.oderId || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{l.oderId || ''}</div>
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontSize: 12 }}>{ICON[l.activityType] || '•'} {l.activityType}</span>
                  </td>
                  <td style={{ ...styles.td, fontSize: 12, color: 'var(--text-primary)' }}>{l.description || '—'}</td>
                  <td style={styles.td}>{l.sessionDuration != null ? `${l.sessionDuration}s` : '—'}</td>
                  <td style={{ ...styles.td, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{l.ipAddress || '—'}</td>
                  <td style={{ ...styles.td, fontSize: 11, color: 'var(--text-secondary)' }}>
                    {[l.os, l.browser, l.device].filter(Boolean).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pagination.totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
          <button onClick={() => fetchLogs(pagination.page - 1)} disabled={pagination.page === 1 || loading} style={styles.btnPage}>‹</button>
          <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
            Page {pagination.page} / {pagination.totalPages} · {pagination.total} total
          </span>
          <button onClick={() => fetchLogs(pagination.page + 1)} disabled={pagination.page === pagination.totalPages || loading} style={styles.btnPage}>›</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  input: { padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 },
  btnPrimary: { padding: '8px 14px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  btnPage: { padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' },
  errorBox: { padding: 10, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', marginBottom: 12, fontSize: 13 },
  tableWrap: { border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-secondary)' },
  th: { textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' },
  td: { padding: '10px 14px', fontSize: 13, verticalAlign: 'top' },
  empty: { padding: 24, textAlign: 'center', color: 'var(--text-secondary)' },
};
