import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import AdminLogin from './AdminLogin';
import { sidebarMenu, sectionTabs, API_URL } from './adminConfig';
import {
  LuChevronLeft, LuChevronRight, LuChevronDown, LuSun, LuMoon, LuArrowLeft,
  LuLayoutDashboard, LuMonitorPlay, LuUsers, LuTrendingUp,
  LuLandmark, LuShieldCheck, LuPalette, LuHandshake,
  LuGamepad2, LuTimer, LuShieldAlert,
  LuArrowLeftRight, LuChartColumn, LuRefreshCw, LuIndianRupee,
  LuGift, LuRadio, LuClock, LuFileChartColumn,
  LuBell, LuSettings, LuActivity, LuTrophy
} from 'react-icons/lu';
// Theme-aware admin sidebar logos: file suffix = ink colour, pick the opposite
// of the surface ("-dark" ink on light mode, "-light" ink on dark mode).
import logoForLightMode from '../../assets/dhanfunded-wordmark-onlight.png';
import logoForDarkMode from '../../assets/dhanfunded-wordmark-dark.png';
import '../../styles/themes.css';
import './Admin.css';

// Map from adminConfig icon key → react-icons component
const ADMIN_ICON_MAP = {
  'dashboard': LuLayoutDashboard,
  'market-watch': LuMonitorPlay,
  'users': LuUsers,
  'trades': LuTrendingUp,
  'bank': LuLandmark,
  'admin': LuShieldCheck,
  'brand': LuPalette,
  'handshake': LuHandshake,
  'gamepad': LuGamepad2,
  'timer': LuTimer,
  'shield': LuShieldAlert,
  'hedging': LuArrowLeftRight,
  'netting': LuChartColumn,
  'refresh': LuRefreshCw,
  'dollar': LuIndianRupee,
  'rupee': LuIndianRupee,
  'gift': LuGift,
  'radio': LuRadio,
  'clock': LuClock,
  'reports': LuFileChartColumn,
  'activity': LuActivity,
  'bell': LuBell,
  'settings': LuSettings,
  'trophy': LuTrophy
};

