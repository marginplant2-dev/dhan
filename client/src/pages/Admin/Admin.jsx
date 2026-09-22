import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLogin from './AdminLogin';
import ReorderSettings from './pages/ReorderSettings';
import RiskManagement from './pages/RiskManagement';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
import './Admin.css';

// Sidebar menu structure - Main sections only (no dropdowns, each is a page with internal tabs)
const sidebarMenu = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'user-management', label: 'User Management', icon: '👥' },
  { id: 'trade-management', label: 'Position Management', icon: '📈' },
  { id: 'bank-fund-management', label: 'Bank & Fund Management', icon: '🏦' },
  { id: 'charge-management', label: 'Charge Management', icon: '💰' },
  { id: 'admin-management', label: 'Admin Management', icon: '🔐' },
  { id: 'trade-mode-settings', label: 'Order Mode Settings', icon: '⚙️' },
  { id: 'risk-management', label: 'Risk Management', icon: '🛡️' },
  { id: 'reboorder-settings', label: 'Reboorder Settings', icon: '⏱️' },
  { id: 'symbol-management', label: 'Symbol Management', icon: '💹' },
  { id: 'reports', label: 'Reports & Analytics', icon: '📑' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'settings', label: 'Settings', icon: '⚙️' }
];

// Sub-tabs for each main section
const sectionTabs = {
  'user-management': [
    { id: 'all-users', label: 'All Users' },
    { id: 'active-users', label: 'Active Users' },
    { id: 'blocked-users', label: 'Blocked Users' },
    { id: 'kyc-management', label: 'KYC Verification' },
    { id: 'user-logs', label: 'Activity Logs' }
  ],
  'trade-management': [
    { id: 'all-trades', label: 'All Positions' },
    { id: 'open-positions', label: 'Open Positions' },
    { id: 'closed-positions', label: 'Closed Positions' },
    { id: 'pending-orders', label: 'Pending Orders' },
    { id: 'trade-history', label: 'Activity History' }
  ],
  'bank-fund-management': [
    { id: 'deposit-requests', label: 'Deposits' },
    { id: 'withdrawal-requests', label: 'Withdrawals' },
    { id: 'bank-accounts', label: 'Bank Accounts' },
    { id: 'upi-management', label: 'UPI' },
    { id: 'transaction-history', label: 'History' }
  ],
  'charge-management': [
    { id: 'spread-settings', label: 'Spread' },
    { id: 'commission-settings', label: 'Commission' },
    { id: 'swap-settings', label: 'Swap' },
    { id: 'margin-settings', label: 'Margin' },
    { id: 'leverage-settings', label: 'Leverage' }
  ],
  'admin-management': [
    { id: 'sub-admins', label: 'Sub-Admins' },
    { id: 'brokers', label: 'Brokers' },
    { id: 'hierarchy', label: 'Hierarchy View' },
    { id: 'fund-requests', label: 'Fund Requests' },
    { id: 'subadmin-logs', label: 'Sub-Admin Activity' },
    { id: 'broker-logs', label: 'Broker Activity' }
  ],
  'trade-mode-settings': [
    { id: 'hedging-settings', label: 'Hedging Mode' },
    { id: 'netting-settings', label: 'Netting Mode' },
    { id: 'binary-settings', label: 'Binary Mode' }
  ],
  'symbol-management': [
    { id: 'all-symbols', label: 'All Symbols' },
    { id: 'forex-symbols', label: 'Forex' },
    { id: 'crypto-symbols', label: 'Crypto' },
    { id: 'stocks-symbols', label: 'Stocks' },
    { id: 'commodities-symbols', label: 'Commodities' }
  ],
  'reports': [
    { id: 'financial-reports', label: 'Financial Reports' },
    { id: 'user-reports', label: 'User Reports' },
    { id: 'trade-reports', label: 'Position Reports' },
    { id: 'commission-reports', label: 'Commission Reports' }
  ],
  'notifications': [
    { id: 'push-notifications', label: 'Push Notifications' },
    { id: 'email-templates', label: 'Email Templates' }
  ],
  'settings': [
    { id: 'general-settings', label: 'General' },
    { id: 'security-settings', label: 'Security' },
    { id: 'api-settings', label: 'API Keys' },
    { id: 'backup-settings', label: 'Backup' }
  ]
};

