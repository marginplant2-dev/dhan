import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

const ACTIVITY_LABELS = {
  login: 'Login', logout: 'Logout', register: 'Register',
  user_created: 'User Created', user_updated: 'User Updated',
  user_blocked: 'User Blocked', user_unblocked: 'User Unblocked',
  trade_placed: 'Position Placed', trade_closed: 'Position Closed', trade_modified: 'Position Modified',
  deposit_approved: 'Deposit Approved', deposit_rejected: 'Deposit Rejected',
  withdrawal_approved: 'Withdrawal Approved', withdrawal_rejected: 'Withdrawal Rejected',
  wallet_credit: 'Wallet Credit', wallet_debit: 'Wallet Debit',
  fund_request: 'Fund Request', fund_approved: 'Fund Approved', fund_rejected: 'Fund Rejected',
  password_change: 'Password Change', profile_update: 'Profile Update',
  settings_change: 'Settings Changed',
  kyc_approved: 'KYC Approved', kyc_rejected: 'KYC Rejected',
  failed_login: 'Failed Login'
};

const ROLE_LABELS = { admin: 'Admin', sub_admin: 'Sub-Admin', broker: 'Broker' };
const ROLE_COLORS = { admin: '#3b82f6', sub_admin: '#8b5cf6', broker: '#f59e0b' };
const STATUS_COLORS = { success: '#10b981', failed: '#ef4444', pending: '#f59e0b' };

function ActivityLogs() {
  const { API_URL } = useOutletContext();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 0 });
  const [filters, setFilters] = useState({ role: 'all', activityType: 'all', search: '', startDate: '', endDate: '' });

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 30 });
      if (filters.role !== 'all') params.set('role', filters.role);
      if (filters.activityType !== 'all') params.set('activityType', filters.activityType);
      if (filters.search) params.set('search', filters.search);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);

      const res = await fetch(`${API_URL}/api/admin/all-activity-logs?${params}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
        setPagination(data.pagination || { total: 0, page: 1, totalPages: 0 });
      }
    } catch (err) {
      console.error('Error fetching activity logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleFilter = () => fetchLogs(1);
  const handleClear = () => {
    setFilters({ role: 'all', activityType: 'all', search: '', startDate: '', endDate: '' });
    setTimeout(() => fetchLogs(1), 0);
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>Activity Logs</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
          All admin, sub-admin &amp; broker activity
        </p>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end',
        padding: 16, marginBottom: 20, background: 'var(--bg-secondary)',
        border: '1px solid var(--border)', borderRadius: 12
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Role</label>
          <select value={filters.role} onChange={e => setFilters(p => ({ ...p, role: e.target.value }))} className="admin-select" style={{ minWidth: 120 }}>
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="sub_admin">Sub-Admin</option>
            <option value="broker">Broker</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Action</label>
          <select value={filters.activityType} onChange={e => setFilters(p => ({ ...p, activityType: e.target.value }))} className="admin-select" style={{ minWidth: 160 }}>
            <option value="all">All Actions</option>
            {Object.entries(ACTIVITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>From</label>
          <input type="date" value={filters.startDate} onChange={e => setFilters(p => ({ ...p, startDate: e.target.value }))} className="admin-input" style={{ minWidth: 140 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>To</label>
          <input type="date" value={filters.endDate} onChange={e => setFilters(p => ({ ...p, endDate: e.target.value }))} className="admin-input" style={{ minWidth: 140 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Search</label>
          <input
            type="text" placeholder="Search by ID or description..."
            value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleFilter()}
            className="admin-input" style={{ minWidth: 200 }}
          />
        </div>
        <button onClick={handleFilter} className="admin-btn primary" style={{ padding: '8px 16px' }}>Apply</button>
        <button onClick={handleClear} className="admin-btn" style={{ padding: '8px 16px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Clear</button>
      </div>

      {/* Stats row */}
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Showing {logs.length} of {pagination.total} logs — Page {pagination.page} of {pagination.totalPages || 1}
      </div>

      {/* Logs table */}
      {loading ? (
        <div className="admin-loading">Loading activity logs...</div>
      ) : (
        <div className="admin-table-wrapper" style={{ maxHeight: 'min(65vh, 600px)', overflowY: 'auto' }}>
          <table className="admin-table">
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th>Time</th>
                <th>Role</th>
                <th>User</th>
                <th>Action</th>
                <th>Description</th>
                <th>Status</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan="7" className="no-data" style={{ textAlign: 'center', padding: 40 }}>No activity logs found</td></tr>
              ) : (
                logs.map((log, idx) => (
                  <tr key={log._id || idx}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                      {new Date(log.timestamp || log.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <span style={{
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: `${ROLE_COLORS[log.role] || '#64748b'}18`,
                        color: ROLE_COLORS[log.role] || '#64748b',
                        border: `1px solid ${ROLE_COLORS[log.role] || '#64748b'}30`
                      }}>
                        {ROLE_LABELS[log.role] || log.role}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{log.admin?.name || log.oderId || '-'}</div>
                      {log.admin?.email && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{log.admin.email}</div>}
                    </td>
                    <td>
                      <span style={{
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                        background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                        border: '1px solid var(--border)'
                      }}>
                        {ACTIVITY_LABELS[log.activityType] || log.activityType}
                      </span>
                    </td>
                    <td style={{ maxWidth: 350, fontSize: 13, lineHeight: 1.4 }}>
                      {log.description}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <details style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                          <summary style={{ cursor: 'pointer' }}>Details</summary>
                          <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11 }}>
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: `${STATUS_COLORS[log.status] || '#64748b'}18`,
                        color: STATUS_COLORS[log.status] || '#64748b'
                      }}>
                        {log.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {log.ipAddress || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button
            disabled={pagination.page <= 1}
            onClick={() => fetchLogs(pagination.page - 1)}
            className="admin-btn" style={{ padding: '6px 14px', fontSize: 12 }}
          >
            Previous
          </button>
          <span style={{ padding: '6px 14px', fontSize: 13, color: 'var(--text-secondary)' }}>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => fetchLogs(pagination.page + 1)}
            className="admin-btn" style={{ padding: '6px 14px', fontSize: 12 }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default ActivityLogs;
