import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  LuLayoutDashboard, LuMonitorPlay, LuUsers, LuTrendingUp,
  LuBanknote, LuIndianRupee, LuLandmark, LuWallet, LuSettings,
  LuChevronLeft, LuChevronRight, LuArrowLeft, LuMenu, LuX,
  LuCalculator, LuShield, LuClock, LuTriangleAlert, LuScroll
} from 'react-icons/lu';
import logoDark from '../../assets/dhanfunded-wordmark-onlight.png';
import '../../styles/themes.css';
import '../Admin/Admin.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Broker sidebar — each entry declares the permission keys it needs.
 *   - `requires: 'x'`        → must hold key 'x'
 *   - `requires: ['a','b']`  → ANY of the listed keys is enough (anyOf)
 *   - omitted                → always visible (own account / dashboard)
 *
 * Permissions come from what super-admin or sub-admin granted to this broker
 * in the admin-management picker, so revoking `trades.view` immediately hides
 * the Position Management nav on the broker's next login.
 */
const brokerSidebarMenu = [
  { id: 'dashboard', label: 'Dashboard', Icon: LuLayoutDashboard, path: '/broker-panel' },
  {
    id: 'users', label: 'User Management', Icon: LuUsers,
    path: '/broker-panel/users',
    requires: 'users.view',
    children: [
      { id: 'users-all',     label: 'All Users',     path: '/broker-panel/users' },
      { id: 'users-active',  label: 'Active',        path: '/broker-panel/users/active' },
      { id: 'users-blocked', label: 'Blocked',       path: '/broker-panel/users/blocked' },
      { id: 'users-demo',    label: 'Demo',          path: '/broker-panel/users/demo' },
      { id: 'users-kyc',     label: 'KYC',           path: '/broker-panel/users/kyc' },
      { id: 'users-logs',    label: 'Activity Logs', path: '/broker-panel/users/activity' },
    ],
  },
  {
    id: 'trades', label: 'Position Management', Icon: LuTrendingUp,
    path: '/broker-panel/trades',
    requires: 'trades.view',
    children: [
      { id: 'trades-combined', label: 'Combined Positions', path: '/broker-panel/trades' },
      { id: 'trades-open',     label: 'Open Positions',     path: '/broker-panel/trades/open' },
      { id: 'trades-pending',  label: 'Pending Orders',     path: '/broker-panel/trades/pending' },
      { id: 'trades-history',  label: 'Activity History',      path: '/broker-panel/trades/history' },
    ],
  },
  {
    id: 'funds', label: 'Fund Management', Icon: LuBanknote,
    path: '/broker-panel/funds',
    requires: ['deposits.view', 'withdrawals.view'],
    children: [
      { id: 'funds-all',        label: 'All',          path: '/broker-panel/funds' },
      { id: 'funds-deposits',   label: 'Deposits',     path: '/broker-panel/funds/deposits' },
      { id: 'funds-withdrawals',label: 'Withdrawals',  path: '/broker-panel/funds/withdrawals' },
    ],
  },
  { id: 'bank-management', label: 'Bank & Payment', Icon: LuLandmark, path: '/broker-panel/bank-management' },
  {
    id: 'netting', label: 'Netting Settings', Icon: LuCalculator,
    path: '/broker-panel/netting-overrides',
    requires: ['nettingSegment.view', 'nettingSegment.edit'],
    children: [
      { id: 'netting-segments', label: 'Segment Settings', path: '/broker-panel/netting-overrides' },
      { id: 'netting-scripts',  label: 'Script Settings',  path: '/broker-panel/netting-overrides/scripts' },
      { id: 'netting-users',    label: 'User Settings',    path: '/broker-panel/netting-overrides/users' },
      { id: 'netting-copy',     label: 'Copy Settings',    path: '/broker-panel/netting-overrides/copy' },
    ],
  },
  { id: 'risk-overrides', label: 'Risk Settings', Icon: LuTriangleAlert, path: '/broker-panel/risk-overrides', requires: ['risk.view', 'risk.edit'] },
  { id: 'scoped-audit', label: 'Override Audit', Icon: LuScroll, path: '/broker-panel/scoped-audit', requires: 'admin.viewAuditLog' },
  { id: 'wallet', label: 'My Wallet', Icon: LuWallet, path: '/broker-panel/wallet' },
  { id: 'settings', label: 'Settings', Icon: LuSettings, path: '/broker-panel/settings' },
];

