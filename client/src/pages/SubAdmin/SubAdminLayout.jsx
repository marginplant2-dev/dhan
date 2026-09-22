import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import logoDark from '../../assets/dhanfunded-wordmark-onlight.png';
import '../../styles/themes.css';
import '../Admin/Admin.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Sub-Admin sidebar. Each entry declares the permission keys it needs:
 *   - `requires: 'x'`        → must hold key 'x'
 *   - `requires: ['a','b']`  → must hold ANY of 'a', 'b' (anyOf semantics)
 *   - omitted                → always visible (own account / dashboard / etc.)
 *
 * The sub-admin's permission map comes from what super-admin granted at
 * create/edit time in Admin Management, so disabling "trades.view" for a
 * sub-admin hides the Position Management nav automatically.
 */
const subAdminSidebarMenu = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', path: '/subadmin-panel' },
  {
    id: 'users', label: 'User Management', icon: '👥',
    path: '/subadmin-panel/users',
    requires: 'users.view',
    children: [
      { id: 'users-all',     label: 'All Users',     path: '/subadmin-panel/users' },
      { id: 'users-active',  label: 'Active',        path: '/subadmin-panel/users/active' },
      { id: 'users-blocked', label: 'Blocked',       path: '/subadmin-panel/users/blocked' },
      { id: 'users-demo',    label: 'Demo',          path: '/subadmin-panel/users/demo' },
      { id: 'users-kyc',     label: 'KYC',           path: '/subadmin-panel/users/kyc' },
      { id: 'users-logs',    label: 'Activity Logs', path: '/subadmin-panel/users/activity' },
    ],
  },
  { id: 'brokers', label: 'Broker Management', icon: '🏢', path: '/subadmin-panel/brokers', requires: 'admin.createBroker' },
  {
    id: 'trades', label: 'Position Management', icon: '📈',
    path: '/subadmin-panel/trades',
    requires: 'trades.view',
    children: [
      { id: 'trades-combined', label: 'Combined Positions', path: '/subadmin-panel/trades' },
      { id: 'trades-open',     label: 'Open Positions',     path: '/subadmin-panel/trades/open' },
      { id: 'trades-pending',  label: 'Pending Orders',     path: '/subadmin-panel/trades/pending' },
      { id: 'trades-history',  label: 'Activity History',      path: '/subadmin-panel/trades/history' },
    ],
  },
  {
    id: 'funds', label: 'Fund Management', icon: '💰',
    path: '/subadmin-panel/funds',
    requires: ['deposits.view', 'withdrawals.view'],
    children: [
      { id: 'funds-all',        label: 'All',          path: '/subadmin-panel/funds' },
      { id: 'funds-deposits',   label: 'Deposits',     path: '/subadmin-panel/funds/deposits' },
      { id: 'funds-withdrawals',label: 'Withdrawals',  path: '/subadmin-panel/funds/withdrawals' },
    ],
  },
  { id: 'broker-funds', label: 'Broker Fund Requests', icon: '💸', path: '/subadmin-panel/broker-funds', requires: 'admin.createBroker' },
  { id: 'bank-management', label: 'Bank & Payment', icon: '🏦', path: '/subadmin-panel/bank-management' },
  {
    id: 'netting', label: 'Netting Settings', icon: '🧮',
    path: '/subadmin-panel/netting-overrides',
    requires: ['nettingSegment.view', 'nettingSegment.edit'],
    children: [
      { id: 'netting-segments', label: 'Segment Settings', path: '/subadmin-panel/netting-overrides' },
      { id: 'netting-scripts',  label: 'Script Settings',  path: '/subadmin-panel/netting-overrides/scripts' },
      { id: 'netting-users',    label: 'User Settings',    path: '/subadmin-panel/netting-overrides/users' },
      { id: 'netting-copy',     label: 'Copy Settings',    path: '/subadmin-panel/netting-overrides/copy' },
    ],
  },
  { id: 'risk-overrides', label: 'Risk Settings', icon: '⚠️', path: '/subadmin-panel/risk-overrides', requires: ['risk.view', 'risk.edit'] },
  { id: 'scoped-audit', label: 'Override Audit', icon: '📜', path: '/subadmin-panel/scoped-audit', requires: 'admin.viewAuditLog' },
  { id: 'branding', label: 'Branding & Domain', icon: '🌐', path: '/subadmin-panel/branding' },
  { id: 'wallet', label: 'My Wallet', icon: '💳', path: '/subadmin-panel/wallet' },
  { id: 'settings', label: 'Settings', icon: '⚙️', path: '/subadmin-panel/settings' },
];

