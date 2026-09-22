import { useState, useEffect, useCallback } from 'react';

function authHeaders() {
  const token = localStorage.getItem('dhanfunded-admin-token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function refreshAdminUserInShell(API_URL) {
  const token = localStorage.getItem('dhanfunded-admin-token');
  if (!token) return;
  fetch(`${API_URL}/api/auth/admin/verify`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.json())
    .then((data) => {
      if (data.success && data.user) {
        localStorage.setItem('dhanfunded-admin-user', JSON.stringify(data.user));
        window.dispatchEvent(new CustomEvent('dhanfunded-admin-user-refreshed', { detail: data.user }));
      }
    })
    .catch(() => {});
}

export default function AdminMyAccount({ API_URL }) {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [oderId, setOderId] = useState('');
  const [email, setEmail] = useState('');

  const [newOderId, setNewOderId] = useState('');
  const [oderIdPassword, setOderIdPassword] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [msg, setMsg] = useState({ type: '', text: '' });

  const show = useCallback((type, text) => {
    setMsg({ type, text });
    if (text) setTimeout(() => setMsg({ type: '', text: '' }), 6000);
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/profile`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) {
        show('error', data.error || 'Could not load profile');
        return;
      }
      const u = data.user || {};
      setName(u.name || '');
      setPhone(u.phone || '');
      setOderId(u.oderId || u.id || '');
      setEmail(u.email || '');
      setNewEmail(u.email || '');
    } catch (e) {
      show('error', e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [API_URL, show]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      const body = { name: name.trim() };
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      if (cleanPhone) body.phone = cleanPhone;

      const res = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        show('error', data.error || 'Update failed');
        return;
      }
      show('success', data.message || 'Profile saved');
      refreshAdminUserInShell(API_URL);
    } catch (err) {
      show('error', err.message);
    }
  };

  const saveOderId = async (e) => {
    e.preventDefault();
    if (!newOderId.trim()) {
      show('error', 'Enter a new admin ID');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/auth/admin/oder-id`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ newOderId: newOderId.trim(), password: oderIdPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        show('error', data.error || 'Could not update admin ID');
        return;
      }
      setOderIdPassword('');
      setNewOderId('');
      show('success', data.message || 'Admin ID updated');
      await loadProfile();
      refreshAdminUserInShell(API_URL);
    } catch (err) {
      show('error', err.message);
    }
  };

  const saveEmail = async (e) => {
    e.preventDefault();
    const next = newEmail.trim().toLowerCase();
    if (next === (email || '').toLowerCase()) {
      show('error', 'Enter a different email than your current login email');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/auth/update-email`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ newEmail: next, password: emailPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        show('error', data.error || 'Could not update email');
        return;
      }
      setEmailPassword('');
      setEmail(newEmail.trim().toLowerCase());
      show('success', data.message || 'Login email updated');
      refreshAdminUserInShell(API_URL);
    } catch (err) {
      show('error', err.message);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        show('error', data.error || 'Could not change password');
        return;
      }
      if (data.token) {
        localStorage.setItem('dhanfunded-admin-token', data.token);
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      show('success', data.message || 'Password changed');
      refreshAdminUserInShell(API_URL);
    } catch (err) {
      show('error', err.message);
    }
  };

  if (loading) {
    return (
      <div className="admin-page-container">
        <div className="admin-loading">Loading account…</div>
      </div>
    );
  }

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>My account</h2>
      </div>

      {msg.text && (
        <div
          className="admin-form-card"
          style={{
            marginBottom: 16,
            borderColor: msg.type === 'error' ? '#f87171' : '#4ade80',
            background: msg.type === 'error' ? 'rgba(248,113,113,0.08)' : 'rgba(74,222,128,0.08)'
          }}
        >
          <p style={{ margin: 0, fontSize: 14 }}>{msg.text}</p>
        </div>
      )}

      <div className="admin-settings-grid">
        <form className="admin-form-card" onSubmit={saveProfile}>
          <h3>Profile</h3>
          <p className="admin-hint" style={{ marginTop: 0, color: '#888', fontSize: 13 }}>
            Display name and phone (login email is changed below).
          </p>
          <div className="admin-form-group">
            <label>Display name</label>
            <input
              className="admin-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="admin-form-group">
            <label>Phone</label>
            <input
              className="admin-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Digits only"
            />
          </div>
          <div className="admin-form-group">
            <label>Current login email</label>
            <input className="admin-input" value={email} readOnly disabled />
          </div>
          <div className="admin-form-group">
            <label>Admin ID (current)</label>
            <input className="admin-input" value={oderId} readOnly disabled />
          </div>
          <button type="submit" className="admin-btn primary">
            Save profile
          </button>
        </form>

        <form className="admin-form-card" onSubmit={saveEmail}>
          <h3>Change login email</h3>
          <p className="admin-hint" style={{ marginTop: 0, color: '#888', fontSize: 13 }}>
            You sign in with email, phone, or admin ID. Updating email requires your current password.
          </p>
          <div className="admin-form-group">
            <label>New email</label>
            <input
              type="email"
              className="admin-input"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
          </div>
          <div className="admin-form-group">
            <label>Current password</label>
            <input
              type="password"
              className="admin-input"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className="admin-btn primary">
            Update email
          </button>
        </form>

        <form className="admin-form-card" onSubmit={saveOderId}>
          <h3>Change admin ID</h3>
          <p className="admin-hint" style={{ marginTop: 0, color: '#888', fontSize: 13 }}>
            3–32 characters: letters, numbers, underscores, hyphens. You can use this instead of email
            at login.
          </p>
          <div className="admin-form-group">
            <label>New admin ID</label>
            <input
              className="admin-input"
              value={newOderId}
              onChange={(e) => setNewOderId(e.target.value)}
              placeholder="e.g. admin_main"
              autoComplete="off"
            />
          </div>
          <div className="admin-form-group">
            <label>Current password</label>
            <input
              type="password"
              className="admin-input"
              value={oderIdPassword}
              onChange={(e) => setOderIdPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className="admin-btn primary">
            Update admin ID
          </button>
        </form>

        <form className="admin-form-card" onSubmit={savePassword}>
          <h3>Change password</h3>
          <div className="admin-form-group">
            <label>Current password</label>
            <input
              type="password"
              className="admin-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="admin-form-group">
            <label>New password</label>
            <input
              type="password"
              className="admin-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </div>
          <div className="admin-form-group">
            <label>Confirm new password</label>
            <input
              type="password"
              className="admin-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </div>
          <button type="submit" className="admin-btn primary">
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
