import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';

/** The admin's own users. The scoped endpoint refuses anything else. */
export default function Users() {
  const { API_URL } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menuFor, setMenuFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '20', status });
      if (search.trim()) qs.set('search', search.trim());
      const res = await fetch(`${API_URL}/api/admin/scoped/users-list?${qs}`);
      const data = await res.json();
      if (data.success) {
        setRows(data.users || []);
        setPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
        setError('');
      } else {
        setError(data.error || 'Could not load users');
      }
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, [API_URL, page, status, search]);

  useEffect(() => { load(); }, [load]);

  const setBlocked = async (user, blocked) => {
    const res = await fetch(`${API_URL}/api/admin/scoped/users-list/${user._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !blocked }),
    });
    const data = await res.json();
    if (data.success) load();
    else alert(data.error || 'Could not update that user');
  };

  const adjustWallet = async (user) => {
    const raw = prompt(`Adjust ${user.name}'s balance. Use a minus sign to debit.`);
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount === 0) return alert('Enter a number');
    const res = await fetch(`${API_URL}/api/admin/scoped/users-list/${user._id}/wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: amount > 0 ? 'credit' : 'debit', amount: Math.abs(amount) }),
    });
    const data = await res.json();
    if (data.success) load();
    else alert(data.error || 'Could not adjust the wallet');
  };

  return (
    <>
      <div className="tp-row" style={{ marginBottom: 16 }}>
        <input
          className="tp-input" style={{ maxWidth: 340 }}
          placeholder="Search name, email, ID or phone…"
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
        <select className="tp-input" style={{ width: 160 }} value={status}
                onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="all">All users</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
        </select>
        <span className="tp-muted" style={{ fontSize: 13 }}>{total} total</span>
      </div>

      <div className="tp-table-wrap" style={{ overflow: 'visible' }}>
        <table className="tp-table">
          <thead>
            <tr>
              <th>ID</th><th>Name</th><th>Email</th><th>Phone</th>
              <th>Balance</th><th>Joined</th><th>Status</th><th style={{ width: 48 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8"><div className="tp-empty">Loading…</div></td></tr>
            ) : error ? (
              <tr><td colSpan="8"><div className="tp-empty">{error}</div></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="8"><div className="tp-empty">
                {search || status !== 'all' ? 'Nothing matches that filter' : 'No users in your pool yet'}
              </div></td></tr>
            ) : rows.map(u => (
              <tr key={u._id}>
                <td className="tp-mono">{u.oderId}</td>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.phone || '—'}</td>
                <td>₹{Number(u.wallet?.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN') : '—'}</td>
                <td>
                  <span className={`tp-pill ${u.isActive === false ? 'tp-pill--off' : 'tp-pill--ok'}`}>
                    {u.isActive === false ? 'BLOCKED' : 'ACTIVE'}
                  </span>
                </td>
                <td style={{ position: 'relative', textAlign: 'right' }}>
                  <button
                    onClick={() => setMenuFor(menuFor === u._id ? null : u._id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--tp-muted)' }}
                  >⋮</button>
                  {menuFor === u._id && (
                    <>
                      <div onClick={() => setMenuFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                      <div className="tp-card" style={{
                        position: 'absolute', right: 10, top: '100%', zIndex: 41,
                        minWidth: 190, padding: 6, textAlign: 'left', boxShadow: '0 12px 30px rgba(0,0,0,.18)',
                      }}>
                        {[
                          { label: 'Adjust balance', run: () => adjustWallet(u) },
                          u.isActive === false
                            ? { label: 'Unblock', run: () => setBlocked(u, false) }
                            : { label: 'Block', run: () => setBlocked(u, true) },
                        ].map(item => (
                          <button key={item.label}
                            onClick={() => { setMenuFor(null); item.run(); }}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                              background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer',
                              fontSize: 14, color: 'var(--tp-text)',
                            }}>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </td>
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
