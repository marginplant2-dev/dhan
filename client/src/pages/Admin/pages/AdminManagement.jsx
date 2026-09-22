import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';
import PermissionPicker from './PermissionPicker';
import { ROLE_PRESETS, emptyPermissions, normalizePermissions } from './adminPermissionCatalog';

// All admin hierarchy/audit endpoints go through the permission chokepoint,
// which needs the bearer token to resolve the admin. Wrap fetch so every call
// in this page picks up the super-admin/sub-admin token automatically.
function authedFetch(url, init = {}) {
  const token = localStorage.getItem('dhanfunded-admin-token') || '';
  const headers = { ...(init.headers || {}) };
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { ...init, headers });
}

function AdminManagement() {
  const { API_URL } = useOutletContext();
  const location = useLocation();
  const [admins, setAdmins] = useState([]);
  const [hierarchyTree, setHierarchyTree] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [fundRequests, setFundRequests] = useState([]);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [walletAdjust, setWalletAdjust] = useState({ show: false, type: 'add', amount: '' });
  
  // Activity Logs state
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);
  const [activityLogsPagination, setActivityLogsPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [activityLogsFilter, setActivityLogsFilter] = useState({ activityType: '', search: '', adminId: '', startDate: '', endDate: '' });
  const [adminsForFilter, setAdminsForFilter] = useState([]);
  const [exportingLogs, setExportingLogs] = useState(false);
  const [adminFilterSearch, setAdminFilterSearch] = useState('');
  const [showAdminFilterDropdown, setShowAdminFilterDropdown] = useState(false);
  const [rowMenuFor, setRowMenuFor] = useState(null);   // admin._id whose menu is open
  const [search, setSearch] = useState('');
  
  // Form state (permissions use new granular keys — see adminPermissionCatalog.js)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    newPassword: '',
    role: 'sub_admin',
    parentId: '',
    isActive: true,
    permissions: ROLE_PRESETS.sub_admin
  });

  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('/brokers')) return 'brokers';
    if (path.includes('/hierarchy')) return 'hierarchy';
    if (path.includes('/fund-requests')) return 'fund-requests';
    if (path.includes('/subadmin-logs')) return 'subadmin-logs';
    if (path.includes('/broker-logs')) return 'broker-logs';
    return 'sub-admins';
  };

  const activeTab = getActiveTab();

  const getTabTitle = () => {
    const titles = {
      'sub-admins': 'Sub-Admin Management',
      'brokers': 'Broker Management',
      'hierarchy': 'Hierarchy View',
      'fund-requests': 'Fund Requests',
      'subadmin-logs': 'Sub-Admin Activity Logs',
      'broker-logs': 'Broker Activity Logs'
    };
    return titles[activeTab] || 'Admin Management';
  };

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`${API_URL}/api/admin/hierarchy`);
      const data = await res.json();
      if (data.success) {
        setAdmins(data.admins || []);
      }
    } catch (error) {
      console.error('Error fetching admins:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHierarchyTree = async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`${API_URL}/api/admin/hierarchy/tree`);
      const data = await res.json();
      if (data.success) {
        setHierarchyTree(data.tree || []);
        setStats(data.stats || {});
      }
    } catch (error) {
      console.error('Error fetching hierarchy:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFundRequests = async () => {
    setLoading(true);
    try {
      // Get current admin from localStorage - check both keys (super admin uses dhanfunded-admin-user)
      let adminData = JSON.parse(localStorage.getItem('dhanfunded-admin') || '{}');
      if (!adminData._id) {
        // Try dhanfunded-admin-user for super admin
        adminData = JSON.parse(localStorage.getItem('dhanfunded-admin-user') || '{}');
      }
      
      // Use _id if available, otherwise use id (oderId) - API now accepts both
      const adminId = adminData._id || adminData.id;
      if (!adminId) {
        setFundRequests([]);
        setLoading(false);
        return;
      }
      
      const res = await authedFetch(`${API_URL}/api/admin/hierarchy/${adminId}/fund-requests`);
      const data = await res.json();
      if (data.success) {
        setFundRequests(data.transactions || []);
      } else {
        console.error('Fund requests error:', data.error);
      }
    } catch (error) {
      console.error('Error fetching fund requests:', error);
    } finally {
      setLoading(false);
    }
  };

  // Activity Logs Functions
  const fetchActivityLogs = useCallback(async (page = 1, role = 'sub_admin') => {
    setActivityLogsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('limit', 20);
      if (activityLogsFilter.activityType) params.set('activityType', activityLogsFilter.activityType);
      if (activityLogsFilter.search) params.set('search', activityLogsFilter.search);
      if (activityLogsFilter.adminId) params.set('adminId', activityLogsFilter.adminId);
      if (activityLogsFilter.startDate) params.set('startDate', activityLogsFilter.startDate);
      if (activityLogsFilter.endDate) params.set('endDate', activityLogsFilter.endDate);
      
      const endpoint = role === 'broker' ? 'broker-activity-logs' : 'subadmin-activity-logs';
      const res = await authedFetch(`${API_URL}/api/admin/${endpoint}?${params}`);
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

  const fetchAdminsForFilter = useCallback(async (role = 'sub_admin') => {
    try {
      const res = await authedFetch(`${API_URL}/api/admin/hierarchy`);
      const data = await res.json();
      if (data.success) {
        const filtered = (data.admins || []).filter(a => a.role === role);
        setAdminsForFilter(filtered);
      }
    } catch (error) {
      console.error('Error fetching admins for filter:', error);
    }
  }, [API_URL]);

  const exportActivityLogs = async (role = 'sub_admin') => {
    setExportingLogs(true);
    try {
      const params = new URLSearchParams();
      params.set('role', role);
      if (activityLogsFilter.activityType) params.set('activityType', activityLogsFilter.activityType);
      if (activityLogsFilter.adminId) params.set('adminId', activityLogsFilter.adminId);
      if (activityLogsFilter.startDate) params.set('startDate', activityLogsFilter.startDate);
      if (activityLogsFilter.endDate) params.set('endDate', activityLogsFilter.endDate);
      
      const res = await authedFetch(`${API_URL}/api/admin/admin-activity-logs/export?${params}`);
      const blob = await res.blob();
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${role}-activity-logs-${new Date().toISOString().split('T')[0]}.csv`;
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

  const getActivityIcon = (type) => {
    const icons = {
      'login': '🔑', 'logout': '🚪', 'register': '📝', 'failed_login': '⚠️',
      'user_created': '👤', 'user_updated': '✏️', 'user_blocked': '🚫', 'user_unblocked': '✅',
      'trade_placed': '📈', 'trade_closed': '📉', 'trade_modified': '🔄',
      'deposit_approved': '✅', 'deposit_rejected': '❌',
      'withdrawal_approved': '✅', 'withdrawal_rejected': '❌',
      'wallet_credit': '💵', 'wallet_debit': '💳',
      'fund_request': '💰', 'fund_approved': '✅', 'fund_rejected': '❌',
      'password_change': '🔐', 'profile_update': '👤', 'settings_change': '⚙️',
      'kyc_approved': '✅', 'kyc_rejected': '❌'
    };
    return icons[type] || '📋';
  };

  const getActivityColor = (type) => {
    if (type?.includes('approved') || type === 'login' || type === 'user_created') return '#10b981';
    if (type?.includes('rejected') || type === 'failed_login' || type === 'user_blocked') return '#ef4444';
    if (type?.includes('request') || type === 'logout') return '#f59e0b';
    return '#888';
  };

  const createAdmin = async () => {
    try {
      let adminData = JSON.parse(localStorage.getItem('dhanfunded-admin') || '{}');
      if (!adminData._id) {
        adminData = JSON.parse(localStorage.getItem('dhanfunded-admin-user') || '{}');
      }
      const adminId = adminData._id || adminData.id;
      
      const res = await authedFetch(`${API_URL}/api/admin/hierarchy/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          permissions: form.permissions,
          createdBy: adminId
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`${form.role === 'sub_admin' ? 'Sub-Admin' : form.role === 'bank_user' ? 'Bank User' : 'Broker'} created successfully! ID: ${data.admin.oderId}`);
        setShowCreateModal(false);
        setForm({
          name: '', email: '', phone: '', password: '', role: 'sub_admin', parentId: '',
          permissions: ROLE_PRESETS.sub_admin
        });
        fetchAdmins();
      } else {
        alert(data.error || 'Failed to create admin');
      }
    } catch (error) {
      console.error('Error creating admin:', error);
      alert('Error creating admin');
    }
  };

  const updateAdmin = async () => {
    try {
      const updateData = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        isActive: form.isActive,
        permissions: form.permissions
      };
      
      // Include password if provided
      if (form.newPassword && form.newPassword.length >= 6) {
        updateData.password = form.newPassword;
      }
      
      const res = await authedFetch(`${API_URL}/api/admin/hierarchy/${selectedAdmin._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      const data = await res.json();
      if (data.success) {
        alert('Admin updated successfully!');
        setShowEditModal(false);
        fetchAdmins();
      } else {
        alert(data.error || 'Failed to update admin');
      }
    } catch (error) {
      console.error('Error updating admin:', error);
    }
  };

  const setActive = async (admin, isActive) => {
    const res = await authedFetch(`${API_URL}/api/admin/hierarchy/${admin._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
    const data = await res.json();
    if (data.success) fetchAdmins();
    else alert(data.error || 'Could not update the admin');
  };

  const resetPassword = async (admin) => {
    const pwd = prompt(`New password for ${admin.name} (minimum 6 characters)`);
    if (!pwd) return;
    if (pwd.length < 6) return alert('Password must be at least 6 characters');
    const res = await authedFetch(`${API_URL}/api/admin/hierarchy/${admin._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    const data = await res.json();
    alert(data.success ? 'Password changed.' : (data.error || 'Could not change the password'));
  };

  const deleteAdmin = async (adminId) => {
    if (!confirm('Are you sure you want to delete this admin?')) return;
    
    try {
      const res = await authedFetch(`${API_URL}/api/admin/hierarchy/${adminId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        alert('Admin deleted successfully!');
        fetchAdmins();
      } else {
        alert(data.error || 'Failed to delete admin');
      }
    } catch (error) {
      console.error('Error deleting admin:', error);
    }
  };

  // Login as Sub-Admin or Broker (impersonate)
  const loginAsAdmin = async (admin) => {
    if (!confirm(`Are you sure you want to login as ${admin.name} (${getRoleLabel(admin.role)})?`)) return;
    
    try {
      const endpoint = admin.role === 'sub_admin' 
        ? `${API_URL}/api/admin/subadmins/${admin._id}/login-as`
        : `${API_URL}/api/admin/brokers/${admin._id}/login-as`;
      
      const res = await authedFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (data.success) {
        // Pass session data via URL hash to avoid affecting current admin's localStorage
        const redirectUrl = admin.role === 'sub_admin' ? '/subadmin-panel' : '/broker-panel';
        const sessionData = btoa(JSON.stringify({
          admin: data.admin,
          token: 'admin-' + (data.admin._id || data.admin.id)
        }));
        
        // Open with impersonate parameter
        window.open(`${redirectUrl}?impersonate=${sessionData}`, '_blank');
      } else {
        alert(data.error || 'Failed to login as admin');
      }
    } catch (error) {
      console.error('Error logging in as admin:', error);
      alert('Failed to login as admin');
    }
  };

  const approveFundRequest = async (transactionId) => {
    try {
      let adminData = JSON.parse(localStorage.getItem('dhanfunded-admin') || '{}');
      if (!adminData._id) {
        adminData = JSON.parse(localStorage.getItem('dhanfunded-admin-user') || '{}');
      }
      const adminId = adminData._id || adminData.id;
      
      const res = await authedFetch(`${API_URL}/api/admin/hierarchy/approve-fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          approverId: adminId
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Fund request approved!');
        fetchFundRequests();
      } else {
        alert(data.error || 'Failed to approve fund request');
      }
    } catch (error) {
      console.error('Error approving fund:', error);
    }
  };

  const rejectFundRequest = async (transactionId) => {
    try {
      const res = await authedFetch(`${API_URL}/api/admin/transactions/${transactionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' })
      });
      const data = await res.json();
      if (data.success) {
        alert('Fund request rejected');
        fetchFundRequests();
      } else {
        alert(data.error || 'Failed to reject');
      }
    } catch (error) {
      console.error('Error rejecting fund:', error);
    }
  };

  const openEditModal = (admin) => {
    setSelectedAdmin(admin);
    setForm({
      name: admin.name,
      email: admin.email,
      phone: admin.phone || '',
      isActive: admin.isActive,
      newPassword: '',
      // Normalize whatever shape came back (legacy nested vs new flat) into
      // the picker's expected flat-dotted format, then backfill with preset for
      // any missing keys so the picker starts consistent.
      permissions: (() => {
        const raw = admin.permissions;
        const preset = ROLE_PRESETS[admin.role] || ROLE_PRESETS.broker;
        if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) {
          return { ...emptyPermissions(), ...normalizePermissions(raw) };
        }
        return { ...emptyPermissions(), ...preset };
      })()
    });
    setShowEditModal(true);
  };

  const openViewModal = (admin) => {
    setSelectedAdmin(admin);
    setWalletAdjust({ show: false, type: 'add', amount: '' });
    setShowViewModal(true);
  };

  const adjustAdminWallet = async (type) => {
    if (!walletAdjust.amount || parseFloat(walletAdjust.amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    try {
      const res = await authedFetch(`${API_URL}/api/admin/hierarchy/${selectedAdmin._id}/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          type, 
          amount: parseFloat(walletAdjust.amount)
        })
      });
      const data = await res.json();
      if (data.success) {
        const newBalance = type === 'add' 
          ? (selectedAdmin.wallet?.balance || 0) + parseFloat(walletAdjust.amount)
          : (selectedAdmin.wallet?.balance || 0) - parseFloat(walletAdjust.amount);
        setSelectedAdmin(prev => ({ ...prev, wallet: { ...prev.wallet, balance: newBalance } }));
        setWalletAdjust({ show: false, type: 'add', amount: '' });
        fetchAdmins();
        alert(data.message || 'Wallet updated successfully');
      } else {
        alert(data.error || 'Failed to adjust wallet');
      }
    } catch (error) {
      console.error('Error adjusting wallet:', error);
      alert('Failed to adjust wallet');
    }
  };

  useEffect(() => {
    if (activeTab === 'hierarchy') {
      fetchHierarchyTree();
    } else if (activeTab === 'fund-requests') {
      fetchFundRequests();
    } else if (activeTab === 'subadmin-logs') {
      fetchActivityLogs(1, 'sub_admin');
      fetchAdminsForFilter('sub_admin');
    } else if (activeTab === 'broker-logs') {
      fetchActivityLogs(1, 'broker');
      fetchAdminsForFilter('broker');
    } else {
      fetchAdmins();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'subadmin-logs') {
      fetchActivityLogs(1, 'sub_admin');
    } else if (activeTab === 'broker-logs') {
      fetchActivityLogs(1, 'broker');
    }
  }, [activityLogsFilter, fetchActivityLogs]);

  const getRoleBadgeColor = (role) => {
    switch(role) {
      case 'super_admin': return '#f59e0b';
      case 'sub_admin': return '#3b82f6';
      case 'broker': return '#10b981';
      case 'bank_user': return '#a855f7';
      default: return '#6b7280';
    }
  };

  const getRoleLabel = (role) => {
    switch(role) {
      case 'super_admin': return 'Super Admin';
      case 'sub_admin': return 'Sub-Admin';
      case 'broker': return 'Broker';
      case 'bank_user': return 'Bank User';
      default: return role;
    }
  };

  // Hierarchy Tree Component
  const HierarchyNode = ({ node, level = 0 }) => {
    const [expanded, setExpanded] = useState(true);
    const hasChildren = (node.children && node.children.length > 0) || (node.users && node.users.length > 0);
    
    return (
      <div style={{ marginLeft: level * 24 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: level === 0 ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.05))' : 'var(--bg-primary)',
          borderRadius: 8,
          marginBottom: 8,
          border: `1px solid ${level === 0 ? 'rgba(245, 158, 11, 0.3)' : 'var(--border)'}`
        }}>
          {hasChildren && (
            <button 
              onClick={() => setExpanded(!expanded)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
            >
              {expanded ? '▼' : '▶'}
            </button>
          )}
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: getRoleBadgeColor(node.role),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 700, fontSize: 14
          }}>
            {node.role === 'super_admin' ? 'SA' : node.role === 'sub_admin' ? 'AD' : 'BR'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{node.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {node.oderId} • {node.email}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{
              padding: '4px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              background: getRoleBadgeColor(node.role),
              color: 'white'
            }}>
              {getRoleLabel(node.role)}
            </span>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              Wallet: ${node.wallet?.balance?.toFixed(2) || '0.00'}
            </div>
          </div>
        </div>
        
        {expanded && node.children && node.children.map((child, idx) => (
          <HierarchyNode key={child._id || idx} node={child} level={level + 1} />
        ))}
        
        {expanded && node.users && node.users.length > 0 && (
          <div style={{ marginLeft: (level + 1) * 24, marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, paddingLeft: 16 }}>
              Users ({node.users.length})
            </div>
            {node.users.map((user, idx) => (
              <div key={user._id || idx} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                background: 'var(--bg-secondary)',
                borderRadius: 6,
                marginBottom: 4,
                border: '1px solid var(--border)'
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: '#6366f1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 600, fontSize: 10
                }}>U</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{user.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{user.oderId}</div>
                </div>
                <div style={{ fontSize: 12, color: user.isActive ? '#10b981' : '#ef4444' }}>
                  ${user.wallet?.balance?.toFixed(2) || '0.00'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Filter admins based on tab, then on what the operator typed.
  const q = search.trim().toLowerCase();
  const filteredAdmins = admins.filter(admin => {
    if (activeTab === 'sub-admins' && admin.role !== 'sub_admin') return false;
    if (activeTab === 'brokers' && admin.role !== 'broker') return false;
    if (!q) return true;
    return [admin.oderId, admin.name, admin.email, admin.phone]
      .some(v => String(v || '').toLowerCase().includes(q));
  });

  // Get sub-admins for broker parent selection
  const subAdmins = admins.filter(a => a.role === 'sub_admin');

  // Activity Logs UI Component
  const renderActivityLogsUI = (role) => {
    const roleLabel = role === 'sub_admin' ? 'Sub-Admin' : 'Broker';
    
    return (
      <div className="admin-page-container">
        <div className="admin-page-header">
          <h2>📊 {roleLabel} Activity Logs</h2>
          <p style={{ color: '#888', margin: '5px 0 0 0' }}>Track all {roleLabel.toLowerCase()} activities - logins, actions, changes</p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          {/* Row 1: Admin Filter and Activity Type */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
            {/* Searchable Admin Dropdown */}
            <div style={{ position: 'relative', minWidth: '250px' }}>
              <input
                type="text"
                placeholder={activityLogsFilter.adminId ? adminsForFilter.find(a => (a.oderId || a._id) === activityLogsFilter.adminId)?.name || 'Selected' : `Search & Select ${roleLabel}...`}
                value={adminFilterSearch}
                onChange={(e) => setAdminFilterSearch(e.target.value)}
                onFocus={() => setShowAdminFilterDropdown(true)}
                style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff', width: '100%', boxSizing: 'border-box' }}
              />
              {activityLogsFilter.adminId && (
                <button
                  onClick={() => { setActivityLogsFilter(prev => ({ ...prev, adminId: '' })); setAdminFilterSearch(''); }}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px' }}
                >×</button>
              )}
              {showAdminFilterDropdown && (
                <>
                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} onClick={() => setShowAdminFilterDropdown(false)} />
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', maxHeight: '250px', overflowY: 'auto', zIndex: 100, marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                    <div style={{ padding: '10px 15px', cursor: 'pointer', borderBottom: '1px solid #333', color: '#888' }}
                      onClick={() => { setActivityLogsFilter(prev => ({ ...prev, adminId: '' })); setAdminFilterSearch(''); setShowAdminFilterDropdown(false); }}>
                      All {roleLabel}s
                    </div>
                    {adminsForFilter
                      .filter(admin => {
                        if (!adminFilterSearch) return true;
                        const search = adminFilterSearch.toLowerCase();
                        return (admin.name || '').toLowerCase().includes(search) || (admin.email || '').toLowerCase().includes(search) || (admin.oderId || '').toString().includes(search);
                      })
                      .slice(0, 20)
                      .map(admin => (
                        <div key={admin._id || admin.oderId}
                          style={{ padding: '10px 15px', cursor: 'pointer', borderBottom: '1px solid #333', background: activityLogsFilter.adminId === (admin.oderId || admin._id) ? '#333' : 'transparent' }}
                          onClick={() => { setActivityLogsFilter(prev => ({ ...prev, adminId: admin.oderId || admin._id })); setAdminFilterSearch(''); setShowAdminFilterDropdown(false); }}>
                          <div style={{ fontWeight: 500, color: '#fff' }}>{admin.name || admin.email}</div>
                          <div style={{ fontSize: '11px', color: '#888' }}>#{admin.oderId} • {admin.email}</div>
                        </div>
                      ))
                    }
                  </div>
                </>
              )}
            </div>
            <select value={activityLogsFilter.activityType} onChange={(e) => setActivityLogsFilter(prev => ({ ...prev, activityType: e.target.value }))}
              style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}>
              <option value="">All Activities</option>
              <optgroup label="Authentication">
                <option value="login">Login</option>
                <option value="logout">Logout</option>
                <option value="failed_login">Failed Login</option>
              </optgroup>
              <optgroup label="User Actions">
                <option value="user_created">User Created</option>
                <option value="user_updated">User Updated</option>
                <option value="user_blocked">User Blocked</option>
                <option value="user_unblocked">User Unblocked</option>
              </optgroup>
              <optgroup label="Market">
                <option value="trade_placed">Position Placed</option>
                <option value="trade_closed">Position Closed</option>
                <option value="trade_modified">Position Modified</option>
              </optgroup>
              <optgroup label="Funds">
                <option value="deposit_approved">Deposit Approved</option>
                <option value="deposit_rejected">Deposit Rejected</option>
                <option value="withdrawal_approved">Withdrawal Approved</option>
                <option value="withdrawal_rejected">Withdrawal Rejected</option>
                <option value="wallet_credit">Wallet Credit</option>
                <option value="wallet_debit">Wallet Debit</option>
                <option value="fund_request">Fund Request</option>
              </optgroup>
            </select>
            <input type="text" placeholder="Search..." value={activityLogsFilter.search}
              onChange={(e) => setActivityLogsFilter(prev => ({ ...prev, search: e.target.value }))}
              style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff', width: '150px' }}
            />
          </div>
          
          {/* Row 2: Date Filters and Actions */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ color: '#888', fontSize: '13px' }}>From:</span>
              <input type="date" value={activityLogsFilter.startDate}
                onChange={(e) => setActivityLogsFilter(prev => ({ ...prev, startDate: e.target.value }))}
                style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ color: '#888', fontSize: '13px' }}>To:</span>
              <input type="date" value={activityLogsFilter.endDate}
                onChange={(e) => setActivityLogsFilter(prev => ({ ...prev, endDate: e.target.value }))}
                style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a1a', color: '#fff' }}
              />
            </div>
            <button onClick={() => fetchActivityLogs(1, role)} style={{ padding: '10px 20px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>
              🔍 Search
            </button>
            <button onClick={() => setActivityLogsFilter({ activityType: '', search: '', adminId: '', startDate: '', endDate: '' })}
              style={{ padding: '10px 20px', borderRadius: '8px', background: '#333', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Clear Filters
            </button>
            <button onClick={() => exportActivityLogs(role)} disabled={exportingLogs}
              style={{ padding: '10px 20px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', cursor: exportingLogs ? 'not-allowed' : 'pointer', opacity: exportingLogs ? 0.7 : 1, marginLeft: 'auto' }}>
              {exportingLogs ? '⏳ Exporting...' : '📥 Export CSV'}
            </button>
          </div>
        </div>

        {activityLogsLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Loading activity logs...</div>
        ) : activityLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: '#1a1a2e', borderRadius: '12px', border: '1px solid #333' }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>📊</div>
            <h3 style={{ color: '#fff', margin: '0 0 10px 0' }}>No Activity Logs Found</h3>
            <p style={{ color: '#888', margin: 0 }}>No activities match your filters</p>
          </div>
        ) : (
          <>
            <div className="admin-table-container" style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>{roleLabel}</th>
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
                      <td style={{ whiteSpace: 'nowrap', fontSize: '13px' }}>{new Date(log.timestamp).toLocaleDateString()}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '13px', color: '#888' }}>{new Date(log.timestamp).toLocaleTimeString()}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{log.admin?.name || '-'}</div>
                        <div style={{ fontSize: '11px', color: '#888' }}>#{log.oderId}</div>
                      </td>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px' }}>{getActivityIcon(log.activityType)}</span>
                          <span style={{ color: getActivityColor(log.activityType), textTransform: 'capitalize', fontSize: '13px' }}>
                            {log.activityType?.replace(/_/g, ' ')}
                          </span>
                        </span>
                      </td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.description}</td>
                      <td style={{ fontSize: '12px', color: log.sessionDuration ? '#10b981' : '#888', whiteSpace: 'nowrap' }}>
                        {log.sessionDuration ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            ⏱️ {Math.floor(log.sessionDuration / 3600) > 0 ? `${Math.floor(log.sessionDuration / 3600)}h ` : ''}
                            {Math.floor((log.sessionDuration % 3600) / 60)}m {log.sessionDuration % 60}s
                          </span>
                        ) : (log.activityType === 'login' ? <span style={{ color: '#f59e0b' }}>🟢 Active</span> : '-')}
                      </td>
                      <td>
                        <span style={{
                          padding: '3px 8px', borderRadius: '4px', fontSize: '11px',
                          background: log.status === 'success' ? '#10b98120' : log.status === 'failed' ? '#ef444420' : '#f59e0b20',
                          color: log.status === 'success' ? '#10b981' : log.status === 'failed' ? '#ef4444' : '#f59e0b'
                        }}>{log.status}</span>
                      </td>
                      <td style={{ fontSize: '12px', color: '#888' }}>{log.ipAddress || '-'}</td>
                      <td style={{ fontSize: '12px', color: '#888', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {log.os === 'macOS' && '🍎'}{log.os?.includes('Windows') && '🪟'}{log.os === 'Linux' && '🐧'}{log.os === 'Android' && '🤖'}{log.os === 'iOS' && '📱'}
                          {log.os || '-'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: '#888', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {log.browser === 'Chrome' && '🌐'}{log.browser === 'Firefox' && '🦊'}{log.browser === 'Safari' && '🧭'}{log.browser === 'Edge' && '🔷'}{log.browser === 'Brave' && '🦁'}
                          {log.browser || '-'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: '#888', textTransform: 'capitalize' }}>{log.device || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {activityLogsPagination.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '20px' }}>
                <button onClick={() => fetchActivityLogs(activityLogsPagination.page - 1, role)} disabled={activityLogsPagination.page <= 1}
                  style={{ padding: '8px 16px', borderRadius: '6px', background: activityLogsPagination.page <= 1 ? '#333' : '#3b82f6', color: '#fff', border: 'none', cursor: activityLogsPagination.page <= 1 ? 'not-allowed' : 'pointer' }}>
                  Previous
                </button>
                <span style={{ padding: '8px 16px', color: '#fff' }}>
                  Page {activityLogsPagination.page} of {activityLogsPagination.totalPages} ({activityLogsPagination.total} total)
                </span>
                <button onClick={() => fetchActivityLogs(activityLogsPagination.page + 1, role)} disabled={activityLogsPagination.page >= activityLogsPagination.totalPages}
                  style={{ padding: '8px 16px', borderRadius: '6px', background: activityLogsPagination.page >= activityLogsPagination.totalPages ? '#333' : '#3b82f6', color: '#fff', border: 'none', cursor: activityLogsPagination.page >= activityLogsPagination.totalPages ? 'not-allowed' : 'pointer' }}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // Render SubAdmin Activity Logs
  if (activeTab === 'subadmin-logs') {
    return renderActivityLogsUI('sub_admin');
  }

  // Render Broker Activity Logs
  if (activeTab === 'broker-logs') {
    return renderActivityLogsUI('broker');
  }

  if (activeTab === 'hierarchy') {
    return (
      <div className="admin-page-container">
        <div className="admin-page-header">
          <h2>{getTabTitle()}</h2>
          <button onClick={fetchHierarchyTree} className="admin-btn primary">🔄 Refresh</button>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', padding: 16, borderRadius: 12, color: 'white' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.superAdmins || 0}</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>Super Admins</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', padding: 16, borderRadius: 12, color: 'white' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.subAdmins || 0}</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>Sub-Admins</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #10b981, #059669)', padding: 16, borderRadius: 12, color: 'white' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.brokers || 0}</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>Brokers</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', padding: 16, borderRadius: 12, color: 'white' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.totalUsers || 0}</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>Total Users</div>
          </div>
        </div>

        {loading ? (
          <div className="admin-loading">Loading hierarchy...</div>
        ) : (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
            {hierarchyTree.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
                <p>No hierarchy data. Create a Super Admin first.</p>
              </div>
            ) : (
              hierarchyTree.map((node, idx) => (
                <HierarchyNode key={node._id || idx} node={node} />
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'fund-requests') {
    return (
      <div className="admin-page-container">
        <div className="admin-page-header">
          <h2>{getTabTitle()}</h2>
          <button onClick={fetchFundRequests} className="admin-btn primary">🔄 Refresh</button>
        </div>

        {loading ? (
          <div className="admin-loading">Loading fund requests...</div>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Requester</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {fundRequests.length === 0 ? (
                  <tr><td colSpan="7" className="no-data">No fund requests</td></tr>
                ) : (
                  fundRequests.map((req, idx) => (
                    <tr key={req._id || idx}>
                      <td>#{req._id?.slice(-6)}</td>
                      <td>
                        <div>{req.requesterName || req.userName || 'N/A'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {req.requesterOderId || req.oderId}
                          {req.requesterRole && <span style={{ marginLeft: 4, color: '#3b82f6' }}>({req.requesterRole})</span>}
                        </div>
                      </td>
                      <td>
                        <span className="capitalize" style={{ 
                          color: req.type === 'admin_fund_request' ? '#8b5cf6' : 'inherit',
                          fontWeight: req.type === 'admin_fund_request' ? 600 : 400
                        }}>
                          {req.type === 'admin_fund_request' ? 'Admin Fund Request' : req.type}
                        </span>
                      </td>
                      <td className={req.type === 'deposit' || req.type === 'admin_fund_request' ? 'text-success' : 'text-danger'}>
                        ₹{req.amount?.toLocaleString()}
                      </td>
                      <td><span className={`status-badge status-${req.status}`}>{req.status}</span></td>
                      <td>{new Date(req.createdAt).toLocaleDateString()}</td>
                      <td>
                        {req.status === 'pending' ? (
                          <div className="action-buttons">
                            <button onClick={() => approveFundRequest(req._id)} className="admin-btn success small">✓</button>
                            <button onClick={() => rejectFundRequest(req._id)} className="admin-btn danger small">✗</button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {req.status === 'approved' ? '✓ Done' : '✗ Rejected'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const rowMenu = (admin) => ([
    { label: 'Login to their panel', icon: '↪', onClick: () => loginAsAdmin(admin) },
    { label: 'View admin profile', icon: '👁', onClick: () => openViewModal(admin) },
    { label: 'Edit permissions', icon: '✎', onClick: () => openEditModal(admin) },
    admin.isActive
      ? { label: 'Block', icon: '⊘', onClick: () => setActive(admin, false) }
      : { label: 'Unblock', icon: '✓', onClick: () => setActive(admin, true) },
    { label: 'Reset password', icon: '🔑', onClick: () => resetPassword(admin) },
    { label: 'Delete', icon: '🗑', danger: true, onClick: () => deleteAdmin(admin._id) },
  ]);

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>Admins</h2>
        <button onClick={() => {
          setForm({
            name: '', email: '', phone: '', password: '', newPassword: '',
            role: 'sub_admin',
            parentId: '',
            isActive: true,
            permissions: ROLE_PRESETS.sub_admin,
          });
          setShowCreateModal(true);
        }} className="admin-btn primary">
          + New admin
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, email, code or mobile…"
        style={{
          width: '100%', padding: '12px 14px', marginBottom: 18, borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--bg-secondary)',
          color: 'var(--text-primary)', fontSize: 14,
        }}
      />

      {loading ? (
        <div className="admin-loading">Loading...</div>
      ) : (
        <div className="admin-table-wrapper" style={{ overflow: 'visible' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>CODE</th>
                <th>NAME</th>
                <th>EMAIL</th>
                <th>MOBILE</th>
                <th>WALLET</th>
                <th>USERS</th>
                <th>STATUS</th>
                <th style={{ width: 56 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredAdmins.length === 0 ? (
                <tr><td colSpan="8" className="no-data">
                  {q ? 'Nothing matches that search' : 'No admins yet — create the first one'}
                </td></tr>
              ) : (
                filteredAdmins.map((admin, idx) => (
                  <tr key={admin._id || idx}>
                    <td style={{ fontFamily: 'monospace' }}>{admin.oderId}</td>
                    <td style={{ fontWeight: 600 }}>{admin.name}</td>
                    <td>{admin.email}</td>
                    <td>{admin.phone || '—'}</td>
                    <td>₹{admin.wallet?.balance?.toFixed(2) || '0.00'}</td>
                    <td>{admin.userCount || 0}</td>
                    <td>
                      <span className={`status-badge status-${admin.isActive ? 'active' : 'inactive'}`}>
                        {admin.isActive ? 'ACTIVE' : 'BLOCKED'}
                      </span>
                    </td>
                    <td style={{ position: 'relative', textAlign: 'right' }}>
                      <button
                        onClick={() => setRowMenuFor(rowMenuFor === admin._id ? null : admin._id)}
                        title="Actions"
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1, padding: '4px 10px',
                        }}
                      >⋮</button>

                      {rowMenuFor === admin._id && (
                        <>
                          {/* click anywhere else to dismiss */}
                          <div onClick={() => setRowMenuFor(null)}
                               style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                          <div style={{
                            position: 'absolute', right: 8, top: '100%', zIndex: 41, minWidth: 220,
                            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                            borderRadius: 12, padding: 6, boxShadow: '0 12px 32px rgba(0,0,0,.28)',
                            textAlign: 'left',
                          }}>
                            {rowMenu(admin).map((item) => (
                              <button
                                key={item.label}
                                onClick={() => { setRowMenuFor(null); item.onClick(); }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                  padding: '10px 12px', background: 'transparent', border: 'none',
                                  borderRadius: 8, cursor: 'pointer', fontSize: 14,
                                  color: item.danger ? '#ef4444' : 'var(--text-primary)',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-primary)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                              >
                                <span style={{ width: 16, textAlign: 'center' }}>{item.icon}</span>
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 500,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>Create {form.role === 'broker' ? 'Broker' : form.role === 'bank_user' ? 'Bank User' : 'Sub-Admin'}</h3>
              <button onClick={() => setShowCreateModal(false)} style={{
                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)'
              }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} className="admin-input" style={{ width: '100%' }} placeholder="Full name" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))} className="admin-input" style={{ width: '100%' }} placeholder="email@example.com" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Phone</label>
                <input type="text" value={form.phone} onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))} className="admin-input" style={{ width: '100%' }} placeholder="+91 XXXXXXXXXX" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Password *</label>
                <input type="password" value={form.password} onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))} className="admin-input" style={{ width: '100%' }} placeholder="Min 6 characters" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Role *</label>
                <select
                  value={form.role}
                  onChange={(e) => {
                    const newRole = e.target.value;
                    setForm(prev => ({
                      ...prev,
                      role: newRole,
                      permissions: ROLE_PRESETS[newRole] || prev.permissions,
                      parentId: newRole === 'broker' ? prev.parentId : ''
                    }));
                  }}
                  className="admin-select"
                  style={{ width: '100%' }}
                >
                  <option value="sub_admin">Sub-Admin</option>
                  <option value="broker">Broker</option>
                  <option value="bank_user">Bank User</option>
                </select>
              </div>
              {form.role === 'broker' && (
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Parent Sub-Admin</label>
                  <select value={form.parentId} onChange={(e) => setForm(prev => ({ ...prev, parentId: e.target.value }))} className="admin-select" style={{ width: '100%' }}>
                    <option value="">Select Parent Admin</option>
                    {subAdmins.map(sa => (
                      <option key={sa._id} value={sa._id}>{sa.name} ({sa.oderId})</option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Permissions Section — Phase 4 grouped tree + presets + deps */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8 }}>
                <PermissionPicker
                  value={form.permissions || {}}
                  onChange={(next) => setForm(prev => ({ ...prev, permissions: next }))}
                  role={form.role}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button onClick={() => setShowCreateModal(false)} className="admin-btn" style={{ flex: 1, background: 'var(--bg-primary)' }}>Cancel</button>
                <button onClick={createAdmin} className="admin-btn primary" style={{ flex: 1 }}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedAdmin && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 500,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>Edit {getRoleLabel(selectedAdmin.role)}</h3>
              <button onClick={() => setShowEditModal(false)} style={{
                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)'
              }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Phone</label>
                <input type="text" value={form.phone} onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))} className="admin-input" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Status</label>
                <select value={form.isActive ? 'active' : 'inactive'} onChange={(e) => setForm(prev => ({ ...prev, isActive: e.target.value === 'active' }))} className="admin-select" style={{ width: '100%' }}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Change Password (leave empty to keep current)</label>
                <input type="password" value={form.newPassword || ''} onChange={(e) => setForm(prev => ({ ...prev, newPassword: e.target.value }))} className="admin-input" style={{ width: '100%' }} placeholder="Min 6 characters" />
                {form.newPassword && form.newPassword.length > 0 && form.newPassword.length < 6 && (
                  <span style={{ fontSize: 11, color: '#ef4444' }}>Password must be at least 6 characters</span>
                )}
              </div>
              
              {/* Permissions Section — Phase 4 grouped tree + presets + deps (with diff badges) */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8 }}>
                <PermissionPicker
                  value={form.permissions || {}}
                  onChange={(next) => setForm(prev => ({ ...prev, permissions: next }))}
                  role={selectedAdmin.role}
                  diffBase={selectedAdmin.permissions || {}}
                />
              </div>

              <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8, marginTop: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Login URL</div>
                <div style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                  {window.location.origin}/{selectedAdmin.role === 'sub_admin' ? 'subadmin' : selectedAdmin.role === 'bank_user' ? 'bankuser' : 'broker'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button onClick={() => setShowEditModal(false)} className="admin-btn" style={{ flex: 1, background: 'var(--bg-primary)' }}>Cancel</button>
                <button onClick={updateAdmin} className="admin-btn primary" style={{ flex: 1 }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && selectedAdmin && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 500,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>{getRoleLabel(selectedAdmin.role)} Details</h3>
              <button onClick={() => setShowViewModal(false)} style={{
                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)'
              }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: getRoleBadgeColor(selectedAdmin.role),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 700, fontSize: 24
                }}>
                  {selectedAdmin.role === 'super_admin' ? 'SA' : selectedAdmin.role === 'sub_admin' ? 'AD' : selectedAdmin.role === 'bank_user' ? 'BK' : 'BR'}
                </div>
              </div>
              
              <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>ID</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedAdmin.oderId}</span>
                </div>
              </div>
              <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Name</span>
                  <span style={{ fontWeight: 600 }}>{selectedAdmin.name}</span>
                </div>
              </div>
              <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Email</span>
                  <span>{selectedAdmin.email}</span>
                </div>
              </div>
              <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Parent</span>
                  <span>{selectedAdmin.parentOderId || 'None (Top Level)'}</span>
                </div>
              </div>
              {/* Wallet Balance with Add/Deduct */}
              <div style={{ background: 'linear-gradient(135deg, #1a3a2a, #1a2a1a)', padding: 16, borderRadius: 12, border: '1px solid #2a4a3a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#888' }}>💰 Wallet Balance</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e', marginTop: 4 }}>₹{(selectedAdmin.wallet?.balance || 0).toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setWalletAdjust({ show: true, type: 'add', amount: '' })} style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontSize: 18, cursor: 'pointer' }}>+</button>
                    <button onClick={() => setWalletAdjust({ show: true, type: 'subtract', amount: '' })} style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 18, cursor: 'pointer' }}>−</button>
                  </div>
                </div>
                
                {/* Wallet Adjust Input */}
                {walletAdjust.show && (
                  <div style={{ marginTop: 12, padding: 12, background: '#1a1a2e', borderRadius: 8 }}>
                    <div style={{ fontSize: 13, color: '#fff', marginBottom: 8 }}>{walletAdjust.type === 'add' ? '➕ Add Funds' : '➖ Deduct Funds'}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="number"
                        placeholder="Amount"
                        value={walletAdjust.amount}
                        onChange={(e) => setWalletAdjust(prev => ({ ...prev, amount: e.target.value }))}
                        style={{ flex: 1, padding: '10px', borderRadius: 6, border: '1px solid #333', background: '#0f0f1a', color: '#fff', fontSize: 14 }}
                      />
                      <button onClick={() => adjustAdminWallet(walletAdjust.type)} style={{ padding: '10px 16px', borderRadius: 6, border: 'none', background: walletAdjust.type === 'add' ? '#22c55e' : '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                        {walletAdjust.type === 'add' ? 'Add' : 'Deduct'}
                      </button>
                      <button onClick={() => setWalletAdjust({ show: false, type: 'add', amount: '' })} style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid #333', background: 'transparent', color: '#888', cursor: 'pointer' }}>✕</button>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Users</span>
                  <span style={{ fontWeight: 600 }}>{selectedAdmin.userCount || 0}</span>
                </div>
              </div>
              <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Sub-Admins/Brokers</span>
                  <span style={{ fontWeight: 600 }}>{selectedAdmin.childCount || 0}</span>
                </div>
              </div>

              {/* Permissions — read-only view so super-admin can audit what's granted */}
              {selectedAdmin.role !== 'super_admin' && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                  <PermissionPicker
                    value={selectedAdmin.permissions || {}}
                    onChange={() => {}}
                    role={selectedAdmin.role}
                    readOnly
                  />
                </div>
              )}

              <button onClick={() => setShowViewModal(false)} className="admin-btn" style={{ marginTop: 8, background: 'var(--bg-primary)' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminManagement;