function canSee(menu, user) {
  if (!menu.requires) return true;
  if (user?.role === 'super_admin') return true;
  const perms = user?.permissions || {};
  const keys = Array.isArray(menu.requires) ? menu.requires : [menu.requires];
  return keys.some(k => !!perms[k]);
}

function SubAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [adminAuth, setAdminAuth] = useState({ isAuthenticated: false, user: null, loading: true });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState([]);
  const [impersonating, setImpersonating] = useState(false);
  const toggleExpanded = (id) =>
    setExpandedMenus((prev) => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  // Currency helpers — MUST mirror AdminLayout so P/L numbers match the
  // admin panel exactly (INR P/L on Indian instruments is normalized to
  // USD base then re-displayed in the admin-selected currency).
  const DEFAULT_USD_INR_RATE = 83.5;
  const [adminCurrency, setAdminCurrency] = useState(
    localStorage.getItem('dhanfunded-admin-currency') || 'USD'
  );
  const [usdInrRate, setUsdInrRate] = useState(DEFAULT_USD_INR_RATE);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await response.json();
        if (data?.rates?.INR) setUsdInrRate(data.rates.INR);
      } catch {
        // keep fallback
      }
    })();
  }, []);

  const toggleAdminCurrency = (currency) => {
    setAdminCurrency(currency);
    localStorage.setItem('dhanfunded-admin-currency', currency);
  };

  const formatAdminCurrency = (valueInINR) => {
    const n = Number(valueInINR || 0);
    return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  useEffect(() => {
    const checkAuth = () => {
      // Check for impersonate parameter (Login As feature from admin panel)
      const urlParams = new URLSearchParams(window.location.search);
      const impersonateData = urlParams.get('impersonate');
      
      if (impersonateData) {
        try {
          const sessionData = JSON.parse(atob(impersonateData));
          if (sessionData.admin && sessionData.admin.role === 'sub_admin') {
            // Store DhanFunded impersonated session in sessionStorage (tab-specific, won't affect other tabs)
            sessionStorage.setItem('dhanfunded-impersonate-token', sessionData.token);
            sessionStorage.setItem('dhanfunded-impersonate-admin', JSON.stringify(sessionData.admin));
            setImpersonating(true);
            // Remove impersonate param from URL
            window.history.replaceState({}, '', window.location.pathname);
            setAdminAuth({ isAuthenticated: true, user: sessionData.admin, loading: false });
            return;
          }
        } catch (e) {
          console.error('Invalid impersonate data:', e);
        }
      }
      
      // Check sessionStorage first for impersonated session (tab-specific)
      const impersonateAdmin = sessionStorage.getItem('dhanfunded-impersonate-admin');
      const impersonateToken = sessionStorage.getItem('dhanfunded-impersonate-token');
      if (impersonateAdmin && impersonateToken) {
        try {
          const parsedAdmin = JSON.parse(impersonateAdmin);
          if (parsedAdmin && parsedAdmin.role === 'sub_admin') {
            setImpersonating(true);
            setAdminAuth({ isAuthenticated: true, user: parsedAdmin, loading: false });
            return;
          }
        } catch (e) {
          // Invalid data
        }
      }
      
      // Fall back to localStorage for normal login
      const adminData = localStorage.getItem('dhanfunded-admin');
      const adminToken = localStorage.getItem('dhanfunded-admin-token');
      
      if (adminData && adminToken?.startsWith('admin-')) {
        try {
          const parsedAdmin = JSON.parse(adminData);
          if (parsedAdmin && parsedAdmin.role === 'sub_admin') {
            setAdminAuth({ isAuthenticated: true, user: parsedAdmin, loading: false });
            return;
          }
        } catch (e) {
          // Invalid data
        }
      }
      
      // Not authenticated as sub_admin, redirect to login
      setAdminAuth({ isAuthenticated: false, user: null, loading: false });
    };
    checkAuth();
  }, []);

  // Refresh permissions from the server so sidebar gating reflects the latest
  // grants from super-admin (no re-login required).
  useEffect(() => {
    if (!adminAuth.isAuthenticated) return;
    let cancelled = false;

    // Bug 3 fix: /auth/me requires Authorization: Bearer <token>. Impersonated
    // sessions store the token in sessionStorage (tab-local), regular logins
    // in localStorage. Without this header the route 401s silently and perms
    // stay stale forever.
    const token =
      sessionStorage.getItem('dhanfunded-impersonate-token') ||
      localStorage.getItem('dhanfunded-admin-token') ||
      '';
    if (!token) return;

    fetch(`${API_URL}/api/admin/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.success || !data.admin) return;
        const fresh = data.admin;
        if (fresh.role !== 'sub_admin') return;
        localStorage.setItem('dhanfunded-admin', JSON.stringify(fresh));
        localStorage.setItem('dhanfunded-admin-user', JSON.stringify(fresh));
        setAdminAuth(a => ({ ...a, user: fresh }));
      })
      .catch(() => { /* stale perms fall back to localStorage; not fatal */ });
    return () => { cancelled = true; };
  }, [adminAuth.isAuthenticated]);

  /** This tab is acting as someone else (opened from Admin Management). */
  const isImpersonating = () => {
    try { return !!sessionStorage.getItem('dhanfunded-impersonate-token'); } catch { return false; }
  };

  const endImpersonation = () => {
    try {
      sessionStorage.removeItem('dhanfunded-impersonate-token');
      sessionStorage.removeItem('dhanfunded-impersonate-admin');
    } catch { /* private mode */ }
    // This panel is always opened in its own tab, so closing it returns the
    // operator to where they started. If the browser refuses, fall back.
    window.close();
    window.location.href = '/admin/admin-management';
  };

  const handleLogout = async () => {
    // Call logout API to log the activity with session duration
    try {
      const adminData = JSON.parse(localStorage.getItem('dhanfunded-admin') || '{}');
      if (adminData._id) {
        await fetch(`${API_URL}/api/admin/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminId: adminData._id, sessionId: adminData.sessionId })
        });
      }
    } catch (error) {
      console.error('Logout API error:', error);
    }
    
    // An impersonated tab owns nothing in localStorage — clearing it would log
    // the operator out of their own panel in every other tab.
    if (isImpersonating()) {
      endImpersonation();
      return;
    }

    localStorage.removeItem('dhanfunded-admin-token');
    localStorage.removeItem('dhanfunded-admin-user');
    localStorage.removeItem('dhanfunded-admin');
    navigate('/subadmin');
  };

  const getActiveMenu = () => {
    const path = location.pathname;
    // Check exact matches first, then prefix matches (excluding dashboard base path)
    for (const menu of subAdminSidebarMenu) {
      if (path === menu.path) {
        return menu.id;
      }
    }
    // Check prefix matches for nested routes (but not for dashboard base path)
    for (const menu of subAdminSidebarMenu) {
      if (menu.id !== 'dashboard' && path.startsWith(menu.path + '/')) {
        return menu.id;
      }
    }
    return 'dashboard';
  };

  const getPageTitle = () => {
    const path = location.pathname;
    for (const menu of subAdminSidebarMenu) {
      if (path === menu.path || path.startsWith(menu.path + '/')) {
        return menu.label;
      }
    }
    return 'Dashboard';
  };

  if (adminAuth.loading) {
    return (
      <div className="admin-loading">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (!adminAuth.isAuthenticated) {
    navigate('/subadmin');
    return null;
  }

  const activeMenu = getActiveMenu();

  return (
    <div className="admin-container">
      {/* Mobile Menu Overlay */}
      <div 
        className={`sidebar-overlay ${mobileMenuOpen ? 'visible' : ''}`} 
        onClick={() => setMobileMenuOpen(false)}
      />
      
      {/* Mobile Menu Toggle Button */}
      <button 
        className="mobile-menu-toggle"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        {mobileMenuOpen ? '✕' : '☰'}
      </button>
      
      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          {sidebarCollapsed ? (
            <img src={logoDark} alt="DhanFunded" className="sidebar-logo-img" style={{ height: '32px', width: '32px', objectFit: 'contain' }} />
          ) : (
            <img src={logoDark} alt="DhanFunded" className="sidebar-logo-img" style={{ height: '40px', width: 'auto', maxWidth: '180px', objectFit: 'contain' }} />
          )}
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>

        <nav className="sidebar-nav">
          {subAdminSidebarMenu.filter(m => canSee(m, adminAuth.user)).map(menu => {
            const isActive = activeMenu === menu.id;
            const hasChildren = Array.isArray(menu.children) && menu.children.length > 0;
            const isExpanded = expandedMenus.includes(menu.id) || (hasChildren && location.pathname.startsWith(menu.path));

            return (
              <div key={menu.id} className="sidebar-menu-item">
                <button
                  className={`sidebar-menu-btn ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    if (hasChildren) {
                      toggleExpanded(menu.id);
                      if (!location.pathname.startsWith(menu.path)) navigate(menu.path);
                    } else {
                      navigate(menu.path);
                    }
                    setMobileMenuOpen(false);
                  }}
                >
                  <span className="menu-icon">{menu.icon}</span>
                  {!sidebarCollapsed && (
                    <>
                      <span className="menu-label">{menu.label}</span>
                      {hasChildren && <span className="menu-arrow" style={{ marginLeft: 'auto' }}>{isExpanded ? '▾' : '▸'}</span>}
                    </>
                  )}
                </button>
                {hasChildren && isExpanded && !sidebarCollapsed && (
                  <div className="sidebar-submenu" style={{ marginLeft: 40, marginTop: 2, marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {menu.children.map(sub => {
                      const subActive = location.pathname === sub.path;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => { navigate(sub.path); setMobileMenuOpen(false); }}
                          style={{
                            textAlign: 'left',
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: 'none',
                            background: subActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                            color: subActive ? '#3b82f6' : 'var(--text-secondary)',
                            fontSize: 13,
                            fontWeight: subActive ? 600 : 400,
                            cursor: 'pointer',
                          }}
                        >
                          {sub.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="back-to-app-btn" onClick={() => navigate('/')}>
            {sidebarCollapsed ? '←' : '← Back to App'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        {impersonating && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '10px 18px', background: '#7c2d12', color: '#fed7aa',
            fontSize: 13, fontWeight: 600, flexWrap: 'wrap',
          }}>
            <span>
              Viewing <strong>{adminAuth.user?.name}</strong>’s panel as the super-admin. Every action is recorded.
            </span>
            <button onClick={endImpersonation} style={{
              background: '#fed7aa', color: '#7c2d12', border: 'none', borderRadius: 8,
              padding: '6px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 13,
            }}>
              Return to my account
            </button>
          </div>
        )}
        <header className="admin-header">
          <h1 className="admin-page-title">{getPageTitle()}</h1>
          <div className="admin-header-actions">
            {/* Currency toggle — mirrors AdminLayout so P/L displays switch
                between USD and INR (with live FX conversion). */}
            <div className="admin-currency-toggle">
              <button
                type="button"
                className={adminCurrency === 'USD' ? 'active usd' : ''}
                onClick={() => toggleAdminCurrency('USD')}
              >
                $ USD
              </button>
              <button
                type="button"
                className={adminCurrency === 'INR' ? 'active inr' : ''}
                onClick={() => toggleAdminCurrency('INR')}
              >
                ₹ INR
              </button>
            </div>
            <span className="admin-user">{adminAuth.user?.name || 'Sub-Admin'} ({adminAuth.user?.oderId})</span>
            <button className="admin-logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <div className="admin-content">
          <Outlet context={{
            adminAuth,
            API_URL,
            adminId: adminAuth.user?._id,
            adminOderId: adminAuth.user?.oderId,
            adminCurrency,
            usdInrRate,
            formatAdminCurrency,
            toggleAdminCurrency,
          }} />
        </div>
      </main>
    </div>
  );
}

export default SubAdminLayout;