function canSee(menu, user) {
  if (!menu.requires) return true;
  if (user?.role === 'super_admin') return true;
  const perms = user?.permissions || {};
  const keys = Array.isArray(menu.requires) ? menu.requires : [menu.requires];
  return keys.some(k => !!perms[k]);
}

function BrokerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [adminAuth, setAdminAuth] = useState({ isAuthenticated: false, user: null, loading: true });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState([]);
  const toggleExpanded = (id) =>
    setExpandedMenus((prev) => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  // Currency helpers — mirror AdminLayout so ScopedTradeList P/L matches
  // the admin panel exactly (INR P/L normalized to USD base, then displayed
  // in admin-selected currency).
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
          if (sessionData.admin && sessionData.admin.role === 'broker') {
            // Store DhanFunded impersonated session in sessionStorage (tab-specific, won't affect other tabs)
            sessionStorage.setItem('dhanfunded-impersonate-token', sessionData.token);
            sessionStorage.setItem('dhanfunded-impersonate-admin', JSON.stringify(sessionData.admin));
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
          if (parsedAdmin && parsedAdmin.role === 'broker') {
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
          if (parsedAdmin && parsedAdmin.role === 'broker') {
            setAdminAuth({ isAuthenticated: true, user: parsedAdmin, loading: false });
            return;
          }
        } catch (e) {
          // Invalid data
        }
      }
      
      // Not authenticated as broker, redirect to login
      setAdminAuth({ isAuthenticated: false, user: null, loading: false });
    };
    checkAuth();
  }, []);

  // Refresh permissions from the server so sidebar gating picks up the latest
  // grants from super-admin / sub-admin (no re-login required).
  useEffect(() => {
    if (!adminAuth.isAuthenticated) return;
    let cancelled = false;
    fetch(`${API_URL}/api/admin/auth/me`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.success || !data.admin) return;
        const fresh = data.admin;
        if (fresh.role !== 'broker') return;
        localStorage.setItem('dhanfunded-admin', JSON.stringify(fresh));
        localStorage.setItem('dhanfunded-admin-user', JSON.stringify(fresh));
        setAdminAuth(a => ({ ...a, user: fresh }));
      })
      .catch(() => { /* stale perms fall back to localStorage; not fatal */ });
    return () => { cancelled = true; };
  }, [adminAuth.isAuthenticated]);

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
    
    localStorage.removeItem('dhanfunded-admin-token');
    localStorage.removeItem('dhanfunded-admin-user');
    localStorage.removeItem('dhanfunded-admin');
    navigate('/broker');
  };

  const getActiveMenu = () => {
    const path = location.pathname;
    // Check exact matches first, then prefix matches (excluding dashboard base path)
    for (const menu of brokerSidebarMenu) {
      if (path === menu.path) {
        return menu.id;
      }
    }
    // Check prefix matches for nested routes (but not for dashboard base path)
    for (const menu of brokerSidebarMenu) {
      if (menu.id !== 'dashboard' && path.startsWith(menu.path + '/')) {
        return menu.id;
      }
    }
    return 'dashboard';
  };

  const getPageTitle = () => {
    const path = location.pathname;
    for (const menu of brokerSidebarMenu) {
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
    navigate('/broker');
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
        {mobileMenuOpen ? <LuX size={20} /> : <LuMenu size={20} />}
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
            {sidebarCollapsed ? <LuChevronRight size={16} /> : <LuChevronLeft size={16} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {brokerSidebarMenu.filter(m => canSee(m, adminAuth.user)).map(menu => {
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
                  <span className="menu-icon"><menu.Icon size={18} /></span>
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
                            textAlign: 'left', padding: '6px 10px', borderRadius: 6, border: 'none',
                            background: subActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                            color: subActive ? '#3b82f6' : 'var(--text-secondary)',
                            fontSize: 13, fontWeight: subActive ? 600 : 400, cursor: 'pointer',
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
            {sidebarCollapsed ? <LuArrowLeft size={16} /> : <><LuArrowLeft size={14} /> Back to App</>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        <header className="admin-header">
          <h1 className="admin-page-title">{getPageTitle()}</h1>
          <div className="admin-header-actions">
            {/* Currency toggle — mirrors AdminLayout / SubAdminLayout. */}
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
            <span className="admin-user">{adminAuth.user?.name || 'Broker'} ({adminAuth.user?.oderId})</span>
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

export default BrokerLayout;