function Admin() {
  const navigate = useNavigate();
  const [adminAuth, setAdminAuth] = useState({ isAuthenticated: false, user: null, loading: true });
  const [activePage, setActivePage] = useState('dashboard');
  const [activeSubTab, setActiveSubTab] = useState(''); // Active sub-tab within a section
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Dashboard stats state
  const [dashboardStats, setDashboardStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    blockedUsers: 0,
    demoUsers: 0,
    totalTrades: 0,
    openPositions: 0,
    closedTrades: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0
  });
  const [recentUsers, setRecentUsers] = useState([]);
  const [recentTrades, setRecentTrades] = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);

  // User management state
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPagination, setUsersPagination] = useState({ total: 0, page: 1, limit: 20, pages: 0 });
  const [usersFilter, setUsersFilter] = useState({ status: '', search: '' });
  const [selectedUser, setSelectedUser] = useState(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [walletAdjustModal, setWalletAdjustModal] = useState({ open: false, user: null });
  const [walletAdjustForm, setWalletAdjustForm] = useState({ type: 'add', amount: '', reason: '' });
  const [userDetailPanel, setUserDetailPanel] = useState({ open: false, user: null, view: 'info', positions: [], positionsLoading: false, wallet: null });

  // KYC Management state
  const [kycList, setKycList] = useState([]);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycPagination, setKycPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [kycFilter, setKycFilter] = useState({ status: '', search: '' });
  const [kycDetailModal, setKycDetailModal] = useState({ open: false, kyc: null });
  const [pendingKycCount, setPendingKycCount] = useState(0);

  // User Activity Logs state
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);
  const [activityLogsPagination, setActivityLogsPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [activityLogsFilter, setActivityLogsFilter] = useState({ activityType: '', search: '' });

  // Banner management state
  const [banners, setBanners] = useState([]);
  const [bannersLoading, setBannersLoading] = useState(false);
  const [bannerForm, setBannerForm] = useState({
    title: '',
    subtitle: '',
    imageData: '',
    link: '',
    isActive: true
  });
  const [imagePreview, setImagePreview] = useState('');

  // Fund Management state
  const [paymentMethods, setPaymentMethods] = useState(() => {
    const saved = localStorage.getItem('dhanfunded-payment-methods');
    return saved ? JSON.parse(saved) : {
      bankAccounts: [],
      upiIds: [],
      cryptoWallets: []
    };
  });
  const [fundRequests, setFundRequests] = useState(() => {
    const saved = localStorage.getItem('dhanfunded-fund-requests');
    return saved ? JSON.parse(saved) : [];
  });
  const [bankForm, setBankForm] = useState({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '', isActive: true });
  const [upiForm, setUpiForm] = useState({ upiId: '', name: '', qrImage: '', isActive: true });
  const [cryptoForm, setCryptoForm] = useState({ network: '', address: '', qrImage: '', isActive: true });
  const [paymentQrPreview, setPaymentQrPreview] = useState('');

  // Currency Management state
  const [currencySettings, setCurrencySettings] = useState(() => {
    const saved = localStorage.getItem('dhanfunded-currency-settings');
    return saved ? JSON.parse(saved) : {
      usdMarkup: 0,
      lastUpdated: null
    };
  });
  const [markupInput, setMarkupInput] = useState(currencySettings.usdMarkup || 0);

  // Order Mode Settings state
  const [tradeModeSettings, setTradeModeSettings] = useState(() => {
    const saved = localStorage.getItem('dhanfunded-trade-mode-settings');
    return saved ? JSON.parse(saved) : {
      hedging: {
        enabled: true,
        minLotSize: 0.01,
        maxLotSize: 100,
        maxPositionsPerSymbol: 10,
        maxTotalPositions: 50,
        allowPartialClose: true,
        allowModifySLTP: true,
        defaultLeverage: 100
      },
      netting: {
        enabled: true,
        minQuantity: 1,
        maxQuantity: 10000,
        intradayMaxQuantity: 5000,
        carryForwardMaxQuantity: 2000,
        autoSquareOffTime: '15:30',
        allowCarryForward: true,
        intradayMarginPercent: 20,
        carryForwardMarginPercent: 100
      },
      binary: {
        enabled: true,
        minTradeAmount: 100,
        maxTradeAmount: 1000000,
        minExpiry: 60,
        maxExpiry: 3600,
        allowedExpiries: [60, 120, 300, 600, 900, 1800, 3600],
        payoutPercent: 85,
        refundOnTie: true
      }
    };
  });

  // Position Management state
  const [activeTrades, setActiveTrades] = useState([]);
  const [activeTradesSummary, setActiveTradesSummary] = useState({ total: 0, hedging: 0, netting: 0, binary: 0, totalUnrealizedPnL: 0 });
  const [activeTradesLoading, setActiveTradesLoading] = useState(false);
  const [activeTradesFilter, setActiveTradesFilter] = useState({ search: '', symbol: '', mode: 'all' });

  const [pendingOrders, setPendingOrders] = useState([]);
  const [pendingOrdersLoading, setPendingOrdersLoading] = useState(false);
  const [pendingOrdersFilter, setPendingOrdersFilter] = useState({ search: '', symbol: '' });

  const [tradeHistory, setTradeHistory] = useState([]);
  const [tradeHistoryLoading, setTradeHistoryLoading] = useState(false);
  const [tradeHistoryPagination, setTradeHistoryPagination] = useState({ total: 0, page: 1, limit: 50, pages: 0 });
  const [tradeHistoryFilter, setTradeHistoryFilter] = useState({ search: '', symbol: '', mode: 'all', dateFrom: '', dateTo: '' });
  const [tradeHistorySummary, setTradeHistorySummary] = useState({ totalTrades: 0, totalPnL: 0, winningTrades: 0, losingTrades: 0, winRate: 0, topSymbols: [] });

  // Transaction History & Reconciliation state
  const [txHistory, setTxHistory] = useState([]);
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);
  const [txHistoryPagination, setTxHistoryPagination] = useState({ total: 0, page: 1, limit: 50, pages: 0 });
  const [txHistoryFilter, setTxHistoryFilter] = useState({ search: '', type: '', status: '', paymentMethod: '', dateFrom: '', dateTo: '' });
  const [txHistorySummary, setTxHistorySummary] = useState({ total: 0, totalDeposits: 0, totalWithdrawals: 0, depositCount: 0, withdrawalCount: 0, pendingCount: 0, approvedCount: 0, rejectedCount: 0, pendingAmount: 0 });

  const [reconData, setReconData] = useState(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconFilter, setReconFilter] = useState({ dateFrom: '', dateTo: '' });

  // Charge Management state
  const [chargeData, setChargeData] = useState({ spreads: [], commissions: [], swaps: [], margins: [], leverages: [], fees: [] });
  const [chargeLoading, setChargeLoading] = useState(false);
  const [chargeModal, setChargeModal] = useState({ open: false, type: '', mode: 'add', editItem: null });
  const [chargeForm, setChargeForm] = useState({});

  const toggleMenu = (menuId) => {
    setExpandedMenus(prev =>
      prev.includes(menuId)
        ? prev.filter(id => id !== menuId)
        : [...prev, menuId]
    );
  };

  const handlePageClick = (pageId) => {
    setActivePage(pageId);
  };

  // Fetch dashboard stats
  const fetchDashboardStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/stats`);
      const data = await res.json();
      if (data.success) {
        setDashboardStats(data.stats);
        setRecentUsers(data.recentUsers || []);
        setRecentTrades(data.recentTrades || []);
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch users with filters
  const fetchUsers = async (page = 1) => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: usersPagination.limit,
        ...(usersFilter.status && { status: usersFilter.status }),
        ...(usersFilter.search && { search: usersFilter.search })
      });
      const res = await fetch(`${API_URL}/api/admin/users?${params}`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
        setUsersPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setUsersLoading(false);
    }
  };

  // Toggle user status (block/unblock) - uses isActive boolean on server
  const toggleUserStatus = async (userId, currentIsActive) => {
    try {
      // currentIsActive is boolean, convert to status string for API
      const newStatus = currentIsActive === false ? 'active' : 'blocked';
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers(usersPagination.page);
        fetchDashboardStats();
        // Update user detail panel if open
        if (userDetailPanel.open && userDetailPanel.user?._id === userId) {
          setUserDetailPanel(prev => ({
            ...prev,
            user: { ...prev.user, isActive: newStatus !== 'blocked' }
          }));
        }
        alert(data.message);
      } else {
        alert(data.error || 'Failed to update user status');
      }
    } catch (error) {
      console.error('Error toggling user status:', error);
      alert('Failed to update user status');
    }
  };

  // Delete user
  const deleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user? This will also delete all their positions and transactions.')) {
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers(usersPagination.page);
        fetchDashboardStats();
        alert(data.message);
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    }
  };

  // Adjust user wallet
  const adjustUserWallet = async () => {
    if (!walletAdjustModal.user || !walletAdjustForm.amount) {
      alert('Please enter an amount');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${walletAdjustModal.user._id}/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(walletAdjustForm)
      });
      const data = await res.json();
      if (data.success) {
        const adjustedUserId = walletAdjustModal.user._id;
        setWalletAdjustModal({ open: false, user: null });
        setWalletAdjustForm({ type: 'add', amount: '', reason: '' });
        fetchUsers(usersPagination.page);
        fetchDashboardStats();
        // Update user detail panel wallet if open
        if (userDetailPanel.open && userDetailPanel.user?._id === adjustedUserId && data.wallet) {
          setUserDetailPanel(prev => ({
            ...prev,
            wallet: data.wallet,
            user: { ...prev.user, wallet: data.wallet }
          }));
        }
        alert(data.message);
      } else {
        alert(data.error || 'Failed to adjust wallet');
      }
    } catch (error) {
      console.error('Error adjusting wallet:', error);
      alert('Failed to adjust wallet');
    }
  };

  // ===== User Detail Panel Functions =====
  const openUserDetail = async (user) => {
    setUserDetailPanel({ open: true, user, view: 'info', positions: [], positionsLoading: true, wallet: user.wallet });
    // Fetch trading positions
    try {
      const res = await fetch(`${API_URL}/api/trade/positions/${user.oderId}`);
      const data = await res.json();
      if (data.success) {
        setUserDetailPanel(prev => ({ ...prev, positions: data.positions || [], wallet: data.wallet || prev.wallet, positionsLoading: false }));
      } else {
        setUserDetailPanel(prev => ({ ...prev, positionsLoading: false }));
      }
    } catch (err) {
      console.error('Error fetching positions:', err);
      setUserDetailPanel(prev => ({ ...prev, positionsLoading: false }));
    }
  };

  const closeUserDetailPosition = async (positionId) => {
    if (!confirm('Are you sure you want to close this position?')) return;
    try {
      const res = await fetch(`${API_URL}/api/trade/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userDetailPanel.user.oderId, positionId })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Position closed. P/L: $${data.closedPosition.pnl.toFixed(2)}`);
        setUserDetailPanel(prev => ({
          ...prev,
          positions: prev.positions.filter(p => p.id !== positionId),
          wallet: data.wallet
        }));
        fetchUsers(usersPagination.page);
      } else {
        alert(data.error || 'Failed to close position');
      }
    } catch (err) {
      alert('Error closing position: ' + err.message);
    }
  };

  const changeUserPasswordFromDetail = async (newPassword) => {
    if (!newPassword || newPassword.length < 6) return alert('Password must be at least 6 characters');
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userDetailPanel.user._id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      const data = await res.json();
      if (res.ok) alert('Password changed successfully');
      else alert(data.error || 'Failed to change password');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Login as user (impersonate)
  const loginAsUser = async (user) => {
    if (!window.confirm(`Login as ${user.name}? You will be redirected to the main app.`)) return;

    try {
      // Admin token required — /api/admin/* middleware 401s without it.
      const adminToken = localStorage.getItem('dhanfunded-admin-token');
      if (!adminToken) {
        alert('Admin session expired. Please log in to the admin panel again.');
        return;
      }
      const res = await fetch(`${API_URL}/api/admin/users/${user._id}/login-as`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        }
      });
      const data = await res.json();

      if (!data.success) {
        alert(data.error || 'Failed to login as user');
        return;
      }

      setUserDetailPanel({ open: false, user: null, view: 'info', positions: [], positionsLoading: false, wallet: null });

      // Cross-origin: admin.<domain> and <domain> don't share localStorage.
      // Pass the session through the URL as a base64 blob; AppRouter on
      // the user side picks it up, writes it to its own localStorage, and
      // strips the query param.
      const payload = btoa(JSON.stringify({ token: data.token, user: data.user }));
      const mainDomain = window.location.hostname.replace(/^admin\./, '');
      const userAppUrl = `${window.location.protocol}//${mainDomain}/app?impersonate=${encodeURIComponent(payload)}`;
      window.location.href = userAppUrl;
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // ===== Position Management Functions =====

  const fetchActiveTrades = async () => {
    setActiveTradesLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTradesFilter.search) params.set('search', activeTradesFilter.search);
      if (activeTradesFilter.symbol) params.set('symbol', activeTradesFilter.symbol);
      if (activeTradesFilter.mode && activeTradesFilter.mode !== 'all') params.set('mode', activeTradesFilter.mode);
      const res = await fetch(`${API_URL}/api/admin/trades/active?${params}`);
      const data = await res.json();
      if (data.success) {
        setActiveTrades(data.positions || []);
        setActiveTradesSummary(data.summary || { total: 0, hedging: 0, netting: 0, binary: 0, totalUnrealizedPnL: 0 });
      }
    } catch (error) {
      console.error('Error fetching active positions:', error);
    } finally {
      setActiveTradesLoading(false);
    }
  };

  const fetchPendingOrders = async () => {
    setPendingOrdersLoading(true);
    try {
      const params = new URLSearchParams();
      if (pendingOrdersFilter.search) params.set('search', pendingOrdersFilter.search);
      if (pendingOrdersFilter.symbol) params.set('symbol', pendingOrdersFilter.symbol);
      const res = await fetch(`${API_URL}/api/admin/trades/pending?${params}`);
      const data = await res.json();
      if (data.success) {
        setPendingOrders(data.orders || []);
      }
    } catch (error) {
      console.error('Error fetching pending orders:', error);
    } finally {
      setPendingOrdersLoading(false);
    }
  };

  const fetchTradeHistory = async (page = 1) => {
    setTradeHistoryLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 50 });
      if (tradeHistoryFilter.search) params.set('search', tradeHistoryFilter.search);
      if (tradeHistoryFilter.symbol) params.set('symbol', tradeHistoryFilter.symbol);
      if (tradeHistoryFilter.mode && tradeHistoryFilter.mode !== 'all') params.set('mode', tradeHistoryFilter.mode);
      if (tradeHistoryFilter.dateFrom) params.set('dateFrom', tradeHistoryFilter.dateFrom);
      if (tradeHistoryFilter.dateTo) params.set('dateTo', tradeHistoryFilter.dateTo);
      const res = await fetch(`${API_URL}/api/admin/trades/history?${params}`);
      const data = await res.json();
      if (data.success) {
        setTradeHistory(data.trades || []);
        setTradeHistoryPagination(data.pagination || { total: 0, page: 1, limit: 50, pages: 0 });
        setTradeHistorySummary(data.summary || { totalTrades: 0, totalPnL: 0, winningTrades: 0, losingTrades: 0, winRate: 0, topSymbols: [] });
      }
    } catch (error) {
      console.error('Error fetching activity history:', error);
    } finally {
      setTradeHistoryLoading(false);
    }
  };

  const forceClosePosition = async (positionId, positionType) => {
    if (!confirm('Are you sure you want to force close this position?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/trades/${positionId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionType })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Position closed. P/L: $${data.profit?.toFixed(2) || '0.00'}`);
        fetchActiveTrades();
        fetchDashboardStats();
      } else {
        alert(data.error || 'Failed to close position');
      }
    } catch (error) {
      console.error('Error force closing position:', error);
      alert('Failed to close position');
    }
  };

  const cancelPendingOrder = async (orderId) => {
    if (!confirm('Are you sure you want to cancel this pending order?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/trades/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        alert('Order cancelled successfully');
        fetchPendingOrders();
      } else {
        alert(data.error || 'Failed to cancel order');
      }
    } catch (error) {
      console.error('Error cancelling order:', error);
      alert('Failed to cancel order');
    }
  };

  // ===== Transaction History & Reconciliation Functions =====

  const fetchTxHistory = async (page = 1) => {
    setTxHistoryLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 50 });
      if (txHistoryFilter.search) params.set('search', txHistoryFilter.search);
      if (txHistoryFilter.type) params.set('type', txHistoryFilter.type);
      if (txHistoryFilter.status) params.set('status', txHistoryFilter.status);
      if (txHistoryFilter.paymentMethod) params.set('paymentMethod', txHistoryFilter.paymentMethod);
      if (txHistoryFilter.dateFrom) params.set('dateFrom', txHistoryFilter.dateFrom);
      if (txHistoryFilter.dateTo) params.set('dateTo', txHistoryFilter.dateTo);
      const res = await fetch(`${API_URL}/api/admin/transactions?${params}`);
      const data = await res.json();
      if (data.success) {
        setTxHistory(data.transactions || []);
        setTxHistoryPagination(data.pagination || { total: 0, page: 1, limit: 50, pages: 0 });
        setTxHistorySummary(data.summary || {});
      }
    } catch (error) {
      console.error('Error fetching transaction history:', error);
    } finally {
      setTxHistoryLoading(false);
    }
  };

  const fetchReconciliation = async () => {
    setReconLoading(true);
    try {
      const params = new URLSearchParams();
      if (reconFilter.dateFrom) params.set('dateFrom', reconFilter.dateFrom);
      if (reconFilter.dateTo) params.set('dateTo', reconFilter.dateTo);
      const res = await fetch(`${API_URL}/api/admin/transactions/reconciliation?${params}`);
      const data = await res.json();
      if (data.success) {
        setReconData(data);
      }
    } catch (error) {
      console.error('Error fetching reconciliation:', error);
    } finally {
      setReconLoading(false);
    }
  };

  const processTransaction = async (txId, status, note = '') => {
    const action = status === 'approved' ? 'approve' : 'reject';
    if (!confirm(`Are you sure you want to ${action} this transaction?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/transactions/${txId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNote: note, processedBy: adminAuth.user?.email || 'admin' })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Transaction ${action}d successfully`);
        fetchTxHistory(txHistoryPagination.page);
      } else {
        alert(data.error || `Failed to ${action} transaction`);
      }
    } catch (error) {
      console.error(`Error processing transaction:`, error);
      alert(`Failed to ${action} transaction`);
    }
  };

  // ===== Charge Management CRUD Functions =====

  const chargeTypeMap = {
    'spread-settings': 'spreads',
    'commission-settings': 'commissions',
    'swap-settings': 'swaps',
    'margin-settings': 'margins',
    'leverage-settings': 'leverages',
    'fee-structure': 'fees'
  };

  const fetchChargeData = async (chargeType) => {
    setChargeLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/charges/${chargeType}`);
      const data = await res.json();
      if (data.success) {
        setChargeData(prev => ({ ...prev, [chargeType]: data.items || [] }));
      }
    } catch (error) {
      console.error(`Error fetching ${chargeType}:`, error);
    } finally {
      setChargeLoading(false);
    }
  };

  const saveChargeSetting = async (chargeType) => {
    try {
      const url = chargeModal.mode === 'edit'
        ? `${API_URL}/api/admin/charges/${chargeType}/${chargeModal.editItem._id}`
        : `${API_URL}/api/admin/charges/${chargeType}`;
      const res = await fetch(url, {
        method: chargeModal.mode === 'edit' ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chargeForm)
      });
      const data = await res.json();
      if (data.success) {
        alert(`Setting ${chargeModal.mode === 'edit' ? 'updated' : 'created'} successfully`);
        setChargeModal({ open: false, type: '', mode: 'add', editItem: null });
        setChargeForm({});
        fetchChargeData(chargeType);
      } else {
        alert(data.error || 'Failed to save setting');
      }
    } catch (error) {
      console.error('Error saving charge setting:', error);
      alert('Failed to save setting');
    }
  };

  const deleteChargeSetting = async (chargeType, id) => {
    if (!confirm('Are you sure you want to delete this setting?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/charges/${chargeType}/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert('Deleted successfully');
        fetchChargeData(chargeType);
      } else {
        alert(data.error || 'Failed to delete');
      }
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  const openChargeModal = (type, mode = 'add', item = null) => {
    setChargeModal({ open: true, type, mode, editItem: item });
    setChargeForm(item ? { ...item } : {});
  };

  // Fetch banners from API
  const fetchBanners = async () => {
    setBannersLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/banners`);
      const data = await res.json();
      setBanners(data.banners || []);
    } catch (error) {
      console.error('Error fetching banners:', error);
    } finally {
      setBannersLoading(false);
    }
  };

  // ===== KYC Management Functions =====
  const fetchKycList = async (page = 1) => {
    setKycLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('limit', 20);
      if (kycFilter.status) params.set('status', kycFilter.status);
      if (kycFilter.search) params.set('search', kycFilter.search);
      
      const res = await fetch(`${API_URL}/api/admin/kyc?${params}`);
      const data = await res.json();
      
      if (data.success) {
        setKycList(data.kycs || []);
        setKycPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching KYC list:', error);
    } finally {
      setKycLoading(false);
    }
  };

  const fetchPendingKycCount = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/kyc/pending-count`);
      const data = await res.json();
      if (data.success) {
        setPendingKycCount(data.count);
      }
    } catch (error) {
      console.error('Error fetching pending KYC count:', error);
    }
  };

  const approveKyc = async (kycId) => {
    if (!window.confirm('Approve this KYC verification?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/kyc/${kycId}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewedBy: 'Admin' })
      });
      const data = await res.json();
      if (data.success) {
        alert('KYC approved successfully');
        fetchKycList(kycPagination.page);
        fetchPendingKycCount();
        setKycDetailModal({ open: false, kyc: null });
      } else {
        alert(data.error || 'Failed to approve KYC');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const rejectKyc = async (kycId) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/kyc/${kycId}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: reason, reviewedBy: 'Admin' })
      });
      const data = await res.json();
      if (data.success) {
        alert('KYC rejected');
        fetchKycList(kycPagination.page);
        fetchPendingKycCount();
        setKycDetailModal({ open: false, kyc: null });
      } else {
        alert(data.error || 'Failed to reject KYC');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const requestKycResubmit = async (kycId) => {
    const reason = prompt('Enter reason for resubmission request:');
    if (!reason) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/kyc/${kycId}/resubmit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: reason, reviewedBy: 'Admin' })
      });
      const data = await res.json();
      if (data.success) {
        alert('Resubmission requested');
        fetchKycList(kycPagination.page);
        setKycDetailModal({ open: false, kyc: null });
      } else {
        alert(data.error || 'Failed to request resubmission');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  // ===== User Activity Logs Functions =====
  const fetchActivityLogs = async (page = 1) => {
    setActivityLogsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('limit', 20);
      if (activityLogsFilter.activityType) params.set('activityType', activityLogsFilter.activityType);
      if (activityLogsFilter.search) params.set('search', activityLogsFilter.search);
      
      const res = await fetch(`${API_URL}/api/admin/activity-logs?${params}`);
      const data = await res.json();
      
      if (data.success) {
        setActivityLogs(data.logs || []);
        setActivityLogsPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching activity logs:', error);
    } finally {
      setActivityLogsLoading(false);
    }
  };

  // Load data on mount and page change
  useEffect(() => {
    if (adminAuth.isAuthenticated) {
      fetchDashboardStats();
      fetchBanners();
    }
  }, [adminAuth.isAuthenticated]);

  // Fetch users when filter changes or page changes
  useEffect(() => {
    if (adminAuth.isAuthenticated && (activePage === 'all-users' || activePage === 'active-users' || activePage === 'blocked-users')) {
      // Auto-set filter based on active page
      if (activePage === 'blocked-users') {
        setUsersFilter(prev => ({ ...prev, status: 'blocked' }));
      } else if (activePage === 'active-users') {
        setUsersFilter(prev => ({ ...prev, status: 'active' }));
      } else if (activePage === 'all-users') {
        setUsersFilter(prev => ({ ...prev, status: '' }));
      }
      fetchUsers(1);
    }
  }, [adminAuth.isAuthenticated, activePage]);

  // Fetch KYC data when KYC pages are active
  useEffect(() => {
    if (adminAuth.isAuthenticated && (activePage === 'kyc-management' || activePage === 'pending-users' || activePage === 'user-documents')) {
      if (activePage === 'pending-users') {
        setKycFilter(prev => ({ ...prev, status: 'pending' }));
      } else {
        setKycFilter(prev => ({ ...prev, status: '' }));
      }
      fetchKycList(1);
      fetchPendingKycCount();
    }
  }, [adminAuth.isAuthenticated, activePage]);

  useEffect(() => {
    if (adminAuth.isAuthenticated && (activePage === 'kyc-management' || activePage === 'pending-users' || activePage === 'user-documents')) {
      fetchKycList(1);
    }
  }, [kycFilter]);

  // Fetch activity logs when user-logs page is active
  useEffect(() => {
    if (adminAuth.isAuthenticated && activePage === 'user-logs') {
      fetchActivityLogs(1);
    }
  }, [adminAuth.isAuthenticated, activePage]);

  useEffect(() => {
    if (adminAuth.isAuthenticated && activePage === 'user-logs') {
      fetchActivityLogs(1);
    }
  }, [activityLogsFilter]);

  // Fetch position management data when pages are active
  useEffect(() => {
    if (!adminAuth.isAuthenticated) return;
    if (activePage === 'open-positions' || activePage === 'all-trades') fetchActiveTrades();
    if (activePage === 'pending-orders') fetchPendingOrders();
    if (activePage === 'trade-history' || activePage === 'trade-reports' || activePage === 'closed-positions') fetchTradeHistory(1);
    if (activePage === 'risk-management') fetchActiveTrades();
  }, [adminAuth.isAuthenticated, activePage]);

  useEffect(() => {
    if (adminAuth.isAuthenticated && (activePage === 'open-positions' || activePage === 'all-trades')) fetchActiveTrades();
  }, [activeTradesFilter]);

  useEffect(() => {
    if (adminAuth.isAuthenticated && activePage === 'pending-orders') fetchPendingOrders();
  }, [pendingOrdersFilter]);

  useEffect(() => {
    if (adminAuth.isAuthenticated && (activePage === 'trade-history' || activePage === 'trade-reports' || activePage === 'closed-positions')) fetchTradeHistory(1);
  }, [tradeHistoryFilter]);

  // Fetch transaction history / reconciliation when pages are active
  useEffect(() => {
    if (!adminAuth.isAuthenticated) return;
    if (activePage === 'transaction-history' || activePage === 'fund-transfers') fetchTxHistory(1);
    if (activePage === 'reconciliation') fetchReconciliation();
  }, [adminAuth.isAuthenticated, activePage]);

  useEffect(() => {
    if (adminAuth.isAuthenticated && (activePage === 'transaction-history' || activePage === 'fund-transfers')) fetchTxHistory(1);
  }, [txHistoryFilter]);

  useEffect(() => {
    if (adminAuth.isAuthenticated && activePage === 'reconciliation') fetchReconciliation();
  }, [reconFilter]);

  // Fetch charge data when charge management pages are active
  useEffect(() => {
    if (!adminAuth.isAuthenticated) return;
    const ct = chargeTypeMap[activePage];
    if (ct) fetchChargeData(ct);
  }, [adminAuth.isAuthenticated, activePage]);

  // Verify admin token on mount
  useEffect(() => {
    const verifyAdmin = async () => {
      const token = localStorage.getItem('dhanfunded-admin-token');
      const savedUser = localStorage.getItem('dhanfunded-admin-user');
      if (!token || !savedUser) {
        setAdminAuth({ isAuthenticated: false, user: null, loading: false });
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/auth/admin/verify`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          setAdminAuth({ isAuthenticated: true, user: data.user, loading: false });
        } else {
          localStorage.removeItem('dhanfunded-admin-token');
          localStorage.removeItem('dhanfunded-admin-user');
          setAdminAuth({ isAuthenticated: false, user: null, loading: false });
        }
      } catch {
        setAdminAuth({ isAuthenticated: false, user: null, loading: false });
      }
    };
    verifyAdmin();
  }, []);

  const handleAdminLogin = (authData) => {
    setAdminAuth({ isAuthenticated: true, user: authData.user, loading: false });
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('dhanfunded-admin-token');
    localStorage.removeItem('dhanfunded-admin-user');
    setAdminAuth({ isAuthenticated: false, user: null, loading: false });
  };

  // Show loading while verifying
  if (adminAuth.loading) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center', padding: '60px 40px' }}>
          <h1 className="auth-logo">DhanFunded</h1>
          <p className="auth-subtitle">Verifying admin session...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!adminAuth.isAuthenticated) {
    return <AdminLogin onAdminLogin={handleAdminLogin} />;
  }

  // Banner management functions
  const handleBannerFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setBannerForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Image size should be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        setBannerForm(prev => ({ ...prev, imageData: base64 }));
        setImagePreview(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const addBanner = async () => {
    if (!bannerForm.title || !bannerForm.imageData) {
      alert('Please fill in title and upload an image');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/banners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bannerForm)
      });
      const data = await res.json();
      if (data.success) {
        setBanners(prev => [data.banner, ...prev]);
        setBannerForm({ title: '', subtitle: '', imageData: '', link: '', isActive: true });
        setImagePreview('');
      }
    } catch (error) {
      console.error('Error adding banner:', error);
      alert('Failed to add banner');
    }
  };

  const deleteBanner = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/banners/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setBanners(prev => prev.filter(b => b._id !== id));
      }
    } catch (error) {
      console.error('Error deleting banner:', error);
      alert('Failed to delete banner');
    }
  };

  const toggleBannerStatus = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/banners/${id}/toggle`, { method: 'PATCH' });
      const data = await res.json();
      if (data.success) {
        setBanners(prev => prev.map(b => b._id === id ? data.banner : b));
      }
    } catch (error) {
      console.error('Error toggling banner:', error);
      alert('Failed to update banner status');
    }
  };

  // Fund Management functions
  const handleQrUpload = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Image size should be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        setPaymentQrPreview(base64);
        if (type === 'upi') {
          setUpiForm(prev => ({ ...prev, qrImage: base64 }));
        } else if (type === 'crypto') {
          setCryptoForm(prev => ({ ...prev, qrImage: base64 }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const addBankAccount = () => {
    if (!bankForm.bankName || !bankForm.accountNumber || !bankForm.ifsc || !bankForm.accountHolder) {
      alert('Please fill all bank details');
      return;
    }
    const newBank = { id: Date.now().toString(), ...bankForm };
    const updated = { ...paymentMethods, bankAccounts: [...paymentMethods.bankAccounts, newBank] };
    setPaymentMethods(updated);
    localStorage.setItem('dhanfunded-payment-methods', JSON.stringify(updated));
    setBankForm({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '', isActive: true });
  };

  const addUpiId = () => {
    if (!upiForm.upiId || !upiForm.name) {
      alert('Please fill UPI details');
      return;
    }
    const newUpi = { id: Date.now().toString(), ...upiForm };
    const updated = { ...paymentMethods, upiIds: [...paymentMethods.upiIds, newUpi] };
    setPaymentMethods(updated);
    localStorage.setItem('dhanfunded-payment-methods', JSON.stringify(updated));
    setUpiForm({ upiId: '', name: '', qrImage: '', isActive: true });
    setPaymentQrPreview('');
  };

  const addCryptoWallet = () => {
    if (!cryptoForm.network || !cryptoForm.address) {
      alert('Please fill crypto details');
      return;
    }
    const newCrypto = { id: Date.now().toString(), ...cryptoForm };
    const updated = { ...paymentMethods, cryptoWallets: [...paymentMethods.cryptoWallets, newCrypto] };
    setPaymentMethods(updated);
    localStorage.setItem('dhanfunded-payment-methods', JSON.stringify(updated));
    setCryptoForm({ network: '', address: '', qrImage: '', isActive: true });
    setPaymentQrPreview('');
  };

  const deletePaymentMethod = (type, id) => {
    let updated;
    if (type === 'bank') {
      updated = { ...paymentMethods, bankAccounts: paymentMethods.bankAccounts.filter(b => b.id !== id) };
    } else if (type === 'upi') {
      updated = { ...paymentMethods, upiIds: paymentMethods.upiIds.filter(u => u.id !== id) };
    } else {
      updated = { ...paymentMethods, cryptoWallets: paymentMethods.cryptoWallets.filter(c => c.id !== id) };
    }
    setPaymentMethods(updated);
    localStorage.setItem('dhanfunded-payment-methods', JSON.stringify(updated));
  };

  const handleFundRequest = (requestId, action) => {
    const updatedRequests = fundRequests.map(req => {
      if (req.id === requestId) {
        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        // Update user wallet if approved
        if (action === 'approve') {
          // Update dhanfunded-users
          const users = JSON.parse(localStorage.getItem('dhanfunded-users') || '[]');
          let userIndex = users.findIndex(u => u.id === req.userId);

          // If user doesn't exist in dhanfunded-users, create entry
          if (userIndex === -1) {
            users.push({ id: req.userId, name: req.userName, wallet: 0, credit: 0 });
            userIndex = users.length - 1;
          }

          if (req.type === 'deposit') {
            users[userIndex].wallet = (users[userIndex].wallet || 0) + req.amount;
          } else if (req.type === 'withdrawal') {
            users[userIndex].wallet = (users[userIndex].wallet || 0) - req.amount;
          }
          localStorage.setItem('dhanfunded-users', JSON.stringify(users));

          // Also update dhanfunded-auth if this is the currently logged in user
          const authData = JSON.parse(localStorage.getItem('dhanfunded-auth') || '{}');
          if (authData.user && authData.user.id === req.userId) {
            authData.user.wallet = users[userIndex].wallet;
            authData.user.credit = users[userIndex].credit || 0;
            localStorage.setItem('dhanfunded-auth', JSON.stringify(authData));
          }
        }
        return { ...req, status: newStatus, processedAt: new Date().toISOString() };
      }
      return req;
    });
    setFundRequests(updatedRequests);
    localStorage.setItem('dhanfunded-fund-requests', JSON.stringify(updatedRequests));
  };

  // Currency Management functions — persists markup to server so mobile app
  // and other browsers stay in sync (was localStorage-only before, which made
  // the APK and web show different INR amounts).
  const saveCurrencySettings = async () => {
    const markup = parseFloat(markupInput) || 0;
    const settings = { usdMarkup: markup, lastUpdated: new Date().toISOString() };
    setCurrencySettings(settings);
    localStorage.setItem('dhanfunded-currency-settings', JSON.stringify(settings));
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      await fetch(`${API_URL}/api/admin/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usdMarkup: markup })
      });
      alert('Currency markup settings saved successfully!');
    } catch (err) {
      alert('Saved locally, but server sync failed: ' + err.message);
    }
  };

  // Order Mode Settings functions
  const updateTradeModeSettings = (mode, field, value) => {
    setTradeModeSettings(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        [field]: value
      }
    }));
  };

  const saveTradeModeSettings = (mode) => {
    localStorage.setItem('dhanfunded-trade-mode-settings', JSON.stringify(tradeModeSettings));
    alert(`${mode.charAt(0).toUpperCase() + mode.slice(1)} mode settings saved successfully!`);
  };

  const getPageTitle = () => {
    // Check main sidebar menu
    for (const menu of sidebarMenu) {
      if (menu.id === activePage) return menu.label;
    }
    // Check section tabs
    for (const section in sectionTabs) {
      for (const tab of sectionTabs[section]) {
        if (tab.id === activePage) return tab.label;
      }
    }
    return 'Dashboard';
  };

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
          <span className="sidebar-logo">{sidebarCollapsed ? 'SP' : 'DhanFunded Admin'}</span>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>

        <nav className="sidebar-nav">
          {sidebarMenu.map(menu => {
            const hasSubItems = sectionTabs[menu.id];
            const isExpanded = expandedMenus.includes(menu.id);
            const isActiveParent = hasSubItems && sectionTabs[menu.id].some(item => item.id === activePage);
            
            return (
              <div key={menu.id} className="sidebar-menu-item">
                <button
                  className={`sidebar-menu-btn ${activePage === menu.id || isActiveParent ? 'active' : ''}`}
                  onClick={() => {
                    if (hasSubItems) {
                      toggleMenu(menu.id);
                      if (!isExpanded) {
                        setActivePage(sectionTabs[menu.id][0].id);
                      }
                    } else {
                      setActivePage(menu.id);
                      setActiveSubTab('');
                      setMobileMenuOpen(false);
                    }
                  }}
                >
                  <span className="menu-icon">{menu.icon}</span>
                  {!sidebarCollapsed && (
                    <>
                      <span className="menu-label">{menu.label}</span>
                      {hasSubItems && <span className="menu-arrow">{isExpanded ? '▼' : '▶'}</span>}
                    </>
                  )}
                </button>
                
                {/* Submenu items */}
                {hasSubItems && isExpanded && !sidebarCollapsed && (
                  <div className="sidebar-submenu">
                    {sectionTabs[menu.id].map(subItem => (
                      <button
                        key={subItem.id}
                        className={`sidebar-submenu-btn ${activePage === subItem.id ? 'active' : ''}`}
                        onClick={() => { setActivePage(subItem.id); setMobileMenuOpen(false); }}
                      >
                        {subItem.label}
                      </button>
                    ))}
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
        <header className="admin-header">
          <h1 className="admin-page-title">{getPageTitle()}</h1>
          <div className="admin-header-actions">
            <span className="admin-user">{adminAuth.user?.name || 'Admin'} ({adminAuth.user?.email})</span>
            <button className="admin-logout-btn" onClick={handleAdminLogout}>Logout</button>
          </div>
        </header>

        <div className="admin-content">
          {/* Dashboard */}
          {activePage === 'dashboard' && (
            <div className="admin-dashboard">
              {statsLoading ? (
                <div className="loading-spinner">Loading dashboard...</div>
              ) : (
                <>
                  <div className="dashboard-stats">
                    <div className="stat-card">
                      <div className="stat-icon">👥</div>
                      <div className="stat-info">
                        <span className="stat-value">{dashboardStats.totalUsers.toLocaleString()}</span>
                        <span className="stat-label">Total Users</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">📈</div>
                      <div className="stat-info">
                        <span className="stat-value">{dashboardStats.totalTrades.toLocaleString()}</span>
                        <span className="stat-label">Total Positions</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">💰</div>
                      <div className="stat-info">
                        <span className="stat-value">₹{dashboardStats.totalDeposits.toLocaleString()}</span>
                        <span className="stat-label">Total Deposits</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">📊</div>
                      <div className="stat-info">
                        <span className="stat-value">{dashboardStats.openPositions}</span>
                        <span className="stat-label">Open Positions</span>
                      </div>
                    </div>
                  </div>

                  <div className="dashboard-stats" style={{ marginTop: '20px' }}>
                    <div className="stat-card" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                      <div className="stat-icon">✅</div>
                      <div className="stat-info">
                        <span className="stat-value">{dashboardStats.activeUsers}</span>
                        <span className="stat-label">Active Users</span>
                      </div>
                    </div>
                    <div className="stat-card" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
                      <div className="stat-icon">🚫</div>
                      <div className="stat-info">
                        <span className="stat-value">{dashboardStats.blockedUsers}</span>
                        <span className="stat-label">Blocked Users</span>
                      </div>
                    </div>
                    <div className="stat-card" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
                      <div className="stat-icon">⏳</div>
                      <div className="stat-info">
                        <span className="stat-value">{dashboardStats.pendingDeposits}</span>
                        <span className="stat-label">Pending Deposits</span>
                      </div>
                    </div>
                    <div className="stat-card" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' }}>
                      <div className="stat-icon">🎮</div>
                      <div className="stat-info">
                        <span className="stat-value">{dashboardStats.demoUsers}</span>
                        <span className="stat-label">Demo Users</span>
                      </div>
                    </div>
                  </div>

                  <div className="dashboard-charts">
                    <div className="chart-card">
                      <h3>Quick Stats</h3>
                      <div style={{ padding: '20px' }}>
                        <p><strong>Closed Positions:</strong> {dashboardStats.closedTrades}</p>
                        <p><strong>Total Withdrawals:</strong> ₹{dashboardStats.totalWithdrawals.toLocaleString()}</p>
                        <p><strong>Pending Withdrawals:</strong> {dashboardStats.pendingWithdrawals}</p>
                      </div>
                    </div>
                    <div className="chart-card">
                      <h3>Recent Positions</h3>
                      {recentTrades.length === 0 ? (
                        <p style={{ padding: '20px', color: '#888' }}>No positions yet</p>
                      ) : (
                        <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                          <table className="admin-table" style={{ fontSize: '12px' }}>
                            <thead>
                              <tr>
                                <th>Symbol</th>
                                <th>Side</th>
                                <th>Volume</th>
                                <th>P/L</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recentTrades.slice(0, 5).map((trade, idx) => (
                                <tr key={idx}>
                                  <td>{trade.symbol}</td>
                                  <td className={trade.side === 'buy' ? 'text-green' : 'text-red'}>{trade.side?.toUpperCase()}</td>
                                  <td>{trade.volume}</td>
                                  <td className={trade.profit >= 0 ? 'text-green' : 'text-red'}>
                                    {trade.profit >= 0 ? '+' : ''}{trade.profit?.toFixed(2) || '0.00'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="dashboard-tables">
                    <div className="table-card">
                      <h3>Recent Users</h3>
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Balance</th>
                            <th>Status</th>
                            <th>Joined</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentUsers.length === 0 ? (
                            <tr><td colSpan="6" style={{ textAlign: 'center', color: '#888' }}>No users yet</td></tr>
                          ) : (
                            recentUsers.map((user, idx) => (
                              <tr key={idx}>
                                <td>#{user.oderId || user._id?.slice(-6)}</td>
                                <td>{user.name}</td>
                                <td>{user.email}</td>
                                <td>₹{user.wallet?.balance?.toLocaleString() || 0}</td>
                                <td>
                                  <span className={`status-badge ${user.isActive === false ? 'blocked' : 'active'}`}>
                                    {user.isActive === false ? 'Blocked' : 'Active'}
                                  </span>
                                </td>
                                <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* User Management - All Users */}
          {(activePage === 'all-users' || activePage === 'active-users' || activePage === 'blocked-users') && (
            <div className="user-management-page">
              <div className="page-header-actions">
                <div className="filters-row">
                  <input
                    type="text"
                    placeholder="Search by name, email, phone..."
                    value={usersFilter.search}
                    onChange={(e) => setUsersFilter(prev => ({ ...prev, search: e.target.value }))}
                    className="search-input"
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff', width: '300px' }}
                  />
                  <select
                    value={usersFilter.status}
                    onChange={(e) => setUsersFilter(prev => ({ ...prev, status: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}
                  >
                    <option value="">All Users</option>
                    <option value="active">Active Only</option>
                    <option value="blocked">Blocked Only</option>
                    <option value="demo">Demo Users</option>
                  </select>
                  <button
                    onClick={() => fetchUsers(1)}
                    style={{ padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}
                  >
                    Search
                  </button>
                </div>
              </div>

              {usersLoading ? (
                <div className="loading-spinner">Loading users...</div>
              ) : (
                <>
                  <div className="table-card" style={{ marginTop: '20px' }}>
                    <h3>Users ({usersPagination.total})</h3>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Phone</th>
                          <th>Balance</th>
                          <th>Status</th>
                          <th>Type</th>
                          <th>Joined</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.length === 0 ? (
                          <tr><td colSpan="9" style={{ textAlign: 'center', color: '#888' }}>No users found</td></tr>
                        ) : (
                          users.map((user) => (
                            <tr key={user._id}>
                              <td>#{user.oderId || user._id?.slice(-6)}</td>
                              <td>{user.name}</td>
                              <td>{user.email}</td>
                              <td>{user.phone || '-'}</td>
                              <td>₹{user.wallet?.balance?.toLocaleString() || 0}</td>
                              <td>
                                <span className={`status-badge ${user.isActive === false ? 'blocked' : 'active'}`}>
                                  {user.isActive === false ? 'Blocked' : 'Active'}
                                </span>
                              </td>
                              <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                  <button
                                    onClick={() => openUserDetail(user)}
                                    style={{ padding: '5px 10px', fontSize: '11px', borderRadius: '4px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}
                                    title="View User Details"
                                  >
                                    👁
                                  </button>
                                  <button
                                    onClick={() => setWalletAdjustModal({ open: true, user })}
                                    style={{ padding: '5px 10px', fontSize: '11px', borderRadius: '4px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}
                                    title="Adjust Wallet"
                                  >
                                    💰
                                  </button>
                                  <button
                                    onClick={() => toggleUserStatus(user._id, user.isActive)}
                                    style={{ padding: '5px 10px', fontSize: '11px', borderRadius: '4px', background: user.isActive === false ? '#10b981' : '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}
                                    title={user.isActive === false ? 'Unblock' : 'Block'}
                                  >
                                    {user.isActive === false ? '✅' : '🚫'}
                                  </button>
                                  <button
                                    onClick={() => deleteUser(user._id)}
                                    style={{ padding: '5px 10px', fontSize: '11px', borderRadius: '4px', background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer' }}
                                    title="Delete User"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {usersPagination.pages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
                      <button
                        onClick={() => fetchUsers(usersPagination.page - 1)}
                        disabled={usersPagination.page <= 1}
                        style={{ padding: '8px 16px', borderRadius: '6px', background: usersPagination.page <= 1 ? '#333' : '#3b82f6', color: '#fff', border: 'none', cursor: usersPagination.page <= 1 ? 'not-allowed' : 'pointer' }}
                      >
                        Previous
                      </button>
                      <span style={{ padding: '8px 16px', color: '#fff' }}>
                        Page {usersPagination.page} of {usersPagination.pages}
                      </span>
                      <button
                        onClick={() => fetchUsers(usersPagination.page + 1)}
                        disabled={usersPagination.page >= usersPagination.pages}
                        style={{ padding: '8px 16px', borderRadius: '6px', background: usersPagination.page >= usersPagination.pages ? '#333' : '#3b82f6', color: '#fff', border: 'none', cursor: usersPagination.page >= usersPagination.pages ? 'not-allowed' : 'pointer' }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Wallet Adjustment Modal */}
              {walletAdjustModal.open && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002 }}>
                  <div className="modal-content" style={{ background: '#1a1a1a', padding: '30px', borderRadius: '12px', width: '400px', maxWidth: '90%' }}>
                    <h3 style={{ marginBottom: '20px', color: '#fff' }}>Adjust Wallet - {walletAdjustModal.user?.name}</h3>
                    <p style={{ color: '#888', marginBottom: '15px' }}>Current Balance: ₹{walletAdjustModal.user?.wallet?.balance?.toLocaleString() || 0}</p>

                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', color: '#ccc' }}>Action</label>
                      <select
                        value={walletAdjustForm.type}
                        onChange={(e) => setWalletAdjustForm(prev => ({ ...prev, type: e.target.value }))}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#0a0a0a', color: '#fff' }}
                      >
                        <option value="add">Add to Balance</option>
                        <option value="subtract">Subtract from Balance</option>
                        <option value="set">Set Balance To</option>
                      </select>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', color: '#ccc' }}>Amount (₹)</label>
                      <input
                        type="number"
                        value={walletAdjustForm.amount}
                        onChange={(e) => setWalletAdjustForm(prev => ({ ...prev, amount: e.target.value }))}
                        placeholder="Enter amount"
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#0a0a0a', color: '#fff' }}
                      />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', color: '#ccc' }}>Reason (optional)</label>
                      <input
                        type="text"
                        value={walletAdjustForm.reason}
                        onChange={(e) => setWalletAdjustForm(prev => ({ ...prev, reason: e.target.value }))}
                        placeholder="e.g., Bonus, Refund, Correction"
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#0a0a0a', color: '#fff' }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={adjustUserWallet}
                        style={{ flex: 1, padding: '12px', borderRadius: '6px', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => { setWalletAdjustModal({ open: false, user: null }); setWalletAdjustForm({ type: 'add', amount: '', reason: '' }); }}
                        style={{ flex: 1, padding: '12px', borderRadius: '6px', background: '#333', color: '#fff', border: 'none', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* User Detail Panel */}
              {userDetailPanel.open && userDetailPanel.user && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
                  <div style={{ background: '#1a1a2e', borderRadius: '16px', width: '500px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(99,102,241,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #333' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '45px', height: '45px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>
                          {userDetailPanel.user.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#fff' }}>{userDetailPanel.user.name}</div>
                          <div style={{ fontSize: '13px', color: '#888' }}>{userDetailPanel.user.email}</div>
                        </div>
                      </div>
                      <button onClick={() => setUserDetailPanel({ open: false, user: null, view: 'info', positions: [], positionsLoading: false, wallet: null })} style={{ background: 'none', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}>✕</button>
                    </div>

                    <div style={{ padding: '20px 24px' }}>
                      {/* User Info Cards */}
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                            <div style={{ background: '#0f0f23', padding: '14px', borderRadius: '10px', border: '1px solid #333' }}>
                              <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Full Name</div>
                              <div style={{ fontSize: '14px', color: '#fff', fontWeight: '500' }}>{userDetailPanel.user.name}</div>
                            </div>
                            <div style={{ background: '#0f0f23', padding: '14px', borderRadius: '10px', border: '1px solid #333' }}>
                              <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Phone</div>
                              <div style={{ fontSize: '14px', color: '#fff', fontWeight: '500' }}>{userDetailPanel.user.phone || '-'}</div>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                            <div style={{ background: '#0f0f23', padding: '14px', borderRadius: '10px', border: '1px solid #333' }}>
                              <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Joined</div>
                              <div style={{ fontSize: '14px', color: '#fff', fontWeight: '500' }}>{new Date(userDetailPanel.user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                            </div>
                            <div style={{ background: '#0f0f23', padding: '14px', borderRadius: '10px', border: '1px solid #333' }}>
                              <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Status</div>
                              <div style={{ fontSize: '14px', color: userDetailPanel.user.isActive !== false ? '#10b981' : '#ef4444', fontWeight: '500' }}>{userDetailPanel.user.isActive !== false ? 'Active' : 'Blocked'}</div>
                            </div>
                          </div>
                          <div style={{ background: '#0f0f23', padding: '14px', borderRadius: '10px', border: '1px solid #333', marginBottom: '16px' }}>
                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Email</div>
                            <div style={{ fontSize: '14px', color: '#fff', fontWeight: '500' }}>{userDetailPanel.user.email}</div>
                          </div>

                          {/* Wallet Balance */}
                          <div style={{ background: 'linear-gradient(135deg, #0f2922, #0a1f2e)', padding: '20px', borderRadius: '12px', border: '1px solid #10b981', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                              <div style={{ fontSize: '12px', color: '#10b981', marginBottom: '4px' }}>💰 Main Wallet Balance</div>
                              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff' }}>${(userDetailPanel.wallet?.balance || userDetailPanel.user.wallet?.balance || 0).toFixed(2)}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setWalletAdjustForm({ type: 'add', amount: '', reason: '' }); setWalletAdjustModal({ open: true, user: userDetailPanel.user }); }} style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}>+</button>
                              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setWalletAdjustForm({ type: 'subtract', amount: '', reason: '' }); setWalletAdjustModal({ open: true, user: userDetailPanel.user }); }} style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}>−</button>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <button type="button" onClick={(e) => { e.preventDefault(); const pw = prompt('Enter new password (min 6 chars):'); if (pw) changeUserPasswordFromDetail(pw); }} style={{ padding: '14px', borderRadius: '10px', background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', color: '#eab308', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>🔒 Change Password</button>
                            <button type="button" onClick={(e) => { e.preventDefault(); setWalletAdjustForm({ type: 'add', amount: '', reason: '' }); setWalletAdjustModal({ open: true, user: userDetailPanel.user }); }} style={{ padding: '14px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>📥 Add Fund</button>
                            <button type="button" onClick={(e) => { e.preventDefault(); setWalletAdjustForm({ type: 'subtract', amount: '', reason: '' }); setWalletAdjustModal({ open: true, user: userDetailPanel.user }); }} style={{ padding: '14px', borderRadius: '10px', background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>💸 Deduct Fund</button>
                            <button type="button" onClick={(e) => { e.preventDefault(); toggleUserStatus(userDetailPanel.user._id, userDetailPanel.user.isActive); }} style={{ padding: '14px', borderRadius: '10px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>{userDetailPanel.user.isActive === false ? '✅ Unblock' : '🚫 Block'}</button>
                            <button type="button" onClick={(e) => { e.preventDefault(); if (window.confirm('Ban this user?')) { toggleUserStatus(userDetailPanel.user._id, true); } }} style={{ padding: '14px', borderRadius: '10px', background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>⛔ Ban</button>
                            <button type="button" onClick={(e) => { e.preventDefault(); loginAsUser(userDetailPanel.user); }} style={{ padding: '14px', borderRadius: '10px', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>➡️ Login as User</button>
                          </div>
                        </>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* KYC Management Page */}
          {(activePage === 'kyc-management' || activePage === 'pending-users' || activePage === 'user-documents') && (
            <div className="kyc-management-page" style={{ padding: '20px' }}>
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '24px' }}>
                  {activePage === 'pending-users' ? '⏳ Pending Verification' : activePage === 'user-documents' ? '📄 User Documents' : '🪪 KYC Management'}
                </h2>
                <p style={{ margin: 0, color: '#888', fontSize: '14px' }}>
                  {activePage === 'pending-users' ? 'Review and verify pending KYC submissions' : 'Manage user identity verification documents'}
                </p>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="🔍 Search by name, ID, document..."
                  value={kycFilter.search}
                  onChange={(e) => setKycFilter(prev => ({ ...prev, search: e.target.value }))}
                  style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #333', background: '#0f0f1a', color: '#fff', width: '280px', fontSize: '14px' }}
                />
                <select
                  value={kycFilter.status}
                  onChange={(e) => setKycFilter(prev => ({ ...prev, status: e.target.value }))}
                  style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #333', background: '#0f0f1a', color: '#fff', fontSize: '14px', minWidth: '150px' }}
                >
                  <option value="">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="resubmit">Resubmit Required</option>
                </select>
                <div style={{ marginLeft: 'auto', background: 'linear-gradient(135deg, #f59e0b20, #f59e0b10)', padding: '10px 20px', borderRadius: '10px', color: '#f59e0b', fontWeight: '600', border: '1px solid #f59e0b30', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>⏳</span> Pending: {pendingKycCount}
                </div>
              </div>

              {kycLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: '#888' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
                    <div>Loading KYC submissions...</div>
                  </div>
                </div>
              ) : kycList.length === 0 ? (
                <div style={{ background: '#0f0f1a', borderRadius: '12px', padding: '60px 20px', textAlign: 'center', border: '1px solid #222' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                  <h3 style={{ margin: '0 0 8px 0', color: '#fff' }}>No KYC Submissions Found</h3>
                  <p style={{ margin: 0, color: '#888', fontSize: '14px' }}>
                    {kycFilter.status === 'pending' ? 'No pending verifications at the moment' : 'No KYC submissions match your filters'}
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ background: '#0f0f1a', borderRadius: '12px', overflow: 'hidden', border: '1px solid #222' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#1a1a2e' }}>
                          <th style={{ padding: '14px 16px', textAlign: 'left', color: '#888', fontWeight: '500', fontSize: '13px', borderBottom: '1px solid #333' }}>User</th>
                          <th style={{ padding: '14px 16px', textAlign: 'left', color: '#888', fontWeight: '500', fontSize: '13px', borderBottom: '1px solid #333' }}>Document Type</th>
                          <th style={{ padding: '14px 16px', textAlign: 'left', color: '#888', fontWeight: '500', fontSize: '13px', borderBottom: '1px solid #333' }}>Document No.</th>
                          <th style={{ padding: '14px 16px', textAlign: 'left', color: '#888', fontWeight: '500', fontSize: '13px', borderBottom: '1px solid #333' }}>Submitted</th>
                          <th style={{ padding: '14px 16px', textAlign: 'left', color: '#888', fontWeight: '500', fontSize: '13px', borderBottom: '1px solid #333' }}>Status</th>
                          <th style={{ padding: '14px 16px', textAlign: 'left', color: '#888', fontWeight: '500', fontSize: '13px', borderBottom: '1px solid #333' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kycList.map(kyc => (
                          <tr key={kyc._id} style={{ borderBottom: '1px solid #222' }}>
                            <td style={{ padding: '14px 16px' }}>
                              <div style={{ fontWeight: '500', color: '#fff' }}>{kyc.fullName}</div>
                              <div style={{ fontSize: '12px', color: '#666' }}>{kyc.user?.email || kyc.oderId}</div>
                            </td>
                            <td style={{ padding: '14px 16px', textTransform: 'capitalize', color: '#ccc' }}>{kyc.documentType?.replace('_', ' ')}</td>
                            <td style={{ padding: '14px 16px', color: '#ccc', fontFamily: 'monospace' }}>{kyc.documentNumber}</td>
                            <td style={{ padding: '14px 16px', color: '#888' }}>{new Date(kyc.submittedAt).toLocaleDateString()}</td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{
                                padding: '5px 12px',
                                borderRadius: '20px',
                                fontSize: '12px',
                                fontWeight: '600',
                                textTransform: 'capitalize',
                                background: kyc.status === 'approved' ? '#10b98120' : kyc.status === 'pending' ? '#f59e0b20' : kyc.status === 'rejected' ? '#ef444420' : '#6366f120',
                                color: kyc.status === 'approved' ? '#10b981' : kyc.status === 'pending' ? '#f59e0b' : kyc.status === 'rejected' ? '#ef4444' : '#6366f1'
                              }}>
                                {kyc.status}
                              </span>
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => setKycDetailModal({ open: true, kyc })} style={{ padding: '8px 14px', borderRadius: '8px', background: '#6366f120', border: '1px solid #6366f140', color: '#6366f1', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>👁️ View</button>
                                {kyc.status === 'pending' && (
                                  <>
                                    <button onClick={() => approveKyc(kyc._id)} style={{ padding: '8px 14px', borderRadius: '8px', background: '#10b98120', border: '1px solid #10b98140', color: '#10b981', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>✓ Approve</button>
                                    <button onClick={() => rejectKyc(kyc._id)} style={{ padding: '8px 14px', borderRadius: '8px', background: '#ef444420', border: '1px solid #ef444440', color: '#ef4444', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>✕ Reject</button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {kycPagination.totalPages > 1 && (
                    <div className="pagination" style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
                      <button
                        disabled={kycPagination.page <= 1}
                        onClick={() => fetchKycList(kycPagination.page - 1)}
                        style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #333', background: '#1a1a2e', color: '#fff', cursor: kycPagination.page <= 1 ? 'not-allowed' : 'pointer', opacity: kycPagination.page <= 1 ? 0.5 : 1 }}
                      >
                        Previous
                      </button>
                      <span style={{ padding: '8px 16px', color: '#888' }}>
                        Page {kycPagination.page} of {kycPagination.totalPages}
                      </span>
                      <button
                        disabled={kycPagination.page >= kycPagination.totalPages}
                        onClick={() => fetchKycList(kycPagination.page + 1)}
                        style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #333', background: '#1a1a2e', color: '#fff', cursor: kycPagination.page >= kycPagination.totalPages ? 'not-allowed' : 'pointer', opacity: kycPagination.page >= kycPagination.totalPages ? 0.5 : 1 }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* KYC Detail Modal */}
              {kycDetailModal.open && kycDetailModal.kyc && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
                  <div style={{ background: '#1a1a2e', borderRadius: '16px', width: '600px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(99,102,241,0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #333' }}>
                      <h3 style={{ margin: 0, color: '#fff' }}>KYC Document Details</h3>
                      <button onClick={() => setKycDetailModal({ open: false, kyc: null })} style={{ background: 'none', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}>✕</button>
                    </div>
                    <div style={{ padding: '20px 24px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                        <div style={{ background: '#0f0f23', padding: '14px', borderRadius: '10px' }}>
                          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Full Name</div>
                          <div style={{ color: '#fff', fontWeight: '500' }}>{kycDetailModal.kyc.fullName}</div>
                        </div>
                        <div style={{ background: '#0f0f23', padding: '14px', borderRadius: '10px' }}>
                          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>User ID</div>
                          <div style={{ color: '#fff', fontWeight: '500' }}>{kycDetailModal.kyc.oderId}</div>
                        </div>
                        <div style={{ background: '#0f0f23', padding: '14px', borderRadius: '10px' }}>
                          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Document Type</div>
                          <div style={{ color: '#fff', fontWeight: '500', textTransform: 'capitalize' }}>{kycDetailModal.kyc.documentType?.replace('_', ' ')}</div>
                        </div>
                        <div style={{ background: '#0f0f23', padding: '14px', borderRadius: '10px' }}>
                          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Document Number</div>
                          <div style={{ color: '#fff', fontWeight: '500' }}>{kycDetailModal.kyc.documentNumber}</div>
                        </div>
                        <div style={{ background: '#0f0f23', padding: '14px', borderRadius: '10px' }}>
                          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Status</div>
                          <div style={{ color: kycDetailModal.kyc.status === 'approved' ? '#10b981' : kycDetailModal.kyc.status === 'pending' ? '#f59e0b' : '#ef4444', fontWeight: '500', textTransform: 'capitalize' }}>{kycDetailModal.kyc.status}</div>
                        </div>
                        <div style={{ background: '#0f0f23', padding: '14px', borderRadius: '10px' }}>
                          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Submitted</div>
                          <div style={{ color: '#fff', fontWeight: '500' }}>{new Date(kycDetailModal.kyc.submittedAt).toLocaleString()}</div>
                        </div>
                      </div>

                      {kycDetailModal.kyc.address && (
                        <div style={{ background: '#0f0f23', padding: '14px', borderRadius: '10px', marginBottom: '20px' }}>
                          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Address</div>
                          <div style={{ color: '#fff' }}>{kycDetailModal.kyc.address}</div>
                        </div>
                      )}

                      {/* Document Images */}
                      <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ color: '#fff', marginBottom: '12px' }}>📄 Document Images</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                          {kycDetailModal.kyc.frontImage && (
                            <div style={{ background: '#0f0f23', padding: '10px', borderRadius: '10px' }}>
                              <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>Front Side</div>
                              <img src={kycDetailModal.kyc.frontImage} alt="Front" style={{ width: '100%', borderRadius: '8px', maxHeight: '200px', objectFit: 'contain' }} />
                            </div>
                          )}
                          {kycDetailModal.kyc.backImage && (
                            <div style={{ background: '#0f0f23', padding: '10px', borderRadius: '10px' }}>
                              <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>Back Side</div>
                              <img src={kycDetailModal.kyc.backImage} alt="Back" style={{ width: '100%', borderRadius: '8px', maxHeight: '200px', objectFit: 'contain' }} />
                            </div>
                          )}
                          {kycDetailModal.kyc.selfieImage && (
                            <div style={{ background: '#0f0f23', padding: '10px', borderRadius: '10px' }}>
                              <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>Selfie</div>
                              <img src={kycDetailModal.kyc.selfieImage} alt="Selfie" style={{ width: '100%', borderRadius: '8px', maxHeight: '200px', objectFit: 'contain' }} />
                            </div>
                          )}
                        </div>
                      </div>

                      {kycDetailModal.kyc.rejectionReason && (
                        <div style={{ background: '#ef444420', padding: '14px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #ef444440' }}>
                          <div style={{ fontSize: '11px', color: '#ef4444', marginBottom: '4px' }}>Rejection Reason</div>
                          <div style={{ color: '#fff' }}>{kycDetailModal.kyc.rejectionReason}</div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      {kycDetailModal.kyc.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                          <button onClick={() => approveKyc(kycDetailModal.kyc._id)} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#10b981', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: '500' }}>✓ Approve KYC</button>
                          <button onClick={() => rejectKyc(kycDetailModal.kyc._id)} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#ef4444', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: '500' }}>✕ Reject KYC</button>
                          <button onClick={() => requestKycResubmit(kycDetailModal.kyc._id)} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#f59e0b', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: '500' }}>🔄 Request Resubmit</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User Activity Logs Page */}
          {activePage === 'user-logs' && (
            <div className="activity-logs-page">
              <div className="page-header-actions">
                <div className="filters-row">
                  <input
                    type="text"
                    placeholder="Search by user ID or description..."
                    value={activityLogsFilter.search}
                    onChange={(e) => setActivityLogsFilter(prev => ({ ...prev, search: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a2e', color: '#fff', width: '250px' }}
                  />
                  <select
                    value={activityLogsFilter.activityType}
                    onChange={(e) => setActivityLogsFilter(prev => ({ ...prev, activityType: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a2e', color: '#fff' }}
                  >
                    <option value="">All Activities</option>
                    <option value="login">Login</option>
                    <option value="logout">Logout</option>
                    <option value="register">Register</option>
                    <option value="deposit_request">Deposit Request</option>
                    <option value="deposit_approved">Deposit Approved</option>
                    <option value="withdrawal_request">Withdrawal Request</option>
                    <option value="withdrawal_approved">Withdrawal Approved</option>
                    <option value="trade_open">Position Open</option>
                    <option value="trade_close">Position Close</option>
                    <option value="kyc_submitted">KYC Submitted</option>
                    <option value="kyc_approved">KYC Approved</option>
                    <option value="kyc_rejected">KYC Rejected</option>
                    <option value="password_change">Password Change</option>
                    <option value="wallet_credit">Wallet Credit</option>
                    <option value="wallet_debit">Wallet Debit</option>
                  </select>
                </div>
              </div>

              {activityLogsLoading ? (
                <div className="loading-spinner">Loading activity logs...</div>
              ) : (
                <>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Activity</th>
                          <th>Description</th>
                          <th>IP Address</th>
                          <th>Device</th>
                          <th>Time</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activityLogs.length === 0 ? (
                          <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#888' }}>No activity logs found</td></tr>
                        ) : activityLogs.map(log => (
                          <tr key={log._id}>
                            <td>
                              <div style={{ fontWeight: '500' }}>{log.user?.name || 'Unknown'}</div>
                              <div style={{ fontSize: '12px', color: '#888' }}>{log.oderId}</div>
                            </td>
                            <td>
                              <span style={{
                                padding: '4px 10px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: '500',
                                background: log.activityType.includes('login') ? '#6366f120' : log.activityType.includes('deposit') ? '#10b98120' : log.activityType.includes('withdrawal') ? '#f59e0b20' : log.activityType.includes('trade') ? '#8b5cf620' : log.activityType.includes('kyc') ? '#06b6d420' : '#64748b20',
                                color: log.activityType.includes('login') ? '#6366f1' : log.activityType.includes('deposit') ? '#10b981' : log.activityType.includes('withdrawal') ? '#f59e0b' : log.activityType.includes('trade') ? '#8b5cf6' : log.activityType.includes('kyc') ? '#06b6d4' : '#64748b',
                                textTransform: 'capitalize'
                              }}>
                                {log.activityType.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.description}</td>
                            <td style={{ fontSize: '12px', color: '#888' }}>{log.ipAddress || '-'}</td>
                            <td style={{ fontSize: '12px', color: '#888', textTransform: 'capitalize' }}>{log.device || '-'}</td>
                            <td style={{ fontSize: '12px', color: '#888' }}>{new Date(log.timestamp).toLocaleString()}</td>
                            <td>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                background: log.status === 'success' ? '#10b98120' : log.status === 'failed' ? '#ef444420' : '#f59e0b20',
                                color: log.status === 'success' ? '#10b981' : log.status === 'failed' ? '#ef4444' : '#f59e0b'
                              }}>
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {activityLogsPagination.totalPages > 1 && (
                    <div className="pagination" style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
                      <button
                        disabled={activityLogsPagination.page <= 1}
                        onClick={() => fetchActivityLogs(activityLogsPagination.page - 1)}
                        style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #333', background: '#1a1a2e', color: '#fff', cursor: activityLogsPagination.page <= 1 ? 'not-allowed' : 'pointer', opacity: activityLogsPagination.page <= 1 ? 0.5 : 1 }}
                      >
                        Previous
                      </button>
                      <span style={{ padding: '8px 16px', color: '#888' }}>
                        Page {activityLogsPagination.page} of {activityLogsPagination.totalPages} ({activityLogsPagination.total} total)
                      </span>
                      <button
                        disabled={activityLogsPagination.page >= activityLogsPagination.totalPages}
                        onClick={() => fetchActivityLogs(activityLogsPagination.page + 1)}
                        style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #333', background: '#1a1a2e', color: '#fff', cursor: activityLogsPagination.page >= activityLogsPagination.totalPages ? 'not-allowed' : 'pointer', opacity: activityLogsPagination.page >= activityLogsPagination.totalPages ? 0.5 : 1 }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Banner Settings Page */}
          {activePage === 'banner-settings' && (
            <div className="banner-settings-page">
              <div className="banner-form-card">
                <h3>Add New Banner</h3>
                <div className="banner-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Banner Title *</label>
                      <input
                        type="text"
                        name="title"
                        value={bannerForm.title}
                        onChange={handleBannerFormChange}
                        placeholder="e.g., TECHNOLOGY SERVICE"
                      />
                    </div>
                    <div className="form-group">
                      <label>Subtitle</label>
                      <input
                        type="text"
                        name="subtitle"
                        value={bannerForm.subtitle}
                        onChange={handleBannerFormChange}
                        placeholder="e.g., THE BEST CHOICE FOR FUTURE"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Upload Banner Image *</label>
                      <div className="image-upload-area">
                        <input
                          type="file"
                          id="banner-image"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="file-input"
                        />
                        <label htmlFor="banner-image" className="upload-label">
                          {imagePreview ? (
                            <img src={imagePreview} alt="Preview" className="image-preview" />
                          ) : (
                            <div className="upload-placeholder">
                              <span className="upload-icon">📷</span>
                              <span>Click to upload image</span>
                              <span className="upload-hint">Max size: 2MB</span>
                            </div>
                          )}
                        </label>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Link URL (optional)</label>
                      <input
                        type="text"
                        name="link"
                        value={bannerForm.link}
                        onChange={handleBannerFormChange}
                        placeholder="https://example.com/offer"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="isActive"
                        checked={bannerForm.isActive}
                        onChange={handleBannerFormChange}
                      />
                      <span>Active (Show on user homepage)</span>
                    </label>
                  </div>
                  <button className="add-banner-btn" onClick={addBanner}>
                    Add Banner
                  </button>
                </div>
              </div>

              <div className="banners-list-card">
                <h3>All Banners ({banners.length})</h3>
                {banners.length === 0 ? (
                  <p className="no-banners">No banners added yet. Add your first banner above.</p>
                ) : (
                  <div className="banners-grid">
                    {banners.map(banner => (
                      <div key={banner._id} className={`banner-item ${!banner.isActive ? 'inactive' : ''}`}>
                        <div className="banner-preview">
                          <img src={banner.imageData || banner.imageUrl} alt={banner.title} onError={(e) => e.target.src = 'https://via.placeholder.com/400x150?text=Banner'} />
                        </div>
                        <div className="banner-info">
                          <h4>{banner.title}</h4>
                          <p>{banner.subtitle || 'No subtitle'}</p>
                          <span className={`banner-status ${banner.isActive ? 'active' : 'inactive'}`}>
                            {banner.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="banner-actions">
                          <button
                            className="toggle-btn"
                            onClick={() => toggleBannerStatus(banner._id)}
                          >
                            {banner.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            className="delete-btn"
                            onClick={() => deleteBanner(banner._id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bank Accounts Management */}
          {activePage === 'bank-accounts' && (
            <div className="fund-management-page">
              <div className="fund-form-card">
                <h3>Add Bank Account</h3>
                <div className="fund-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Bank Name *</label>
                      <input
                        type="text"
                        value={bankForm.bankName}
                        onChange={(e) => setBankForm(prev => ({ ...prev, bankName: e.target.value }))}
                        placeholder="e.g., State Bank of India"
                      />
                    </div>
                    <div className="form-group">
                      <label>Account Holder Name *</label>
                      <input
                        type="text"
                        value={bankForm.accountHolder}
                        onChange={(e) => setBankForm(prev => ({ ...prev, accountHolder: e.target.value }))}
                        placeholder="e.g., John Doe"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Account Number *</label>
                      <input
                        type="text"
                        value={bankForm.accountNumber}
                        onChange={(e) => setBankForm(prev => ({ ...prev, accountNumber: e.target.value }))}
                        placeholder="e.g., 1234567890"
                      />
                    </div>
                    <div className="form-group">
                      <label>IFSC Code *</label>
                      <input
                        type="text"
                        value={bankForm.ifsc}
                        onChange={(e) => setBankForm(prev => ({ ...prev, ifsc: e.target.value }))}
                        placeholder="e.g., SBIN0001234"
                      />
                    </div>
                  </div>
                  <button className="add-btn" onClick={addBankAccount}>Add Bank Account</button>
                </div>
              </div>

              <div className="fund-list-card">
                <h3>Bank Accounts ({paymentMethods.bankAccounts.length})</h3>
                {paymentMethods.bankAccounts.length === 0 ? (
                  <p className="no-items">No bank accounts added yet.</p>
                ) : (
                  <div className="fund-list">
                    {paymentMethods.bankAccounts.map(bank => (
                      <div key={bank.id} className="fund-item">
                        <div className="fund-info">
                          <h4>{bank.bankName}</h4>
                          <p>A/C: {bank.accountNumber}</p>
                          <p>IFSC: {bank.ifsc}</p>
                          <p>Holder: {bank.accountHolder}</p>
                        </div>
                        <button className="delete-btn" onClick={() => deletePaymentMethod('bank', bank.id)}>Delete</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* UPI Management */}
          {activePage === 'upi-management' && (
            <div className="fund-management-page">
              <div className="fund-form-card">
                <h3>Add UPI ID</h3>
                <div className="fund-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label>UPI ID *</label>
                      <input
                        type="text"
                        value={upiForm.upiId}
                        onChange={(e) => setUpiForm(prev => ({ ...prev, upiId: e.target.value }))}
                        placeholder="e.g., example@upi"
                      />
                    </div>
                    <div className="form-group">
                      <label>Name *</label>
                      <input
                        type="text"
                        value={upiForm.name}
                        onChange={(e) => setUpiForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g., John Doe"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>QR Code (Optional)</label>
                    <div className="image-upload-area">
                      <input
                        type="file"
                        id="upi-qr"
                        accept="image/*"
                        onChange={(e) => handleQrUpload(e, 'upi')}
                        className="file-input"
                      />
                      <label htmlFor="upi-qr" className="upload-label small">
                        {upiForm.qrImage ? (
                          <img src={upiForm.qrImage} alt="QR" className="qr-preview" />
                        ) : (
                          <div className="upload-placeholder">
                            <span>Upload QR Code</span>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>
                  <button className="add-btn" onClick={addUpiId}>Add UPI</button>
                </div>
              </div>

              <div className="fund-list-card">
                <h3>UPI IDs ({paymentMethods.upiIds.length})</h3>
                {paymentMethods.upiIds.length === 0 ? (
                  <p className="no-items">No UPI IDs added yet.</p>
                ) : (
                  <div className="fund-list">
                    {paymentMethods.upiIds.map(upi => (
                      <div key={upi.id} className="fund-item">
                        <div className="fund-info">
                          <h4>{upi.name}</h4>
                          <p>{upi.upiId}</p>
                          {upi.qrImage && <img src={upi.qrImage} alt="QR" className="qr-thumb" />}
                        </div>
                        <button className="delete-btn" onClick={() => deletePaymentMethod('upi', upi.id)}>Delete</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment Gateways (Crypto) */}
          {activePage === 'payment-gateways' && (
            <div className="fund-management-page">
              <div className="fund-form-card">
                <h3>Add Crypto Wallet</h3>
                <div className="fund-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Network *</label>
                      <select
                        value={cryptoForm.network}
                        onChange={(e) => setCryptoForm(prev => ({ ...prev, network: e.target.value }))}
                      >
                        <option value="">Select Network</option>
                        <option value="BTC">Bitcoin (BTC)</option>
                        <option value="ETH">Ethereum (ETH)</option>
                        <option value="BNB">BNB (BSC)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Wallet Address *</label>
                      <input
                        type="text"
                        value={cryptoForm.address}
                        onChange={(e) => setCryptoForm(prev => ({ ...prev, address: e.target.value }))}
                        placeholder="Wallet address"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>QR Code (Optional)</label>
                    <div className="image-upload-area">
                      <input
                        type="file"
                        id="crypto-qr"
                        accept="image/*"
                        onChange={(e) => handleQrUpload(e, 'crypto')}
                        className="file-input"
                      />
                      <label htmlFor="crypto-qr" className="upload-label small">
                        {cryptoForm.qrImage ? (
                          <img src={cryptoForm.qrImage} alt="QR" className="qr-preview" />
                        ) : (
                          <div className="upload-placeholder">
                            <span>Upload QR Code</span>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>
                  <button className="add-btn" onClick={addCryptoWallet}>Add Crypto Wallet</button>
                </div>
              </div>

              <div className="fund-list-card">
                <h3>Crypto Wallets ({paymentMethods.cryptoWallets.length})</h3>
                {paymentMethods.cryptoWallets.length === 0 ? (
                  <p className="no-items">No crypto wallets added yet.</p>
                ) : (
                  <div className="fund-list">
                    {paymentMethods.cryptoWallets.map(crypto => (
                      <div key={crypto.id} className="fund-item">
                        <div className="fund-info">
                          <h4>{crypto.network}</h4>
                          <p className="address">{crypto.address}</p>
                          {crypto.qrImage && <img src={crypto.qrImage} alt="QR" className="qr-thumb" />}
                        </div>
                        <button className="delete-btn" onClick={() => deletePaymentMethod('crypto', crypto.id)}>Delete</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Deposit Requests */}
          {activePage === 'deposit-requests' && (
            <div className="fund-requests-page">
              <h3>Deposit Requests</h3>
              <div className="requests-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>User</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Proof</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fundRequests.filter(r => r.type === 'deposit').length === 0 ? (
                      <tr><td colSpan="8" className="no-data">No deposit requests</td></tr>
                    ) : (
                      fundRequests.filter(r => r.type === 'deposit').map(req => (
                        <tr key={req.id}>
                          <td>#{req.id.slice(-6)}</td>
                          <td>{req.userName}</td>
                          <td>₹{req.amount.toFixed(2)}</td>
                          <td>{req.method}</td>
                          <td>
                            {req.proofImage && (
                              <img src={req.proofImage} alt="Proof" className="proof-thumb" onClick={() => window.open(req.proofImage)} />
                            )}
                          </td>
                          <td><span className={`status-badge ${req.status}`}>{req.status}</span></td>
                          <td>{new Date(req.createdAt).toLocaleDateString()}</td>
                          <td>
                            {req.status === 'pending' && (
                              <div className="action-btns">
                                <button className="approve-btn" onClick={() => handleFundRequest(req.id, 'approve')}>Approve</button>
                                <button className="reject-btn" onClick={() => handleFundRequest(req.id, 'reject')}>Reject</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Withdrawal Requests */}
          {activePage === 'withdrawal-requests' && (
            <div className="fund-requests-page">
              <h3>Withdrawal Requests</h3>
              <div className="requests-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>User</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Details</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fundRequests.filter(r => r.type === 'withdrawal').length === 0 ? (
                      <tr><td colSpan="8" className="no-data">No withdrawal requests</td></tr>
                    ) : (
                      fundRequests.filter(r => r.type === 'withdrawal').map(req => (
                        <tr key={req.id}>
                          <td>#{req.id.slice(-6)}</td>
                          <td>{req.userName}</td>
                          <td>₹{req.amount.toFixed(2)}</td>
                          <td>{req.method}</td>
                          <td className="details-cell">{req.withdrawDetails}</td>
                          <td><span className={`status-badge ${req.status}`}>{req.status}</span></td>
                          <td>{new Date(req.createdAt).toLocaleDateString()}</td>
                          <td>
                            {req.status === 'pending' && (
                              <div className="action-btns">
                                <button className="approve-btn" onClick={() => handleFundRequest(req.id, 'approve')}>Approve</button>
                                <button className="reject-btn" onClick={() => handleFundRequest(req.id, 'reject')}>Reject</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}


          {/* Hedging Mode Settings */}
          {activePage === 'hedging-settings' && (
            <div className="trade-mode-settings-page">
              <div className="settings-card">
                <div className="settings-header">
                  <h3>🔄 Hedging Mode Settings</h3>
                  <p>Configure rules for Forex/Crypto MT5-style execution with multiple positions per symbol.</p>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={tradeModeSettings.hedging.enabled}
                      onChange={(e) => updateTradeModeSettings('hedging', 'enabled', e.target.checked)}
                    />
                    <span className="slider"></span>
                    <span className="toggle-label">{tradeModeSettings.hedging.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="settings-grid">
                  <div className="setting-group">
                    <h4>Lot Size Limits</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Minimum Lot Size</label>
                        <input type="number" step="0.01" value={tradeModeSettings.hedging.minLotSize}
                          onChange={(e) => updateTradeModeSettings('hedging', 'minLotSize', parseFloat(e.target.value))} />
                      </div>
                      <div className="form-group">
                        <label>Maximum Lot Size</label>
                        <input type="number" step="0.01" value={tradeModeSettings.hedging.maxLotSize}
                          onChange={(e) => updateTradeModeSettings('hedging', 'maxLotSize', parseFloat(e.target.value))} />
                      </div>
                    </div>
                  </div>

                  <div className="setting-group">
                    <h4>Position Limits</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Max Positions Per Symbol</label>
                        <input type="number" value={tradeModeSettings.hedging.maxPositionsPerSymbol}
                          onChange={(e) => updateTradeModeSettings('hedging', 'maxPositionsPerSymbol', parseInt(e.target.value))} />
                      </div>
                      <div className="form-group">
                        <label>Max Total Positions</label>
                        <input type="number" value={tradeModeSettings.hedging.maxTotalPositions}
                          onChange={(e) => updateTradeModeSettings('hedging', 'maxTotalPositions', parseInt(e.target.value))} />
                      </div>
                    </div>
                  </div>

                  <div className="setting-group">
                    <h4>Leverage</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Default Leverage (1:X)</label>
                        <input type="number" value={tradeModeSettings.hedging.defaultLeverage}
                          onChange={(e) => updateTradeModeSettings('hedging', 'defaultLeverage', parseInt(e.target.value))} />
                      </div>
                    </div>
                    {/* Margin Call / Stop Out moved to /admin/risk-management — they're
                        account-wide MT5 controls, not per-trade-mode. */}
                  </div>

                  <div className="setting-group">
                    <h4>Order Features</h4>
                    <div className="checkbox-row">
                      <label className="checkbox-label">
                        <input type="checkbox" checked={tradeModeSettings.hedging.allowPartialClose}
                          onChange={(e) => updateTradeModeSettings('hedging', 'allowPartialClose', e.target.checked)} />
                        Allow Partial Close
                      </label>
                      <label className="checkbox-label">
                        <input type="checkbox" checked={tradeModeSettings.hedging.allowModifySLTP}
                          onChange={(e) => updateTradeModeSettings('hedging', 'allowModifySLTP', e.target.checked)} />
                        Allow Modify SL/TP
                      </label>
                    </div>
                  </div>
                </div>

                <button className="save-btn" onClick={() => saveTradeModeSettings('hedging')}>
                  Save Hedging Settings
                </button>
              </div>
            </div>
          )}

          {/* Netting Mode Settings */}
          {activePage === 'netting-settings' && (
            <div className="trade-mode-settings-page">
              <div className="settings-card">
                <div className="settings-header">
                  <h3>📊 Netting Mode Settings</h3>
                  <p>Configure rules for Indian Market style execution (F&O / Equity) with net position per symbol.</p>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={tradeModeSettings.netting.enabled}
                      onChange={(e) => updateTradeModeSettings('netting', 'enabled', e.target.checked)}
                    />
                    <span className="slider"></span>
                    <span className="toggle-label">{tradeModeSettings.netting.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="settings-grid">
                  <div className="setting-group">
                    <h4>Quantity Limits</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Minimum Quantity</label>
                        <input type="number" value={tradeModeSettings.netting.minQuantity}
                          onChange={(e) => updateTradeModeSettings('netting', 'minQuantity', parseInt(e.target.value))} />
                      </div>
                      <div className="form-group">
                        <label>Maximum Quantity</label>
                        <input type="number" value={tradeModeSettings.netting.maxQuantity}
                          onChange={(e) => updateTradeModeSettings('netting', 'maxQuantity', parseInt(e.target.value))} />
                      </div>
                    </div>
                  </div>

                  <div className="setting-group">
                    <h4>Intraday Settings</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Max Intraday Quantity</label>
                        <input type="number" value={tradeModeSettings.netting.intradayMaxQuantity}
                          onChange={(e) => updateTradeModeSettings('netting', 'intradayMaxQuantity', parseInt(e.target.value))} />
                      </div>
                      <div className="form-group">
                        <label>Auto Square-Off Time</label>
                        <input type="time" value={tradeModeSettings.netting.autoSquareOffTime}
                          onChange={(e) => updateTradeModeSettings('netting', 'autoSquareOffTime', e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="setting-group">
                    <h4>Carry Forward Settings</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Max Carry Forward Quantity</label>
                        <input type="number" value={tradeModeSettings.netting.carryForwardMaxQuantity}
                          onChange={(e) => updateTradeModeSettings('netting', 'carryForwardMaxQuantity', parseInt(e.target.value))} />
                      </div>
                    </div>
                    <div className="checkbox-row">
                      <label className="checkbox-label">
                        <input type="checkbox" checked={tradeModeSettings.netting.allowCarryForward}
                          onChange={(e) => updateTradeModeSettings('netting', 'allowCarryForward', e.target.checked)} />
                        Allow Carry Forward Positions
                      </label>
                    </div>
                  </div>
                </div>

                <button className="save-btn" onClick={() => saveTradeModeSettings('netting')}>
                  Save Netting Settings
                </button>
              </div>
            </div>
          )}

          {/* Binary Mode Settings */}
          {activePage === 'binary-settings' && (
            <div className="trade-mode-settings-page">
              <div className="settings-card">
                <div className="settings-header">
                  <h3>⏱️ Binary Mode Settings</h3>
                  <p>Configure rules for time-based UP/DOWN execution with fixed expiry.</p>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={tradeModeSettings.binary.enabled}
                      onChange={(e) => updateTradeModeSettings('binary', 'enabled', e.target.checked)}
                    />
                    <span className="slider"></span>
                    <span className="toggle-label">{tradeModeSettings.binary.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="settings-grid">
                  <div className="setting-group">
                    <h4>Order Amount Limits (₹ INR)</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Minimum Order Amount (₹)</label>
                        <input type="number" value={tradeModeSettings.binary.minTradeAmount}
                          onChange={(e) => updateTradeModeSettings('binary', 'minTradeAmount', parseInt(e.target.value))} />
                      </div>
                      <div className="form-group">
                        <label>Maximum Order Amount (₹)</label>
                        <input type="number" value={tradeModeSettings.binary.maxTradeAmount}
                          onChange={(e) => updateTradeModeSettings('binary', 'maxTradeAmount', parseInt(e.target.value))} />
                      </div>
                    </div>
                  </div>

                  <div className="setting-group">
                    <h4>Expiry Time Limits (seconds)</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Minimum Expiry</label>
                        <input type="number" value={tradeModeSettings.binary.minExpiry}
                          onChange={(e) => updateTradeModeSettings('binary', 'minExpiry', parseInt(e.target.value))} />
                        <span className="form-hint">{Math.floor(tradeModeSettings.binary.minExpiry / 60)}m {tradeModeSettings.binary.minExpiry % 60}s</span>
                      </div>
                      <div className="form-group">
                        <label>Maximum Expiry</label>
                        <input type="number" value={tradeModeSettings.binary.maxExpiry}
                          onChange={(e) => updateTradeModeSettings('binary', 'maxExpiry', parseInt(e.target.value))} />
                        <span className="form-hint">{Math.floor(tradeModeSettings.binary.maxExpiry / 60)}m</span>
                      </div>
                    </div>
                  </div>

                  <div className="setting-group">
                    <h4>Payout Settings</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Payout Percentage (%)</label>
                        <input type="number" value={tradeModeSettings.binary.payoutPercent}
                          onChange={(e) => updateTradeModeSettings('binary', 'payoutPercent', parseInt(e.target.value))} />
                        <span className="form-hint">User wins: Amount × {tradeModeSettings.binary.payoutPercent}%</span>
                      </div>
                    </div>
                    <div className="checkbox-row">
                      <label className="checkbox-label">
                        <input type="checkbox" checked={tradeModeSettings.binary.refundOnTie}
                          onChange={(e) => updateTradeModeSettings('binary', 'refundOnTie', e.target.checked)} />
                        Refund on Tie (price unchanged at expiry)
                      </label>
                    </div>
                  </div>

                  <div className="setting-group">
                    <h4>Allowed Expiry Options</h4>
                    <div className="expiry-chips">
                      {[60, 120, 300, 600, 900, 1800, 3600].map(exp => (
                        <label key={exp} className={`expiry-chip ${tradeModeSettings.binary.allowedExpiries.includes(exp) ? 'active' : ''}`}>
                          <input
                            type="checkbox"
                            checked={tradeModeSettings.binary.allowedExpiries.includes(exp)}
                            onChange={(e) => {
                              const newExpiries = e.target.checked
                                ? [...tradeModeSettings.binary.allowedExpiries, exp]
                                : tradeModeSettings.binary.allowedExpiries.filter(e => e !== exp);
                              updateTradeModeSettings('binary', 'allowedExpiries', newExpiries);
                            }}
                          />
                          {exp >= 60 ? `${Math.floor(exp / 60)}m` : `${exp}s`}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <button className="save-btn" onClick={() => saveTradeModeSettings('binary')}>
                  Save Binary Settings
                </button>
              </div>
            </div>
          )}

          {/* ===== ACTIVE POSITIONS ===== */}
          {(activePage === 'open-positions' || activePage === 'all-trades') && (
            <div className="trade-management-page">
              <div className="dashboard-stats" style={{ marginBottom: '20px' }}>
                <div className="stat-card">
                  <div className="stat-icon">📊</div>
                  <div className="stat-info">
                    <span className="stat-value">{activeTradesSummary.total}</span>
                    <span className="stat-label">Total Open</span>
                  </div>
                </div>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}>
                  <div className="stat-icon">📈</div>
                  <div className="stat-info">
                    <span className="stat-value">{activeTradesSummary.hedging}</span>
                    <span className="stat-label">Hedging</span>
                  </div>
                </div>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' }}>
                  <div className="stat-icon">📉</div>
                  <div className="stat-info">
                    <span className="stat-value">{activeTradesSummary.netting}</span>
                    <span className="stat-label">Netting</span>
                  </div>
                </div>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
                  <div className="stat-icon">🎯</div>
                  <div className="stat-info">
                    <span className="stat-value">{activeTradesSummary.binary}</span>
                    <span className="stat-label">Binary</span>
                  </div>
                </div>
                <div className="stat-card" style={{ background: activeTradesSummary.totalUnrealizedPnL >= 0 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
                  <div className="stat-icon">💰</div>
                  <div className="stat-info">
                    <span className="stat-value">₹{activeTradesSummary.totalUnrealizedPnL?.toFixed(2)}</span>
                    <span className="stat-label">Unrealized P/L</span>
                  </div>
                </div>
              </div>

              <div className="page-header-actions">
                <div className="filters-row">
                  <input type="text" placeholder="Search by User ID..." value={activeTradesFilter.search}
                    onChange={(e) => setActiveTradesFilter(prev => ({ ...prev, search: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff', width: '200px' }} />
                  <input type="text" placeholder="Filter by symbol..." value={activeTradesFilter.symbol}
                    onChange={(e) => setActiveTradesFilter(prev => ({ ...prev, symbol: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff', width: '200px' }} />
                  <select value={activeTradesFilter.mode}
                    onChange={(e) => setActiveTradesFilter(prev => ({ ...prev, mode: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}>
                    <option value="all">All Modes</option>
                    <option value="hedging">Hedging</option>
                    <option value="netting">Netting</option>
                    <option value="binary">Binary</option>
                  </select>
                  <button onClick={fetchActiveTrades}
                    style={{ padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>Refresh</button>
                </div>
              </div>

              {activeTradesLoading ? (
                <div className="loading-spinner">Loading active positions...</div>
              ) : (
                <div className="table-card" style={{ marginTop: '20px' }}>
                  <h3>Active Positions ({activeTrades.length})</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>User ID</th>
                          <th>Symbol</th>
                          <th>Mode</th>
                          <th>Side</th>
                          <th>Volume</th>
                          <th>Entry Price</th>
                          <th>Current Price</th>
                          <th>P/L</th>
                          <th>Margin</th>
                          <th>Open Time</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeTrades.length === 0 ? (
                          <tr><td colSpan="11" style={{ textAlign: 'center', color: '#888' }}>No active positions found</td></tr>
                        ) : (
                          activeTrades.map((trade) => (
                            <tr key={trade._id}>
                              <td style={{ fontSize: '12px' }}>{trade.userId}</td>
                              <td><strong>{trade.symbol}</strong></td>
                              <td>
                                <span style={{
                                  padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                                  background: trade.mode === 'hedging' ? '#3b82f620' : trade.mode === 'netting' ? '#8b5cf620' : '#f59e0b20',
                                  color: trade.mode === 'hedging' ? '#3b82f6' : trade.mode === 'netting' ? '#8b5cf6' : '#f59e0b'
                                }}>{trade.mode?.toUpperCase()}</span>
                              </td>
                              <td className={trade.side === 'buy' || trade.side === 'up' ? 'text-green' : 'text-red'}>
                                {trade.side?.toUpperCase()}
                              </td>
                              <td>{trade.volume}</td>
                              <td>{trade.entryPrice?.toFixed(trade.symbol?.includes('JPY') ? 3 : 5)}</td>
                              <td>{trade.currentPrice?.toFixed(trade.symbol?.includes('JPY') ? 3 : 5) || '-'}</td>
                              <td className={(trade.profit || 0) >= 0 ? 'text-green' : 'text-red'}>
                                {(trade.profit || 0) >= 0 ? '+' : ''}{(trade.profit || 0).toFixed(2)}
                              </td>
                              <td>${(trade.marginUsed || 0).toFixed(2)}</td>
                              <td style={{ fontSize: '12px' }}>{trade.openTime ? new Date(trade.openTime).toLocaleString() : '-'}</td>
                              <td>
                                <button onClick={() => forceClosePosition(trade._id, trade.positionType)}
                                  style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}
                                  title="Force Close">✕ Close</button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== PENDING ORDERS ===== */}
          {activePage === 'pending-orders' && (
            <div className="trade-management-page">
              <div className="page-header-actions">
                <div className="filters-row">
                  <input type="text" placeholder="Search by User ID..." value={pendingOrdersFilter.search}
                    onChange={(e) => setPendingOrdersFilter(prev => ({ ...prev, search: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff', width: '200px' }} />
                  <input type="text" placeholder="Filter by symbol..." value={pendingOrdersFilter.symbol}
                    onChange={(e) => setPendingOrdersFilter(prev => ({ ...prev, symbol: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff', width: '200px' }} />
                  <button onClick={fetchPendingOrders}
                    style={{ padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>Refresh</button>
                </div>
              </div>

              {pendingOrdersLoading ? (
                <div className="loading-spinner">Loading pending orders...</div>
              ) : (
                <div className="table-card" style={{ marginTop: '20px' }}>
                  <h3>Pending Orders ({pendingOrders.length})</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>User ID</th>
                          <th>Symbol</th>
                          <th>Type</th>
                          <th>Side</th>
                          <th>Volume</th>
                          <th>Entry Price</th>
                          <th>SL</th>
                          <th>TP</th>
                          <th>Created</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingOrders.length === 0 ? (
                          <tr><td colSpan="11" style={{ textAlign: 'center', color: '#888' }}>No pending orders</td></tr>
                        ) : (
                          pendingOrders.map((order) => (
                            <tr key={order._id}>
                              <td style={{ fontSize: '12px' }}>{order.oderId}</td>
                              <td style={{ fontSize: '12px' }}>{order.userId}</td>
                              <td><strong>{order.symbol}</strong></td>
                              <td>
                                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: '#f59e0b20', color: '#f59e0b' }}>
                                  {order.orderType?.toUpperCase()}
                                </span>
                              </td>
                              <td className={order.side === 'buy' ? 'text-green' : 'text-red'}>{order.side?.toUpperCase()}</td>
                              <td>{order.volume}</td>
                              <td>{order.entryPrice?.toFixed(5)}</td>
                              <td>{order.stopLoss || '-'}</td>
                              <td>{order.takeProfit || '-'}</td>
                              <td style={{ fontSize: '12px' }}>{new Date(order.createdAt).toLocaleString()}</td>
                              <td>
                                <button onClick={() => cancelPendingOrder(order._id)}
                                  style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}
                                  title="Cancel Order">✕ Cancel</button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== ACTIVITY HISTORY ===== */}
          {(activePage === 'trade-history' || activePage === 'closed-positions') && (
            <div className="trade-management-page">
              <div className="page-header-actions">
                <div className="filters-row" style={{ flexWrap: 'wrap' }}>
                  <input type="text" placeholder="Search by User ID..." value={tradeHistoryFilter.search}
                    onChange={(e) => setTradeHistoryFilter(prev => ({ ...prev, search: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff', width: '200px' }} />
                  <input type="text" placeholder="Filter by symbol..." value={tradeHistoryFilter.symbol}
                    onChange={(e) => setTradeHistoryFilter(prev => ({ ...prev, symbol: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff', width: '200px' }} />
                  <select value={tradeHistoryFilter.mode}
                    onChange={(e) => setTradeHistoryFilter(prev => ({ ...prev, mode: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}>
                    <option value="all">All Modes</option>
                    <option value="hedging">Hedging</option>
                    <option value="netting">Netting</option>
                    <option value="binary">Binary</option>
                  </select>
                  <input type="date" value={tradeHistoryFilter.dateFrom}
                    onChange={(e) => setTradeHistoryFilter(prev => ({ ...prev, dateFrom: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }} />
                  <input type="date" value={tradeHistoryFilter.dateTo}
                    onChange={(e) => setTradeHistoryFilter(prev => ({ ...prev, dateTo: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }} />
                  <button onClick={() => fetchTradeHistory(1)}
                    style={{ padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>Search</button>
                </div>
              </div>

              <div className="dashboard-stats" style={{ marginTop: '15px', marginBottom: '15px' }}>
                <div className="stat-card">
                  <div className="stat-icon">📊</div>
                  <div className="stat-info">
                    <span className="stat-value">{tradeHistorySummary.totalTrades}</span>
                    <span className="stat-label">Total Positions</span>
                  </div>
                </div>
                <div className="stat-card" style={{ background: tradeHistorySummary.totalPnL >= 0 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
                  <div className="stat-icon">💰</div>
                  <div className="stat-info">
                    <span className="stat-value">₹{tradeHistorySummary.totalPnL?.toFixed(2)}</span>
                    <span className="stat-label">Total P/L</span>
                  </div>
                </div>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                  <div className="stat-icon">✅</div>
                  <div className="stat-info">
                    <span className="stat-value">{tradeHistorySummary.winningTrades}</span>
                    <span className="stat-label">Winning</span>
                  </div>
                </div>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
                  <div className="stat-icon">❌</div>
                  <div className="stat-info">
                    <span className="stat-value">{tradeHistorySummary.losingTrades}</span>
                    <span className="stat-label">Losing</span>
                  </div>
                </div>
              </div>

              {tradeHistoryLoading ? (
                <div className="loading-spinner">Loading activity history...</div>
              ) : (
                <>
                  <div className="table-card">
                    <h3>Closed Positions ({tradeHistoryPagination.total})</h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Position ID</th>
                            <th>User ID</th>
                            <th>Symbol</th>
                            <th>Mode</th>
                            <th>Side</th>
                            <th>Volume</th>
                            <th>Entry</th>
                            <th>Close</th>
                            <th>P/L</th>
                            <th>Remark</th>
                            <th>Closed At</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tradeHistory.length === 0 ? (
                            <tr><td colSpan="12" style={{ textAlign: 'center', color: '#888' }}>No activity history found</td></tr>
                          ) : (
                            tradeHistory.map((trade) => (
                              <tr key={trade._id}>
                                <td style={{ fontSize: '11px' }}>{trade.tradeId?.slice(-10)}</td>
                                <td style={{ fontSize: '12px' }}>{trade.userId}</td>
                                <td><strong>{trade.symbol}</strong></td>
                                <td>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                                    background: trade.mode === 'hedging' ? '#3b82f620' : trade.mode === 'netting' ? '#8b5cf620' : '#f59e0b20',
                                    color: trade.mode === 'hedging' ? '#3b82f6' : trade.mode === 'netting' ? '#8b5cf6' : '#f59e0b'
                                  }}>{trade.mode?.toUpperCase()}</span>
                                </td>
                                <td className={trade.side === 'buy' || trade.side === 'up' ? 'text-green' : 'text-red'}>
                                  {trade.side?.toUpperCase()}
                                </td>
                                <td>{trade.volume || trade.amount || '-'}</td>
                                <td>{trade.entryPrice?.toFixed(5)}</td>
                                <td>{trade.closePrice?.toFixed(5) || '-'}</td>
                                <td className={(trade.profit || 0) >= 0 ? 'text-green' : 'text-red'}>
                                  {(trade.profit || 0) >= 0 ? '+' : ''}{(trade.profit || 0).toFixed(2)}
                                </td>
                                <td>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                                    background: trade.remark === 'Admin' ? '#f59e0b20' : trade.remark === 'SL' ? '#ef444420' : trade.remark === 'TP' ? '#10b98120' : trade.remark === 'Stop Out' ? '#dc262620' : trade.remark === 'Auto Square-Off' ? '#8b5cf620' : trade.remark === 'Expiry' ? '#6366f120' : '#6b728020',
                                    color: trade.remark === 'Admin' ? '#f59e0b' : trade.remark === 'SL' ? '#ef4444' : trade.remark === 'TP' ? '#10b981' : trade.remark === 'Stop Out' ? '#dc2626' : trade.remark === 'Auto Square-Off' ? '#8b5cf6' : trade.remark === 'Expiry' ? '#6366f1' : '#9ca3af'
                                  }}>{trade.remark || trade.closedBy || 'User'}</span>
                                </td>
                                <td style={{ fontSize: '12px' }}>{trade.closedAt ? new Date(trade.closedAt).toLocaleString() : new Date(trade.executedAt).toLocaleString()}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {tradeHistoryPagination.pages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
                      <button onClick={() => fetchTradeHistory(tradeHistoryPagination.page - 1)}
                        disabled={tradeHistoryPagination.page <= 1}
                        style={{ padding: '8px 16px', borderRadius: '6px', background: tradeHistoryPagination.page <= 1 ? '#333' : '#3b82f6', color: '#fff', border: 'none', cursor: tradeHistoryPagination.page <= 1 ? 'not-allowed' : 'pointer' }}>Previous</button>
                      <span style={{ padding: '8px 16px', color: '#fff' }}>Page {tradeHistoryPagination.page} of {tradeHistoryPagination.pages}</span>
                      <button onClick={() => fetchTradeHistory(tradeHistoryPagination.page + 1)}
                        disabled={tradeHistoryPagination.page >= tradeHistoryPagination.pages}
                        style={{ padding: '8px 16px', borderRadius: '6px', background: tradeHistoryPagination.page >= tradeHistoryPagination.pages ? '#333' : '#3b82f6', color: '#fff', border: 'none', cursor: tradeHistoryPagination.page >= tradeHistoryPagination.pages ? 'not-allowed' : 'pointer' }}>Next</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ===== POSITION REPORTS ===== */}
          {activePage === 'trade-reports' && (
            <div className="trade-management-page">
              <div className="page-header-actions">
                <div className="filters-row">
                  <select value={tradeHistoryFilter.mode}
                    onChange={(e) => setTradeHistoryFilter(prev => ({ ...prev, mode: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}>
                    <option value="all">All Modes</option>
                    <option value="hedging">Hedging</option>
                    <option value="netting">Netting</option>
                    <option value="binary">Binary</option>
                  </select>
                  <input type="date" value={tradeHistoryFilter.dateFrom}
                    onChange={(e) => setTradeHistoryFilter(prev => ({ ...prev, dateFrom: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }} />
                  <input type="date" value={tradeHistoryFilter.dateTo}
                    onChange={(e) => setTradeHistoryFilter(prev => ({ ...prev, dateTo: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }} />
                </div>
              </div>

              {tradeHistoryLoading ? (
                <div className="loading-spinner">Loading position reports...</div>
              ) : (
                <>
                  <div className="dashboard-stats" style={{ marginTop: '20px' }}>
                    <div className="stat-card">
                      <div className="stat-icon">📊</div>
                      <div className="stat-info">
                        <span className="stat-value">{tradeHistorySummary.totalTrades}</span>
                        <span className="stat-label">Total Closed Positions</span>
                      </div>
                    </div>
                    <div className="stat-card" style={{ background: tradeHistorySummary.totalPnL >= 0 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
                      <div className="stat-icon">💰</div>
                      <div className="stat-info">
                        <span className="stat-value">₹{tradeHistorySummary.totalPnL?.toFixed(2)}</span>
                        <span className="stat-label">Total Realized P/L</span>
                      </div>
                    </div>
                    <div className="stat-card" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}>
                      <div className="stat-icon">🏆</div>
                      <div className="stat-info">
                        <span className="stat-value">{tradeHistorySummary.winRate}%</span>
                        <span className="stat-label">Win Rate</span>
                      </div>
                    </div>
                    <div className="stat-card" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                      <div className="stat-icon">✅</div>
                      <div className="stat-info">
                        <span className="stat-value">{tradeHistorySummary.winningTrades}</span>
                        <span className="stat-label">Winners</span>
                      </div>
                    </div>
                    <div className="stat-card" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
                      <div className="stat-icon">❌</div>
                      <div className="stat-info">
                        <span className="stat-value">{tradeHistorySummary.losingTrades}</span>
                        <span className="stat-label">Losers</span>
                      </div>
                    </div>
                  </div>

                  <div className="dashboard-charts" style={{ marginTop: '20px' }}>
                    <div className="chart-card">
                      <h3>Performance Overview</h3>
                      <div style={{ padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #222' }}>
                          <span style={{ color: '#888' }}>Total Positions</span>
                          <span style={{ color: '#fff', fontWeight: 'bold' }}>{tradeHistorySummary.totalTrades}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #222' }}>
                          <span style={{ color: '#888' }}>Win Rate</span>
                          <span style={{ color: '#10b981', fontWeight: 'bold' }}>{tradeHistorySummary.winRate}%</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #222' }}>
                          <span style={{ color: '#888' }}>Net P/L</span>
                          <span style={{ color: tradeHistorySummary.totalPnL >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                            ${tradeHistorySummary.totalPnL?.toFixed(2)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #222' }}>
                          <span style={{ color: '#888' }}>Avg P/L per Position</span>
                          <span style={{ color: tradeHistorySummary.totalTrades > 0 ? (tradeHistorySummary.totalPnL / tradeHistorySummary.totalTrades) >= 0 ? '#10b981' : '#ef4444' : '#888', fontWeight: 'bold' }}>
                            ${tradeHistorySummary.totalTrades > 0 ? (tradeHistorySummary.totalPnL / tradeHistorySummary.totalTrades).toFixed(2) : '0.00'}
                          </span>
                        </div>
                        {/* Win Rate Bar */}
                        <div style={{ marginTop: '15px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <span style={{ color: '#10b981', fontSize: '12px' }}>Wins ({tradeHistorySummary.winningTrades})</span>
                            <span style={{ color: '#ef4444', fontSize: '12px' }}>Losses ({tradeHistorySummary.losingTrades})</span>
                          </div>
                          <div style={{ height: '12px', background: '#ef444440', borderRadius: '6px', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', background: '#10b981', borderRadius: '6px', transition: 'width 0.5s',
                              width: tradeHistorySummary.totalTrades > 0 ? `${(tradeHistorySummary.winningTrades / tradeHistorySummary.totalTrades * 100)}%` : '0%'
                            }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="chart-card">
                      <h3>Top Active Symbols</h3>
                      <div style={{ padding: '20px' }}>
                        {tradeHistorySummary.topSymbols?.length === 0 ? (
                          <p style={{ color: '#888' }}>No data available</p>
                        ) : (
                          tradeHistorySummary.topSymbols?.map((sym, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #222' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ background: '#3b82f620', color: '#3b82f6', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                  #{i + 1}
                                </span>
                                <strong style={{ color: '#fff' }}>{sym.symbol}</strong>
                              </div>
                              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                <span style={{ color: '#888', fontSize: '12px' }}>{sym.count} positions</span>
                                <span style={{ color: sym.pnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold', fontSize: '13px' }}>
                                  {sym.pnl >= 0 ? '+' : ''}${sym.pnl?.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ===== RISK MANAGEMENT ===== */}
          {activePage === 'risk-management' && (
            <RiskManagement />
          )}

          {/* ===== TRANSACTION HISTORY ===== */}
          {(activePage === 'transaction-history' || activePage === 'fund-transfers') && (
            <div className="trade-management-page">
              <div className="dashboard-stats" style={{ marginBottom: '20px' }}>
                <div className="stat-card">
                  <div className="stat-icon">📋</div>
                  <div className="stat-info">
                    <span className="stat-value">{txHistorySummary.total}</span>
                    <span className="stat-label">Total Transactions</span>
                  </div>
                </div>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                  <div className="stat-icon">💵</div>
                  <div className="stat-info">
                    <span className="stat-value">₹{txHistorySummary.totalDeposits?.toFixed(2)}</span>
                    <span className="stat-label">Deposits ({txHistorySummary.depositCount})</span>
                  </div>
                </div>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
                  <div className="stat-icon">💸</div>
                  <div className="stat-info">
                    <span className="stat-value">₹{txHistorySummary.totalWithdrawals?.toFixed(2)}</span>
                    <span className="stat-label">Withdrawals ({txHistorySummary.withdrawalCount})</span>
                  </div>
                </div>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
                  <div className="stat-icon">⏳</div>
                  <div className="stat-info">
                    <span className="stat-value">{txHistorySummary.pendingCount}</span>
                    <span className="stat-label">Pending (${txHistorySummary.pendingAmount?.toFixed(2)})</span>
                  </div>
                </div>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}>
                  <div className="stat-icon">✅</div>
                  <div className="stat-info">
                    <span className="stat-value">{txHistorySummary.approvedCount}</span>
                    <span className="stat-label">Approved</span>
                  </div>
                </div>
              </div>

              <div className="page-header-actions">
                <div className="filters-row" style={{ flexWrap: 'wrap' }}>
                  <input type="text" placeholder="Search by User ID..." value={txHistoryFilter.search}
                    onChange={(e) => setTxHistoryFilter(prev => ({ ...prev, search: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff', width: '180px' }} />
                  <select value={txHistoryFilter.type}
                    onChange={(e) => setTxHistoryFilter(prev => ({ ...prev, type: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}>
                    <option value="">All Types</option>
                    <option value="deposit">Deposit</option>
                    <option value="withdrawal">Withdrawal</option>
                  </select>
                  <select value={txHistoryFilter.status}
                    onChange={(e) => setTxHistoryFilter(prev => ({ ...prev, status: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}>
                    <option value="">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="approved">Approved</option>
                    <option value="completed">Completed</option>
                    <option value="rejected">Rejected</option>
                    <option value="failed">Failed</option>
                  </select>
                  <select value={txHistoryFilter.paymentMethod}
                    onChange={(e) => setTxHistoryFilter(prev => ({ ...prev, paymentMethod: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}>
                    <option value="">All Methods</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="upi">UPI</option>
                    <option value="crypto">Crypto</option>
                    <option value="card">Card</option>
                    <option value="wallet">Wallet</option>
                  </select>
                  <input type="date" value={txHistoryFilter.dateFrom}
                    onChange={(e) => setTxHistoryFilter(prev => ({ ...prev, dateFrom: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }} />
                  <input type="date" value={txHistoryFilter.dateTo}
                    onChange={(e) => setTxHistoryFilter(prev => ({ ...prev, dateTo: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }} />
                </div>
              </div>

              {txHistoryLoading ? (
                <div className="loading-spinner">Loading transactions...</div>
              ) : (
                <>
                  <div className="table-card" style={{ marginTop: '20px' }}>
                    <h3>Transactions ({txHistoryPagination.total})</h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>User ID</th>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Method</th>
                            <th>Status</th>
                            <th>Reference</th>
                            <th>Date</th>
                            <th>Processed By</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {txHistory.length === 0 ? (
                            <tr><td colSpan="9" style={{ textAlign: 'center', color: '#888' }}>No transactions found</td></tr>
                          ) : (
                            txHistory.map((tx) => (
                              <tr key={tx._id}>
                                <td style={{ fontSize: '12px' }}>{tx.oderId}</td>
                                <td>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                                    background: tx.type === 'deposit' ? '#10b98120' : '#ef444420',
                                    color: tx.type === 'deposit' ? '#10b981' : '#ef4444'
                                  }}>{tx.type?.toUpperCase()}</span>
                                </td>
                                <td style={{ fontWeight: 'bold', color: tx.type === 'deposit' ? '#10b981' : '#ef4444' }}>
                                  {tx.type === 'deposit' ? '+' : '-'}${tx.amount?.toFixed(2)}
                                </td>
                                <td style={{ fontSize: '12px' }}>
                                  <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', background: '#3b82f620', color: '#3b82f6' }}>
                                    {tx.paymentMethod?.replace('_', ' ').toUpperCase()}
                                  </span>
                                </td>
                                <td>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                                    background: tx.status === 'approved' || tx.status === 'completed' ? '#10b98120' : tx.status === 'pending' ? '#f59e0b20' : tx.status === 'rejected' ? '#ef444420' : '#6b728020',
                                    color: tx.status === 'approved' || tx.status === 'completed' ? '#10b981' : tx.status === 'pending' ? '#f59e0b' : tx.status === 'rejected' ? '#ef4444' : '#6b7280'
                                  }}>{tx.status?.toUpperCase()}</span>
                                </td>
                                <td style={{ fontSize: '11px' }}>{tx.paymentDetails?.referenceNumber || tx.paymentDetails?.utrNumber || tx.paymentDetails?.txHash || '-'}</td>
                                <td style={{ fontSize: '12px' }}>{new Date(tx.createdAt).toLocaleString()}</td>
                                <td style={{ fontSize: '11px' }}>{tx.processedBy || '-'}</td>
                                <td>
                                  {tx.status === 'pending' && (
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                      <button onClick={() => processTransaction(tx._id, 'approved')}
                                        style={{ padding: '3px 8px', fontSize: '10px', borderRadius: '4px', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer' }}>✓</button>
                                      <button onClick={() => processTransaction(tx._id, 'rejected')}
                                        style={{ padding: '3px 8px', fontSize: '10px', borderRadius: '4px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>✕</button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {txHistoryPagination.pages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
                      <button onClick={() => fetchTxHistory(txHistoryPagination.page - 1)}
                        disabled={txHistoryPagination.page <= 1}
                        style={{ padding: '8px 16px', borderRadius: '6px', background: txHistoryPagination.page <= 1 ? '#333' : '#3b82f6', color: '#fff', border: 'none', cursor: txHistoryPagination.page <= 1 ? 'not-allowed' : 'pointer' }}>Previous</button>
                      <span style={{ padding: '8px 16px', color: '#fff' }}>Page {txHistoryPagination.page} of {txHistoryPagination.pages}</span>
                      <button onClick={() => fetchTxHistory(txHistoryPagination.page + 1)}
                        disabled={txHistoryPagination.page >= txHistoryPagination.pages}
                        style={{ padding: '8px 16px', borderRadius: '6px', background: txHistoryPagination.page >= txHistoryPagination.pages ? '#333' : '#3b82f6', color: '#fff', border: 'none', cursor: txHistoryPagination.page >= txHistoryPagination.pages ? 'not-allowed' : 'pointer' }}>Next</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ===== RECONCILIATION ===== */}
          {activePage === 'reconciliation' && (
            <div className="trade-management-page">
              <div className="page-header-actions">
                <div className="filters-row">
                  <input type="date" value={reconFilter.dateFrom}
                    onChange={(e) => setReconFilter(prev => ({ ...prev, dateFrom: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }} />
                  <input type="date" value={reconFilter.dateTo}
                    onChange={(e) => setReconFilter(prev => ({ ...prev, dateTo: e.target.value }))}
                    style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }} />
                  <button onClick={fetchReconciliation}
                    style={{ padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>Refresh</button>
                </div>
              </div>

              {reconLoading ? (
                <div className="loading-spinner">Loading reconciliation data...</div>
              ) : reconData ? (
                <>
                  <div className="dashboard-stats" style={{ marginTop: '20px', marginBottom: '20px' }}>
                    <div className="stat-card">
                      <div className="stat-icon">📊</div>
                      <div className="stat-info">
                        <span className="stat-value">{reconData.summary?.totalTransactions}</span>
                        <span className="stat-label">Total Transactions</span>
                      </div>
                    </div>
                    <div className="stat-card" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                      <div className="stat-icon">💵</div>
                      <div className="stat-info">
                        <span className="stat-value">₹{reconData.summary?.totalDepositsApproved?.toFixed(2)}</span>
                        <span className="stat-label">Approved Deposits</span>
                      </div>
                    </div>
                    <div className="stat-card" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
                      <div className="stat-icon">💸</div>
                      <div className="stat-info">
                        <span className="stat-value">₹{reconData.summary?.totalWithdrawalsApproved?.toFixed(2)}</span>
                        <span className="stat-label">Approved Withdrawals</span>
                      </div>
                    </div>
                    <div className="stat-card" style={{ background: reconData.summary?.netFlow >= 0 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
                      <div className="stat-icon">📈</div>
                      <div className="stat-info">
                        <span className="stat-value">₹{reconData.summary?.netFlow?.toFixed(2)}</span>
                        <span className="stat-label">Net Flow</span>
                      </div>
                    </div>
                    <div className="stat-card" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
                      <div className="stat-icon">⏳</div>
                      <div className="stat-info">
                        <span className="stat-value">{reconData.summary?.pendingCount} (${reconData.summary?.totalPending?.toFixed(2)})</span>
                        <span className="stat-label">Pending</span>
                      </div>
                    </div>
                  </div>

                  <div className="dashboard-charts" style={{ marginBottom: '20px' }}>
                    <div className="chart-card">
                      <h3>Status Distribution</h3>
                      <div style={{ padding: '20px' }}>
                        {reconData.statusDistribution?.map((s, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #222' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{
                                padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                                background: s.status === 'approved' || s.status === 'completed' ? '#10b98120' : s.status === 'pending' ? '#f59e0b20' : s.status === 'rejected' ? '#ef444420' : '#6b728020',
                                color: s.status === 'approved' || s.status === 'completed' ? '#10b981' : s.status === 'pending' ? '#f59e0b' : s.status === 'rejected' ? '#ef4444' : '#6b7280'
                              }}>{s.status?.toUpperCase()}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                              <span style={{ color: '#888', fontSize: '12px' }}>{s.count} txns</span>
                              <span style={{ color: '#fff', fontWeight: 'bold' }}>₹{s.amount?.toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="chart-card">
                      <h3>By Payment Method</h3>
                      <div style={{ padding: '20px' }}>
                        {reconData.byMethod?.length === 0 ? (
                          <p style={{ color: '#888' }}>No data</p>
                        ) : (
                          reconData.byMethod?.map((m, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #222' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ background: '#3b82f620', color: '#3b82f6', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                  #{i + 1}
                                </span>
                                <strong style={{ color: '#fff' }}>{m.method?.replace('_', ' ').toUpperCase()}</strong>
                              </div>
                              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                <span style={{ color: '#888', fontSize: '12px' }}>{m.count} txns</span>
                                <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '13px' }}>₹{m.amount?.toFixed(2)}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="table-card">
                    <h3>Daily Breakdown</h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Deposits</th>
                            <th>Deposit Count</th>
                            <th>Withdrawals</th>
                            <th>Withdrawal Count</th>
                            <th>Net Flow</th>
                            <th>Pending</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reconData.dailyBreakdown?.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', color: '#888' }}>No data for selected period</td></tr>
                          ) : (
                            reconData.dailyBreakdown?.map((day, i) => (
                              <tr key={i}>
                                <td><strong>{day.date}</strong></td>
                                <td className="text-green">₹{day.deposits?.toFixed(2)}</td>
                                <td>{day.depositCount}</td>
                                <td className="text-red">₹{day.withdrawals?.toFixed(2)}</td>
                                <td>{day.withdrawalCount}</td>
                                <td className={(day.deposits - day.withdrawals) >= 0 ? 'text-green' : 'text-red'}>
                                  {(day.deposits - day.withdrawals) >= 0 ? '+' : ''}${(day.deposits - day.withdrawals).toFixed(2)}
                                </td>
                                <td style={{ color: '#f59e0b' }}>{day.pending > 0 ? `₹${day.pending.toFixed(2)}` : '-'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>No reconciliation data available</div>
              )}
            </div>
          )}

          {/* ===== SPREAD SETTINGS ===== */}
          {activePage === 'spread-settings' && (
            <div className="trade-management-page">
              <div className="page-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ color: '#fff', margin: 0 }}>📊 Spread Settings (per Symbol)</h3>
                <button onClick={() => openChargeModal('spreads', 'add')}
                  style={{ padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Spread</button>
              </div>
              {chargeLoading ? <div className="loading-spinner">Loading...</div> : (
                <div className="table-card">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table">
                      <thead><tr><th>Symbol</th><th>Type</th><th>Spread (Pips)</th><th>Markup (Pips)</th><th>Min Spread</th><th>Max Spread</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {chargeData.spreads.length === 0 ? (
                          <tr><td colSpan="8" style={{ textAlign: 'center', color: '#888' }}>No spread settings configured. Click "Add Spread" to create one.</td></tr>
                        ) : chargeData.spreads.map(s => (
                          <tr key={s._id}>
                            <td><strong>{s.symbol}</strong></td>
                            <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: s.spreadType === 'fixed' ? '#3b82f620' : '#f59e0b20', color: s.spreadType === 'fixed' ? '#3b82f6' : '#f59e0b' }}>{s.spreadType?.toUpperCase()}</span></td>
                            <td>{s.spreadPips}</td>
                            <td>{s.markupPips}</td>
                            <td>{s.minSpread}</td>
                            <td>{s.maxSpread}</td>
                            <td><span style={{ color: s.isActive ? '#10b981' : '#ef4444' }}>{s.isActive ? '● Active' : '● Inactive'}</span></td>
                            <td>
                              <button onClick={() => openChargeModal('spreads', 'edit', s)} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', marginRight: '4px' }}>Edit</button>
                              <button onClick={() => deleteChargeSetting('spreads', s._id)} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== COMMISSION SETTINGS ===== */}
          {activePage === 'commission-settings' && (
            <div className="trade-management-page">
              <div className="page-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ color: '#fff', margin: 0 }}>💱 Commission Settings (per Symbol)</h3>
                <button onClick={() => openChargeModal('commissions', 'add')}
                  style={{ padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Commission</button>
              </div>
              {chargeLoading ? <div className="loading-spinner">Loading...</div> : (
                <div className="table-card">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table">
                      <thead><tr><th>Symbol</th><th>Type</th><th>Open Commission</th><th>Close Commission</th><th>Min</th><th>Max</th><th>Currency</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {chargeData.commissions.length === 0 ? (
                          <tr><td colSpan="9" style={{ textAlign: 'center', color: '#888' }}>No commission settings configured.</td></tr>
                        ) : chargeData.commissions.map(c => (
                          <tr key={c._id}>
                            <td><strong>{c.symbol}</strong></td>
                            <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: '#8b5cf620', color: '#8b5cf6' }}>{c.commissionType?.toUpperCase()}</span></td>
                            <td>₹{c.openCommission?.toFixed(2)}</td>
                            <td>₹{c.closeCommission?.toFixed(2)}</td>
                            <td>₹{c.minCommission?.toFixed(2)}</td>
                            <td>{c.maxCommission > 0 ? `₹${c.maxCommission?.toFixed(2)}` : 'No limit'}</td>
                            <td>{c.currency}</td>
                            <td><span style={{ color: c.isActive ? '#10b981' : '#ef4444' }}>{c.isActive ? '● Active' : '● Inactive'}</span></td>
                            <td>
                              <button onClick={() => openChargeModal('commissions', 'edit', c)} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', marginRight: '4px' }}>Edit</button>
                              <button onClick={() => deleteChargeSetting('commissions', c._id)} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== SWAP SETTINGS ===== */}
          {activePage === 'swap-settings' && (
            <div className="trade-management-page">
              <div className="page-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ color: '#fff', margin: 0 }}>🔄 Swap Settings (Overnight Rates)</h3>
                <button onClick={() => openChargeModal('swaps', 'add')}
                  style={{ padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Swap</button>
              </div>
              {chargeLoading ? <div className="loading-spinner">Loading...</div> : (
                <div className="table-card">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table">
                      <thead><tr><th>Symbol</th><th>Swap Type</th><th>Swap Long</th><th>Swap Short</th><th>Triple Day</th><th>Swap-Free</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {chargeData.swaps.length === 0 ? (
                          <tr><td colSpan="8" style={{ textAlign: 'center', color: '#888' }}>No swap settings configured.</td></tr>
                        ) : chargeData.swaps.map(sw => (
                          <tr key={sw._id}>
                            <td><strong>{sw.symbol}</strong></td>
                            <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: '#06b6d420', color: '#06b6d4' }}>{sw.swapType?.toUpperCase()}</span></td>
                            <td style={{ color: sw.swapLong >= 0 ? '#10b981' : '#ef4444' }}>{sw.swapLong}</td>
                            <td style={{ color: sw.swapShort >= 0 ? '#10b981' : '#ef4444' }}>{sw.swapShort}</td>
                            <td>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][sw.tripleSwapDay]}</td>
                            <td>{sw.swapFreeEnabled ? '✅ Yes' : '❌ No'}</td>
                            <td><span style={{ color: sw.isActive ? '#10b981' : '#ef4444' }}>{sw.isActive ? '● Active' : '● Inactive'}</span></td>
                            <td>
                              <button onClick={() => openChargeModal('swaps', 'edit', sw)} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', marginRight: '4px' }}>Edit</button>
                              <button onClick={() => deleteChargeSetting('swaps', sw._id)} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== MARGIN SETTINGS ===== */}
          {activePage === 'margin-settings' && (
            <div className="trade-management-page">
              <div className="page-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ color: '#fff', margin: 0 }}>🛡️ Margin Settings (per Symbol)</h3>
                <button onClick={() => openChargeModal('margins', 'add')}
                  style={{ padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Margin Rule</button>
              </div>
              {chargeLoading ? <div className="loading-spinner">Loading...</div> : (
                <div className="table-card">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table">
                      <thead><tr><th>Symbol</th><th>Mode</th><th>Initial %</th><th>Maintenance %</th><th>Hedged %</th><th>Margin Call</th><th>Stop Out</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {chargeData.margins.length === 0 ? (
                          <tr><td colSpan="9" style={{ textAlign: 'center', color: '#888' }}>No margin settings configured.</td></tr>
                        ) : chargeData.margins.map(m => (
                          <tr key={m._id}>
                            <td><strong>{m.symbol}</strong></td>
                            <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: '#f59e0b20', color: '#f59e0b' }}>{m.marginMode?.toUpperCase()}</span></td>
                            <td>{m.initialMarginRate}%</td>
                            <td>{m.maintenanceMarginRate}%</td>
                            <td>{m.hedgedMarginRate}%</td>
                            <td style={{ color: '#f59e0b' }}>{m.marginCallLevel}%</td>
                            <td style={{ color: '#ef4444' }}>{m.stopOutLevel}%</td>
                            <td><span style={{ color: m.isActive ? '#10b981' : '#ef4444' }}>{m.isActive ? '● Active' : '● Inactive'}</span></td>
                            <td>
                              <button onClick={() => openChargeModal('margins', 'edit', m)} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', marginRight: '4px' }}>Edit</button>
                              <button onClick={() => deleteChargeSetting('margins', m._id)} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== LEVERAGE SETTINGS ===== */}
          {activePage === 'leverage-settings' && (
            <div className="trade-management-page">
              <div className="page-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ color: '#fff', margin: 0 }}>⚡ Leverage Settings (Groups)</h3>
                <button onClick={() => openChargeModal('leverages', 'add')}
                  style={{ padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Leverage Group</button>
              </div>
              {chargeLoading ? <div className="loading-spinner">Loading...</div> : (
                <div className="table-card">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table">
                      <thead><tr><th>Group Name</th><th>Max Leverage</th><th>Symbol Overrides</th><th>Default</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {chargeData.leverages.length === 0 ? (
                          <tr><td colSpan="6" style={{ textAlign: 'center', color: '#888' }}>No leverage groups configured.</td></tr>
                        ) : chargeData.leverages.map(l => (
                          <tr key={l._id}>
                            <td><strong>{l.groupName}</strong></td>
                            <td style={{ fontWeight: 'bold', color: '#3b82f6' }}>1:{l.maxLeverage}</td>
                            <td>
                              {l.symbolOverrides?.length > 0 ? l.symbolOverrides.map((o, i) => (
                                <span key={i} style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', background: '#1a1a1a', color: '#888', marginRight: '4px' }}>{o.symbol}: 1:{o.maxLeverage}</span>
                              )) : <span style={{ color: '#666' }}>None</span>}
                            </td>
                            <td>{l.isDefault ? '⭐ Yes' : 'No'}</td>
                            <td><span style={{ color: l.isActive ? '#10b981' : '#ef4444' }}>{l.isActive ? '● Active' : '● Inactive'}</span></td>
                            <td>
                              <button onClick={() => openChargeModal('leverages', 'edit', l)} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', marginRight: '4px' }}>Edit</button>
                              <button onClick={() => deleteChargeSetting('leverages', l._id)} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== FEE STRUCTURE ===== */}
          {activePage === 'fee-structure' && (
            <div className="trade-management-page">
              <div className="page-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ color: '#fff', margin: 0 }}>🏷️ Fee Structure (Platform Fees)</h3>
                <button onClick={() => openChargeModal('fees', 'add')}
                  style={{ padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Fee</button>
              </div>
              {chargeLoading ? <div className="loading-spinner">Loading...</div> : (
                <div className="table-card">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table">
                      <thead><tr><th>Fee Name</th><th>Type</th><th>Charge</th><th>Amount/Rate</th><th>Min</th><th>Max</th><th>Frequency</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {chargeData.fees.length === 0 ? (
                          <tr><td colSpan="9" style={{ textAlign: 'center', color: '#888' }}>No fees configured.</td></tr>
                        ) : chargeData.fees.map(f => (
                          <tr key={f._id}>
                            <td><strong>{f.feeName}</strong></td>
                            <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: '#ec489920', color: '#ec4899' }}>{f.feeType?.toUpperCase()}</span></td>
                            <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: f.chargeType === 'fixed' ? '#3b82f620' : '#f59e0b20', color: f.chargeType === 'fixed' ? '#3b82f6' : '#f59e0b' }}>{f.chargeType?.toUpperCase()}</span></td>
                            <td style={{ fontWeight: 'bold' }}>{f.chargeType === 'fixed' ? `₹${f.amount?.toFixed(2)}` : `${f.percentageRate}%`}</td>
                            <td>₹{f.minAmount?.toFixed(2)}</td>
                            <td>{f.maxAmount > 0 ? `₹${f.maxAmount.toFixed(2)}` : 'No limit'}</td>
                            <td style={{ fontSize: '11px' }}>{f.frequency?.toUpperCase()}</td>
                            <td><span style={{ color: f.isActive ? '#10b981' : '#ef4444' }}>{f.isActive ? '● Active' : '● Inactive'}</span></td>
                            <td>
                              <button onClick={() => openChargeModal('fees', 'edit', f)} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', marginRight: '4px' }}>Edit</button>
                              <button onClick={() => deleteChargeSetting('fees', f._id)} style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== CHARGE MANAGEMENT MODAL ===== */}
          {chargeModal.open && (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
              <div style={{ background: '#1a1a2e', borderRadius: '16px', padding: '30px', width: '500px', maxHeight: '80vh', overflowY: 'auto', border: '1px solid #333' }}>
                <h3 style={{ color: '#fff', marginBottom: '20px' }}>{chargeModal.mode === 'edit' ? 'Edit' : 'Add'} {chargeModal.type?.replace(/s$/, '')} Setting</h3>

                {/* Spread fields */}
                {chargeModal.type === 'spreads' && (<>
                  <div style={{ marginBottom: '12px' }}><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Symbol *</label><input value={chargeForm.symbol || ''} onChange={e => setChargeForm(p => ({ ...p, symbol: e.target.value.toUpperCase() }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} placeholder="e.g. EURUSD" /></div>
                  <div style={{ marginBottom: '12px' }}><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Spread Type</label><select value={chargeForm.spreadType || 'fixed'} onChange={e => setChargeForm(p => ({ ...p, spreadType: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }}><option value="fixed">Fixed</option><option value="floating">Floating</option></select></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Spread (Pips)</label><input type="number" value={chargeForm.spreadPips ?? 0} onChange={e => setChargeForm(p => ({ ...p, spreadPips: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Markup (Pips)</label><input type="number" value={chargeForm.markupPips ?? 0} onChange={e => setChargeForm(p => ({ ...p, markupPips: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Min Spread</label><input type="number" value={chargeForm.minSpread ?? 0} onChange={e => setChargeForm(p => ({ ...p, minSpread: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Max Spread</label><input type="number" value={chargeForm.maxSpread ?? 100} onChange={e => setChargeForm(p => ({ ...p, maxSpread: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                  </div>
                  <div style={{ marginBottom: '12px' }}><label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', cursor: 'pointer' }}><input type="checkbox" checked={chargeForm.isActive !== false} onChange={e => setChargeForm(p => ({ ...p, isActive: e.target.checked }))} /> Active</label></div>
                </>)}

                {/* Commission fields */}
                {chargeModal.type === 'commissions' && (<>
                  <div style={{ marginBottom: '12px' }}><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Symbol *</label><input value={chargeForm.symbol || ''} onChange={e => setChargeForm(p => ({ ...p, symbol: e.target.value.toUpperCase() }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} placeholder="e.g. EURUSD" /></div>
                  <div style={{ marginBottom: '12px' }}><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Commission Type</label><select value={chargeForm.commissionType || 'per-lot'} onChange={e => setChargeForm(p => ({ ...p, commissionType: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }}><option value="per-lot">Per Lot</option><option value="per-trade">Per Position</option><option value="percentage">Percentage</option></select></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Open Commission</label><input type="number" step="0.01" value={chargeForm.openCommission ?? 0} onChange={e => setChargeForm(p => ({ ...p, openCommission: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Close Commission</label><input type="number" step="0.01" value={chargeForm.closeCommission ?? 0} onChange={e => setChargeForm(p => ({ ...p, closeCommission: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Min Commission</label><input type="number" step="0.01" value={chargeForm.minCommission ?? 0} onChange={e => setChargeForm(p => ({ ...p, minCommission: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Max Commission</label><input type="number" step="0.01" value={chargeForm.maxCommission ?? 0} onChange={e => setChargeForm(p => ({ ...p, maxCommission: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Currency</label><input value={chargeForm.currency || 'USD'} onChange={e => setChargeForm(p => ({ ...p, currency: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                  </div>
                  <div style={{ marginBottom: '12px' }}><label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', cursor: 'pointer' }}><input type="checkbox" checked={chargeForm.isActive !== false} onChange={e => setChargeForm(p => ({ ...p, isActive: e.target.checked }))} /> Active</label></div>
                </>)}

                {/* Swap fields */}
                {chargeModal.type === 'swaps' && (<>
                  <div style={{ marginBottom: '12px' }}><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Symbol *</label><input value={chargeForm.symbol || ''} onChange={e => setChargeForm(p => ({ ...p, symbol: e.target.value.toUpperCase() }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} placeholder="e.g. EURUSD" /></div>
                  <div style={{ marginBottom: '12px' }}><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Swap Type</label><select value={chargeForm.swapType || 'points'} onChange={e => setChargeForm(p => ({ ...p, swapType: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }}><option value="points">Points</option><option value="percentage">Percentage</option><option value="money">Money</option></select></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Swap Long</label><input type="number" step="0.01" value={chargeForm.swapLong ?? 0} onChange={e => setChargeForm(p => ({ ...p, swapLong: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Swap Short</label><input type="number" step="0.01" value={chargeForm.swapShort ?? 0} onChange={e => setChargeForm(p => ({ ...p, swapShort: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                  </div>
                  <div style={{ marginBottom: '12px' }}><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Triple Swap Day</label><select value={chargeForm.tripleSwapDay ?? 3} onChange={e => setChargeForm(p => ({ ...p, tripleSwapDay: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }}><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select></div>
                  <div style={{ display: 'flex', gap: '15px', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', cursor: 'pointer' }}><input type="checkbox" checked={chargeForm.swapFreeEnabled || false} onChange={e => setChargeForm(p => ({ ...p, swapFreeEnabled: e.target.checked }))} /> Swap-Free (Islamic)</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', cursor: 'pointer' }}><input type="checkbox" checked={chargeForm.isActive !== false} onChange={e => setChargeForm(p => ({ ...p, isActive: e.target.checked }))} /> Active</label>
                  </div>
                </>)}

                {/* Margin fields */}
                {chargeModal.type === 'margins' && (<>
                  <div style={{ marginBottom: '12px' }}><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Symbol *</label><input value={chargeForm.symbol || ''} onChange={e => setChargeForm(p => ({ ...p, symbol: e.target.value.toUpperCase() }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} placeholder="e.g. EURUSD" /></div>
                  <div style={{ marginBottom: '12px' }}><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Margin Mode</label><select value={chargeForm.marginMode || 'percentage'} onChange={e => setChargeForm(p => ({ ...p, marginMode: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }}><option value="percentage">Percentage</option><option value="fixed">Fixed</option><option value="calculated">Calculated</option></select></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Initial Margin %</label><input type="number" value={chargeForm.initialMarginRate ?? 100} onChange={e => setChargeForm(p => ({ ...p, initialMarginRate: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Maintenance %</label><input type="number" value={chargeForm.maintenanceMarginRate ?? 50} onChange={e => setChargeForm(p => ({ ...p, maintenanceMarginRate: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Hedged Margin %</label><input type="number" value={chargeForm.hedgedMarginRate ?? 50} onChange={e => setChargeForm(p => ({ ...p, hedgedMarginRate: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Margin Call Level %</label><input type="number" value={chargeForm.marginCallLevel ?? 100} onChange={e => setChargeForm(p => ({ ...p, marginCallLevel: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Stop Out Level %</label><input type="number" value={chargeForm.stopOutLevel ?? 50} onChange={e => setChargeForm(p => ({ ...p, stopOutLevel: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                  </div>
                  <div style={{ marginBottom: '12px' }}><label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', cursor: 'pointer' }}><input type="checkbox" checked={chargeForm.isActive !== false} onChange={e => setChargeForm(p => ({ ...p, isActive: e.target.checked }))} /> Active</label></div>
                </>)}

                {/* Leverage fields */}
                {chargeModal.type === 'leverages' && (<>
                  <div style={{ marginBottom: '12px' }}><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Group Name *</label><input value={chargeForm.groupName || ''} onChange={e => setChargeForm(p => ({ ...p, groupName: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} placeholder="e.g. Standard, VIP, Micro" /></div>
                  <div style={{ marginBottom: '12px' }}><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Max Leverage</label><select value={chargeForm.maxLeverage || 100} onChange={e => setChargeForm(p => ({ ...p, maxLeverage: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }}>{[1, 2, 5, 10, 25, 50, 100, 200, 300, 400, 500, 1000].map(v => <option key={v} value={v}>1:{v}</option>)}</select></div>
                  <div style={{ display: 'flex', gap: '15px', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', cursor: 'pointer' }}><input type="checkbox" checked={chargeForm.isDefault || false} onChange={e => setChargeForm(p => ({ ...p, isDefault: e.target.checked }))} /> Default Group</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', cursor: 'pointer' }}><input type="checkbox" checked={chargeForm.isActive !== false} onChange={e => setChargeForm(p => ({ ...p, isActive: e.target.checked }))} /> Active</label>
                  </div>
                </>)}

                {/* Fee fields */}
                {chargeModal.type === 'fees' && (<>
                  <div style={{ marginBottom: '12px' }}><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Fee Name *</label><input value={chargeForm.feeName || ''} onChange={e => setChargeForm(p => ({ ...p, feeName: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} placeholder="e.g. Account Maintenance Fee" /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Fee Type</label><select value={chargeForm.feeType || 'account'} onChange={e => setChargeForm(p => ({ ...p, feeType: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }}><option value="account">Account</option><option value="inactivity">Inactivity</option><option value="withdrawal">Withdrawal</option><option value="deposit">Deposit</option><option value="overnight">Overnight</option><option value="platform">Platform</option><option value="data-feed">Data Feed</option></select></div>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Charge Type</label><select value={chargeForm.chargeType || 'fixed'} onChange={e => setChargeForm(p => ({ ...p, chargeType: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }}><option value="fixed">Fixed Amount</option><option value="percentage">Percentage</option></select></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Amount ($)</label><input type="number" step="0.01" value={chargeForm.amount ?? 0} onChange={e => setChargeForm(p => ({ ...p, amount: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Percentage (%)</label><input type="number" step="0.01" value={chargeForm.percentageRate ?? 0} onChange={e => setChargeForm(p => ({ ...p, percentageRate: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Min Amount ($)</label><input type="number" step="0.01" value={chargeForm.minAmount ?? 0} onChange={e => setChargeForm(p => ({ ...p, minAmount: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Max Amount ($)</label><input type="number" step="0.01" value={chargeForm.maxAmount ?? 0} onChange={e => setChargeForm(p => ({ ...p, maxAmount: +e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }} /></div>
                    <div><label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Frequency</label><select value={chargeForm.frequency || 'monthly'} onChange={e => setChargeForm(p => ({ ...p, frequency: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff' }}><option value="per-trade">Per Position</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="one-time">One-Time</option></select></div>
                  </div>
                  <div style={{ marginBottom: '12px' }}><label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', cursor: 'pointer' }}><input type="checkbox" checked={chargeForm.isActive !== false} onChange={e => setChargeForm(p => ({ ...p, isActive: e.target.checked }))} /> Active</label></div>
                </>)}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => setChargeModal({ open: false, type: '', mode: 'add', editItem: null })}
                    style={{ padding: '10px 20px', borderRadius: '8px', background: '#333', color: '#fff', border: 'none', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={() => saveChargeSetting(chargeModal.type)}
                    style={{ padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>{chargeModal.mode === 'edit' ? 'Update' : 'Create'}</button>
                </div>
              </div>
            </div>
          )}

          {/* Reboorder Settings */}
          {activePage === 'reboorder-settings' && (
            <ReorderSettings />
          )}

          {/* Placeholder for other pages */}
          {!['dashboard', 'all-users', 'active-users', 'blocked-users', 'banner-settings', 'bank-accounts', 'upi-management', 'payment-gateways', 'deposit-requests', 'withdrawal-requests', 'currency-management', 'hedging-settings', 'netting-settings', 'binary-settings', 'all-trades', 'open-positions', 'closed-positions', 'pending-orders', 'trade-history', 'trade-reports', 'risk-management', 'transaction-history', 'fund-transfers', 'reconciliation', 'spread-settings', 'commission-settings', 'swap-settings', 'margin-settings', 'leverage-settings', 'fee-structure', 'kyc-management', 'pending-users', 'user-documents', 'user-logs', 'reboorder-settings'].includes(activePage) && (
            <div className="admin-page-placeholder">
              <div className="placeholder-icon">🚧</div>
              <h2>{getPageTitle()}</h2>
              <p>This page is under construction. Content will be added soon.</p>
              <div className="placeholder-info">
                <span>Page ID: {activePage}</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Admin;
