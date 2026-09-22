import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MyPermissionsPanel } from '../../shared/permissions';

function BrokerSettings() {
  const { API_URL, adminAuth } = useOutletContext();
  const [profile, setProfile] = useState({ name: '', email: '', phone: '' });
  const [passwords, setPasswords] = useState({ newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (adminAuth?.user) {
      setProfile({
        name: adminAuth.user.name || '',
        email: adminAuth.user.email || '',
        phone: adminAuth.user.phone || ''
      });
    }
  }, [adminAuth]);

  const updateProfile = async () => {
    setLoading(true);
    try {
      const adminId = adminAuth?.user?._id;
      const res = await fetch(`${API_URL}/api/admin/hierarchy/${adminId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profile.name, email: profile.email, phone: profile.phone })
      });
      const data = await res.json();
      if (data.success) {
        alert('Profile updated successfully!');
        const adminData = JSON.parse(localStorage.getItem('dhanfunded-admin') || '{}');
        adminData.name = profile.name;
        adminData.email = profile.email;
        adminData.phone = profile.phone;
        localStorage.setItem('dhanfunded-admin', JSON.stringify(adminData));
      } else {
        alert(data.error || 'Failed to update profile');
      }
    } catch (error) {
      alert('Error updating profile');
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    if (passwords.newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const adminId = adminAuth?.user?._id;
      const res = await fetch(`${API_URL}/api/admin/hierarchy/${adminId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwords.newPassword })
      });
      const data = await res.json();
      if (data.success) {
        alert('Password changed successfully!');
        setPasswords({ newPassword: '', confirmPassword: '' });
      } else {
        alert(data.error || 'Failed to change password');
      }
    } catch (error) {
      alert('Error changing password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 24px 0', color: 'var(--text-primary)' }}>Settings</h2>

      <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 24, marginBottom: 24, border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)' }}>Profile Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-secondary)', fontSize: 14 }}>Name</label>
            <input type="text" value={profile.name} onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))} style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-secondary)', fontSize: 14 }}>Email</label>
            <input type="email" value={profile.email} onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))} style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-secondary)', fontSize: 14 }}>Phone</label>
            <input type="text" value={profile.phone} onChange={(e) => setProfile(prev => ({ ...prev, phone: e.target.value }))} style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          </div>
        </div>
        <button onClick={updateProfile} disabled={loading} style={{ marginTop: 20, padding: '12px 24px', borderRadius: 8, border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
          {loading ? 'Saving...' : 'Save Profile'}
        </button>
      </div>

      <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 24, border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)' }}>Change Password</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-secondary)', fontSize: 14 }}>New Password</label>
            <input type="password" value={passwords.newPassword} onChange={(e) => setPasswords(prev => ({ ...prev, newPassword: e.target.value }))} placeholder="Min 6 characters" style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-secondary)', fontSize: 14 }}>Confirm Password</label>
            <input type="password" value={passwords.confirmPassword} onChange={(e) => setPasswords(prev => ({ ...prev, confirmPassword: e.target.value }))} placeholder="Confirm password" style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          </div>
        </div>
        <button onClick={changePassword} disabled={loading} style={{ marginTop: 20, padding: '12px 24px', borderRadius: 8, border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
          {loading ? 'Changing...' : 'Change Password'}
        </button>
      </div>

      <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 24, marginTop: 24, border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)' }}>Account Information</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <InfoRow label="Account ID" value={adminAuth?.user?.oderId || 'N/A'} />
          <InfoRow label="Role" value="BROKER" />
          <InfoRow label="Status" value={adminAuth?.user?.isActive ? 'Active' : 'Inactive'} />
        </div>
      </div>

      {/* Referral Link */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 24, marginTop: 24, border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)' }}>📎 Referral Link</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
          Share this code or link with users. When they register using this, they will be automatically assigned to you.
        </p>
        
        <div style={{ marginBottom: 16, padding: 16, background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 8 }}>Your Referral Code</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'white', fontFamily: 'monospace', letterSpacing: 4 }}>
            {adminAuth?.user?.oderId || 'N/A'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            readOnly
            value={`${window.location.origin}/register?ref=${adminAuth?.user?.oderId}`}
            style={{
              flex: 1,
              minWidth: 250,
              padding: '12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontFamily: 'monospace',
              fontSize: 13
            }}
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/register?ref=${adminAuth?.user?.oderId}`);
              alert('Referral link copied to clipboard!');
            }}
            style={{
              padding: '12px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#10b981',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            📋 Copy Link
          </button>
        </div>
        
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => {
              navigator.clipboard.writeText(adminAuth?.user?.oderId || '');
              alert('Referral code copied!');
            }}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 13
            }}
          >
            📋 Copy Code Only
          </button>
        </div>
      </div>

      <MyPermissionsPanel API_URL={API_URL} fallbackUser={adminAuth?.user} />
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

export default BrokerSettings;
