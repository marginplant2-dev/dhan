import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext, useLocation, useNavigate } from 'react-router-dom';

/** Split a CSV line respecting quoted fields */
function parseReportCsvRow(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === ',' && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

/**
 * Turn server report text (meta lines + === SECTION === + CSV blocks) into structured data for UI.
 */
function parseUserReportPreview(raw) {
  const empty = { meta: [], sections: [], rawFallback: null };
  if (raw == null || typeof raw !== 'string') return empty;
  const trimmed = raw.trim();
  if (!trimmed) return empty;

  const lines = raw.split(/\r?\n/);
  const meta = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (t === '') {
      i++;
      break;
    }
    if (t.startsWith('===')) break;
    const colon = line.indexOf(':');
    if (colon > 0) {
      meta.push({
        key: line.slice(0, colon).trim(),
        value: line.slice(colon + 1).trim()
      });
    } else {
      meta.push({ key: '', value: line });
    }
    i++;
  }

  while (i < lines.length && lines[i].trim() === '') i++;

  const sections = [];
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith('===') && t.endsWith('===') && t.length > 6) {
      const title = t.replace(/^===\s*/, '').replace(/\s*===$/, '').trim();
      i++;
      const body = [];
      while (i < lines.length && !lines[i].trim().startsWith('===')) {
        body.push(lines[i]);
        i++;
      }
      while (body.length && body[body.length - 1].trim() === '') body.pop();

      const nonEmpty = body.map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
      if (nonEmpty.length === 0) {
        sections.push({ title, kind: 'empty' });
        continue;
      }
      const firstTrim = nonEmpty[0].trim();
      if (nonEmpty.length === 1 && /^no\s+.+\s+found/i.test(firstTrim)) {
        sections.push({ title, kind: 'message', message: firstTrim });
        continue;
      }
      if (firstTrim.includes(',')) {
        const header = parseReportCsvRow(nonEmpty[0]);
        if (header.length >= 2) {
          const rows = nonEmpty.slice(1).map(parseReportCsvRow);
          sections.push({ title, kind: 'table', columns: header, rows });
          continue;
        }
      }
      sections.push({ title, kind: 'text', lines: nonEmpty });
      continue;
    }
    i++;
  }

  if (meta.length === 0 && sections.length === 0) {
    return { meta: [], sections: [], rawFallback: trimmed };
  }
  return { meta, sections, rawFallback: null };
}

