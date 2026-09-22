import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { LuUser, LuLandmark, LuLock, LuIdCard, LuChartColumn } from 'react-icons/lu';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function SettingsPage() {
  const { user, onLogout, walletData, kycStatus, setKycStatus, kycForm, setKycForm, kycSubmitting, submitKyc, handleKycImageUpload, displayCurrency, usdInrRate, usdMarkup } = useOutletContext();
  const [activeSection, setActiveSection] = useState('profile');
  const tabsRef = useRef(null);

  // Reset horizontal scroll to 0 on mount so Profile tab is fully visible
  useEffect(() => {
    if (tabsRef.current) tabsRef.current.scrollLeft = 0;
  }, []);
  
  const formatCurrency = (value) => {
    const numValue = Number(value || 0);
    return `₹${numValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Filter sections for demo accounts - hide bank and kyc
  const allSections = [
    { id: 'profile', icon: LuUser, label: 'Profile' },
    { id: 'bank', icon: LuLandmark, label: 'Bank Details' },
    { id: 'security', icon: LuLock, label: 'Security' },
    { id: 'kyc', icon: LuIdCard, label: 'KYC' },
    { id: 'stats', icon: LuChartColumn, label: 'Stats' },
  ];
  
  const sections = allSections;
  
  // Bank accounts state (now includes UPI ID)
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [showAddBank, setShowAddBank] = useState(false);
  const [newBankForm, setNewBankForm] = useState({
    bankName: '', accountNumber: '', ifsc: '', accountHolder: '', upiId: ''
  });
  
  // Profile edit state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    email: '',
    phone: '',
    city: '',
    state: ''
  });
  const [profileSaving, setProfileSaving] = useState(false);
  
  // Initialize profile form when user data is available
  useEffect(() => {
    if (user) {
      setProfileForm({
        email: user.email || '',
        phone: user.phone || '',
        city: user.profile?.city || '',
        state: user.profile?.state || ''
      });
    }
  }, [user]);
  
  // Save profile changes
  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      const token = localStorage.getItem('dhanfunded-token');
      const res = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          email: profileForm.email,
          phone: profileForm.phone,
          city: profileForm.city,
          state: profileForm.state
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Profile updated successfully!');
        setIsEditingProfile(false);
        window.location.reload();
      } else {
        alert(data.error || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };
  
  // Fetch user's bank accounts
  const fetchBankAccounts = async () => {
    const userId = user?.oderId || user?.id;
    if (!userId) return;
    setBankLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/user/bank-accounts/${userId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setBankAccounts(data.bankAccounts || []);
        }
      }
    } catch (error) {
      console.error('Error fetching bank accounts:', error);
    } finally {
      setBankLoading(false);
    }
  };
  
  // Add new bank account
  const addBankAccount = async () => {
    const userId = user?.oderId || user?.id;
    if (!userId) return;
    if (!newBankForm.bankName || !newBankForm.accountNumber || !newBankForm.ifsc || !newBankForm.accountHolder) {
      alert('Please fill all fields');
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/user/bank-accounts/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBankForm)
      });
      const data = await response.json();
      if (data.success) {
        alert('Bank account added successfully!');
        setNewBankForm({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '', upiId: '' });
        setShowAddBank(false);
        fetchBankAccounts();
      } else {
        alert(data.error || 'Failed to add bank account');
      }
    } catch (error) {
      alert('Error adding bank account');
    }
  };
  
  // Delete bank account
  const deleteBankAccount = async (bankId) => {
    if (!confirm('Are you sure you want to delete this bank account?')) return;
    const userId = user?.oderId || user?.id;
    try {
      const response = await fetch(`${API_URL}/api/user/bank-accounts/${userId}/${bankId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        alert('Bank account deleted');
        fetchBankAccounts();
      }
    } catch (error) {
      alert('Error deleting bank account');
    }
  };
  
  // Load bank accounts on mount
  useEffect(() => {
    fetchBankAccounts();
  }, [user]);

  const containerStyle = {
    maxWidth: '100%',
    margin: '0 auto',
    padding: '0 24px 100px',
    width: '100%',
    boxSizing: 'border-box'
  };

  const sectionNavStyle = {
    display: 'flex',
    gap: 8,
    padding: '16px 0',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none'
  };

  const navButtonStyle = (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    borderRadius: 12,
    border: 'none',
    background: isActive ? 'var(--accent-primary)' : 'var(--bg-secondary)',
    color: isActive ? '#fff' : 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transition: 'all 0.2s ease'
  });

  const cardStyle = {
    background: 'var(--bg-secondary)',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    border: '1px solid var(--border-color)',
    position: 'relative',
    zIndex: 1,
    width: '100%',
    boxSizing: 'border-box'
  };

  const sectionTitleStyle = {
    margin: '0 0 20px 0',
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 10
  };

  const inputStyle = {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 12,
    // `--bg-primary` contrasts with the parent section card
    // (`--bg-secondary`) so the input boxes are clearly visible in both
    // themes. Adding a subtle shadow gives the field a filled look.
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
    boxSizing: 'border-box'
  };

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: 8
  };

  const buttonStyle = {
    width: '100%',
    padding: '14px 24px',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(135deg, var(--accent-primary), #8b5cf6)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
  };

  const infoRowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: 'var(--bg-primary)',
    borderRadius: 12,
    marginBottom: 10
  };

  const statusBadgeStyle = (status) => ({
    padding: '6px 14px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    background: status === 'approved' ? 'rgba(16, 185, 129, 0.15)' : 
                status === 'pending' ? 'rgba(245, 158, 11, 0.15)' : 
                status === 'rejected' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(100, 116, 139, 0.15)',
    color: status === 'approved' ? '#10b981' : 
           status === 'pending' ? '#f59e0b' : 
           status === 'rejected' ? '#ef4444' : '#64748b',
    border: `1px solid ${status === 'approved' ? 'rgba(16, 185, 129, 0.3)' : 
             status === 'pending' ? 'rgba(245, 158, 11, 0.3)' : 
             status === 'rejected' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(100, 116, 139, 0.3)'}`
  });

  return (
    <div className="page-content settings-page" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden'
    }}>
      <style>{`
        /* Settings page polish — inputs/selects/textareas get a focus ring
           and readable placeholder colour in both themes. The base style
           object (inputStyle) handles border + background; this layer adds
           interactive states and the dropdown arrow on <select>. */
        .settings-page input,
        .settings-page select,
        .settings-page textarea {
          font-family: inherit;
        }
        .settings-page input::placeholder,
        .settings-page textarea::placeholder {
          color: var(--text-muted);
          opacity: 1;
        }
        .settings-page input:focus,
        .settings-page select:focus,
        .settings-page textarea:focus {
          border-color: var(--accent-primary) !important;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 18%, transparent) !important;
        }
        .settings-page select {
          appearance: none;
          -webkit-appearance: none;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%23787b86' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
          background-repeat: no-repeat;
          background-position: right 14px center;
          padding-right: 40px !important;
        }
        /* Light theme — give inputs a bit more contrast since the card bg
           (var(--bg-secondary) = #f8f9fa) is very close to the input bg
           (var(--bg-primary) = #ffffff) otherwise. */
        html[data-theme="light"] .settings-page input,
        html[data-theme="light"] .settings-page select,
        html[data-theme="light"] .settings-page textarea {
          background: #ffffff !important;
          border: 1px solid #d1d5db !important;
          color: #131722 !important;
        }
        html[data-theme="light"] .settings-page input::placeholder,
        html[data-theme="light"] .settings-page textarea::placeholder {
          color: #9ca3af !important;
        }
        html[data-theme="light"] .settings-page input:focus,
        html[data-theme="light"] .settings-page select:focus,
        html[data-theme="light"] .settings-page textarea:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12) !important;
        }
      `}</style>
      {/* Fixed Header & Navigation */}
      <div style={{
        flexShrink: 0,
        background: 'var(--bg-primary)',
        paddingBottom: 8,
        borderBottom: '1px solid var(--border-color)',
        zIndex: 10
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', padding: '16px 16px 8px' }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>⚙️ Settings</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>Manage your account & preferences</p>
        </div>

        {/* Section Navigation — Desktop: tab row, Mobile: dropdown */}
        <div ref={tabsRef} className="settings-nav-tabs settings-nav-tabs-desktop" style={{
          display: 'flex',
          gap: 8,
          padding: '12px 16px 8px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          justifyContent: 'center'
        }}>
          {sections.map(section => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                style={navButtonStyle(isActive)}
              >
                <Icon size={15} />
                <span>{section.label}</span>
              </button>
            );
          })}
        </div>

        {/* Mobile: section dropdown */}
        <div className="settings-nav-mobile" style={{ padding: '12px 16px 8px' }}>
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              outline: 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
              backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%239ca3af\' stroke-width=\'2.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><polyline points=\'6 9 12 15 18 9\'/></svg>")',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 14px center',
              paddingRight: 40,
            }}
          >
            {sections.map(section => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto',
        overflowX: 'hidden',
        width: '100%'
      }}>
        <div style={{ ...containerStyle, paddingTop: 16, maxWidth: 900, margin: '0 auto' }}>
        {/* Profile Section */}
        {activeSection === 'profile' && (
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>👤 Profile Information</h2>
            
            {/* Avatar & Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, padding: 20, background: 'var(--bg-primary)', borderRadius: 16 }}>
              <div style={{ 
                width: 80, height: 80, borderRadius: '50%', 
                background: 'linear-gradient(135deg, var(--accent-primary), #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32, fontWeight: 700, color: '#fff',
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)'
              }}>
                {user?.avatar ? (
                  <img src={`${API_URL}${user.avatar}`} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  user?.name?.charAt(0)?.toUpperCase() || 'U'
                )}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.name || 'User'}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>ID: {user?.oderId || user?.id || '-'}</p>
                <input
                  type="file"
                  id="avatar-upload"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const formData = new FormData();
                    formData.append('avatar', file);
                    try {
                      const token = localStorage.getItem('dhanfunded-token');
                      const res = await fetch(`${API_URL}/api/auth/avatar`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                      });
                      const data = await res.json();
                      if (data.success) {
                        alert('Avatar updated!');
                        window.location.reload();
                      }
                    } catch (err) {
                      alert('Failed to upload avatar');
                    }
                  }}
                />
                <button 
                  onClick={() => document.getElementById('avatar-upload').click()}
                  style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--accent-primary)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                >
                  📷 Change Photo
                </button>
              </div>
            </div>

            {/* Info Rows */}
            <div>
              {!isEditingProfile ? (
                <>
                  <div style={infoRowStyle}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>📧 Email</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{user?.email || '-'}</span>
                  </div>
                  <div style={infoRowStyle}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>📱 Phone</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{user?.phone || '-'}</span>
                  </div>
                  <div style={infoRowStyle}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>🏙️ City</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{user?.profile?.city || '-'}</span>
                  </div>
                  <div style={infoRowStyle}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>🗺️ State</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{user?.profile?.state || '-'}</span>
                  </div>
                  <div style={infoRowStyle}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>🆔 User ID</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-primary)', fontFamily: 'monospace' }}>{user?.oderId || user?.id || '-'}</span>
                  </div>
                  <button 
                    onClick={() => setIsEditingProfile(true)}
                    style={{ marginTop: 16, padding: '12px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, var(--accent-primary), #8b5cf6)', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', width: '100%' }}
                  >
                    ✏️ Edit Profile
                  </button>
                </>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>📧 Email</label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>📱 Phone</label>
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>🏙️ City</label>
                    <input
                      type="text"
                      value={profileForm.city}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, city: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14 }}
                      placeholder="Enter city"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>🗺️ State</label>
                    <input
                      type="text"
                      value={profileForm.state}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, state: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14 }}
                      placeholder="Enter state"
                    />
                  </div>
                  <div style={infoRowStyle}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>🆔 User ID</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-primary)', fontFamily: 'monospace' }}>{user?.oderId || user?.id || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                    <button 
                      onClick={() => setIsEditingProfile(false)}
                      style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={saveProfile}
                      disabled={profileSaving}
                      style={{ flex: 1, padding: '12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontSize: 14, fontWeight: 500, cursor: profileSaving ? 'not-allowed' : 'pointer', opacity: profileSaving ? 0.7 : 1 }}
                    >
                      {profileSaving ? 'Saving...' : '✓ Save Changes'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bank Details Section */}
        {activeSection === 'bank' && (
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>🏦 Bank Details</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
              Save your bank accounts for quick withdrawals. These details will be available when you request a withdrawal.
            </p>
            
            {/* Add Bank Button */}
            {!showAddBank && (
              <button 
                onClick={() => setShowAddBank(true)}
                style={{ ...buttonStyle, marginBottom: 20, background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                ➕ Add Bank Account
              </button>
            )}
            
            {/* Add Bank Form */}
            {showAddBank && (
              <div style={{ background: 'var(--bg-primary)', padding: 20, borderRadius: 12, marginBottom: 20, border: '1px solid var(--border-color)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Add New Bank Account</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Bank Name *</label>
                    <input 
                      type="text" 
                      value={newBankForm.bankName}
                      onChange={(e) => setNewBankForm(prev => ({ ...prev, bankName: e.target.value }))}
                      style={inputStyle} 
                      placeholder="e.g., HDFC Bank" 
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Account Holder Name *</label>
                    <input 
                      type="text" 
                      value={newBankForm.accountHolder}
                      onChange={(e) => setNewBankForm(prev => ({ ...prev, accountHolder: e.target.value }))}
                      style={inputStyle} 
                      placeholder="Name as per bank records" 
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Account Number *</label>
                    <input 
                      type="text" 
                      value={newBankForm.accountNumber}
                      onChange={(e) => setNewBankForm(prev => ({ ...prev, accountNumber: e.target.value }))}
                      style={inputStyle} 
                      placeholder="Enter account number" 
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>IFSC Code *</label>
                    <input 
                      type="text" 
                      value={newBankForm.ifsc}
                      onChange={(e) => setNewBankForm(prev => ({ ...prev, ifsc: e.target.value.toUpperCase() }))}
                      style={inputStyle} 
                      placeholder="e.g., HDFC0001234" 
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>UPI ID (Optional)</label>
                    <input 
                      type="text" 
                      value={newBankForm.upiId}
                      onChange={(e) => setNewBankForm(prev => ({ ...prev, upiId: e.target.value }))}
                      style={inputStyle} 
                      placeholder="e.g., yourname@upi" 
                    />
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>Add UPI ID linked to this bank account for faster withdrawals</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                    <button 
                      onClick={() => { setShowAddBank(false); setNewBankForm({ bankName: '', accountNumber: '', ifsc: '', accountHolder: '', upiId: '' }); }}
                      style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={addBankAccount}
                      style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Save Bank Account
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Saved Bank Accounts List */}
            {bankLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Loading...</div>
            ) : bankAccounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', background: 'var(--bg-primary)', borderRadius: 12 }}>
                <p style={{ fontSize: 40, margin: '0 0 10px' }}>🏦</p>
                <p style={{ margin: 0 }}>No bank accounts saved yet</p>
                <p style={{ margin: '8px 0 0', fontSize: 12 }}>Add a bank account to use for quick withdrawals</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {bankAccounts.map(bank => (
                  <div key={bank._id} style={{ 
                    background: 'var(--bg-primary)', 
                    padding: 16, 
                    borderRadius: 12, 
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>{bank.bankName}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                        {bank.accountHolder} • ****{bank.accountNumber?.slice(-4)}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                        IFSC: {bank.ifsc}
                      </p>
                      {bank.upiId && (
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 4 }}>
                          📱 UPI: {bank.upiId}
                        </p>
                      )}
                    </div>
                    <button 
                      onClick={() => deleteBankAccount(bank._id)}
                      style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Security Section */}
        {activeSection === 'security' && (
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>🔒 Security Settings</h2>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target;
              const currentPassword = form.currentPassword.value;
              const newPassword = form.newPassword.value;
              const confirmPassword = form.confirmPassword.value;

              if (newPassword !== confirmPassword) {
                alert('New passwords do not match');
                return;
              }

              try {
                const token = localStorage.getItem('dhanfunded-token');
                const res = await fetch(`${API_URL}/api/auth/change-password`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                  body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
                });
                const data = await res.json();
                if (data.success) {
                  alert('Password changed successfully!');
                  localStorage.setItem('dhanfunded-token', data.token);
                  form.reset();
                } else {
                  alert(data.error || 'Failed to change password');
                }
              } catch (err) {
                alert('Server error');
              }
            }}>
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Current Password</label>
                  <input type="password" name="currentPassword" required style={inputStyle} placeholder="Enter current password" />
                </div>
                <div>
                  <label style={labelStyle}>New Password</label>
                  <input type="password" name="newPassword" minLength="6" required style={inputStyle} placeholder="Enter new password (min 6 chars)" />
                </div>
                <div>
                  <label style={labelStyle}>Confirm New Password</label>
                  <input type="password" name="confirmPassword" minLength="6" required style={inputStyle} placeholder="Confirm new password" />
                </div>
                <button type="submit" style={buttonStyle}>🔐 Update Password</button>
              </div>
            </form>

            {/* Logout Section */}
            <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>� Session</h3>
              <button 
                onClick={onLogout}
                style={{ ...buttonStyle, background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
              >
                Logout from Account
              </button>
            </div>
          </div>
        )}

        {/* KYC Section */}
        {activeSection === 'kyc' && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ ...sectionTitleStyle, margin: 0 }}>🪪 KYC Verification</h2>
              <span style={statusBadgeStyle(kycStatus.status)}>
                {kycStatus.status === 'not_submitted' ? 'Not Submitted' : kycStatus.status.charAt(0).toUpperCase() + kycStatus.status.slice(1)}
              </span>
            </div>

            {kycStatus.status === 'approved' ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 16 }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#10b981' }}>KYC Verified</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 10 }}>Your identity has been verified successfully.</div>
              </div>
            ) : kycStatus.status === 'pending' ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: 16 }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>⏳</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#f59e0b' }}>Verification Pending</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 10 }}>Your documents are being reviewed. This usually takes 24-48 hours.</div>
              </div>
            ) : kycStatus.status === 'rejected' || kycStatus.status === 'resubmit' ? (
              <div>
                <div style={{ textAlign: 'center', padding: '30px 20px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 16, marginBottom: 20 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#ef4444' }}>
                    {kycStatus.status === 'resubmit' ? 'Resubmission Required' : 'Verification Rejected'}
                  </div>
                  {kycStatus.kyc?.rejectionReason && (
                    <div style={{ fontSize: 13, color: '#ef4444', marginTop: 12, padding: '12px 16px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: 10 }}>
                      <strong>Reason:</strong> {kycStatus.kyc.rejectionReason}
                    </div>
                  )}
                </div>
                <button onClick={() => setKycStatus({ status: 'not_submitted', kyc: null })} style={buttonStyle}>
                  📄 Submit New Documents
                </button>
              </div>
            ) : (
              <form onSubmit={submitKyc}>
                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Document Type *</label>
                    <select value={kycForm.documentType} onChange={(e) => setKycForm(prev => ({ ...prev, documentType: e.target.value }))} style={inputStyle}>
                      <option value="aadhaar">Aadhaar Card</option>
                      <option value="pan">PAN Card</option>
                      <option value="passport">Passport</option>
                      <option value="driving_license">Driving License</option>
                      <option value="voter_id">Voter ID</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Full Name (as on document) *</label>
                    <input type="text" value={kycForm.fullName} onChange={(e) => setKycForm(prev => ({ ...prev, fullName: e.target.value }))} placeholder="Enter your full name" style={inputStyle} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Document Number *</label>
                    <input type="text" value={kycForm.documentNumber} onChange={(e) => setKycForm(prev => ({ ...prev, documentNumber: e.target.value }))} placeholder="Enter document number" style={inputStyle} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Address</label>
                    <textarea value={kycForm.address} onChange={(e) => setKycForm(prev => ({ ...prev, address: e.target.value }))} placeholder="Enter your address" rows="2" style={{ ...inputStyle, resize: 'none', minHeight: 80 }} />
                  </div>
                  
                  {/* Document Upload Grid */}
                  <div>
                    <label style={labelStyle}>Document Images</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ 
                        border: `2px dashed ${kycForm.frontImage ? '#10b981' : 'var(--border-color)'}`, 
                        borderRadius: 12, 
                        padding: 20, 
                        textAlign: 'center', 
                        cursor: 'pointer', 
                        background: kycForm.frontImage ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-primary)',
                        transition: 'all 0.2s ease'
                      }}>
                        <input type="file" accept="image/*" onChange={handleKycImageUpload('frontImage')} style={{ display: 'none' }} id="kyc-front" />
                        <label htmlFor="kyc-front" style={{ cursor: 'pointer', display: 'block' }}>
                          <div style={{ fontSize: 24, marginBottom: 8 }}>{kycForm.frontImage ? '✅' : '📷'}</div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: kycForm.frontImage ? '#10b981' : 'var(--text-secondary)' }}>
                            {kycForm.frontImage ? 'Front Uploaded' : 'Front Image *'}
                          </div>
                        </label>
                      </div>
                      <div style={{ 
                        border: `2px dashed ${kycForm.backImage ? '#10b981' : 'var(--border-color)'}`, 
                        borderRadius: 12, 
                        padding: 20, 
                        textAlign: 'center', 
                        cursor: 'pointer', 
                        background: kycForm.backImage ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-primary)',
                        transition: 'all 0.2s ease'
                      }}>
                        <input type="file" accept="image/*" onChange={handleKycImageUpload('backImage')} style={{ display: 'none' }} id="kyc-back" />
                        <label htmlFor="kyc-back" style={{ cursor: 'pointer', display: 'block' }}>
                          <div style={{ fontSize: 24, marginBottom: 8 }}>{kycForm.backImage ? '✅' : '📷'}</div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: kycForm.backImage ? '#10b981' : 'var(--text-secondary)' }}>
                            {kycForm.backImage ? 'Back Uploaded' : 'Back Image'}
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Selfie Upload */}
                  <div style={{ 
                    border: `2px dashed ${kycForm.selfieImage ? '#10b981' : 'var(--border-color)'}`, 
                    borderRadius: 12, 
                    padding: 24, 
                    textAlign: 'center', 
                    cursor: 'pointer', 
                    background: kycForm.selfieImage ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-primary)',
                    transition: 'all 0.2s ease'
                  }}>
                    <input type="file" accept="image/*" onChange={handleKycImageUpload('selfieImage')} style={{ display: 'none' }} id="kyc-selfie" />
                    <label htmlFor="kyc-selfie" style={{ cursor: 'pointer', display: 'block' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>{kycForm.selfieImage ? '✅' : '🤳'}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: kycForm.selfieImage ? '#10b981' : 'var(--text-secondary)' }}>
                        {kycForm.selfieImage ? 'Selfie Uploaded' : 'Upload Selfie with Document'}
                      </div>
                    </label>
                  </div>

                  <button type="submit" disabled={kycSubmitting} style={{ ...buttonStyle, opacity: kycSubmitting ? 0.6 : 1, cursor: kycSubmitting ? 'not-allowed' : 'pointer' }}>
                    {kycSubmitting ? '⏳ Submitting...' : '📤 Submit KYC'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Stats Section */}
        {activeSection === 'stats' && (
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>📊 Market Statistics</h2>
            
            {/* Main Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Balance', value: formatCurrency(walletData?.balance), icon: '💰', color: '#10b981' },
                { label: 'Equity', value: formatCurrency(walletData?.equity), icon: '📈', color: '#3b82f6' },
                { label: 'Used Margin', value: formatCurrency(walletData?.margin), icon: '🔒', color: '#f59e0b' },
                { label: 'Free Margin', value: formatCurrency(walletData?.freeMargin), icon: '💵', color: '#8b5cf6' }
              ].map((item, i) => (
                <div key={i} style={{ 
                  background: 'var(--bg-primary)', 
                  borderRadius: 14, 
                  padding: 18, 
                  textAlign: 'center',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</p>
                  <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Trade Stats - uses user.stats for actual trade data */}
            <div style={{ background: 'var(--bg-primary)', borderRadius: 14, padding: 20, border: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>📊 Order Performance</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total Positions</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.stats?.totalTrades || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Winning Positions</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#10b981' }}>{user?.stats?.winningTrades || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Losing Positions</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#ef4444' }}>{user?.stats?.losingTrades || 0}</span>
                </div>
                <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Net P/L</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: (user?.stats?.netPnL || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                    {(user?.stats?.netPnL || 0) >= 0 ? '+' : ''}{formatCurrency(user?.stats?.netPnL || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
