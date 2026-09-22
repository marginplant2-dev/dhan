import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import scopedApi from '../scoped/scopedApi';

/**
 * Scoped user list — mirrors the super-admin users table but filtered to the
 * signed-in admin's subtree. Four variants via the `status` prop:
 *   'all' | 'active' | 'blocked' | 'demo'
 *
 * Parity goal with super-admin panel's User Management:
 *   Row:    View · Wallet · Block/Unblock · Delete
 *   Detail: Change Password · Add/Deduct Fund (balance or credit, USD/INR) ·
 *           Block/Unblock · Hedging / Netting Segment Settings ·
 *           Order Modes (hedging/netting/binary + allowed currencies) ·
 *           Login as User · Download Report
 * Every button is gated by the specific permission the server enforces, so a
 * broker with fewer grants simply sees fewer buttons.
 */
const STATUS_LABELS = {
  all: 'All Users',
  active: 'Active Users',
  blocked: 'Blocked Users',
  demo: 'Demo Users',
};

function hasPerm(user, key) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return !!user.permissions?.[key];
}

function getAdminToken() {
  return (
    sessionStorage.getItem('dhanfunded-impersonate-token') ||
    localStorage.getItem('dhanfunded-admin-token') ||
    ''
  );
}

/**
 * Fetch wrapper that attaches the admin bearer token. Required because the
 * non-scoped /api/admin/users/* endpoints go through the chokepoint middleware
 * which calls resolveAdminFromRequest() — that reads Authorization: Bearer.
 */
async function adminFetch(url, options = {}) {
  const token = getAdminToken();
  const headers = {
    ...(options.headers || {}),
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { ...options, headers });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { res, data };
}

