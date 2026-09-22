import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import scopedApi from './scopedApi';

/**
 * Scoped audit log (Phase 6).
 *
 * Shows each scoped_* change recorded against AdminActivityLog. Visibility
 * scope is enforced server-side:
 *   super_admin  → all rows
 *   sub_admin    → self + subtree
 *   broker/...   → self only
 */
const ACTIVITY_LABEL = {
  scoped_segment_write: { label: 'Segment override', icon: '📝', color: '#3b82f6' },
  scoped_segment_clear: { label: 'Segment cleared',  icon: '🧹', color: '#ef4444' },
  scoped_reorder_write: { label: 'Reorder set',      icon: '⏳', color: '#3b82f6' },
  scoped_reorder_clear: { label: 'Reorder cleared',  icon: '🧹', color: '#ef4444' },
  scoped_risk_write:    { label: 'Risk set',         icon: '⚠️', color: '#3b82f6' },
  scoped_risk_clear:    { label: 'Risk cleared',     icon: '🧹', color: '#ef4444' },
};

const TYPES = Object.keys(ACTIVITY_LABEL);

function formatTs(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function MetadataSummary({ type, metadata }) {
  if (!metadata) return null;
  const m = metadata;
  if (type.startsWith('scoped_segment')) {
    return (
      <>
        <strong>{m.mode}</strong> · {m.segmentName}
        {m.fieldsApplied && <> · fields: {m.fieldsApplied.join(', ')}</>}
        {m.affectedUsers != null && <> · {m.affectedUsers} user(s)</>}
        {m.deletedCount != null && <> · {m.deletedCount} row(s) deleted</>}
      </>
    );
  }
  if (type.startsWith('scoped_reorder')) {
    return (
      <>
        {m.delaySeconds != null && <>delay {m.delaySeconds}s · </>}
        {m.affectedUsers != null && <>{m.affectedUsers} user(s)</>}
        {m.removed != null && <>{m.removed} row(s) removed</>}
      </>
    );
  }
  if (type.startsWith('scoped_risk')) {
    return (
      <>
        {m.fieldsApplied && <>fields: {m.fieldsApplied.join(', ')} · </>}
        {m.affectedUsers != null && <>{m.affectedUsers} user(s)</>}
        {m.deletedCount != null && <>{m.deletedCount} row(s) deleted</>}
      </>
    );
  }
  return null;
}

export default function ScopedAuditLog() {
  const { API_URL } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [scope, setScope] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({ activityType: '', startDate: '', endDate: '' });

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const r = await scopedApi.listAudit(API_URL, {
        activityType: filter.activityType,
        startDate: filter.startDate,
        endDate: filter.endDate,
        page,
        limit: 50,
      });
      setRows(r.logs || []);
      setPagination(r.pagination || { total: 0, page: 1, limit: 50, totalPages: 0 });
      setScope(r.scope || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [API_URL, filter]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const onPage = (p) => {
    if (p < 1 || p > pagination.totalPages) return;
    fetchLogs(p);
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Scoped Settings Audit</h2>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Every override write/clear is logged here. Scope visibility is enforced by the server.
          </div>
        </div>
        {scope && (
          <div style={{ padding: '6px 10px', background: 'rgba(59,130,246,0.12)', color: '#3b82f6', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
            Scope: {scope.role} · {scope.affectedUserCount ?? 'all'} user(s)
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          value={filter.activityType}
          onChange={(e) => setFilter(f => ({ ...f, activityType: e.target.value }))}
          style={inputStyle}
        >
          <option value="">All activity types</option>
          {TYPES.map(t => <option key={t} value={t}>{ACTIVITY_LABEL[t].label}</option>)}
        </select>
        <input
          type="date"
          value={filter.startDate}
          onChange={(e) => setFilter(f => ({ ...f, startDate: e.target.value }))}
          style={inputStyle}
        />
        <input
          type="date"
          value={filter.endDate}
          onChange={(e) => setFilter(f => ({ ...f, endDate: e.target.value }))}
          style={inputStyle}
        />
        <button onClick={() => fetchLogs(1)} disabled={loading} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div style={{ padding: 10, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{error}</div>}

      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
            {loading ? 'Loading…' : 'No scoped changes in this range.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>When</th>
                <th style={th}>Who</th>
                <th style={th}>Action</th>
                <th style={th}>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const meta = ACTIVITY_LABEL[r.activityType] || { label: r.activityType, icon: '•', color: '#888' };
                return (
                  <tr key={r._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>{formatTs(r.timestamp)}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.oderId}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.role}</div>
                    </td>
                    <td style={td}>
                      <span style={{ color: meta.color, fontSize: 12, fontWeight: 600 }}>
                        {meta.icon} {meta.label}
                      </span>
                    </td>
                    <td style={{ ...td, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <div style={{ color: 'var(--text-primary)', marginBottom: 2 }}>{r.description}</div>
                      <MetadataSummary type={r.activityType} metadata={r.metadata} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
          <button onClick={() => onPage(pagination.page - 1)} disabled={pagination.page === 1 || loading} style={pageBtn}>‹</button>
          <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
            Page {pagination.page} / {pagination.totalPages} · {pagination.total} total
          </span>
          <button onClick={() => onPage(pagination.page + 1)} disabled={pagination.page === pagination.totalPages || loading} style={pageBtn}>›</button>
        </div>
      )}
    </div>
  );
}

const inputStyle = { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 };
const th = { textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' };
const td = { padding: '10px 14px', fontSize: 13, verticalAlign: 'top' };
const pageBtn = { padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' };
