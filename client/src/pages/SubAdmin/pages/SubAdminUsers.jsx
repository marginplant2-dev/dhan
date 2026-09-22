import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

function SubAdminUsers() {
  const { API_URL, adminAuth } = useOutletContext();
  const [users, setUsers] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userWallet, setUserWallet] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', assignTo: '' });
  const [walletAdjust, setWalletAdjust] = useState({ show: false, type: 'add', amount: '', currency: 'USD' });
  const [adminWalletBalance, setAdminWalletBalance] = useState(0);
  const [xr, setXr] = useState({ USD_TO_INR: 83.5, INR_TO_USD: 1 / 83.5 });

  useEffect(() => {
    fetchUsers();
    fetchBrokers();
    fetchAdminWallet();
    fetch(`${API_URL}/api/exchange-rate`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.USD_TO_INR && d.INR_TO_USD) {
          setXr({ USD_TO_INR: d.USD_TO_INR, INR_TO_USD: d.INR_TO_USD });
        }
      })
      .catch(() => {});
  }, []);

  const fetchAdminWallet = async () => {
    try {
      const adminId = adminAuth?.user?._id;
      if (!adminId) return;
      
      const res = await fetch(`${API_URL}/api/admin/hierarchy/${adminId}`);
      const data = await res.json();
      if (data.success && data.admin) {
        setAdminWalletBalance(data.admin.wallet?.balance || 0);
      }
    } catch (error) {
      console.error('Error fetching admin wallet:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const adminId = adminAuth?.user?._id;
      if (!adminId) return;

      const res = await fetch(`${API_URL}/api/admin/hierarchy/${adminId}/users`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBrokers = async () => {
    try {
      const adminId = adminAuth?.user?._id;
      if (!adminId) return;

      const res = await fetch(`${API_URL}/api/admin/hierarchy/${adminId}/brokers`);
      const data = await res.json();
      if (data.success) {
        setBrokers(data.brokers || []);
      }
    } catch (error) {
      console.error('Error fetching brokers:', error);
    }
  };

  const createUser = async () => {
    if (!form.name || !form.email || !form.phone || !form.password) {
      alert('Please fill all required fields');
      return;
    }
    if (form.password.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    try {
      const adminId = adminAuth?.user?._id;
      const parentAdminId = form.assignTo || adminId;

      const staffToken = localStorage.getItem('dhanfunded-admin-token');
      const headers = { 'Content-Type': 'application/json' };
      if (staffToken) headers.Authorization = `Bearer ${staffToken}`;

      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
          parentAdminId: parentAdminId
        })
      });
      const data = await res.json();
      if (data.success || data.user) {
        alert(`User created successfully! ID: ${data.user?.oderId || 'N/A'}`);
        setShowCreateModal(false);
        setForm({ name: '', email: '', phone: '', password: '', assignTo: '' });
        fetchUsers();
      } else {
        alert(data.error || 'Failed to create user');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Error creating user');
    }
  };

  const toggleUserStatus = async (userId, currentStatus) => {
    try {
      const res = await fetch(`${API_URL}/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
        if (selectedUser && selectedUser._id === userId) {
          setSelectedUser(prev => ({ ...prev, isActive: !currentStatus }));
        }
      }
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  const openUserDetail = (user) => {
    setSelectedUser(user);
    setUserWallet(user.wallet);
    setWalletAdjust({ show: false, type: 'add', amount: '', currency: 'USD' });
    setShowViewModal(true);
  };

  const adjustUserWallet = async (type) => {
    if (!walletAdjust.amount || parseFloat(walletAdjust.amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    const amount = parseFloat(walletAdjust.amount);
    const cur = walletAdjust.currency || 'USD';
    const usdDelta = cur === 'INR' ? amount * xr.INR_TO_USD : amount;

    if (type === 'add' && usdDelta > adminWalletBalance) {
      alert(
        `Insufficient balance! Your wallet: $${adminWalletBalance.toFixed(2)} USD (need ~$${usdDelta.toFixed(2)} USD for this ${cur} amount).`
      );
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/admin/users/${selectedUser._id}/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          amount: walletAdjust.amount,
          currency: cur,
          reason: `${type === 'add' ? 'Added' : 'Deducted'} ${cur} by Sub-Admin`,
          adminId: adminAuth?.user?._id
        })
      });
      const data = await res.json();
      if (data.success) {
        if (data.wallet) setUserWallet(data.wallet);
        setWalletAdjust({ show: false, type: 'add', amount: '', currency: 'USD' });
        if (type === 'add') {
          setAdminWalletBalance((prev) => Math.max(0, prev - usdDelta));
        }
        fetchUsers();
        alert(data.message || 'Wallet updated successfully');
      } else {
        alert(data.error || 'Failed to adjust wallet');
      }
    } catch (error) {
      console.error('Error adjusting wallet:', error);
      alert('Failed to adjust wallet');
    }
  };

  const filteredUsers = users.filter(user =>
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.oderId?.includes(searchTerm)
  );

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading users...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>My Users ({users.length})</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              width: 200
            }}
          />
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#22c55e',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            + Add User
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)' }}>
              <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>ID</th>
              <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Name</th>
              <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Email</th>
              <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Phone</th>
              <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Balance</th>
              <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Status</th>
              <th style={{ textAlign: 'left', padding: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No users found
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => (
                <tr key={user._id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 16, color: 'var(--text-primary)' }}>#{user.oderId}</td>
                  <td style={{ padding: 16, color: 'var(--text-primary)' }}>{user.name}</td>
                  <td style={{ padding: 16, color: 'var(--text-secondary)' }}>{user.email}</td>
                  <td style={{ padding: 16, color: 'var(--text-secondary)' }}>{user.phone}</td>
                  <td style={{ padding: 16, color: 'var(--text-primary)' }}>₹{user.wallet?.balance?.toLocaleString() || 0}</td>
                  <td style={{ padding: 16 }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      background: user.isActive ? '#22c55e' : '#ef4444',
                      color: 'white'
                    }}>
                      {user.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td style={{ padding: 16 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => openUserDetail(user)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: '#3b82f6',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: 12
                        }}
                      >
                        View
                      </button>
                      <button
                        onClick={() => toggleUserStatus(user._id, user.isActive)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: user.isActive ? '#ef4444' : '#22c55e',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: 12
                        }}
                      >
                        {user.isActive ? 'Block' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 450,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Create User</h3>
              <button onClick={() => setShowCreateModal(false)} style={{
                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)'
              }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  placeholder="User name" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  placeholder="user@example.com" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Phone *</label>
                <input type="text" value={form.phone} onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  placeholder="+91 XXXXXXXXXX" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Password *</label>
                <input type="password" value={form.password} onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  placeholder="Min 6 characters" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, color: 'var(--text-secondary)' }}>Assign To</label>
                <select value={form.assignTo} onChange={(e) => setForm(prev => ({ ...prev, assignTo: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                  <option value="">Myself (Sub-Admin)</option>
                  {brokers.map(broker => (
                    <option key={broker._id} value={broker._id}>{broker.name} ({broker.oderId})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button onClick={() => setShowCreateModal(false)} style={{ flex: 1, padding: '12px', borderRadius: 8, border: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
                <button onClick={createUser} style={{ flex: 1, padding: '12px', borderRadius: 8, border: 'none', background: '#22c55e', color: 'white', cursor: 'pointer', fontWeight: 600 }}>Create User</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Modal - SuperAdmin Style */}
      {showViewModal && selectedUser && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: '#1a1a2e', borderRadius: 16, width: '90%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto',
            border: '1px solid #333'
          }}>
            {/* Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 45, height: 45, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18 }}>
                  {selectedUser.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, color: '#fff', fontSize: 16 }}>{selectedUser.name}</h3>
                  <p style={{ margin: 0, color: '#888', fontSize: 13 }}>{selectedUser.email}</p>
                </div>
              </div>
              <button onClick={() => setShowViewModal(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#888' }}>×</button>
            </div>

            {/* Content */}
            <div style={{ padding: '20px' }}>
              {/* Info Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 15 }}>
                <div style={{ background: '#252540', borderRadius: 10, padding: 12 }}>
                  <p style={{ margin: 0, color: '#888', fontSize: 11 }}>Full Name</p>
                  <p style={{ margin: '4px 0 0 0', color: '#fff', fontSize: 14, fontWeight: 500 }}>{selectedUser.name}</p>
                </div>
                <div style={{ background: '#252540', borderRadius: 10, padding: 12 }}>
                  <p style={{ margin: 0, color: '#888', fontSize: 11 }}>Phone</p>
                  <p style={{ margin: '4px 0 0 0', color: '#fff', fontSize: 14, fontWeight: 500 }}>{selectedUser.phone}</p>
                </div>
                <div style={{ background: '#252540', borderRadius: 10, padding: 12 }}>
                  <p style={{ margin: 0, color: '#888', fontSize: 11 }}>Joined</p>
                  <p style={{ margin: '4px 0 0 0', color: '#fff', fontSize: 14, fontWeight: 500 }}>{new Date(selectedUser.createdAt).toLocaleDateString()}</p>
                </div>
                <div style={{ background: '#252540', borderRadius: 10, padding: 12 }}>
                  <p style={{ margin: 0, color: '#888', fontSize: 11 }}>Status</p>
                  <p style={{ margin: '4px 0 0 0', color: selectedUser.isActive ? '#22c55e' : '#ef4444', fontSize: 14, fontWeight: 500 }}>{selectedUser.isActive ? 'Active' : 'Inactive'}</p>
                </div>
              </div>

              {/* Email */}
              <div style={{ background: '#252540', borderRadius: 10, padding: 12, marginBottom: 15 }}>
                <p style={{ margin: 0, color: '#888', fontSize: 11 }}>Email</p>
                <p style={{ margin: '4px 0 0 0', color: '#fff', fontSize: 14, fontWeight: 500 }}>{selectedUser.email}</p>
              </div>

              {/* Wallet Balance */}
              <div style={{ background: 'linear-gradient(135deg, #1a3a2a, #1a2a1a)', borderRadius: 12, padding: 16, marginBottom: 15, border: '1px solid #2a4a3a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, color: '#888', fontSize: 12 }}>💰 User Wallet Balance</p>
                    <p style={{ margin: '6px 0 0 0', color: '#22c55e', fontSize: 26, fontWeight: 700 }}>₹{Number(userWallet?.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: 12, color: '#888' }}>INR</span></p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setWalletAdjust({ show: true, type: 'add', amount: '', currency: walletAdjust.currency || 'USD' })} style={{ width: 40, height: 40, borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontSize: 20, cursor: 'pointer' }}>+</button>
                    <button onClick={() => setWalletAdjust({ show: true, type: 'subtract', amount: '', currency: walletAdjust.currency || 'USD' })} style={{ width: 40, height: 40, borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 20, cursor: 'pointer' }}>−</button>
                  </div>
                </div>
                
                {/* Wallet Adjust Input */}
                {walletAdjust.show && (
                  <div style={{ marginTop: 12, padding: 12, background: '#1a1a2e', borderRadius: 8 }}>
                    <p style={{ margin: '0 0 8px 0', color: '#fff', fontSize: 13 }}>{walletAdjust.type === 'add' ? '➕ Add Funds' : '➖ Deduct Funds'}</p>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <button type="button" onClick={() => setWalletAdjust((prev) => ({ ...prev, currency: 'USD' }))} style={{ flex: 1, padding: 8, borderRadius: 6, border: walletAdjust.currency === 'USD' ? '2px solid #3b82f6' : '1px solid #333', background: walletAdjust.currency === 'USD' ? '#1e3a5e' : '#0f0f1a', color: walletAdjust.currency === 'USD' ? '#93c5fd' : '#888', fontSize: 12, cursor: 'pointer' }}>USD ($)</button>
                      <button type="button" onClick={() => setWalletAdjust((prev) => ({ ...prev, currency: 'INR' }))} style={{ flex: 1, padding: 8, borderRadius: 6, border: walletAdjust.currency === 'INR' ? '2px solid #f59e0b' : '1px solid #333', background: walletAdjust.currency === 'INR' ? '#5e3a1e' : '#0f0f1a', color: walletAdjust.currency === 'INR' ? '#fcd34d' : '#888', fontSize: 12, cursor: 'pointer' }}>INR (₹)</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="number"
                        placeholder={walletAdjust.currency === 'INR' ? 'Amount in ₹' : 'Amount in $'}
                        value={walletAdjust.amount}
                        onChange={(e) => setWalletAdjust(prev => ({ ...prev, amount: e.target.value }))}
                        style={{ flex: 1, padding: '10px', borderRadius: 6, border: '1px solid #333', background: '#0f0f1a', color: '#fff', fontSize: 14 }}
                      />
                      <button onClick={() => adjustUserWallet(walletAdjust.type)} style={{ padding: '10px 16px', borderRadius: 6, border: 'none', background: walletAdjust.type === 'add' ? '#22c55e' : '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                        {walletAdjust.type === 'add' ? 'Add' : 'Deduct'}
                      </button>
                      <button onClick={() => setWalletAdjust({ show: false, type: 'add', amount: '', currency: 'USD' })} style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid #333', background: 'transparent', color: '#888', cursor: 'pointer' }}>✕</button>
                    </div>
                    <p style={{ margin: '8px 0 0 0', color: '#888', fontSize: 11 }}>Your wallet: ${adminWalletBalance.toFixed(2)} USD (adds deduct this much USD equivalent).</p>
                  </div>
                )}
              </div>

              {/* Assigned Admin/Broker */}
              <div style={{ background: '#252540', borderRadius: 10, padding: 12, marginBottom: 15 }}>
                <p style={{ margin: 0, color: '#888', fontSize: 11 }}>Assigned To</p>
                {selectedUser.parentAdminOderId ? (
                  <p style={{ margin: '4px 0 0 0', color: '#fff', fontSize: 14, fontWeight: 500 }}>
                    {selectedUser.parentAdminOderId === adminAuth?.user?.oderId ? `${adminAuth?.user?.name} (You)` : selectedUser.parentAdminOderId}
                  </p>
                ) : (
                  <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: 14 }}>Not Assigned</p>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <button onClick={() => setWalletAdjust({ show: true, type: 'add', amount: '', currency: walletAdjust.currency || 'USD' })} style={{ padding: 14, borderRadius: 10, background: '#2a3a2e', border: '1px solid #3a4a3e', color: '#22c55e', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  📥 Add Fund
                </button>
                <button onClick={() => setWalletAdjust({ show: true, type: 'subtract', amount: '', currency: walletAdjust.currency || 'USD' })} style={{ padding: 14, borderRadius: 10, background: '#3a3a2a', border: '1px solid #4a4a3a', color: '#eab308', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  💵 Deduct Fund
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <button onClick={() => { toggleUserStatus(selectedUser._id, selectedUser.isActive); }} style={{ padding: 14, borderRadius: 10, background: selectedUser.isActive ? '#3a2a2a' : '#2a3a2e', border: `1px solid ${selectedUser.isActive ? '#4a3a3a' : '#3a4a3e'}`, color: selectedUser.isActive ? '#ef4444' : '#22c55e', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  🚫 {selectedUser.isActive ? 'Block User' : 'Activate User'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export default SubAdminUsers;