export default function ScopedUserList({ status = 'all' }) {
  const ctx = useOutletContext();
  const API_URL = ctx?.API_URL;
  const authUser = ctx?.adminAuth?.user;
  const navigate = useNavigate();

  // Per-permission capability flags — drive which buttons render.
  const canEdit         = hasPerm(authUser, 'users.edit');
  const canBlock        = hasPerm(authUser, 'users.block');
  const canCredit       = hasPerm(authUser, 'users.wallet.credit');
  const canDebit        = hasPerm(authUser, 'users.wallet.debit');
  const canBonus        = hasPerm(authUser, 'users.wallet.bonus');
  const canWallet       = canCredit || canDebit || canBonus;
  const canImpersonate  = hasPerm(authUser, 'admin.impersonateUser');
  const canReport       = hasPerm(authUser, 'reports.export');
  const canHedgingView  = hasPerm(authUser, 'hedgingSegment.view') || hasPerm(authUser, 'hedgingSegment.edit');
  const canNettingView  = hasPerm(authUser, 'nettingSegment.view') || hasPerm(authUser, 'nettingSegment.edit');

  // Shortcut navigation base — sub-admin vs broker routes use different roots.
  const panelBase = authUser?.role === 'broker' ? '/broker-panel' : '/subadmin-panel';

  // List state
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  // Detail panel (side drawer modal hosting the action buttons)
  const [detail, setDetail] = useState({ open: false, user: null });

  // Modals
  const emptyWallet = { open: false, user: null, target: 'balance', type: 'add', currency: 'INR', amount: '', reason: '' };
  const [walletModal, setWalletModal] = useState(emptyWallet);

  const emptyPassword = { open: false, user: null, newPassword: '', show: false };
  const [passwordModal, setPasswordModal] = useState(emptyPassword);

  const emptyTradeModes = {
    open: false, user: null, saving: false,
    modes: { hedging: true, netting: true, binary: true },
    currencyDisplay: 'BOTH',
    currencies: { USD: true, INR: true },
  };
  const [tradeModesModal, setTradeModesModal] = useState(emptyTradeModes);

  const emptyReport = {
    open: false, user: null, saving: false,
    allTime: true, fromDate: '', toDate: '',
    reportTypes: { trades: true, transactions: true, activity: true, kyc: true, wallet: true },
  };
  const [reportModal, setReportModal] = useState(emptyReport);

  const fetchUsers = useCallback(async (page = 1) => {
    setLoading(true); setError(null);
    try {
      const r = await scopedApi.listScopedUsers(API_URL, { status, search, page, limit: 20 });
      setUsers(r.users || []);
      setPagination(r.pagination || { total: 0, page: 1, limit: 20, totalPages: 0 });
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [API_URL, status, search]);

  useEffect(() => { fetchUsers(1); }, [fetchUsers]);

  // ─── Row actions ────────────────────────────────────────────────────────

  const toggleStatus = async (u) => {
    const nextActive = !(u.isActive !== false);
    if (!confirm(`${nextActive ? 'Unblock' : 'Block'} ${u.name || u.oderId}?`)) return;
    setBusyId(u._id); setError(null);
    try {
      await scopedApi.setUserStatus(API_URL, u._id, nextActive);
      await fetchUsers(pagination.page);
      if (detail.open && detail.user?._id === u._id) {
        setDetail({ open: true, user: { ...detail.user, isActive: nextActive } });
      }
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  const deleteUser = async (u) => {
    if (!confirm(`Delete ${u.name || u.oderId}? This also deletes their positions and transactions.`)) return;
    setBusyId(u._id); setError(null);
    try {
      const { res, data } = await adminFetch(`${API_URL}/api/admin/users/${u._id}`, { method: 'DELETE' });
      if (!res.ok || data?.success === false) throw new Error(data?.error || `HTTP ${res.status}`);
      if (detail.open && detail.user?._id === u._id) setDetail({ open: false, user: null });
      await fetchUsers(pagination.page);
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  // ─── Wallet ─────────────────────────────────────────────────────────────

  const openWalletModal = (u, target = 'balance', type = 'add') => {
    setWalletModal({
      open: true, user: u,
      target,
      type,
      currency: target === 'credit' ? 'INR' : 'INR',
      amount: '',
      reason: '',
    });
  };

  const submitWallet = async () => {
    const amt = Number(walletModal.amount);
    if (!amt || amt <= 0) { alert('Enter a positive amount'); return; }
    const u = walletModal.user;
    setBusyId(u._id); setError(null);
    try {
      // Hits the non-scoped /api/admin/users/:id/wallet endpoint which matches
      // admin UserManagement exactly — supports target balance/credit, USD/INR
      // currency, and add/subtract semantics. The chokepoint enforces
      // users.wallet.credit (sub-admin preset has it).
      const { res, data } = await adminFetch(`${API_URL}/api/admin/users/${u._id}/wallet`, {
        method: 'POST',
        body: JSON.stringify({
          type: walletModal.type,           // 'add' | 'subtract'
          target: walletModal.target,       // 'balance' | 'credit'
          currency: walletModal.currency,   // 'USD' | 'INR'
          amount: amt,
          reason: walletModal.reason || '',
        }),
      });
      if (!res.ok || data?.success === false) throw new Error(data?.error || `HTTP ${res.status}`);
      setWalletModal(emptyWallet);
      await fetchUsers(pagination.page);
      alert(data?.message || 'Wallet updated');
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  // ─── Change Password ────────────────────────────────────────────────────

  const submitPassword = async () => {
    const { user, newPassword } = passwordModal;
    if (!newPassword || newPassword.length < 6) { alert('Password must be at least 6 characters'); return; }
    setBusyId(user._id); setError(null);
    try {
      const { res, data } = await adminFetch(`${API_URL}/api/admin/users/${user._id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok || data?.success === false) throw new Error(data?.error || `HTTP ${res.status}`);
      setPasswordModal(emptyPassword);
      alert('Password changed');
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  // ─── Order Modes ────────────────────────────────────────────────────────

  const openTradeModesModal = (u) => {
    const modes = u.allowedTradeModes || { hedging: true, netting: true, binary: true };
    const currencies = u.allowedCurrencies || { USD: true, INR: true };
    const currencyDisplay = u.allowedCurrencyDisplay || 'BOTH';
    setTradeModesModal({ open: true, user: u, saving: false, modes, currencies, currencyDisplay });
  };

  const submitTradeModes = async () => {
    const m = tradeModesModal;
    setTradeModesModal(s => ({ ...s, saving: true }));
    setError(null);
    try {
      // netting is always true (enforced by admin parity; admin modal also
      // forces it true on save — see UserManagement.jsx saveTradeModeSettings)
      const { res: r1, data: d1 } = await adminFetch(`${API_URL}/api/admin/users/${m.user._id}/trade-modes`, {
        method: 'PUT',
        body: JSON.stringify({
          hedging: !!m.modes.hedging,
          netting: true,
          binary:  !!m.modes.binary,
          allowedCurrencyDisplay: m.currencyDisplay,
        }),
      });
      if (!r1.ok || d1?.success === false) throw new Error(d1?.error || `HTTP ${r1.status}`);

      const { res: r2, data: d2 } = await adminFetch(`${API_URL}/api/admin/users/${m.user._id}/currency-permissions`, {
        method: 'PUT',
        body: JSON.stringify({ allowUSD: !!m.currencies.USD, allowINR: !!m.currencies.INR }),
      });
      if (!r2.ok || d2?.success === false) throw new Error(d2?.error || `HTTP ${r2.status}`);

      setTradeModesModal(emptyTradeModes);
      await fetchUsers(pagination.page);
      alert('Order modes & currency settings saved');
    } catch (e) {
      setError(e.message);
      setTradeModesModal(s => ({ ...s, saving: false }));
    }
  };

  // ─── Login as User ──────────────────────────────────────────────────────

  const loginAsUser = async (u) => {
    if (!confirm(`Login as ${u.name || u.oderId}? A new tab will open with their account.`)) return;
    // Open the popup synchronously so the browser keeps the click context —
    // popup blockers strip new tabs that open after an await.
    const popup = window.open('about:blank', '_blank');
    setBusyId(u._id); setError(null);
    try {
      const { res, data } = await adminFetch(`${API_URL}/api/admin/users/${u._id}/login-as`, { method: 'POST' });
      if (!res.ok || data?.success === false) {
        popup?.close();
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      // Pass credentials through the URL — admin/sub-admin/broker run on a
      // different sub-domain than /app so localStorage here is invisible there.
      // AppRouter on the user side decodes ?impersonate= into localStorage and
      // strips the param before routing.
      const payload = btoa(JSON.stringify({ token: data.token, user: data.user }));
      // Use window.location.host (not hostname) so the port survives in dev —
      // without it the URL becomes localhost/app on port 80 in local dev.
      const mainHost = window.location.host.replace(/^(admin|subadmin|broker)\./, '');
      const userAppUrl = `${window.location.protocol}//${mainHost}/app?impersonate=${encodeURIComponent(payload)}`;
      if (popup) {
        popup.location.href = userAppUrl;
      } else {
        window.location.href = userAppUrl;
      }
    } catch (e) {
      popup?.close();
      setError(e.message);
    } finally { setBusyId(null); }
  };

  // ─── Download Report ────────────────────────────────────────────────────

  const submitDownloadReport = async () => {
    const m = reportModal;
    if (!m.allTime && (!m.fromDate || !m.toDate)) { alert('Pick from/to dates or check All Time'); return; }
    setReportModal(s => ({ ...s, saving: true }));
    setError(null);
    try {
      const selectedTypes = Object.entries(m.reportTypes).filter(([, v]) => v).map(([k]) => k);
      const body = {
        allTime: m.allTime,
        fromDate: m.allTime ? null : m.fromDate,
        toDate:   m.allTime ? null : m.toDate,
        reportTypes: selectedTypes,
      };
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/api/admin/users/${m.user._id}/download-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const d = await res.json(); if (d?.error) msg = d.error; } catch { /* csv */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateRange = m.allTime ? 'all_time' : `${m.fromDate}_to_${m.toDate}`;
      a.download = `${m.user.name || m.user.oderId}_report_${dateRange}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setReportModal(emptyReport);
    } catch (e) {
      setError(e.message);
      setReportModal(s => ({ ...s, saving: false }));
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 16 }}>
      <div style={styles.header}>
        <h2 style={{ margin: 0 }}>{STATUS_LABELS[status] || 'Users'}</h2>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Users in your scope (subtree or direct depending on role).
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="text" placeholder="Search name / email / ID / phone…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          style={styles.search}
        />
        <button onClick={() => fetchUsers(1)} disabled={loading} style={styles.btnPrimary}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.tableWrap}>
        {loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : users.length === 0 ? (
          <div style={styles.empty}>No users.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Phone</th>
                <th style={styles.th}>Balance</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Joined</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const active = u.isActive !== false;
                return (
                  <tr key={u._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={styles.td}><code>{u.oderId}</code></td>
                    <td style={styles.td}><strong>{u.name || '—'}</strong></td>
                    <td style={styles.td}>{u.email || '—'}</td>
                    <td style={styles.td}>{u.phone || '—'}</td>
                    <td style={styles.td}>₹{Number(u.wallet?.balance || 0).toLocaleString()}</td>
                    <td style={styles.td}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                        background: active ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: active ? '#10b981' : '#ef4444' }}>
                        {active ? 'active' : 'blocked'}
                      </span>
                    </td>
                    <td style={styles.td}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button onClick={() => setDetail({ open: true, user: u })}
                          style={{ ...styles.btnSmall, borderColor: '#6366f1', color: '#6366f1' }}>
                          View
                        </button>
                        {canWallet && (
                          <button onClick={() => openWalletModal(u, 'balance', 'add')} style={styles.btnSmall}>
                            Wallet
                          </button>
                        )}
                        {canBlock && (
                          <button onClick={() => toggleStatus(u)} disabled={busyId === u._id}
                            style={{ ...styles.btnSmall, borderColor: active ? '#ef4444' : '#10b981', color: active ? '#ef4444' : '#10b981' }}>
                            {active ? 'Block' : 'Unblock'}
                          </button>
                        )}
                        {canBlock && (
                          <button onClick={() => deleteUser(u)} disabled={busyId === u._id}
                            style={{ ...styles.btnSmall, borderColor: '#dc2626', color: '#dc2626' }}>
                            Delete
                          </button>
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
          <button onClick={() => fetchUsers(pagination.page - 1)} disabled={pagination.page === 1 || loading} style={styles.btnPage}>‹</button>
          <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
            Page {pagination.page} / {pagination.totalPages} · {pagination.total} total
          </span>
          <button onClick={() => fetchUsers(pagination.page + 1)} disabled={pagination.page === pagination.totalPages || loading} style={styles.btnPage}>›</button>
        </div>
      )}

      {/* ═══════════ Detail Panel (drawer) ═══════════ */}
      {detail.open && detail.user && (
        <div style={styles.modalOverlay} onClick={() => setDetail({ open: false, user: null })}>
          <div style={{ ...styles.modal, maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0 }}>{detail.user.name || detail.user.oderId}</h3>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  <code>{detail.user.oderId}</code> · {detail.user.email || '—'} · {detail.user.phone || '—'}
                </div>
              </div>
              <button onClick={() => setDetail({ open: false, user: null })}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
            </div>

            {/* Info tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              <InfoTile label="Status" value={(detail.user.isActive !== false) ? 'Active' : 'Blocked'}
                color={(detail.user.isActive !== false) ? '#10b981' : '#ef4444'} />
              <InfoTile label="Balance" value={`₹${Number(detail.user.wallet?.balance || 0).toLocaleString()}`} />
              <InfoTile label="Credit" value={`₹${Number(detail.user.wallet?.credit || 0).toLocaleString()}`}
                color="#fbbf24" />
            </div>

            {/* Action grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {canEdit && (
                <ActionBtn color="#10b981" onClick={() => setPasswordModal({ ...emptyPassword, open: true, user: detail.user })}>
                  🔒 Change Password
                </ActionBtn>
              )}
              {canCredit && (
                <ActionBtn color="#f59e0b" onClick={() => openWalletModal(detail.user, 'balance', 'add')}>
                  📥 Add Fund
                </ActionBtn>
              )}
              {canDebit && (
                <ActionBtn color="#f59e0b" onClick={() => openWalletModal(detail.user, 'balance', 'subtract')}>
                  💵 Deduct Fund
                </ActionBtn>
              )}
              {canBlock && (
                <ActionBtn color={(detail.user.isActive === false) ? '#10b981' : '#ef4444'}
                  onClick={() => toggleStatus(detail.user)}>
                  🚫 {(detail.user.isActive === false) ? 'Unblock' : 'Block'}
                </ActionBtn>
              )}
              {canHedgingView && (
                <ActionBtn color="#8b5cf6"
                  onClick={() => navigate(`${panelBase}/hedging-overrides/users?userId=${encodeURIComponent(detail.user._id)}`)}>
                  ⚙️ Hedging Segment Settings
                </ActionBtn>
              )}
              {canNettingView && (
                <ActionBtn color="#8b5cf6"
                  onClick={() => navigate(`${panelBase}/netting-overrides/users?userId=${encodeURIComponent(detail.user._id)}`)}>
                  ⚙️ Netting Segment Settings
                </ActionBtn>
              )}
              {canEdit && (
                <ActionBtn color="#f59e0b" onClick={() => openTradeModesModal(detail.user)}>
                  📊 Order Modes
                </ActionBtn>
              )}
              {canImpersonate && (
                <ActionBtn color="#3b82f6" onClick={() => loginAsUser(detail.user)}>
                  ➡️ Login as User
                </ActionBtn>
              )}
              {canReport && (
                <ActionBtn color="#10b981" onClick={() => setReportModal({ ...emptyReport, open: true, user: detail.user })}>
                  📥 Download Report
                </ActionBtn>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ Wallet Modal ═══════════ */}
      {walletModal.open && walletModal.user && (
        <div style={styles.modalOverlay} onClick={() => setWalletModal(emptyWallet)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Adjust Wallet</h3>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                {walletModal.user.name || walletModal.user.oderId} · balance ₹{Number(walletModal.user.wallet?.balance || 0).toLocaleString()} · credit ₹{Number(walletModal.user.wallet?.credit || 0).toLocaleString()}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <label style={styles.label}>Target</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setWalletModal(w => ({ ...w, target: 'balance', currency: 'INR' }))}
                    style={{ ...styles.pillBtn, ...(walletModal.target === 'balance' ? styles.pillActive : {}) }}>
                    Balance (real cash)
                  </button>
                  {canBonus && (
                    <button type="button" onClick={() => setWalletModal(w => ({ ...w, target: 'credit', currency: 'INR' }))}
                      style={{ ...styles.pillBtn, ...(walletModal.target === 'credit' ? styles.pillActiveBonus : {}) }}
                      title="Bonus credit — counts toward equity, NOT withdrawable, INR only">
                      Credit (bonus)
                    </button>
                  )}
                </div>
                {walletModal.target === 'credit' && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#9ca3af', lineHeight: 1.4 }}>
                    Bonus credit counts toward equity &amp; free margin but is NOT withdrawable.
                    <strong style={{ color: '#fbbf24', marginLeft: 4 }}>INR only</strong>.
                  </div>
                )}
              </div>

              <div>
                <label style={styles.label}>Type</label>
                <select value={walletModal.type} onChange={(e) => setWalletModal(w => ({ ...w, type: e.target.value }))} style={styles.input}>
                  <option value="add">{walletModal.target === 'credit' ? 'Add Bonus' : 'Add Funds'}</option>
                  <option value="subtract">{walletModal.target === 'credit' ? 'Deduct Bonus' : 'Subtract Funds'}</option>
                </select>
              </div>

              {walletModal.target !== 'credit' && (
                <div>
                  <label style={styles.label}>Currency</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setWalletModal(w => ({ ...w, currency: 'USD' }))}
                      style={{ ...styles.pillBtn, ...(walletModal.currency === 'USD' ? styles.pillActive : {}) }}>
                      USD ($)
                    </button>
                    <button type="button" onClick={() => setWalletModal(w => ({ ...w, currency: 'INR' }))}
                      style={{ ...styles.pillBtn, ...(walletModal.currency === 'INR' ? styles.pillActive : {}) }}>
                      INR (₹)
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label style={styles.label}>
                  Amount ({walletModal.target === 'credit' ? '₹' : (walletModal.currency === 'INR' ? '₹' : '$')})
                </label>
                <input type="number" min="0" value={walletModal.amount}
                  onChange={(e) => setWalletModal(w => ({ ...w, amount: e.target.value }))} style={styles.input}
                  placeholder={walletModal.target === 'credit' ? 'Enter bonus amount in ₹' : `Enter amount in ${walletModal.currency}`} />
              </div>

              <div>
                <label style={styles.label}>Reason (optional)</label>
                <input type="text" value={walletModal.reason}
                  onChange={(e) => setWalletModal(w => ({ ...w, reason: e.target.value }))} style={styles.input} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setWalletModal(emptyWallet)} style={styles.btnSecondary}>Cancel</button>
              <button onClick={submitWallet} disabled={busyId === walletModal.user._id} style={styles.btnPrimary}>
                {busyId === walletModal.user._id ? 'Saving…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ Change Password Modal ═══════════ */}
      {passwordModal.open && passwordModal.user && (
        <div style={styles.modalOverlay} onClick={() => setPasswordModal(emptyPassword)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0' }}>Change Password</h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
              {passwordModal.user.name || passwordModal.user.oderId} · {passwordModal.user.email || '—'}
            </div>

            <label style={styles.label}>New Password (min 6 characters)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type={passwordModal.show ? 'text' : 'password'} value={passwordModal.newPassword}
                onChange={(e) => setPasswordModal(s => ({ ...s, newPassword: e.target.value }))}
                style={{ ...styles.input, flex: 1 }} autoFocus />
              <button onClick={() => setPasswordModal(s => ({ ...s, show: !s.show }))} style={styles.btnSecondary}>
                {passwordModal.show ? 'Hide' : 'Show'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setPasswordModal(emptyPassword)} style={styles.btnSecondary}>Cancel</button>
              <button onClick={submitPassword} disabled={busyId === passwordModal.user._id} style={styles.btnPrimary}>
                {busyId === passwordModal.user._id ? 'Saving…' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ Order Modes Modal ═══════════ */}
      {tradeModesModal.open && tradeModesModal.user && (
        <div style={styles.modalOverlay} onClick={() => !tradeModesModal.saving && setTradeModesModal(emptyTradeModes)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px 0' }}>Order Modes & Currency</h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
              {tradeModesModal.user.name || tradeModesModal.user.oderId}
            </div>

            <label style={styles.label}>Allowed Order Modes</label>
            <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
              <CheckRow label="Hedging" checked={!!tradeModesModal.modes.hedging}
                onChange={(v) => setTradeModesModal(s => ({ ...s, modes: { ...s.modes, hedging: v } }))} />
              <CheckRow label="Netting (always on)" checked disabled />
              <CheckRow label="Binary" checked={!!tradeModesModal.modes.binary}
                onChange={(v) => setTradeModesModal(s => ({ ...s, modes: { ...s.modes, binary: v } }))} />
            </div>

            <label style={styles.label}>Currency Display</label>
            <select value={tradeModesModal.currencyDisplay}
              onChange={(e) => setTradeModesModal(s => ({ ...s, currencyDisplay: e.target.value }))}
              style={{ ...styles.input, marginBottom: 12 }}>
              <option value="BOTH">Both (USD & INR)</option>
              <option value="USD">USD only</option>
              <option value="INR">INR only</option>
            </select>

            <label style={styles.label}>Allowed Deposit / Withdrawal Currencies</label>
            <div style={{ display: 'grid', gap: 6 }}>
              <CheckRow label="USD" checked={!!tradeModesModal.currencies.USD}
                onChange={(v) => setTradeModesModal(s => ({ ...s, currencies: { ...s.currencies, USD: v } }))} />
              <CheckRow label="INR" checked={!!tradeModesModal.currencies.INR}
                onChange={(v) => setTradeModesModal(s => ({ ...s, currencies: { ...s.currencies, INR: v } }))} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setTradeModesModal(emptyTradeModes)} style={styles.btnSecondary} disabled={tradeModesModal.saving}>
                Cancel
              </button>
              <button onClick={submitTradeModes} disabled={tradeModesModal.saving} style={styles.btnPrimary}>
                {tradeModesModal.saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ Download Report Modal ═══════════ */}
      {reportModal.open && reportModal.user && (
        <div style={styles.modalOverlay} onClick={() => !reportModal.saving && setReportModal(emptyReport)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px 0' }}>Download Report</h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
              {reportModal.user.name || reportModal.user.oderId}
            </div>

            <label style={styles.label}>Date Range</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button type="button" onClick={() => setReportModal(s => ({ ...s, allTime: true }))}
                style={{ ...styles.pillBtn, ...(reportModal.allTime ? styles.pillActive : {}) }}>
                All Time
              </button>
              <button type="button" onClick={() => setReportModal(s => ({ ...s, allTime: false }))}
                style={{ ...styles.pillBtn, ...(!reportModal.allTime ? styles.pillActive : {}) }}>
                Custom
              </button>
            </div>
            {!reportModal.allTime && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <label style={styles.label}>From</label>
                  <input type="date" value={reportModal.fromDate}
                    onChange={(e) => setReportModal(s => ({ ...s, fromDate: e.target.value }))} style={styles.input} />
                </div>
                <div>
                  <label style={styles.label}>To</label>
                  <input type="date" value={reportModal.toDate}
                    onChange={(e) => setReportModal(s => ({ ...s, toDate: e.target.value }))} style={styles.input} />
                </div>
              </div>
            )}

            <label style={styles.label}>Sections to Include</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {Object.keys(reportModal.reportTypes).map((k) => (
                <CheckRow key={k} label={k[0].toUpperCase() + k.slice(1)}
                  checked={!!reportModal.reportTypes[k]}
                  onChange={(v) => setReportModal(s => ({ ...s, reportTypes: { ...s.reportTypes, [k]: v } }))} />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setReportModal(emptyReport)} style={styles.btnSecondary} disabled={reportModal.saving}>
                Cancel
              </button>
              <button onClick={submitDownloadReport} disabled={reportModal.saving} style={styles.btnPrimary}>
                {reportModal.saving ? 'Preparing…' : 'Download CSV'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoTile({ label, value, color }) {
  return (
    <div style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || 'var(--text-primary)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ActionBtn({ color, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '12px', borderRadius: 10,
      background: `color-mix(in srgb, ${color} 12%, var(--bg-secondary))`,
      border: `1px solid color-mix(in srgb, ${color} 35%, var(--border-color))`,
      color, cursor: 'pointer', fontSize: 13, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    }}>
      {children}
    </button>
  );
}

function CheckRow({ label, checked, disabled, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.7 : 1 }}>
      <input type="checkbox" checked={!!checked} disabled={!!disabled}
        onChange={(e) => onChange && onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const styles = {
  header: { marginBottom: 14 },
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
  pillBtn: { flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500 },
  pillActive: { border: '2px solid #3b82f6', background: 'color-mix(in srgb, #3b82f6 12%, var(--bg-primary))', color: '#3b82f6', fontWeight: 600 },
  pillActiveBonus: { border: '2px solid #fbbf24', background: 'color-mix(in srgb, #fbbf24 12%, var(--bg-primary))', color: '#fbbf24', fontWeight: 600 },
};
