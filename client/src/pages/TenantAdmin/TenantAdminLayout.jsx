import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import './TenantAdmin.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * The panel an ADMIN runs their own pool from.
 *
 * It shows only what belongs to that admin: every call goes to the scoped API,
 * which resolves the tenant from the token and refuses anything outside it.
 * The old sub-admin panel is still in the repo but no longer routed — it was
 * the super-admin console wearing a different sidebar.
 */

const NAV = [
  { to: '/admin-panel',           end: true, icon: '▦', label: 'Overview' },
  { to: '/admin-panel/users',     icon: '👥', label: 'My Users' },
  { to: '/admin-panel/funds',     icon: '₹',  label: 'Deposits & Withdrawals' },
  { to: '/admin-panel/branding',  icon: '🌐', label: 'Branding & Domain' },
  { to: '/admin-panel/settings',  icon: '⚙',  label: 'Settings' },
];

/** Session for this tab: an impersonated one wins, and never touches localStorage. */
function readSession() {
  try {
    const raw = sessionStorage.getItem('dhanfunded-impersonate-admin');
    if (raw) return { admin: JSON.parse(raw), impersonating: true };
  } catch { /* private mode */ }
  try {
    const raw = localStorage.getItem('dhanfunded-admin');
    const token = localStorage.getItem('dhanfunded-admin-token');
    if (raw && token) {
      const admin = JSON.parse(raw);
      if (admin && admin.role === 'sub_admin') return { admin, impersonating: false };
    }
  } catch { /* corrupt entry */ }
  return null;
}

export default function TenantAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(undefined);   // undefined = still deciding

  useEffect(() => {
    // Arriving from the super-admin's "Login to their panel" — the payload is
    // in the URL so it never lands in localStorage and can't leak into the
    // operator's other tabs.
    const params = new URLSearchParams(window.location.search);
    const payload = params.get('impersonate');
    if (payload) {
      try {
        const data = JSON.parse(atob(payload));
        if (data?.admin?.role === 'sub_admin' && data.token) {
          sessionStorage.setItem('dhanfunded-impersonate-token', data.token);
          sessionStorage.setItem('dhanfunded-impersonate-admin', JSON.stringify(data.admin));
          window.history.replaceState({}, '', window.location.pathname);
          setSession({ admin: data.admin, impersonating: true });
          return;
        }
      } catch { /* fall through to the normal check */ }
    }
    setSession(readSession());
  }, []);

  useEffect(() => {
    if (session === null) navigate('/subadmin', { replace: true });
  }, [session, navigate]);

  const exitImpersonation = useCallback(() => {
    try {
      sessionStorage.removeItem('dhanfunded-impersonate-token');
      sessionStorage.removeItem('dhanfunded-impersonate-admin');
    } catch { /* private mode */ }
    // This panel opens in its own tab, so closing returns the operator to the
    // console they came from. Browsers that refuse get a redirect instead.
    window.close();
    window.location.href = '/admin/admin-management';
  }, []);

  const logout = useCallback(() => {
    if (session?.impersonating) return exitImpersonation();
    localStorage.removeItem('dhanfunded-admin-token');
    localStorage.removeItem('dhanfunded-admin-user');
    localStorage.removeItem('dhanfunded-admin');
    navigate('/subadmin', { replace: true });
  }, [session, exitImpersonation, navigate]);

  if (session === undefined) return <div className="tp"><div className="tp-body tp-muted">Loading…</div></div>;
  if (!session) return null;

  const { admin, impersonating } = session;
  const title = NAV.find(n => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))?.label
    || 'Overview';
  const brand = admin.brandName || admin.name || 'Admin';

  return (
    <div className="tp">
      <aside className="tp-side">
        <div className="tp-brand">
          <span className="tp-brand-mark">{brand.slice(0, 1).toUpperCase()}</span>
          <div>
            <div className="tp-brand-name">{brand}</div>
            <div className="tp-brand-sub">Admin panel</div>
          </div>
        </div>

        <nav className="tp-nav">
          {NAV.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <span className="tp-nav-icon">{item.icon}</span>{item.label}
            </NavLink>
          ))}
        </nav>

        <div className="tp-side-foot">
          <div className="tp-muted" style={{ fontSize: 12, marginBottom: 8 }}>{admin.oderId}</div>
          <button className="tp-btn" style={{ width: '100%' }} onClick={logout}>
            {impersonating ? 'Leave this panel' : 'Logout'}
          </button>
        </div>
      </aside>

      <main className="tp-main">
        {impersonating && (
          <div className="tp-banner">
            <span>You are in <strong>{admin.name}</strong>’s panel as the platform owner. Every action is recorded.</span>
            <button className="tp-btn" onClick={exitImpersonation}>Return to my account</button>
          </div>
        )}

        <header className="tp-top">
          <h1>{title}</h1>
          <span className="tp-who">{admin.name} · {admin.email}</span>
        </header>

        <div className="tp-body">
          <Outlet context={{ API_URL, admin, impersonating }} />
        </div>
      </main>
    </div>
  );
}
