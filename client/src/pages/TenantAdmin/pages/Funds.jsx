import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';

const TYPES = [
  { id: 'all', label: 'All' },
  { id: 'deposit', label: 'Deposits' },
  { id: 'withdrawal', label: 'Withdrawals' },
];

/** Deposits and withdrawals belonging to this admin's users only. */
export default function Funds() {
  const { API_URL } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '25', type, status });
      const res = await fetch(`${API_URL}/api/admin/scoped/transactions-list?${qs}`);
      const data = await res.json();
      if (data.success) {
        setRows(data.transactions || []);
        setSummary(data.summary || null);
        setPages(data.pagination?.totalPages || 1);
        setError('');
      } else {
        setError(data.error || 'Could not load transactions');
      }
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, [API_URL, page, type, status]);

  useEffect(() => { load(); }, [load]);

  const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const pillFor = (s) => (
    s === 'approved' || s === 'completed' ? 'tp-pill--ok'
    : s === 'rejected' || s === 'failed' ? 'tp-pill--off'
    : 'tp-pill--wait'
  );

  return (
    <>
      {summary && (
        <div className="tp-stats" style={{ marginBottom: 20 }}>
          <div className="tp-card">
            <div className="tp-stat-label">Deposits approved</div>
            <div className="tp-stat-value">{money(summary.approvedDeposits)}</div>
          </div>
          <div className="tp-card">
            <div className="tp-stat-label">Withdrawals approved</div>
            <div className="tp-stat-value">{money(summary.approvedWithdrawals)}</div>
          </div>
          <div className="tp-card">
            <div className="tp-stat-label">Pending</div>
            <div className="tp-stat-value">{summary.pending || 0}</div>
          </div>
        </div>
      )}

      <div className="tp-row" style={{ marginBottom: 16 }}>
        {TYPES.map(t => (
          <button key={t.id}
            className={`tp-btn ${type === t.id ? 'tp-btn--primary' : ''}`}
            onClick={() => { setPage(1); setType(t.id); }}>
            {t.label}
          </button>
        ))}
        <select className="tp-input" style={{ width: 170, marginLeft: 'auto' }} value={status}
                onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="all">Any status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="tp-table-wrap">
        <table className="tp-table">
          <thead>
            <tr>
              <th>Date</th><th>User</th><th>Type</th><th>Method</th><th>Amount</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6"><div className="tp-empty">Loading…</div></td></tr>
            ) : error ? (
              <tr><td colSpan="6"><div className="tp-empty">{error}</div></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="6"><div className="tp-empty">Nothing here yet</div></td></tr>
            ) : rows.map(t => (
              <tr key={t._id}>
                <td>{t.createdAt ? new Date(t.createdAt).toLocaleString('en-IN') : '—'}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{t.userName || '—'}</div>
                  <div className="tp-mono tp-muted">{t.oderId}</div>
                </td>
                <td style={{ textTransform: 'capitalize' }}>{t.type}</td>
                <td>{t.paymentMethod || '—'}</td>
                <td style={{ fontWeight: 650 }}>{money(t.amount)}</td>
                <td><span className={`tp-pill ${pillFor(t.status)}`}>{String(t.status || '').toUpperCase()}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="tp-row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="tp-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span className="tp-muted" style={{ fontSize: 13 }}>Page {page} of {pages}</span>
          <button className="tp-btn" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </>
  );
}
