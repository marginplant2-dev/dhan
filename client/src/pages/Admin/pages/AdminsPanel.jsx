import { useCallback, useEffect, useState } from 'react';
import PermissionPicker from './PermissionPicker';
import { ROLE_PRESETS, normalizePermissions } from './adminPermissionCatalog';
import '../../TenantAdmin/TenantAdmin.css';

/**
 * Admins, for the platform owner.
 *
 * Replaces the old AdminManagement screen, which carried brokers, hierarchy
 * trees, fund requests and two activity-log tabs from a different product.
 * This platform runs one layer: the owner creates admins, each admin runs
 * their own pool. That is the whole screen.
 *
 * The old file is still in the repo, just not routed.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function authedFetch(url, init = {}) {
  const token = localStorage.getItem('dhanfunded-admin-token') || '';
  const headers = { ...(init.headers || {}) };
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { ...init, headers });
}

const BLANK = { name: '', email: '', phone: '', password: '' };

export default function AdminsPanel() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [menuFor, setMenuFor] = useState(null);

  // One editor for both create and edit — same fields, same permission tree.
  const [editor, setEditor] = useState(null);   // { mode, admin?, form, permissions }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`${API_URL}/api/admin/hierarchy?role=sub_admin`);
      const data = await res.json();
      if (data.success) {
        setAdmins((data.admins || []).filter(a => a.role === 'sub_admin'));
        setError('');
      } else {
        setError(data.error || 'Could not load admins');
      }
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => setEditor({
    mode: 'create', form: { ...BLANK }, permissions: normalizePermissions(ROLE_PRESETS.sub_admin),
  });

  const openEdit = (admin) => setEditor({
    mode: 'edit',
    admin,
    form: { name: admin.name || '', email: admin.email || '', phone: admin.phone || '', password: '' },
    permissions: normalizePermissions(admin.permissions),
  });

  const submit = async () => {
    const { mode, admin, form, permissions } = editor;
    if (!form.name || !form.email) return alert('Name and email are required');
    if (mode === 'create' && (form.password || '').length < 6) return alert('Password must be at least 6 characters');

    const url = mode === 'create'
      ? `${API_URL}/api/admin/hierarchy/create`
      : `${API_URL}/api/admin/hierarchy/${admin._id}`;
    const body = mode === 'create'
      ? { ...form, role: 'sub_admin', permissions }
      : {
          name: form.name, email: form.email, phone: form.phone, permissions,
          ...(form.password && form.password.length >= 6 ? { password: form.password } : {}),
        };

    const res = await authedFetch(url, {
      method: mode === 'create' ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) return alert(data.error || 'That did not work');

    // The server caps every grant at what the granter holds and tells us what
    // it clipped — say so instead of showing a tree that silently disagrees.
    if (data.clipped?.length) {
      alert(`Saved. These were above your own level and were not granted:\n${data.clipped.join('\n')}`);
    }
    setEditor(null);
    load();
  };

  const patch = async (admin, body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    const res = await authedFetch(`${API_URL}/api/admin/hierarchy/${admin._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) load();
    else alert(data.error || 'That did not work');
  };

  const resetPassword = (admin) => {
    const pwd = prompt(`New password for ${admin.name} (at least 6 characters)`);
    if (!pwd) return;
    if (pwd.length < 6) return alert('Password must be at least 6 characters');
    patch(admin, { password: pwd });
  };

  const remove = async (admin) => {
    if (!window.confirm(`Delete ${admin.name}? Their users stay on the platform, unassigned.`)) return;
    const res = await authedFetch(`${API_URL}/api/admin/hierarchy/${admin._id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) load();
    else alert(data.error || 'Could not delete this admin');
  };

  const loginAs = async (admin) => {
    const res = await authedFetch(`${API_URL}/api/admin/subadmins/${admin._id}/login-as`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) return alert(data.error || 'Could not open that panel');
    // Session travels in the URL, so it lands in the new tab's sessionStorage
    // and never touches this tab's login.
    const payload = btoa(JSON.stringify({
      admin: data.admin,
      token: 'admin-' + (data.admin._id || data.admin.id),
    }));
    window.open(`/admin-panel?impersonate=${payload}`, '_blank');
  };

  const q = search.trim().toLowerCase();
  const rows = admins.filter(a => !q || [a.oderId, a.name, a.email, a.phone]
    .some(v => String(v || '').toLowerCase().includes(q)));

  const menuItems = (admin) => [
    { label: 'Login to their panel', run: () => loginAs(admin) },
    { label: 'Edit & permissions', run: () => openEdit(admin) },
    admin.isActive
      ? { label: 'Block', run: () => patch(admin, { isActive: false }) }
      : { label: 'Unblock', run: () => patch(admin, { isActive: true }) },
    { label: 'Reset password', run: () => resetPassword(admin) },
    { label: 'Delete', danger: true, run: () => remove(admin) },
  ];

  return (
    <div className="tp" style={{ minHeight: 0, display: 'block', background: 'transparent' }}>
      <div className="tp-row" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Admins</h2>
          <p className="tp-muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
            Each admin runs an isolated pool. They see only their own users — never yours, never each other's.
          </p>
        </div>
        <button className="tp-btn tp-btn--primary" onClick={openCreate}>+ New admin</button>
      </div>

      <input
        className="tp-input" style={{ marginBottom: 16 }}
        placeholder="Search by name, email, code or mobile…"
        value={search} onChange={(e) => setSearch(e.target.value)}
      />

      <div className="tp-table-wrap" style={{ overflow: 'visible' }}>
        <table className="tp-table">
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Email</th><th>Mobile</th>
              <th>Users</th><th>Created</th><th>Status</th><th style={{ width: 48 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8"><div className="tp-empty">Loading…</div></td></tr>
            ) : error ? (
              <tr><td colSpan="8"><div className="tp-empty">{error}</div></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="8"><div className="tp-empty">
                {q ? 'Nothing matches that search' : 'No admins yet — create the first one'}
              </div></td></tr>
            ) : rows.map(admin => (
              <tr key={admin._id}>
                <td className="tp-mono">{admin.oderId}</td>
                <td style={{ fontWeight: 600 }}>{admin.name}</td>
                <td>{admin.email}</td>
                <td>{admin.phone || '—'}</td>
                <td>{admin.userCount || 0}</td>
                <td>{admin.createdAt ? new Date(admin.createdAt).toLocaleDateString('en-IN') : '—'}</td>
                <td>
                  <span className={`tp-pill ${admin.isActive ? 'tp-pill--ok' : 'tp-pill--off'}`}>
                    {admin.isActive ? 'ACTIVE' : 'BLOCKED'}
                  </span>
                </td>
                <td style={{ position: 'relative', textAlign: 'right' }}>
                  <button onClick={() => setMenuFor(menuFor === admin._id ? null : admin._id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--tp-muted)' }}>
                    ⋮
                  </button>
                  {menuFor === admin._id && (
                    <>
                      <div onClick={() => setMenuFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                      <div className="tp-card" style={{
                        position: 'absolute', right: 10, top: '100%', zIndex: 41, minWidth: 210,
                        padding: 6, textAlign: 'left', boxShadow: '0 14px 34px rgba(0,0,0,.2)',
                      }}>
                        {menuItems(admin).map(item => (
                          <button key={item.label}
                            onClick={() => { setMenuFor(null); item.run(); }}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                              background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer',
                              fontSize: 14, color: item.danger ? 'var(--tp-danger)' : 'var(--tp-text)',
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

      {editor && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 900,
          display: 'flex', justifyContent: 'flex-end',
        }} onClick={(e) => { if (e.target === e.currentTarget) setEditor(null); }}>
          <div className="tp" style={{
            width: 'min(560px, 100%)', height: '100%', overflowY: 'auto',
            background: 'var(--tp-surface)', display: 'block', padding: 24,
          }}>
            <div className="tp-row" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>
                {editor.mode === 'create' ? 'New admin' : `Edit ${editor.admin.name}`}
              </h3>
              <button className="tp-btn" onClick={() => setEditor(null)}>Close</button>
            </div>

            <div className="tp-grid-2" style={{ marginBottom: 16 }}>
              {[
                ['name', 'Name', 'text'],
                ['email', 'Email', 'email'],
                ['phone', 'Mobile', 'text'],
                ['password', editor.mode === 'create' ? 'Password' : 'New password (optional)', 'text'],
              ].map(([key, label, type]) => (
                <div key={key}>
                  <label className="tp-label">{label}</label>
                  <input className="tp-input" type={type} value={editor.form[key]}
                         onChange={(e) => setEditor(ed => ({ ...ed, form: { ...ed.form, [key]: e.target.value } }))} />
                </div>
              ))}
            </div>

            <label className="tp-label">Permissions</label>
            <PermissionPicker
              value={editor.permissions}
              role="sub_admin"
              onChange={(next) => setEditor(ed => ({ ...ed, permissions: next }))}
            />

            <div className="tp-row" style={{ marginTop: 22 }}>
              <button className="tp-btn tp-btn--primary" onClick={submit}>
                {editor.mode === 'create' ? 'Create admin' : 'Save changes'}
              </button>
              <button className="tp-btn" onClick={() => setEditor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
