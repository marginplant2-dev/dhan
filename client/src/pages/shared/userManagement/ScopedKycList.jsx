import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import scopedApi from '../scoped/scopedApi';

/**
 * Scoped KYC list — mirrors the admin KYC verification table but filtered to
 * users in the signed-in admin's subtree. Approve/Reject actions show only for
 * pending rows.
 */
const STATUS_PILLS = {
  pending:  { bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b' },
  approved: { bg: 'rgba(16,185,129,0.15)', fg: '#10b981' },
  rejected: { bg: 'rgba(239,68,68,0.15)',  fg: '#ef4444' },
};

export default function ScopedKycList() {
  const { API_URL } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchRows = useCallback(async (page = 1) => {
    setLoading(true); setError(null);
    try {
      const r = await scopedApi.listScopedKyc(API_URL, { status, search, page, limit: 20 });
      setRows(r.kycs || []);
      setPagination(r.pagination || { total: 0, page: 1, limit: 20, totalPages: 0 });
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [API_URL, status, search]);

  useEffect(() => { fetchRows(1); }, [fetchRows]);

  const approve = async (row) => {
    if (!confirm(`Approve KYC for ${row.user?.name || row.oderId}?`)) return;
    setBusyId(row._id); setError(null);
    try {
      await scopedApi.approveScopedKyc(API_URL, row._id);
      await fetchRows(pagination.page);
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };
  const submitReject = async () => {
    if (!rejecting) return;
    if (!rejectReason.trim()) { alert('Reason required'); return; }
    setBusyId(rejecting._id); setError(null);
    try {
      await scopedApi.rejectScopedKyc(API_URL, rejecting._id, rejectReason.trim());
      setRejecting(null); setRejectReason('');
      await fetchRows(pagination.page);
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>KYC Verification</h2>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Review and approve KYC submissions from users in your scope.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={styles.selectInput}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
        <input
          type="text" placeholder="Search user / doc number…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          style={styles.search}
        />
        <button onClick={() => fetchRows(1)} disabled={loading} style={styles.btnPrimary}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.tableWrap}>
        {loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={styles.empty}>No KYC submissions match.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={styles.th}>User</th>
                <th style={styles.th}>Doc Type</th>
                <th style={styles.th}>Doc Number</th>
                <th style={styles.th}>Full Name</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Submitted</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(k => {
                const pill = STATUS_PILLS[k.status] || STATUS_PILLS.pending;
                return (
                  <tr key={k._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={styles.td}>
                      <div style={{ fontWeight: 600 }}>{k.user?.name || k.oderId}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{k.oderId} · {k.user?.email || '—'}</div>
                    </td>
                    <td style={styles.td}>{k.documentType || '—'}</td>
                    <td style={styles.td}><code>{k.documentNumber || '—'}</code></td>
                    <td style={styles.td}>{k.fullName || '—'}</td>
                    <td style={styles.td}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: pill.bg, color: pill.fg }}>
                        {k.status}
                      </span>
                    </td>
                    <td style={styles.td}>{k.submittedAt ? new Date(k.submittedAt).toLocaleDateString() : (k.createdAt ? new Date(k.createdAt).toLocaleDateString() : '—')}</td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setViewing(k)} style={styles.btnSmall}>View</button>
                        {k.status === 'pending' && (
                          <>
                            <button onClick={() => approve(k)} disabled={busyId === k._id}
                              style={{ ...styles.btnSmall, borderColor: '#10b981', color: '#10b981' }}>
                              Approve
                            </button>
                            <button onClick={() => { setRejecting(k); setRejectReason(''); }} disabled={busyId === k._id}
                              style={{ ...styles.btnSmall, borderColor: '#ef4444', color: '#ef4444' }}>
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pagination.totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
          <button onClick={() => fetchRows(pagination.page - 1)} disabled={pagination.page === 1 || loading} style={styles.btnPage}>‹</button>
          <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
            Page {pagination.page} / {pagination.totalPages} · {pagination.total} total
          </span>
          <button onClick={() => fetchRows(pagination.page + 1)} disabled={pagination.page === pagination.totalPages || loading} style={styles.btnPage}>›</button>
        </div>
      )}

      {viewing && (
        <div style={styles.modalOverlay} onClick={() => setViewing(null)}>
          <div style={{ ...styles.modal, maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>KYC — {viewing.user?.name || viewing.oderId}</h3>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {viewing.oderId} · {viewing.user?.email || '—'}
                </div>
              </div>
              <button onClick={() => setViewing(null)} style={styles.btnSecondary}>Close</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginBottom: 12 }}>
              <InfoRow label="Doc Type" value={viewing.documentType} />
              <InfoRow label="Doc Number" value={viewing.documentNumber} />
              <InfoRow label="Full Name" value={viewing.fullName} />
              <InfoRow label="DOB" value={viewing.dateOfBirth} />
              <InfoRow label="Status" value={viewing.status} />
              <InfoRow label="Submitted" value={viewing.submittedAt ? new Date(viewing.submittedAt).toLocaleString() : '—'} />
            </div>

            {viewing.documents?.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Documents</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                  {viewing.documents.map((d, i) => (
                    <a key={i} href={d.url || d} target="_blank" rel="noreferrer"
                      style={{ display: 'block', padding: 8, border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--bg-primary)', fontSize: 12, color: '#3b82f6', textDecoration: 'none' }}>
                      📎 {d.name || `doc-${i + 1}`}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {rejecting && (
        <div style={styles.modalOverlay} onClick={() => { setRejecting(null); setRejectReason(''); }}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0' }}>Reject KYC</h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
              {rejecting.user?.name || rejecting.oderId}
            </div>
            <label style={styles.label}>Reason</label>
            <textarea rows={3} value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain to the user why their KYC was rejected…"
              style={{ ...styles.input, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => { setRejecting(null); setRejectReason(''); }} style={styles.btnSecondary}>Cancel</button>
              <button onClick={submitReject} disabled={busyId === rejecting._id} style={{ ...styles.btnPrimary, background: '#ef4444' }}>
                {busyId === rejecting._id ? 'Saving…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ padding: 8, background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 2 }}>{value || '—'}</div>
    </div>
  );
}

const styles = {
  selectInput: { padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 },
  search: { flex: 1, minWidth: 220, maxWidth: 400, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 },
  btnPrimary: { padding: '8px 14px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  btnSecondary: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 },
  btnSmall: { padding: '4px 10px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' },
  btnPage: { padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' },
  errorBox: { padding: 10, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', marginBottom: 12, fontSize: 13 },
  tableWrap: { border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-secondary)' },
  th: { textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' },
  td: { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' },
  empty: { padding: 24, textAlign: 'center', color: 'var(--text-secondary)' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20, width: '90%', maxWidth: 440 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 },
  input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 },
};