// Mobile bottom-nav: the 5 most-used admin sections for one-tap access on phones.
// menuId matches getActiveMenu()'s sidebarMenu ids so the active tab highlights.
const BOTTOM_NAV = [
  { menuId: 'dashboard', label: 'Home', path: '/admin', Icon: LuLayoutDashboard },
  { menuId: 'user-management', label: 'Users', path: '/admin/users', Icon: LuUsers },
  { menuId: 'trade-management', label: 'Trades', path: '/admin/trades', Icon: LuTrendingUp },
  { menuId: 'bank-fund-management', label: 'Fund', path: '/admin/funds', Icon: LuLandmark },
  { menuId: 'prop-trading', label: 'Prop', path: '/admin/prop-trading', Icon: LuTrophy },
];

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [adminAuth, setAdminAuth] = useState({ isAuthenticated: false, user: null, loading: true });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState([]);

  // Close the mobile drawer whenever the route changes (i.e. after the admin
  // taps a nav item) so the content is visible immediately on phones.
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);
  const adminCurrency = 'INR';
  const usdInrRate = 1;
  // Admin panel is light-only now.
  const [adminTheme, setAdminTheme] = useState('light');

  const toggleAdminTheme = () => {
    setAdminTheme('light');
    localStorage.setItem('dhanfunded-admin-theme', 'light');
  };

  const totalRate = 1;

  const formatAdminCurrency = (valueInINR) => {
    const numValue = Number(valueInINR || 0);
    return `₹${numValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatAdminCurrencyCompact = (valueInINR) => {
    const numValue = Number(valueInINR || 0);
    const sign = numValue < 0 ? '-' : '';
    const abs = Math.abs(numValue);
    if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
    if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
    if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(2)} K`;
    return `${sign}₹${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const toggleAdminCurrency = () => {};

  useEffect(() => {
    const onUserRefresh = (e) => {
      if (e?.detail) {
        setAdminAuth((prev) => (prev.isAuthenticated ? { ...prev, user: e.detail } : prev));
      }
    };
    window.addEventListener('dhanfunded-admin-user-refreshed', onUserRefresh);
    return () => window.removeEventListener('dhanfunded-admin-user-refreshed', onUserRefresh);
  }, []);

  // Check admin authentication on mount
  useEffect(() => {
    const checkAdminAuth = async () => {
      const adminToken = localStorage.getItem('dhanfunded-admin-token');
      const adminUser = localStorage.getItem('dhanfunded-admin-user');
      
      // SuperAdmin panel should only use JWT token (not admin- prefixed tokens)
      // SubAdmin/Broker tokens start with 'admin-', SuperAdmin tokens are JWT
      if (adminToken && !adminToken.startsWith('admin-') && adminUser) {
        try {
          const res = await fetch(`${API_URL}/api/auth/admin/verify`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            // Update localStorage with fresh user data including _id
            if (data.user) {
              localStorage.setItem('dhanfunded-admin-user', JSON.stringify(data.user));
              setAdminAuth({ isAuthenticated: true, user: data.user, loading: false });
            } else {
              setAdminAuth({ isAuthenticated: true, user: JSON.parse(adminUser), loading: false });
            }
          } else {
            localStorage.removeItem('dhanfunded-admin-token');
            localStorage.removeItem('dhanfunded-admin-user');
            setAdminAuth({ isAuthenticated: false, user: null, loading: false });
          }
        } catch (error) {
          setAdminAuth({ isAuthenticated: true, user: JSON.parse(adminUser), loading: false });
        }
      } else {
        setAdminAuth({ isAuthenticated: false, user: null, loading: false });
      }
    };
    checkAdminAuth();
  }, []);

  const handleAdminLogin = (user, token) => {
    localStorage.setItem('dhanfunded-admin-token', token);
    localStorage.setItem('dhanfunded-admin-user', JSON.stringify(user));
    setAdminAuth({ isAuthenticated: true, user, loading: false });
    // Navigate to dashboard after login
    navigate('/admin');
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('dhanfunded-admin-token');
    localStorage.removeItem('dhanfunded-admin-user');
    localStorage.removeItem('dhanfunded-admin');
    setAdminAuth({ isAuthenticated: false, user: null, loading: false });
  };

  const toggleMenu = (menuId) => {
    setExpandedMenus(prev =>
      prev.includes(menuId)
        ? prev.filter(id => id !== menuId)
        : [...prev, menuId]
    );
  };

  // Get current active menu based on URL path
  const getActiveMenu = () => {
    const path = location.pathname;
    // Check exact matches first, then prefix matches (excluding dashboard base path)
    for (const menu of sidebarMenu) {
      if (path === menu.path) {
        return menu.id;
      }
    }
    // Check prefix matches for nested routes (but not for dashboard base path)
    for (const menu of sidebarMenu) {
      if (menu.id !== 'dashboard' && path.startsWith(menu.path + '/')) {
        return menu.id;
      }
    }
    return 'dashboard';
  };

  // Get page title based on current route
  const getPageTitle = () => {
    const path = location.pathname;
    for (const menu of sidebarMenu) {
      if (path === menu.path) return menu.label;
      if (path.startsWith(menu.path + '/')) {
        const subPath = path.replace(menu.path + '/', '');
        const tabs = sectionTabs[menu.id];
        if (tabs) {
          const tab = tabs.find(t => t.path === subPath);
          if (tab) return tab.label;
        }
        return menu.label;
      }
    }
    return 'Dashboard';
  };

  if (adminAuth.loading) {
    return (
      <div className="admin-theme-root" data-theme={adminTheme}>
        <div className="admin-loading">
          <div className="loading-spinner">Loading...</div>
        </div>
      </div>
    );
  }

  if (!adminAuth.isAuthenticated) {
    return (
      <div className="admin-theme-root" data-theme={adminTheme}>
        <AdminLogin
          onLogin={handleAdminLogin}
          adminTheme={adminTheme}
          onToggleTheme={toggleAdminTheme}
        />
      </div>
    );
  }

  const activeMenu = getActiveMenu();

  return (
    <div className="admin-theme-root" data-theme={adminTheme}>
    <div className="admin-container">
      {/* Mobile drawer backdrop — tap to close */}
      <div
        className={`sidebar-overlay ${mobileMenuOpen ? 'visible' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          {sidebarCollapsed ? (
            <img src={adminTheme === 'light' ? logoForLightMode : logoForDarkMode} alt="DhanFunded" className="sidebar-logo-img" style={{ height: '32px', width: '32px', objectFit: 'contain' }} />
          ) : (
            <img src={adminTheme === 'light' ? logoForLightMode : logoForDarkMode} alt="DhanFunded" className="sidebar-logo-img" style={{ height: '40px', width: 'auto', maxWidth: '180px', objectFit: 'contain' }} />
          )}
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? <LuChevronRight size={16} /> : <LuChevronLeft size={16} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {sidebarMenu.map(menu => {
            const hasSubItems = sectionTabs[menu.id];
            const isExpanded = expandedMenus.includes(menu.id);
            const isActive = activeMenu === menu.id;
            
            return (
              <div key={menu.id} className="sidebar-menu-item">
                <button
                  className={`sidebar-menu-btn ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    if (hasSubItems) {
                      toggleMenu(menu.id);
                      if (!isExpanded) {
                        navigate(menu.path);
                      }
                    } else {
                      navigate(menu.path);
                    }
                  }}
                >
                  <span className="menu-icon">{ADMIN_ICON_MAP[menu.icon] ? (() => { const Icon = ADMIN_ICON_MAP[menu.icon]; return <Icon size={18} />; })() : menu.icon}</span>
                  {!sidebarCollapsed && (
                    <>
                      <span className="menu-label">{menu.label}</span>
                      {hasSubItems && <span className="menu-arrow">{isExpanded ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}</span>}
                    </>
                  )}
                </button>
                
                {/* Submenu items */}
                {hasSubItems && isExpanded && !sidebarCollapsed && (
                  <div className="sidebar-submenu">
                    {sectionTabs[menu.id].map(subItem => {
                      const subPath = subItem.path ? `${menu.path}/${subItem.path}` : menu.path;
                      const isSubActive = location.pathname === subPath;
                      return (
                        <button
                          key={subItem.id}
                          className={`sidebar-submenu-btn ${isSubActive ? 'active' : ''}`}
                          onClick={() => navigate(subPath)}
                        >
                          {subItem.label}
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
          <button className="back-to-app-btn" onClick={() => navigate('/app')}>
            {sidebarCollapsed ? <LuArrowLeft size={16} /> : <><LuArrowLeft size={14} /> Back to App</>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        <header className="admin-header">
          <button
            className="admin-mobile-hamburger"
            aria-label="Open menu"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span /><span /><span />
          </button>
          <h1 className="admin-page-title">{getPageTitle()}</h1>
          <div className="admin-header-actions">
            <span className="admin-user">{adminAuth.user?.name || 'Admin'} ({adminAuth.user?.email})</span>
            <button className="admin-logout-btn" onClick={handleAdminLogout}>Logout</button>
          </div>
        </header>

        <div className="admin-content">
          <Outlet context={{ adminAuth, API_URL, adminCurrency, usdInrRate: totalRate, formatAdminCurrency, formatAdminCurrencyCompact }} />
        </div>

        {/* Mobile bottom navigation — quick access to the main sections */}
        <nav className="admin-bottom-nav">
          {BOTTOM_NAV.map(({ menuId, label, path, Icon }) => (
            <button
              key={menuId}
              className={`admin-bottom-nav-btn ${activeMenu === menuId ? 'active' : ''}`}
              onClick={() => navigate(path)}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </main>
    </div>
    </div>
  );
}

export default AdminLayout;