function UserManagement() {
  const { API_URL, adminCurrency, usdInrRate } = useOutletContext();
  const navigate = useNavigate();
  
  const formatCurrency = (value) => {
    const numValue = Number(value || 0);
    return `₹${numValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const location = useLocation();
  
  // User management state
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPagination, setUsersPagination] = useState({ total: 0, page: 1, limit: 20, pages: 0 });
  const [usersFilter, setUsersFilter] = useState({ status: '', search: '', city: '', state: '' });
  const [selectedUser, setSelectedUser] = useState(null);
  const [walletAdjustModal, setWalletAdjustModal] = useState({ open: false, user: null });
  const [walletAdjustForm, setWalletAdjustForm] = useState({ type: 'add', amount: '', reason: '', currency: 'INR', target: 'balance' });
  const [userDetailPanel, setUserDetailPanel] = useState({ open: false, user: null, view: 'info', positions: [], positionsLoading: false, wallet: null });
  const [changePasswordModal, setChangePasswordModal] = useState({ open: false, user: null });
  // Row ⋮ menu. Holds the user plus the button's viewport position: the table
  // sits in an overflow-x container, so an absolutely-positioned dropdown
  // inside the cell would be clipped. position:fixed escapes it.
  const [actionMenu, setActionMenu] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [inlineWalletAdjust, setInlineWalletAdjust] = useState({ show: false, type: 'add', amount: '', currency: 'INR' });
  const [changeAdminModal, setChangeAdminModal] = useState({ open: false, user: null });
  const [adminsList, setAdminsList] = useState([]);
  const [selectedAdminId, setSelectedAdminId] = useState('');
  
  // Create User state
  const [createUserModal, setCreateUserModal] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    initialBalance: '',
    assignTo: '', // subadmin/broker ID
  });
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [subadminsList, setSubadminsList] = useState([]);

  // Segment settings: choose netting vs hedging → full editor under Segment Management

  // Order Mode Settings state
  const [tradeModeModal, setTradeModeModal] = useState({ open: false, user: null });
  const [tradeModeSettings, setTradeModeSettings] = useState({ hedging: true, netting: true, binary: true });
  const [tradeModeLoading, setTradeModeLoading] = useState(false);
  
  // Currency Display Settings state
  const [currencyDisplaySetting, setCurrencyDisplaySetting] = useState('BOTH'); // USD, INR, BOTH
  
  // Currency Permissions for Deposit/Withdrawal
  const [currencyPermissions, setCurrencyPermissions] = useState({ USD: true, INR: true });
  
  // KYC management state
  const [kycList, setKycList] = useState([]);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycPagination, setKycPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [kycFilter, setKycFilter] = useState({ status: '', search: '' });
  const [kycDetailModal, setKycDetailModal] = useState({ open: false, kyc: null });
  const [pendingKycCount, setPendingKycCount] = useState(0);

  // Download Report state
  const [reportModal, setReportModal] = useState({ open: false, user: null });
  const [reportForm, setReportForm] = useState({
    allTime: true,
    fromDate: '',
    toDate: '',
    reportTypes: {
      loginActivity: true,
      trades: true,
      funds: true,
      positions: true,
      ledger: true
    }
  });
  const [reportViewLoading, setReportViewLoading] = useState(false);
  const [reportDownloadLoading, setReportDownloadLoading] = useState(false);
  const reportBusy = reportViewLoading || reportDownloadLoading;
  /** In-browser preview after “View report” (parsed into tables in UI) */
  const [reportPreview, setReportPreview] = useState(null);
  const reportPreviewParsed = useMemo(() => {
    if (reportPreview == null) return null;
    return parseUserReportPreview(reportPreview);
  }, [reportPreview]);

  // Activity Logs state
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);
  const [activityLogsPagination, setActivityLogsPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [activityLogsFilter, setActivityLogsFilter] = useState({ activityType: '', search: '', userId: '', startDate: '', endDate: '' });
  const [activityUsersForFilter, setActivityUsersForFilter] = useState([]);
  const [exportingLogs, setExportingLogs] = useState(false);
  const [exportingUsers, setExportingUsers] = useState(false);
  const [userFilterSearch, setUserFilterSearch] = useState('');
  const [showUserFilterDropdown, setShowUserFilterDropdown] = useState(false);

  // Determine active tab from URL
  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('/active')) return 'active-users';
    if (path.includes('/blocked')) return 'blocked-users';
    if (path.includes('/kyc')) return 'kyc-management';
    if (path.includes('/logs')) return 'user-logs';
    return 'all-users';
  };

  const activeTab = getActiveTab();

  const fetchAdminsList = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/hierarchy`);
      const data = await res.json();
      if (data.success) {
        setAdminsList(data.admins || []);
      }
    } catch (error) {
      console.error('Error fetching admins:', error);
    }
  };

  const changeUserAdmin = async () => {
    if (!changeAdminModal.user) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${changeAdminModal.user._id}/assign-admin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentAdminId: selectedAdminId || null })
      });
      const data = await res.json();
      if (data.success) {
        alert('User admin/broker updated successfully!');
        setChangeAdminModal({ open: false, user: null });
        setSelectedAdminId('');
        fetchUsers(usersPagination.page);
      } else {
        alert(data.error || 'Failed to update user admin');
      }
    } catch (error) {
      console.error('Error changing user admin:', error);
      alert('Error changing user admin');
    }
  };

  const goToHedgingUserSegmentSettings = (user) => {
    setUserDetailPanel((p) => ({ ...p, open: false }));
    navigate(`/admin/hedging-segments/users?userId=${encodeURIComponent(user._id)}`);
  };

  // Open order mode settings modal
  const openTradeModeModal = async (user) => {
    const modes = user.allowedTradeModes || { hedging: true, netting: true, binary: true };
    setTradeModeSettings(modes);
    setCurrencyDisplaySetting(user.allowedCurrencyDisplay || 'BOTH');
    setCurrencyPermissions(user.allowedCurrencies || { USD: true, INR: true });
    setTradeModeModal({ open: true, user });
  };

  // Save order mode settings
  const saveTradeModeSettings = async () => {
    if (!tradeModeModal.user) return;
    setTradeModeLoading(true);
    try {
      // Save order mode settings
      const res = await fetch(`${API_URL}/api/admin/users/${tradeModeModal.user._id}/trade-modes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tradeModeSettings, netting: true, allowedCurrencyDisplay: currencyDisplaySetting })
      });
      const data = await res.json();
      
      // Save currency permissions for deposit/withdrawal
      await fetch(`${API_URL}/api/admin/users/${tradeModeModal.user._id}/currency-permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowUSD: currencyPermissions.USD, allowINR: currencyPermissions.INR })
      });
      
      if (data.success) {
        alert('Settings saved successfully!');
        setTradeModeModal({ open: false, user: null });
        fetchUsers(usersPagination.page);
      } else {
        alert(data.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving order mode settings:', error);
      alert('Error saving order mode settings');
    } finally {
      setTradeModeLoading(false);
    }
  };

  const fetchUsers = async (page = 1) => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: usersPagination.limit,
        ...(usersFilter.status && { status: usersFilter.status }),
        ...(usersFilter.search && { search: usersFilter.search }),
        ...(usersFilter.city && { city: usersFilter.city }),
        ...(usersFilter.state && { state: usersFilter.state })
      });

      // Apply filter based on active tab
      if (activeTab === 'active-users') params.set('status', 'active');
      if (activeTab === 'blocked-users') params.set('status', 'blocked');

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

  const toggleUserStatus = async (userId, currentIsActive) => {
    try {
      const newStatus = currentIsActive === false ? 'active' : 'blocked';
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers(usersPagination.page);
        alert(data.message);
      } else {
        alert(data.error || 'Failed to update user status');
      }
    } catch (error) {
      console.error('Error toggling user status:', error);
      alert('Failed to update user status');
    }
  };

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
        alert(data.message);
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    }
  };

  // Fetch subadmins/brokers for assignment
  const fetchSubadmins = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/hierarchy/subadmins`);
      const data = await res.json();
      if (data.success) {
        setSubadminsList(data.subadmins || []);
      }
    } catch (error) {
      console.error('Error fetching subadmins:', error);
    }
  };

  // Create new user
  const createUser = async () => {
    if (!createUserForm.name || !createUserForm.email || !createUserForm.password) {
      alert('Please fill in name, email and password');
      return;
    }
    
    setCreateUserLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createUserForm.name,
          email: createUserForm.email,
          phone: createUserForm.phone,
          password: createUserForm.password,
          initialBalance: parseFloat(createUserForm.initialBalance) || 0,
          parentAdminId: createUserForm.assignTo || null
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('User created successfully!');
        setCreateUserModal(false);
        setCreateUserForm({ name: '', email: '', phone: '', password: '', initialBalance: '', assignTo: '' });
        fetchUsers(1);
      } else {
        alert(data.error || 'Failed to create user');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Failed to create user');
    } finally {
      setCreateUserLoading(false);
    }
  };

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
        setWalletAdjustModal({ open: false, user: null });
        setWalletAdjustForm({ type: 'add', amount: '', reason: '', currency: 'INR', target: 'balance' });
        fetchUsers(usersPagination.page);
        alert(data.message);
      } else {
        alert(data.error || 'Failed to adjust wallet');
      }
    } catch (error) {
      console.error('Error adjusting wallet:', error);
      alert('Failed to adjust wallet');
    }
  };

  const inlineAdjustWallet = async (type) => {
    if (!inlineWalletAdjust.amount || parseFloat(inlineWalletAdjust.amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userDetailPanel.user._id}/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, amount: inlineWalletAdjust.amount, currency: inlineWalletAdjust.currency, reason: `${type === 'add' ? 'Added' : 'Deducted'} ${inlineWalletAdjust.currency} by admin` })
      });
      const data = await res.json();
      if (data.success) {
        // Use the wallet balance returned from server instead of calculating client-side
        if (data.wallet) {
          setUserDetailPanel(prev => ({ ...prev, wallet: data.wallet }));
        }
        setInlineWalletAdjust({ show: false, type: 'add', amount: '', currency: 'INR' });
        fetchUsers(usersPagination.page);
        alert(data.message);
      } else {
        alert(data.error || 'Failed to adjust wallet');
      }
    } catch (error) {
      console.error('Error adjusting wallet:', error);
      alert('Failed to adjust wallet');
    }
  };

  const openUserDetail = async (user) => {
    setInlineWalletAdjust({ show: false, type: 'add', amount: '', currency: 'INR' });
    setUserDetailPanel({ open: true, user, view: 'info', positions: [], positionsLoading: true, wallet: user.wallet, parentAdmin: null });
    
    // Fetch positions
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

    // Fetch parent admin info if user has parentAdminId
    if (user.parentAdminId) {
      try {
        const adminRes = await fetch(`${API_URL}/api/admin/hierarchy/${user.parentAdminId}`);
        const adminData = await adminRes.json();
        if (adminData.success && adminData.admin) {
          setUserDetailPanel(prev => ({ ...prev, parentAdmin: adminData.admin }));
        }
      } catch (err) {
        console.error('Error fetching parent admin:', err);
      }
    }
  };

  const changeUserPassword = async () => {
    if (!changePasswordModal.user || !newPassword) {
      alert('Please enter a new password');
      return;
    }
    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${changePasswordModal.user._id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (data.success) {
        alert('Password changed successfully');
        setChangePasswordModal({ open: false, user: null });
        setNewPassword('');
      } else {
        alert(data.error || 'Failed to change password');
      }
    } catch (error) {
      console.error('Error changing password:', error);
      alert('Failed to change password');
    }
  };

  const loginAsUser = async (user) => {
    // Pre-open the popup synchronously (inside the click handler) so the
    // browser keeps the user-gesture context. If we wait for fetch() to
    // resolve before calling window.open, popup blockers strip the new tab.
    const popup = window.open('about:blank', '_blank');

    try {
      // Admin token is required — the /api/admin/* middleware enforces
      // the `admin.impersonateUser` permission and returns 401 without it.
      const adminToken = localStorage.getItem('dhanfunded-admin-token');
      if (!adminToken) {
        popup?.close();
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
      if (!res.ok || !data.success) {
        popup?.close();
        alert(data.error || `Failed to login as user (HTTP ${res.status})`);
        return;
      }

      // Admin panel runs on admin.<domain>; the user app runs on <domain>.
      // Those are separate origins, so localStorage set here is invisible
      // to the user app. Pass the credentials through the URL as a base64
      // blob — AppRouter on the user side decodes it, stores it in
      // localStorage (on the main origin), and strips the query param.
      // Use window.location.host (not hostname) so the port survives in
      // local dev — without it the URL becomes localhost/app on port 80.
      const payload = btoa(JSON.stringify({ token: data.token, user: data.user }));
      const mainHost = window.location.host.replace(/^admin\./, '');
      const userAppUrl = `${window.location.protocol}//${mainHost}/app?impersonate=${encodeURIComponent(payload)}`;

      if (popup) {
        popup.location.href = userAppUrl;
      } else {
        // Popup was blocked despite synchronous open — fall back to the
        // current tab so the admin still ends up logged in as the user.
        window.location.href = userAppUrl;
      }
    } catch (error) {
      console.error('Error logging in as user:', error);
      popup?.close();
      alert('Failed to login as user: ' + (error?.message || 'network error'));
    }
  };

  const buildUserReportPayload = () => {
    const { allTime, fromDate, toDate, reportTypes } = reportForm;
    const selectedTypes = Object.entries(reportTypes)
      .filter(([_, selected]) => selected)
      .map(([type]) => type);
    return {
      allTime,
      fromDate: allTime ? null : fromDate,
      toDate: allTime ? null : toDate,
      reportTypes: selectedTypes
    };
  };

  const validateReportForm = () => {
    const { allTime, fromDate, toDate, reportTypes } = reportForm;
    if (!allTime && (!fromDate || !toDate)) {
      alert('Please select date range or choose "All Time"');
      return false;
    }
    const selectedTypes = Object.entries(reportTypes)
      .filter(([_, selected]) => selected)
      .map(([type]) => type);
    if (selectedTypes.length === 0) {
      alert('Please select at least one report type');
      return false;
    }
    return true;
  };

  const viewUserReport = async () => {
    if (!reportModal.user || !validateReportForm()) return;
    setReportViewLoading(true);
    setReportPreview(null);
    try {
      const body = buildUserReportPayload();
      const res = await fetch(`${API_URL}/api/admin/users/${reportModal.user._id}/download-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        let msg = 'Failed to generate report';
        try {
          const errorData = await res.json();
          msg = errorData.error || msg;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const text = await res.text();
      setReportPreview(text);
    } catch (error) {
      console.error('Error loading report preview:', error);
      alert(error.message || 'Failed to load report');
    } finally {
      setReportViewLoading(false);
    }
  };

  // Download Report function
  const downloadUserReport = async () => {
    if (!reportModal.user || !validateReportForm()) return;

    setReportDownloadLoading(true);
    try {
      const body = buildUserReportPayload();
      const res = await fetch(`${API_URL}/api/admin/users/${reportModal.user._id}/download-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to generate report');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateRange = body.allTime ? 'all_time' : `${body.fromDate}_to_${body.toDate}`;
      a.download = `${reportModal.user.name || reportModal.user.oderId}_report_${dateRange}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setReportModal({ open: false, user: null });
      setReportPreview(null);
      setReportForm({
        allTime: true,
        fromDate: '',
        toDate: '',
        reportTypes: { loginActivity: true, trades: true, funds: true, positions: true, ledger: true }
      });
    } catch (error) {
      console.error('Error downloading report:', error);
      alert(error.message || 'Failed to download report');
    } finally {
      setReportDownloadLoading(false);
    }
  };

  // KYC Functions - optimized with useCallback for 3000+ users
  const fetchKycList = useCallback(async (page = 1) => {
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
  }, [API_URL, kycFilter]);

  const fetchPendingKycCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/kyc/pending-count`);
      const data = await res.json();
      if (data.success) {
        setPendingKycCount(data.count);
      }
    } catch (error) {
      console.error('Error fetching pending KYC count:', error);
    }
  }, [API_URL]);

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
      console.error('Error approving KYC:', error);
      alert('Failed to approve KYC');
    }
  };

  const rejectKyc = async (kycId, reason) => {
    if (!reason) {
      reason = prompt('Enter rejection reason:');
      if (!reason) return;
    }
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
      console.error('Error rejecting KYC:', error);
      alert('Failed to reject KYC');
    }
  };

  // Activity Logs Functions
  const fetchActivityLogs = useCallback(async (page = 1) => {
    setActivityLogsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('limit', 20);
      if (activityLogsFilter.activityType) params.set('activityType', activityLogsFilter.activityType);
      if (activityLogsFilter.search) params.set('search', activityLogsFilter.search);
      if (activityLogsFilter.userId) params.set('userId', activityLogsFilter.userId);
      if (activityLogsFilter.startDate) params.set('startDate', activityLogsFilter.startDate);
      if (activityLogsFilter.endDate) params.set('endDate', activityLogsFilter.endDate);
      
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
  }, [API_URL, activityLogsFilter]);

  // Fetch users for activity filter dropdown
  const fetchUsersForActivityFilter = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/users?limit=1000`);
      const data = await res.json();
      if (data.success) {
        setActivityUsersForFilter(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users for filter:', error);
    }
  }, [API_URL]);

  // Export activity logs
  const exportActivityLogs = async () => {
    setExportingLogs(true);
    try {
      const params = new URLSearchParams();
      if (activityLogsFilter.activityType) params.set('activityType', activityLogsFilter.activityType);
      if (activityLogsFilter.userId) params.set('userId', activityLogsFilter.userId);
      if (activityLogsFilter.startDate) params.set('startDate', activityLogsFilter.startDate);
      if (activityLogsFilter.endDate) params.set('endDate', activityLogsFilter.endDate);
      
      const res = await fetch(`${API_URL}/api/admin/activity-logs/export?${params}`);
      const blob = await res.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting logs:', error);
      alert('Error exporting activity logs');
    } finally {
      setExportingLogs(false);
    }
  };

  // Export all users to Excel
  const exportUsersToExcel = async () => {
    setExportingUsers(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '10000'); // Get all users
      if (usersFilter.search) params.set('search', usersFilter.search);
      if (usersFilter.city) params.set('city', usersFilter.city);
      if (usersFilter.state) params.set('state', usersFilter.state);
      if (usersFilter.status) params.set('status', usersFilter.status);
      if (activeTab === 'active-users') params.set('status', 'active');
      if (activeTab === 'blocked-users') params.set('status', 'blocked');
      
      const res = await fetch(`${API_URL}/api/admin/users?${params}`);
      const data = await res.json();
      
      if (!data.success || !data.users) {
        alert('Failed to fetch users');
        return;
      }
      
      // Create CSV content with all user details
      const headers = [
        'Order ID',
        'Name',
        'Email',
        'Phone',
        'City',
        'State',
        'Country',
        'Address',
        'Balance',
        'Status',
        'Parent Admin',
        'Referral Code',
        'Referred By',
        'KYC Status',
        'Created At',
        'Last Login'
      ];
      
      const rows = data.users.map(user => [
        user.oderId || user._id?.slice(-6) || '',
        user.name || '',
        user.email || '',
        user.phone || '',
        user.city || '',
        user.state || '',
        user.country || '',
        user.address || '',
        user.wallet?.balance?.toFixed(2) || '0.00',
        user.isActive === false ? 'Blocked' : 'Active',
        user.parentAdmin?.name || user.parentAdmin?.email || '-',
        user.referralCode || '',
        user.referredBy || '',
        user.kycStatus || 'Not Submitted',
        user.createdAt ? new Date(user.createdAt).toLocaleString() : '',
        user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'
      ]);
      
      // Convert to CSV
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      
      // Create and download file
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert(`Successfully exported ${data.users.length} users`);
    } catch (error) {
      console.error('Error exporting users:', error);
      alert('Error exporting users');
    } finally {
      setExportingUsers(false);
    }
  };

  const getActivityIcon = (type) => {
    const icons = {
      'login': '🔑', 'logout': '🚪', 'register': '📝',
      'deposit_request': '💰', 'deposit_approved': '✅', 'deposit_rejected': '❌',
      'withdrawal_request': '💸', 'withdrawal_approved': '✅', 'withdrawal_rejected': '❌',
      'trade_open': '📈', 'trade_close': '📉', 'order_placed': '📋', 'order_cancelled': '🚫',
      'kyc_submitted': '📄', 'kyc_approved': '✅', 'kyc_rejected': '❌',
      'password_change': '🔐', 'profile_update': '👤', 'wallet_credit': '💵', 'wallet_debit': '💳',
      'session_start': '▶️', 'session_end': '⏹️', 'failed_login': '⚠️'
    };
    return icons[type] || '📌';
  };

  const getActivityColor = (type) => {
    if (type.includes('approved') || type === 'login' || type === 'register' || type === 'wallet_credit') return '#10b981';
    if (type.includes('rejected') || type.includes('failed') || type === 'wallet_debit') return '#ef4444';
    if (type.includes('request') || type.includes('submitted')) return '#f59e0b';
    if (type.includes('trade')) return '#3b82f6';
    return 'var(--text-muted)';
  };

  // Effects
  useEffect(() => {
    if (activeTab === 'kyc-management') {
      fetchKycList(1);
      fetchPendingKycCount();
    } else if (activeTab === 'user-logs') {
      fetchActivityLogs(1);
      fetchUsersForActivityFilter();
    } else {
      fetchUsers(1);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'kyc-management') {
      fetchKycList(1);
    }
  }, [kycFilter, fetchKycList]);

  useEffect(() => {
    if (activeTab === 'user-logs') {
      fetchActivityLogs(1);
    }
  }, [activityLogsFilter, fetchActivityLogs]);

  useEffect(() => {
    if (activeTab !== 'kyc-management' && activeTab !== 'user-logs') {
      fetchUsers(1);
    }
  }, [usersFilter]);

  // KYC Management UI
  if (activeTab === 'kyc-management') {
    return (
      <div className="kyc-management-page">
        <div className="page-header" style={{ marginBottom: '20px' }}>
          <h2 style={{ color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            📋 KYC Management
            {pendingKycCount > 0 && (
              <span style={{ background: '#f59e0b', color: '#000', padding: '4px 12px', borderRadius: '20px', fontSize: '14px' }}>
                Pending: {pendingKycCount}
              </span>
            )}
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>Manage user identity verification documents</p>
        </div>

        <div className="page-header-actions" style={{ marginBottom: '20px' }}>
          <div className="filters-row" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search by name, ID, document..."
              value={kycFilter.search}
              onChange={(e) => setKycFilter(prev => ({ ...prev, search: e.target.value }))}
              style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '300px' }}
            />
            <select
              value={kycFilter.status}
              onChange={(e) => setKycFilter(prev => ({ ...prev, status: e.target.value }))}
              style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="resubmit">Resubmit Required</option>
            </select>
          </div>
        </div>

        {kycLoading ? (
          <div className="loading-spinner" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading KYC submissions...</div>
        ) : kycList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>📋</div>
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 10px 0' }}>No KYC Submissions Found</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>No KYC submissions match your filters</p>
          </div>
        ) : (
          <>
            <div className="admin-table-container" style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Document Type</th>
                    <th>Document Number</th>
                    <th>Full Name</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {kycList.map((kyc) => (
                    <tr key={kyc._id}>
                      <td>
                        <div>
                          <div style={{ fontWeight: 500 }}>{kyc.user?.name || 'Unknown'}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>#{kyc.oderId}</div>
                        </div>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{kyc.documentType?.replace('_', ' ')}</td>
                      <td>{kyc.documentNumber}</td>
                      <td>{kyc.fullName}</td>
                      <td>
                        <span className={`status-badge ${kyc.status}`} style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          background: kyc.status === 'pending' ? '#f59e0b' : kyc.status === 'approved' ? '#10b981' : kyc.status === 'rejected' ? '#ef4444' : '#6366f1',
                          color: '#fff'
                        }}>
                          {kyc.status}
                        </span>
                      </td>
                      <td>{new Date(kyc.submittedAt).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button onClick={() => setKycDetailModal({ open: true, kyc })} style={{ padding: '5px 10px', borderRadius: '4px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
                            View
                          </button>
                          {kyc.status === 'pending' && (
                            <>
                              <button onClick={() => approveKyc(kyc._id)} style={{ padding: '5px 10px', borderRadius: '4px', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
                                Approve
                              </button>
                              <button onClick={() => rejectKyc(kyc._id)} style={{ padding: '5px 10px', borderRadius: '4px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* KYC Pagination */}
            {kycPagination.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
                <button onClick={() => fetchKycList(kycPagination.page - 1)} disabled={kycPagination.page <= 1} style={{ padding: '8px 16px', borderRadius: '6px', background: kycPagination.page <= 1 ? 'var(--bg-tertiary)' : 'var(--accent-primary)', color: '#fff', border: 'none', cursor: kycPagination.page <= 1 ? 'not-allowed' : 'pointer' }}>
                  Previous
                </button>
                <span style={{ padding: '8px 16px', color: 'var(--text-primary)' }}>Page {kycPagination.page} of {kycPagination.totalPages}</span>
                <button onClick={() => fetchKycList(kycPagination.page + 1)} disabled={kycPagination.page >= kycPagination.totalPages} style={{ padding: '8px 16px', borderRadius: '6px', background: kycPagination.page >= kycPagination.totalPages ? 'var(--bg-tertiary)' : 'var(--accent-primary)', color: '#fff', border: 'none', cursor: kycPagination.page >= kycPagination.totalPages ? 'not-allowed' : 'pointer' }}>
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {/* KYC Detail Modal */}
        {kycDetailModal.open && kycDetailModal.kyc && (
          <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', width: '700px', maxHeight: '90vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>KYC Details - {kycDetailModal.kyc.fullName}</h3>
                <button onClick={() => setKycDetailModal({ open: false, kyc: null })} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '24px', cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                  <div><strong style={{ color: 'var(--text-muted)' }}>User ID:</strong> <span style={{ color: 'var(--text-primary)' }}>#{kycDetailModal.kyc.oderId}</span></div>
                  <div><strong style={{ color: 'var(--text-muted)' }}>Email:</strong> <span style={{ color: 'var(--text-primary)' }}>{kycDetailModal.kyc.user?.email || '-'}</span></div>
                  <div><strong style={{ color: 'var(--text-muted)' }}>Document Type:</strong> <span style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{kycDetailModal.kyc.documentType?.replace('_', ' ')}</span></div>
                  <div><strong style={{ color: 'var(--text-muted)' }}>Document Number:</strong> <span style={{ color: 'var(--text-primary)' }}>{kycDetailModal.kyc.documentNumber}</span></div>
                  <div><strong style={{ color: 'var(--text-muted)' }}>Full Name:</strong> <span style={{ color: 'var(--text-primary)' }}>{kycDetailModal.kyc.fullName}</span></div>
                  <div><strong style={{ color: 'var(--text-muted)' }}>Address:</strong> <span style={{ color: 'var(--text-primary)' }}>{kycDetailModal.kyc.address || '-'}</span></div>
                  <div><strong style={{ color: 'var(--text-muted)' }}>Status:</strong> <span style={{ color: kycDetailModal.kyc.status === 'approved' ? '#10b981' : kycDetailModal.kyc.status === 'rejected' ? '#ef4444' : '#f59e0b' }}>{kycDetailModal.kyc.status}</span></div>
                  <div><strong style={{ color: 'var(--text-muted)' }}>Submitted:</strong> <span style={{ color: 'var(--text-primary)' }}>{new Date(kycDetailModal.kyc.submittedAt).toLocaleString()}</span></div>
                </div>

                <h4 style={{ color: 'var(--text-primary)', marginTop: '20px', marginBottom: '15px' }}>Document Images</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px' }}>
                  {kycDetailModal.kyc.frontImage && (
                    <div>
                      <p style={{ color: 'var(--text-muted)', marginBottom: '5px' }}>Front Image</p>
                      <img src={kycDetailModal.kyc.frontImage} alt="Front" style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                    </div>
                  )}
                  {kycDetailModal.kyc.backImage && (
                    <div>
                      <p style={{ color: 'var(--text-muted)', marginBottom: '5px' }}>Back Image</p>
                      <img src={kycDetailModal.kyc.backImage} alt="Back" style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                    </div>
                  )}
                  {kycDetailModal.kyc.selfieImage && (
                    <div>
                      <p style={{ color: 'var(--text-muted)', marginBottom: '5px' }}>Selfie</p>
                      <img src={kycDetailModal.kyc.selfieImage} alt="Selfie" style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                    </div>
                  )}
                </div>

                {kycDetailModal.kyc.status === 'pending' && (
                  <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
                    <button onClick={() => approveKyc(kycDetailModal.kyc._id)} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
                      ✓ Approve KYC
                    </button>
                    <button onClick={() => rejectKyc(kycDetailModal.kyc._id)} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
                      ✗ Reject KYC
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Activity Logs UI
  if (activeTab === 'user-logs') {
    return (
      <div className="activity-logs-page">
        <div className="page-header" style={{ marginBottom: '20px' }}>
          <h2 style={{ color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            📊 Activity Logs
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>Track all user activities - logins, positions, deposits, withdrawals</p>
        </div>

        <div className="page-header-actions" style={{ marginBottom: '20px' }}>
          {/* Row 1: User Filter and Activity Type */}
          <div className="filters-row" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
            {/* Searchable User Dropdown */}
            <div style={{ position: 'relative', minWidth: '250px' }}>
              <input
                type="text"
                placeholder={activityLogsFilter.userId ? activityUsersForFilter.find(u => (u.oderId || u._id) === activityLogsFilter.userId)?.name || 'Selected User' : 'Search & Select User...'}
                value={userFilterSearch}
                onChange={(e) => setUserFilterSearch(e.target.value)}
                onFocus={() => setShowUserFilterDropdown(true)}
                style={{ 
                  padding: '10px 15px', 
                  borderRadius: '8px', 
                  border: '1px solid var(--border-color)', 
                  background: 'var(--bg-primary)', 
                  color: 'var(--text-primary)', 
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              />
              {activityLogsFilter.userId && (
                <button
                  onClick={() => {
                    setActivityLogsFilter(prev => ({ ...prev, userId: '' }));
                    setUserFilterSearch('');
                  }}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  ×
                </button>
              )}
              {showUserFilterDropdown && (
                <>
                  <div 
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
                    onClick={() => setShowUserFilterDropdown(false)}
                  />
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    maxHeight: '250px',
                    overflowY: 'auto',
                    zIndex: 100,
                    marginTop: '4px',
                    boxShadow: '0 4px 12px color-mix(in srgb, var(--text-primary) 12%, transparent)'
                  }}>
                    <div
                      style={{ padding: '10px 15px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
                      onClick={() => {
                        setActivityLogsFilter(prev => ({ ...prev, userId: '' }));
                        setUserFilterSearch('');
                        setShowUserFilterDropdown(false);
                      }}
                    >
                      All Users
                    </div>
                    {activityUsersForFilter
                      .filter(user => {
                        if (!userFilterSearch) return true;
                        const search = userFilterSearch.toLowerCase();
                        return (user.name || '').toLowerCase().includes(search) ||
                               (user.email || '').toLowerCase().includes(search) ||
                               (user.oderId || '').toString().includes(search);
                      })
                      .slice(0, 20)
                      .map(user => (
                        <div
                          key={user._id || user.oderId}
                          style={{
                            padding: '10px 15px',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border-color)',
                            background: activityLogsFilter.userId === (user.oderId || user._id) ? 'var(--bg-hover)' : 'transparent'
                          }}
                          onClick={() => {
                            setActivityLogsFilter(prev => ({ ...prev, userId: user.oderId || user._id }));
                            setUserFilterSearch('');
                            setShowUserFilterDropdown(false);
                          }}
                        >
                          <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{user.name || user.email}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>#{user.oderId} • {user.email}</div>
                        </div>
                      ))
                    }
                    {activityUsersForFilter.filter(user => {
                      if (!userFilterSearch) return true;
                      const search = userFilterSearch.toLowerCase();
                      return (user.name || '').toLowerCase().includes(search) ||
                             (user.email || '').toLowerCase().includes(search) ||
                             (user.oderId || '').toString().includes(search);
                    }).length > 20 && (
                      <div style={{ padding: '10px 15px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '12px' }}>
                        +{activityUsersForFilter.filter(user => {
                          if (!userFilterSearch) return true;
                          const search = userFilterSearch.toLowerCase();
                          return (user.name || '').toLowerCase().includes(search) ||
                                 (user.email || '').toLowerCase().includes(search) ||
                                 (user.oderId || '').toString().includes(search);
                        }).length - 20} more users...
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <select
              value={activityLogsFilter.activityType}
              onChange={(e) => setActivityLogsFilter(prev => ({ ...prev, activityType: e.target.value }))}
              style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            >
              <option value="">All Activities</option>
              <optgroup label="Authentication">
                <option value="login">Login</option>
                <option value="logout">Logout</option>
                <option value="register">Register</option>
                <option value="failed_login">Failed Login</option>
              </optgroup>
              <optgroup label="Market">
                <option value="trade_open">Position Open</option>
                <option value="trade_close">Position Close</option>
                <option value="order_placed">Order Placed</option>
                <option value="order_cancelled">Order Cancelled</option>
              </optgroup>
              <optgroup label="Deposits">
                <option value="deposit_request">Deposit Request</option>
                <option value="deposit_approved">Deposit Approved</option>
                <option value="deposit_rejected">Deposit Rejected</option>
              </optgroup>
              <optgroup label="Withdrawals">
                <option value="withdrawal_request">Withdrawal Request</option>
                <option value="withdrawal_approved">Withdrawal Approved</option>
                <option value="withdrawal_rejected">Withdrawal Rejected</option>
              </optgroup>
              <optgroup label="KYC">
                <option value="kyc_submitted">KYC Submitted</option>
                <option value="kyc_approved">KYC Approved</option>
                <option value="kyc_rejected">KYC Rejected</option>
              </optgroup>
              <optgroup label="Wallet">
                <option value="wallet_credit">Wallet Credit</option>
                <option value="wallet_debit">Wallet Debit</option>
              </optgroup>
              <optgroup label="Account">
                <option value="password_change">Password Change</option>
                <option value="profile_update">Profile Update</option>
              </optgroup>
            </select>
            <input
              type="text"
              placeholder="Search by user ID, description..."
              value={activityLogsFilter.search}
              onChange={(e) => setActivityLogsFilter(prev => ({ ...prev, search: e.target.value }))}
              style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '200px' }}
            />
          </div>
          
          {/* Row 2: Date Filters and Actions */}
          <div className="filters-row" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>From:</span>
              <input
                type="date"
                value={activityLogsFilter.startDate}
                onChange={(e) => setActivityLogsFilter(prev => ({ ...prev, startDate: e.target.value }))}
                style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>To:</span>
              <input
                type="date"
                value={activityLogsFilter.endDate}
                onChange={(e) => setActivityLogsFilter(prev => ({ ...prev, endDate: e.target.value }))}
                style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
            </div>
            <button onClick={() => fetchActivityLogs(1)} style={{ padding: '10px 20px', borderRadius: '8px', background: 'var(--accent-primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>
              🔍 Search
            </button>
            <button 
              onClick={() => setActivityLogsFilter({ activityType: '', search: '', userId: '', startDate: '', endDate: '' })} 
              style={{ padding: '10px 20px', borderRadius: '8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer' }}
            >
              Clear Filters
            </button>
            <button 
              onClick={exportActivityLogs} 
              disabled={exportingLogs}
              style={{ padding: '10px 20px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', cursor: exportingLogs ? 'not-allowed' : 'pointer', opacity: exportingLogs ? 0.7 : 1, marginLeft: 'auto' }}
            >
              {exportingLogs ? '⏳ Exporting...' : '📥 Export CSV'}
            </button>
          </div>
        </div>

        {activityLogsLoading ? (
          <div className="loading-spinner" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading activity logs...</div>
        ) : activityLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>📊</div>
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 10px 0' }}>No Activity Logs Found</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>No activities match your filters</p>
          </div>
        ) : (
          <>
            <div className="admin-table-container" style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>User</th>
                    <th>Activity</th>
                    <th>Description</th>
                    <th>Session Duration</th>
                    <th>Status</th>
                    <th>IP Address</th>
                    <th>OS</th>
                    <th>Browser</th>
                    <th>Device</th>
                  </tr>
                </thead>
                <tbody>
                  {activityLogs.map((log) => (
                    <tr key={log._id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '13px' }}>
                        {new Date(log.timestamp).toLocaleDateString()}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '13px', color: 'var(--text-muted)' }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 500 }}>{log.user?.name || '-'}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>#{log.oderId}</div>
                      </td>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px' }}>{getActivityIcon(log.activityType)}</span>
                          <span style={{ color: getActivityColor(log.activityType), textTransform: 'capitalize', fontSize: '13px' }}>
                            {log.activityType?.replace(/_/g, ' ')}
                          </span>
                        </span>
                      </td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.description}
                      </td>
                      <td style={{ fontSize: '12px', color: log.sessionDuration ? '#10b981' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {log.sessionDuration ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            ⏱️ {Math.floor(log.sessionDuration / 3600) > 0 ? `${Math.floor(log.sessionDuration / 3600)}h ` : ''}
                            {Math.floor((log.sessionDuration % 3600) / 60)}m {log.sessionDuration % 60}s
                          </span>
                        ) : (log.activityType === 'login' ? <span style={{ color: '#f59e0b' }}>🟢 Active</span> : '-')}
                      </td>
                      <td>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          background: log.status === 'success' ? '#10b98120' : log.status === 'failed' ? '#ef444420' : '#f59e0b20',
                          color: log.status === 'success' ? '#10b981' : log.status === 'failed' ? '#ef4444' : '#f59e0b'
                        }}>
                          {log.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{log.ipAddress || '-'}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {log.os === 'macOS' && '🍎'}
                          {log.os?.includes('Windows') && '🪟'}
                          {log.os === 'Linux' && '🐧'}
                          {log.os === 'Android' && '🤖'}
                          {log.os === 'iOS' && '📱'}
                          {log.os || '-'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {log.browser === 'Chrome' && '🌐'}
                          {log.browser === 'Firefox' && '🦊'}
                          {log.browser === 'Safari' && '🧭'}
                          {log.browser === 'Edge' && '🔷'}
                          {log.browser === 'Brave' && '🦁'}
                          {log.browser === 'Opera' && '🔴'}
                          {log.browser || '-'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{log.device || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Activity Logs Pagination */}
            {activityLogsPagination.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '20px' }}>
                <button onClick={() => fetchActivityLogs(activityLogsPagination.page - 1)} disabled={activityLogsPagination.page <= 1} style={{ padding: '8px 16px', borderRadius: '6px', background: activityLogsPagination.page <= 1 ? 'var(--bg-tertiary)' : 'var(--accent-primary)', color: '#fff', border: 'none', cursor: activityLogsPagination.page <= 1 ? 'not-allowed' : 'pointer' }}>
                  Previous
                </button>
                <span style={{ padding: '8px 16px', color: 'var(--text-primary)' }}>
                  Page {activityLogsPagination.page} of {activityLogsPagination.totalPages} ({activityLogsPagination.total} total)
                </span>
                <button onClick={() => fetchActivityLogs(activityLogsPagination.page + 1)} disabled={activityLogsPagination.page >= activityLogsPagination.totalPages} style={{ padding: '8px 16px', borderRadius: '6px', background: activityLogsPagination.page >= activityLogsPagination.totalPages ? 'var(--bg-tertiary)' : 'var(--accent-primary)', color: '#fff', border: 'none', cursor: activityLogsPagination.page >= activityLogsPagination.totalPages ? 'not-allowed' : 'pointer' }}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // User Management UI (default)
  return (
    <div className="user-management-page">
      <div className="page-header-actions">
        <div className="filters-row" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search by name, email, or ID..."
            value={usersFilter.search}
            onChange={(e) => setUsersFilter(prev => ({ ...prev, search: e.target.value }))}
            style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '250px' }}
          />
          <input
            type="text"
            placeholder="City"
            value={usersFilter.city || ''}
            onChange={(e) => setUsersFilter(prev => ({ ...prev, city: e.target.value }))}
            style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '120px' }}
          />
          <input
            type="text"
            placeholder="State"
            value={usersFilter.state || ''}
            onChange={(e) => setUsersFilter(prev => ({ ...prev, state: e.target.value }))}
            style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '120px' }}
          />
          {activeTab === 'all-users' && (
            <select
              value={usersFilter.status}
              onChange={(e) => setUsersFilter(prev => ({ ...prev, status: e.target.value }))}
              style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
            </select>
          )}
          <button onClick={() => fetchUsers(1)} style={{ padding: '10px 20px', borderRadius: '8px', background: 'var(--accent-primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Search
          </button>
          <button 
            onClick={exportUsersToExcel} 
            disabled={exportingUsers}
            style={{ 
              padding: '10px 20px', 
              borderRadius: '8px', 
              background: '#10b981', 
              color: '#fff', 
              border: 'none', 
              cursor: exportingUsers ? 'not-allowed' : 'pointer',
              opacity: exportingUsers ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {exportingUsers ? '⏳ Exporting...' : '📥 Download Excel'}
          </button>
          <button 
            onClick={() => { setCreateUserModal(true); fetchSubadmins(); }}
            style={{ 
              padding: '10px 20px', 
              borderRadius: '8px', 
              background: '#8b5cf6', 
              color: '#fff', 
              border: 'none', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            ➕ Create User
          </button>
        </div>
      </div>

      {usersLoading ? (
        <div className="loading-spinner">Loading users...</div>
      ) : (
        <>
          <div className="admin-table-container" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="admin-table admin-cards-on-mobile" style={{ minWidth: '1000px' }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No users found</td></tr>
                ) : (
                  users.map(user => (
                    <tr key={user._id}>
                      <td data-label="ID">#{user.oderId || user._id?.slice(-6)}</td>
                      <td data-label="Name">
                        {user.name}
                      </td>
                      <td data-label="Email">{user.email}</td>
                      <td data-label="Phone">{user.phone || '-'}</td>
                      <td data-label="Status">
                        <span className={`status-badge ${user.isActive === false ? 'blocked' : 'active'}`}>
                          {user.isActive === false ? 'Blocked' : 'Active'}
                        </span>
                      </td>
                      <td data-label="Joined">{new Date(user.createdAt).toLocaleDateString()}</td>
                      <td data-label="Actions">
                        <button
                          type="button"
                          aria-label={`Actions for ${user.name || user.email}`}
                          aria-haspopup="menu"
                          aria-expanded={actionMenu?.user._id === user._id}
                          onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setActionMenu(actionMenu?.user._id === user._id
                              ? null
                              : { user, top: r.bottom + 6, right: window.innerWidth - r.right });
                          }}
                          style={{
                            width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border-color)',
                            background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer',
                            fontSize: 20, lineHeight: 1, display: 'inline-grid', placeItems: 'center'
                          }}
                        >
                          ⋮
                        </button>
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
              <button onClick={() => fetchUsers(usersPagination.page - 1)} disabled={usersPagination.page <= 1} style={{ padding: '8px 16px', borderRadius: '6px', background: usersPagination.page <= 1 ? 'var(--bg-tertiary)' : 'var(--accent-primary)', color: '#fff', border: 'none', cursor: usersPagination.page <= 1 ? 'not-allowed' : 'pointer' }}>
                Previous
              </button>
              <span style={{ padding: '8px 16px', color: 'var(--text-primary)' }}>Page {usersPagination.page} of {usersPagination.pages}</span>
              <button onClick={() => fetchUsers(usersPagination.page + 1)} disabled={usersPagination.page >= usersPagination.pages} style={{ padding: '8px 16px', borderRadius: '6px', background: usersPagination.page >= usersPagination.pages ? 'var(--bg-tertiary)' : 'var(--accent-primary)', color: '#fff', border: 'none', cursor: usersPagination.page >= usersPagination.pages ? 'not-allowed' : 'pointer' }}>
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Row actions menu */}
      {actionMenu && (() => {
        const u = actionMenu.user;
        const blocked = u.isActive === false;
        const close = () => setActionMenu(null);
        const item = { display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer', borderRadius: 6 };
        return (
          <>
            {/* click-away layer — closes the menu without a document listener */}
            <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
            <div
              role="menu"
              style={{
                position: 'fixed', top: actionMenu.top, right: actionMenu.right, zIndex: 1000, minWidth: 190,
                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 10,
                boxShadow: '0 12px 32px rgba(0,0,0,.18)', padding: 6
              }}
            >
              <button role="menuitem" style={item} onClick={() => { close(); loginAsUser(u); }}>
                Login as user
              </button>
              <button role="menuitem" style={item} onClick={() => { close(); setChangePasswordModal({ open: true, user: u }); }}>
                Change password
              </button>
              <button
                role="menuitem"
                style={{ ...item, color: blocked ? 'var(--success)' : '#f59e0b' }}
                onClick={() => {
                  close();
                  // Block had no confirmation and sat next to Delete — one slip
                  // locked a paying user out.
                  if (confirm(`${blocked ? 'Unblock' : 'Block'} ${u.name || u.email}?`)) toggleUserStatus(u._id, u.isActive);
                }}
              >
                {blocked ? 'Unblock user' : 'Block user'}
              </button>
              <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />
              <button role="menuitem" style={{ ...item, color: '#dc2626' }} onClick={() => { close(); deleteUser(u._id); }}>
                Delete user
              </button>
            </div>
          </>
        );
      })()}

      {/* Wallet Adjust Modal */}
      {walletAdjustModal.open && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '30px', borderRadius: '12px', width: '400px' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#fff' }}>Adjust Wallet - {walletAdjustModal.user?.name}</h3>
            {/* Target selector — Fix 20. 'Balance' is real cash (deposits/
                withdrawals, withdrawable). 'Credit' is bonus credit (counts
                toward equity & free margin like MT5, but is NOT withdrawable
                and doesn't touch the multi-currency walletUSD/INR ledgers). */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)' }}>Target</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setWalletAdjustForm(prev => ({ ...prev, target: 'balance' }))}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '6px',
                    border: walletAdjustForm.target === 'balance' ? '2px solid #10b981' : '1px solid var(--border-color)',
                    background: walletAdjustForm.target === 'balance' ? '#0e3a2e' : 'var(--bg-primary)',
                    color: walletAdjustForm.target === 'balance' ? '#10b981' : 'var(--text-muted)',
                    cursor: 'pointer', fontWeight: walletAdjustForm.target === 'balance' ? 600 : 400
                  }}
                  title="Real cash — deposits / withdrawals, withdrawable"
                >
                  Balance
                </button>
                <button
                  type="button"
                  onClick={() => setWalletAdjustForm(prev => ({ ...prev, target: 'credit', currency: 'INR' }))}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '6px',
                    border: walletAdjustForm.target === 'credit' ? '2px solid #fbbf24' : '1px solid var(--border-color)',
                    background: walletAdjustForm.target === 'credit' ? '#3a2e0e' : 'var(--bg-primary)',
                    color: walletAdjustForm.target === 'credit' ? '#fbbf24' : 'var(--text-muted)',
                    cursor: 'pointer', fontWeight: walletAdjustForm.target === 'credit' ? 600 : 400
                  }}
                  title="Bonus credit — counts toward equity, NOT withdrawable, INR only"
                >
                  Credit (Bonus)
                </button>
              </div>
              {walletAdjustForm.target === 'credit' && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#9ca3af', lineHeight: 1.4 }}>
                  Bonus credit counts toward equity &amp; free margin (MT5 convention) but is NOT withdrawable.
                  <br />
                  <strong style={{ color: '#fbbf24' }}>INR only</strong> — amount entered in ₹ and displayed in ₹ in the user's footer.
                </div>
              )}
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)' }}>Type</label>
              <select value={walletAdjustForm.type} onChange={(e) => setWalletAdjustForm(prev => ({ ...prev, type: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                <option value="add">{walletAdjustForm.target === 'credit' ? 'Add Bonus' : 'Add Funds'}</option>
                <option value="subtract">{walletAdjustForm.target === 'credit' ? 'Deduct Bonus' : 'Subtract Funds'}</option>
              </select>
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)' }}>Amount (₹)</label>
              <input
                type="number"
                value={walletAdjustForm.amount}
                onChange={(e) => setWalletAdjustForm(prev => ({ ...prev, amount: e.target.value }))}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                placeholder="Enter amount in ₹"
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)' }}>Reason</label>
              <input type="text" value={walletAdjustForm.reason} onChange={(e) => setWalletAdjustForm(prev => ({ ...prev, reason: e.target.value }))} placeholder="Optional" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setWalletAdjustModal({ open: false, user: null })} style={{ flex: 1, padding: '10px', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={adjustUserWallet} style={{ flex: 1, padding: '10px', borderRadius: '6px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* User Detail Panel - New Design */}
      {userDetailPanel.open && userDetailPanel.user && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-primary)', borderRadius: '16px', width: '520px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--border-color)', boxShadow: '0 12px 40px color-mix(in srgb, var(--text-primary) 12%, transparent)' }}>
            {/* Header with Avatar */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '20px', gap: '15px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>
                {userDetailPanel.user.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '18px' }}>{userDetailPanel.user.name}</h3>
                <p style={{ margin: '2px 0 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>{userDetailPanel.user.email}</p>
              </div>
              <button onClick={() => setUserDetailPanel({ open: false, user: null, view: 'info', positions: [], positionsLoading: false, wallet: null })} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '24px', cursor: 'pointer', padding: '0' }}>×</button>
            </div>

            {/* Info Cards */}
            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '15px', border: '1px solid var(--border-color)' }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>Full Name</p>
                  <p style={{ margin: '5px 0 0 0', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 500 }}>{userDetailPanel.user.name}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '15px', border: '1px solid var(--border-color)' }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>Phone</p>
                  <p style={{ margin: '5px 0 0 0', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 500 }}>{userDetailPanel.user.phone || '-'}</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '15px', border: '1px solid var(--border-color)' }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>Joined</p>
                  <p style={{ margin: '5px 0 0 0', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 500 }}>{new Date(userDetailPanel.user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '15px', border: '1px solid var(--border-color)' }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>Status</p>
                  <p style={{ margin: '5px 0 0 0', color: userDetailPanel.user.isActive === false ? 'var(--danger)' : 'var(--success)', fontSize: '15px', fontWeight: 500 }}>{userDetailPanel.user.isActive === false ? 'Blocked' : 'Active'}</p>
                </div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '15px', marginBottom: '15px', border: '1px solid var(--border-color)' }}>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>Email</p>
                <p style={{ margin: '5px 0 0 0', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 500 }}>{userDetailPanel.user.email}</p>
              </div>

              {/* Wallet Balance Card */}
              <div style={{ background: 'color-mix(in srgb, var(--success) 10%, var(--bg-secondary))', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid color-mix(in srgb, var(--success) 28%, var(--border-color))' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>💰 Main Wallet Balance</p>
                    <p style={{ margin: '8px 0 0 0', color: 'var(--success)', fontSize: '28px', fontWeight: 'bold' }}>{formatCurrency(userDetailPanel.wallet?.balance || 0)}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setInlineWalletAdjust({ show: true, type: 'add', amount: '', currency: 'INR' })} style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--success)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    <button onClick={() => setInlineWalletAdjust({ show: true, type: 'subtract', amount: '', currency: 'INR' })} style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--danger)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  </div>
                </div>
                {inlineWalletAdjust.show && (
                  <div style={{ marginTop: '15px', padding: '15px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <p style={{ margin: '0 0 10px 0', color: 'var(--text-primary)', fontSize: '14px' }}>{inlineWalletAdjust.type === 'add' ? '➕ Add Funds' : '➖ Deduct Funds'}</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input
                        type="number"
                        placeholder="Enter amount in ₹"
                        value={inlineWalletAdjust.amount}
                        onChange={(e) => setInlineWalletAdjust(prev => ({ ...prev, amount: e.target.value }))}
                        style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}
                      />
                      <button onClick={() => inlineAdjustWallet(inlineWalletAdjust.type)} style={{ padding: '10px 20px', borderRadius: '6px', background: inlineWalletAdjust.type === 'add' ? 'var(--success)' : 'var(--danger)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
                        {inlineWalletAdjust.type === 'add' ? 'Add' : 'Deduct'}
                      </button>
                      <button onClick={() => setInlineWalletAdjust({ show: false, type: 'add', amount: '', currency: 'INR' })} style={{ padding: '10px 15px', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Assigned Admin/Broker Info */}
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '15px', marginBottom: '15px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>Assigned Admin/Broker</p>
                    {userDetailPanel.parentAdmin ? (
                      <div style={{ marginTop: '5px' }}>
                        <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: '15px', fontWeight: 500 }}>
                          {userDetailPanel.parentAdmin.name}
                        </p>
                        <p style={{ margin: '2px 0 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                          {userDetailPanel.parentAdmin.oderId} • {userDetailPanel.parentAdmin.role === 'sub_admin' ? 'Sub-Admin' : 'Broker'}
                        </p>
                      </div>
                    ) : (
                      <p style={{ margin: '5px 0 0 0', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 500 }}>
                        {userDetailPanel.user.parentAdminOderId || 'Not Assigned'}
                      </p>
                    )}
                  </div>
                  <button 
                    onClick={() => { fetchAdminsList(); setSelectedAdminId(userDetailPanel.user.parentAdminId || ''); setChangeAdminModal({ open: true, user: userDetailPanel.user }); }}
                    style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--accent-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Action Buttons — theme-aware (light + dark) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                <button onClick={() => { setChangePasswordModal({ open: true, user: userDetailPanel.user }); }} style={{ padding: '14px', borderRadius: '10px', background: 'color-mix(in srgb, var(--success) 12%, var(--bg-secondary))', border: '1px solid color-mix(in srgb, var(--success) 35%, var(--border-color))', color: 'var(--success)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  🔒 Change Password
                </button>
                <button onClick={() => setInlineWalletAdjust({ show: true, type: 'add', amount: '', currency: 'INR' })} style={{ padding: '14px', borderRadius: '10px', background: 'color-mix(in srgb, var(--warning) 12%, var(--bg-secondary))', border: '1px solid color-mix(in srgb, var(--warning) 35%, var(--border-color))', color: 'var(--warning)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  📥 Add Fund
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                <button onClick={() => setInlineWalletAdjust({ show: true, type: 'subtract', amount: '', currency: 'INR' })} style={{ padding: '14px', borderRadius: '10px', background: 'color-mix(in srgb, var(--warning) 10%, var(--bg-secondary))', border: '1px solid color-mix(in srgb, var(--warning) 30%, var(--border-color))', color: 'var(--warning)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  💵 Deduct Fund
                </button>
                <button onClick={() => { toggleUserStatus(userDetailPanel.user._id, userDetailPanel.user.isActive); setUserDetailPanel({ open: false, user: null, view: 'info', positions: [], positionsLoading: false, wallet: null }); }} style={{ padding: '14px', borderRadius: '10px', background: userDetailPanel.user.isActive === false ? 'color-mix(in srgb, var(--success) 12%, var(--bg-secondary))' : 'color-mix(in srgb, var(--danger) 12%, var(--bg-secondary))', border: userDetailPanel.user.isActive === false ? '1px solid color-mix(in srgb, var(--success) 35%, var(--border-color))' : '1px solid color-mix(in srgb, var(--danger) 35%, var(--border-color))', color: userDetailPanel.user.isActive === false ? 'var(--success)' : 'var(--danger)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  🚫 {userDetailPanel.user.isActive === false ? 'Unblock' : 'Block'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                <button onClick={() => goToHedgingUserSegmentSettings(userDetailPanel.user)} style={{ padding: '14px', borderRadius: '10px', background: 'color-mix(in srgb, #8b5cf6 12%, var(--bg-secondary))', border: '1px solid color-mix(in srgb, #8b5cf6 35%, var(--border-color))', color: '#8b5cf6', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  ⚙️ Hedging segment settings
                </button>
                <button onClick={() => openTradeModeModal(userDetailPanel.user)} style={{ padding: '14px', borderRadius: '10px', background: 'color-mix(in srgb, var(--warning) 10%, var(--bg-secondary))', border: '1px solid color-mix(in srgb, var(--warning) 32%, var(--border-color))', color: 'var(--warning)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  📊 Order Modes
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                <button onClick={() => loginAsUser(userDetailPanel.user)} style={{ padding: '14px', borderRadius: '10px', background: 'color-mix(in srgb, var(--accent-primary) 12%, var(--bg-secondary))', border: '1px solid color-mix(in srgb, var(--accent-primary) 35%, var(--border-color))', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  ➡️ Login as User
                </button>
                <button onClick={() => { setReportPreview(null); setReportModal({ open: true, user: userDetailPanel.user }); }} style={{ padding: '14px', borderRadius: '10px', background: 'color-mix(in srgb, var(--success) 10%, var(--bg-secondary))', border: '1px solid color-mix(in srgb, var(--success) 30%, var(--border-color))', color: 'var(--success)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  📥 Download Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User report modal (view + download CSV) */}
      {reportModal.open && reportModal.user && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '30px', borderRadius: '12px', width: reportPreview ? 'min(920px, 98vw)' : '500px', maxWidth: '98vw', border: '1px solid var(--border-color)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              📋 User report — {reportModal.user?.name || reportModal.user?.oderId}
            </h3>
            
            {/* Date Range Options */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '12px', color: 'var(--text-muted)', fontSize: '14px' }}>Date Range</label>
              
              {/* All Time Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', background: reportForm.allTime ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-primary)', borderRadius: '8px', border: reportForm.allTime ? '2px solid #10b981' : '1px solid var(--border-color)', marginBottom: '12px' }}>
                <input
                  type="checkbox"
                  checked={reportForm.allTime}
                  onChange={(e) => setReportForm(prev => ({ ...prev, allTime: e.target.checked }))}
                  style={{ width: '18px', height: '18px', accentColor: '#10b981' }}
                />
                <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: reportForm.allTime ? '600' : '400' }}>📅 All Time (From Beginning)</span>
              </label>
              
              {/* Custom Date Range */}
              {!reportForm.allTime && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-muted)', fontSize: '12px' }}>From</label>
                    <input
                      type="date"
                      value={reportForm.fromDate}
                      onChange={(e) => setReportForm(prev => ({ ...prev, fromDate: e.target.value }))}
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-muted)', fontSize: '12px' }}>To</label>
                    <input
                      type="date"
                      value={reportForm.toDate}
                      onChange={(e) => setReportForm(prev => ({ ...prev, toDate: e.target.value }))}
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}
                    />
                  </div>
                </div>
              )}
            </div>
            
            {/* Report Types */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '12px', color: 'var(--text-muted)', fontSize: '14px' }}>Select Report Types</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', background: reportForm.reportTypes.loginActivity ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-primary)', borderRadius: '8px', border: reportForm.reportTypes.loginActivity ? '1px solid #10b981' : '1px solid var(--border-color)' }}>
                  <input
                    type="checkbox"
                    checked={reportForm.reportTypes.loginActivity}
                    onChange={(e) => setReportForm(prev => ({ ...prev, reportTypes: { ...prev.reportTypes, loginActivity: e.target.checked } }))}
                    style={{ width: '18px', height: '18px', accentColor: '#10b981' }}
                  />
                  <span style={{ color: '#fff', fontSize: '14px' }}>🔐 Login/Logout Activity</span>
                </label>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', background: reportForm.reportTypes.trades ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-primary)', borderRadius: '8px', border: reportForm.reportTypes.trades ? '1px solid #3b82f6' : '1px solid var(--border-color)' }}>
                  <input
                    type="checkbox"
                    checked={reportForm.reportTypes.trades}
                    onChange={(e) => setReportForm(prev => ({ ...prev, reportTypes: { ...prev.reportTypes, trades: e.target.checked } }))}
                    style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }}
                  />
                  <span style={{ color: '#fff', fontSize: '14px' }}>📊 Activity History</span>
                </label>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', background: reportForm.reportTypes.funds ? 'rgba(234, 179, 8, 0.1)' : 'var(--bg-primary)', borderRadius: '8px', border: reportForm.reportTypes.funds ? '1px solid #eab308' : '1px solid var(--border-color)' }}>
                  <input
                    type="checkbox"
                    checked={reportForm.reportTypes.funds}
                    onChange={(e) => setReportForm(prev => ({ ...prev, reportTypes: { ...prev.reportTypes, funds: e.target.checked } }))}
                    style={{ width: '18px', height: '18px', accentColor: '#eab308' }}
                  />
                  <span style={{ color: '#fff', fontSize: '14px' }}>💰 Deposit/Withdrawal History</span>
                </label>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', background: reportForm.reportTypes.positions ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-primary)', borderRadius: '8px', border: reportForm.reportTypes.positions ? '1px solid #8b5cf6' : '1px solid var(--border-color)' }}>
                  <input
                    type="checkbox"
                    checked={reportForm.reportTypes.positions}
                    onChange={(e) => setReportForm(prev => ({ ...prev, reportTypes: { ...prev.reportTypes, positions: e.target.checked } }))}
                    style={{ width: '18px', height: '18px', accentColor: '#8b5cf6' }}
                  />
                  <span style={{ color: '#fff', fontSize: '14px' }}>📈 Position History</span>
                </label>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', background: reportForm.reportTypes.ledger ? 'rgba(236, 72, 153, 0.1)' : 'var(--bg-primary)', borderRadius: '8px', border: reportForm.reportTypes.ledger ? '1px solid #ec4899' : '1px solid var(--border-color)' }}>
                  <input
                    type="checkbox"
                    checked={reportForm.reportTypes.ledger}
                    onChange={(e) => setReportForm(prev => ({ ...prev, reportTypes: { ...prev.reportTypes, ledger: e.target.checked } }))}
                    style={{ width: '18px', height: '18px', accentColor: '#ec4899' }}
                  />
                  <span style={{ color: '#fff', fontSize: '14px' }}>💳 Transaction History</span>
                </label>
              </div>
            </div>

            {reportPreview != null && reportPreviewParsed && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 600 }}>Report preview</span>
                  <button
                    type="button"
                    onClick={() => setReportPreview(null)}
                    disabled={reportBusy}
                    style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: reportBusy ? 'not-allowed' : 'pointer', fontSize: '12px' }}
                  >
                    Clear preview
                  </button>
                </div>

                {reportPreviewParsed.rawFallback ? (
                  <pre
                    style={{
                      maxHeight: '320px',
                      overflow: 'auto',
                      margin: 0,
                      padding: '12px',
                      background: 'var(--bg-primary)',
                      borderRadius: '8px',
                      border: '1px solid #334155',
                      fontSize: '12px',
                      lineHeight: 1.45,
                      color: '#e2e8f0',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                  >
                    {reportPreviewParsed.rawFallback}
                  </pre>
                ) : (
                  <div
                    style={{
                      maxHeight: 'min(52vh, 480px)',
                      overflowY: 'auto',
                      padding: '4px',
                      borderRadius: '10px',
                      border: '1px solid #334155',
                      background: '#0c0c14'
                    }}
                  >
                    {reportPreviewParsed.meta.length > 0 && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                          gap: '10px 16px',
                          padding: '14px',
                          marginBottom: '12px',
                          background: 'linear-gradient(145deg, #13131f 0%, #0f0f18 100%)',
                          borderRadius: '8px',
                          border: '1px solid #2d2d3d'
                        }}
                      >
                        {reportPreviewParsed.meta.map((m, idx) => (
                          <div key={idx} style={{ minWidth: 0 }}>
                            {m.key ? (
                              <>
                                <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{m.key}</div>
                                <div style={{ color: '#f1f5f9', fontSize: '14px', fontWeight: 500, wordBreak: 'break-word' }}>{m.value}</div>
                              </>
                            ) : (
                              <div style={{ color: '#cbd5e1', fontSize: '13px', wordBreak: 'break-word' }}>{m.value}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {reportPreviewParsed.sections.map((sec, si) => (
                      <div key={si} style={{ marginBottom: '18px', padding: '0 10px' }}>
                        <div
                          style={{
                            color: '#38bdf8',
                            fontWeight: 600,
                            fontSize: '13px',
                            marginBottom: '10px',
                            paddingBottom: '6px',
                            borderBottom: '1px solid #1e293b',
                            letterSpacing: '0.02em'
                          }}
                        >
                          {sec.title}
                        </div>
                        {sec.kind === 'message' && (
                          <p style={{ margin: 0, color: '#64748b', fontSize: '13px', fontStyle: 'italic' }}>{sec.message}</p>
                        )}
                        {sec.kind === 'empty' && (
                          <p style={{ margin: 0, color: '#64748b', fontSize: '13px', fontStyle: 'italic' }}>No rows in this section.</p>
                        )}
                        {sec.kind === 'text' && (
                          <pre
                            style={{
                              margin: 0,
                              padding: '10px',
                              background: 'var(--bg-primary)',
                              borderRadius: '6px',
                              fontSize: '12px',
                              color: '#cbd5e1',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word'
                            }}
                          >
                            {sec.lines.join('\n')}
                          </pre>
                        )}
                        {sec.kind === 'table' && (
                          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #1e293b' }}>
                            <table
                              style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: '13px',
                                minWidth: sec.columns.length > 4 ? 640 : undefined
                              }}
                            >
                              <thead>
                                <tr style={{ background: '#1e293b' }}>
                                  {sec.columns.map((col, ci) => (
                                    <th
                                      key={ci}
                                      style={{
                                        textAlign: 'left',
                                        padding: '10px 12px',
                                        color: '#cbd5e1',
                                        fontWeight: 600,
                                        borderBottom: '2px solid #334155',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      {col}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {sec.rows.length === 0 ? (
                                  <tr>
                                    <td colSpan={sec.columns.length} style={{ padding: '14px', color: '#64748b', fontStyle: 'italic' }}>
                                      No data rows
                                    </td>
                                  </tr>
                                ) : (
                                  sec.rows.map((row, ri) => (
                                    <tr key={ri} style={{ background: ri % 2 === 0 ? '#12121c' : '#0a0a12' }}>
                                      {sec.columns.map((_, ci) => (
                                        <td
                                          key={ci}
                                          style={{
                                            padding: '9px 12px',
                                            color: '#e2e8f0',
                                            borderBottom: '1px solid #1e293b',
                                            verticalAlign: 'top',
                                            maxWidth: 220,
                                            wordBreak: 'break-word'
                                          }}
                                        >
                                          {row[ci] ?? ''}
                                        </td>
                                      ))}
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <button 
                onClick={() => {
                  setReportModal({ open: false, user: null });
                  setReportPreview(null);
                  setReportForm({
                    allTime: true,
                    fromDate: '',
                    toDate: '',
                    reportTypes: { loginActivity: true, trades: true, funds: true, positions: true, ledger: true }
                  });
                }} 
                style={{ flex: '1 1 120px', padding: '14px', borderRadius: '8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '14px' }}
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={viewUserReport}
                disabled={reportBusy}
                style={{ flex: '1 1 120px', padding: '14px', borderRadius: '8px', background: reportBusy ? '#666' : '#0ea5e9', color: '#fff', border: 'none', cursor: reportBusy ? 'not-allowed' : 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {reportViewLoading ? '⏳ Loading...' : '👁 View report'}
              </button>
              <button 
                type="button"
                onClick={downloadUserReport}
                disabled={reportBusy}
                style={{ flex: '1 1 120px', padding: '14px', borderRadius: '8px', background: reportBusy ? '#666' : '#10b981', color: '#fff', border: 'none', cursor: reportBusy ? 'not-allowed' : 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {reportDownloadLoading ? '⏳ Generating...' : '📥 Download CSV'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {changePasswordModal.open && changePasswordModal.user && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '30px', borderRadius: '12px', width: '400px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#fff' }}>Change Password - {changePasswordModal.user?.name}</h3>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '14px' }}>New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                  style={{ width: '100%', padding: '12px', paddingRight: '45px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '5px', color: 'var(--text-muted)', fontSize: '18px' }}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setChangePasswordModal({ open: false, user: null }); setNewPassword(''); setShowPassword(false); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={changeUserPassword} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '14px' }}>Change Password</button>
            </div>
          </div>
        </div>
      )}

      {/* Change Admin/Broker Modal */}
      {changeAdminModal.open && changeAdminModal.user && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '30px', borderRadius: '12px', width: '450px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#fff' }}>Change Admin/Broker - {changeAdminModal.user?.name}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
              Select which Sub-Admin or Broker this user should be assigned to.
            </p>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '14px' }}>Assign To</label>
              <select
                value={selectedAdminId}
                onChange={(e) => setSelectedAdminId(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}
              >
                <option value="">No Assignment (Direct)</option>
                {adminsList.filter(a => a.role !== 'super_admin').map(admin => (
                  <option key={admin._id} value={admin._id}>
                    {admin.name} ({admin.oderId}) - {admin.role === 'sub_admin' ? 'Sub-Admin' : 'Broker'}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ background: '#252540', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>Current Assignment</p>
              <p style={{ margin: '5px 0 0 0', color: '#fff', fontSize: '14px' }}>
                {changeAdminModal.user.parentAdminOderId || 'Not Assigned'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setChangeAdminModal({ open: false, user: null }); setSelectedAdminId(''); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={changeUserAdmin} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '14px' }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Order Mode Settings Modal */}
      {tradeModeModal.open && tradeModeModal.user && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: '20px' }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '30px', borderRadius: '12px', width: '450px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#fff' }}>📊 Order Mode Settings</h3>
            <p style={{ margin: '0 0 20px 0', color: 'var(--text-muted)', fontSize: '14px' }}>{tradeModeModal.user.name} ({tradeModeModal.user.oderId})</p>
            
            <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '15px' }}>Select which order modes this user can access:</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '25px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: tradeModeSettings.hedging ? '#1e3a2e' : '#2a2e3a', borderRadius: '10px', cursor: 'pointer', border: tradeModeSettings.hedging ? '1px solid #10b981' : '1px solid #3a3e4a' }}>
                <input
                  type="checkbox"
                  checked={tradeModeSettings.hedging}
                  onChange={(e) => setTradeModeSettings(prev => ({ ...prev, hedging: e.target.checked }))}
                  style={{ width: '20px', height: '20px', accentColor: '#10b981' }}
                />
                <div>
                  <span style={{ color: '#fff', fontWeight: '500', display: 'block' }}>Hedging Mode</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Forex/Crypto MT5-style execution with multiple positions</span>
                </div>
              </label>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: '#1e3a2e', borderRadius: '10px', cursor: 'not-allowed', border: '1px solid #10b981', opacity: 0.9 }}>
                <input
                  type="checkbox"
                  checked={true}
                  disabled={true}
                  style={{ width: '20px', height: '20px', accentColor: '#10b981' }}
                />
                <div>
                  <span style={{ color: '#fff', fontWeight: '500', display: 'block' }}>Netting Mode <span style={{ color: '#10b981', fontSize: '11px' }}>(Required)</span></span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Indian market style - single position per symbol. Always enabled.</span>
                </div>
              </label>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: tradeModeSettings.binary ? '#1e3a2e' : '#2a2e3a', borderRadius: '10px', cursor: 'pointer', border: tradeModeSettings.binary ? '1px solid #10b981' : '1px solid #3a3e4a' }}>
                <input
                  type="checkbox"
                  checked={tradeModeSettings.binary}
                  onChange={(e) => setTradeModeSettings(prev => ({ ...prev, binary: e.target.checked }))}
                  style={{ width: '20px', height: '20px', accentColor: '#10b981' }}
                />
                <div>
                  <span style={{ color: '#fff', fontWeight: '500', display: 'block' }}>Binary Mode</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Time-based UP/DOWN predictions</span>
                </div>
              </label>
            </div>
            
            {!tradeModeSettings.hedging && !tradeModeSettings.netting && !tradeModeSettings.binary && (
              <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '15px', textAlign: 'center' }}>⚠️ At least one mode should be enabled</p>
            )}

            
            {/* Currency Display Settings */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '10px' }}>
              <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '15px' }}>💱 Currency Display Options:</p>
              
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: currencyDisplaySetting === 'USD' ? '#1e3a5e' : '#2a2e3a', borderRadius: '10px', cursor: 'pointer', border: currencyDisplaySetting === 'USD' ? '1px solid #3b82f6' : '1px solid #3a3e4a' }}>
                  <input
                    type="radio"
                    name="currencyDisplay"
                    checked={currencyDisplaySetting === 'USD'}
                    onChange={() => setCurrencyDisplaySetting('USD')}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <span style={{ color: '#fff', fontWeight: '500' }}>$ USD Only</span>
                </label>
                
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: currencyDisplaySetting === 'INR' ? '#5e3a1e' : '#2a2e3a', borderRadius: '10px', cursor: 'pointer', border: currencyDisplaySetting === 'INR' ? '1px solid #f59e0b' : '1px solid #3a3e4a' }}>
                  <input
                    type="radio"
                    name="currencyDisplay"
                    checked={currencyDisplaySetting === 'INR'}
                    onChange={() => setCurrencyDisplaySetting('INR')}
                    style={{ accentColor: '#f59e0b' }}
                  />
                  <span style={{ color: '#fff', fontWeight: '500' }}>₹ INR Only</span>
                </label>
                
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: currencyDisplaySetting === 'BOTH' ? '#1e3a2e' : '#2a2e3a', borderRadius: '10px', cursor: 'pointer', border: currencyDisplaySetting === 'BOTH' ? '1px solid #10b981' : '1px solid #3a3e4a' }}>
                  <input
                    type="radio"
                    name="currencyDisplay"
                    checked={currencyDisplaySetting === 'BOTH'}
                    onChange={() => setCurrencyDisplaySetting('BOTH')}
                    style={{ accentColor: '#10b981' }}
                  />
                  <span style={{ color: '#fff', fontWeight: '500' }}>Both</span>
                </label>
              </div>
              
              <p style={{ color: '#666', fontSize: '11px', textAlign: 'center' }}>
                {currencyDisplaySetting === 'USD' && 'User will only see USD currency option'}
                {currencyDisplaySetting === 'INR' && 'User will only see INR currency option'}
                {currencyDisplaySetting === 'BOTH' && 'User can toggle between USD and INR'}
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button 
                onClick={() => setTradeModeModal({ open: false, user: null })} 
                style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '14px' }}
              >
                Cancel
              </button>
              <button 
                onClick={saveTradeModeSettings} 
                disabled={tradeModeLoading || (!tradeModeSettings.hedging && !tradeModeSettings.netting && !tradeModeSettings.binary)}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: tradeModeLoading || (!tradeModeSettings.hedging && !tradeModeSettings.netting && !tradeModeSettings.binary) ? 0.5 : 1 }}
              >
                {tradeModeLoading ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {createUserModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '30px', borderRadius: '12px', width: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#fff' }}>Create New User</h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)' }}>Name *</label>
              <input 
                type="text" 
                value={createUserForm.name} 
                onChange={(e) => setCreateUserForm(prev => ({ ...prev, name: e.target.value }))} 
                placeholder="Enter full name"
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)' }}>Email *</label>
              <input 
                type="email" 
                value={createUserForm.email} 
                onChange={(e) => setCreateUserForm(prev => ({ ...prev, email: e.target.value }))} 
                placeholder="Enter email address"
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)' }}>Phone</label>
              <input 
                type="tel" 
                value={createUserForm.phone} 
                onChange={(e) => setCreateUserForm(prev => ({ ...prev, phone: e.target.value }))} 
                placeholder="Enter phone number"
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)' }}>Password *</label>
              <input 
                type="password" 
                value={createUserForm.password} 
                onChange={(e) => setCreateUserForm(prev => ({ ...prev, password: e.target.value }))} 
                placeholder="Enter password"
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)' }}>Initial Balance (USD)</label>
              <input 
                type="number" 
                value={createUserForm.initialBalance} 
                onChange={(e) => setCreateUserForm(prev => ({ ...prev, initialBalance: e.target.value }))} 
                placeholder="0.00"
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)' }}>Assign to Subadmin/Broker</label>
              <select 
                value={createUserForm.assignTo} 
                onChange={(e) => setCreateUserForm(prev => ({ ...prev, assignTo: e.target.value }))} 
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                <option value="">-- Direct to Super Admin --</option>
                {subadminsList.map(admin => (
                  <option key={admin._id} value={admin._id}>
                    {admin.name} ({admin.role}) - {admin.email}
                  </option>
                ))}
              </select>
              <p style={{ color: '#666', fontSize: '11px', marginTop: '5px' }}>
                Leave empty to assign directly to super admin
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setCreateUserModal(false); setCreateUserForm({ name: '', email: '', phone: '', password: '', initialBalance: '', assignTo: '' }); }}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={createUser}
                disabled={createUserLoading}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#8b5cf6', color: '#fff', border: 'none', cursor: createUserLoading ? 'not-allowed' : 'pointer', opacity: createUserLoading ? 0.7 : 1 }}
              >
                {createUserLoading ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagement;
