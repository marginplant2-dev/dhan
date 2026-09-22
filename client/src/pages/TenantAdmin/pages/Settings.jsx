import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';

/** Profile, password, and a plain list of what this account is allowed to do. */
export default function Settings() {
  const { API_URL, admin, impersonating } = useOutletContext();
  const [profile, setProfile] = useState({
    name: admin.name || '', email: admin.email || '', phone: admin.phone || '',
  });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const save = async (body, okMessage) => {
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/hierarchy/${admin._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setMessage(data.success ? okMessage : (data.error || 'That did not work'));
    } catch {
      setMessage('Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  const granted = Object.entries(admin.permissions || {})
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  return (
    <>
      {message && <div className="tp-card" style={{ marginBottom: 16 }}>{message}</div>}

      <div className="tp-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Profile</h3>
        <div className="tp-grid-2">
          <div>
            <label className="tp-label">Name</label>
            <input className="tp-input" value={profile.name}
                   onChange={(e) => setProfile(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="tp-label">Email</label>
            <input className="tp-input" value={profile.email}
                   onChange={(e) => setProfile(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div>
            <label className="tp-label">Phone</label>
            <input className="tp-input" value={profile.phone}
                   onChange={(e) => setProfile(p => ({ ...p, phone: e.target.value }))} />
          </div>
        </div>
        <button className="tp-btn tp-btn--primary" style={{ marginTop: 18 }} disabled={busy}
                onClick={() => save(profile, 'Profile saved.')}>
          Save profile
        </button>
      </div>

      <div className="tp-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Password</h3>
        <div style={{ maxWidth: 320 }}>
          <label className="tp-label">New password</label>
          <input className="tp-input" type="password" value={password} placeholder="At least 6 characters"
                 onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="tp-btn tp-btn--primary" style={{ marginTop: 18 }}
                disabled={busy || password.length < 6}
                onClick={() => save({ password }, 'Password changed.').then(() => setPassword(''))}>
          Change password
        </button>
        {impersonating && (
          <p className="tp-muted" style={{ fontSize: 13, marginBottom: 0 }}>
            You are acting as this admin — changing the password changes theirs.
          </p>
        )}
      </div>

      <div className="tp-card">
        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>What this account can do</h3>
        <p className="tp-muted" style={{ fontSize: 13, marginTop: 0 }}>
          Granted by the platform owner. Ask them to change it.
        </p>
        {granted.length === 0 ? (
          <p className="tp-muted" style={{ fontSize: 14, margin: 0 }}>No permissions granted yet.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {granted.map(k => <span key={k} className="tp-pill tp-pill--ok">{k}</span>)}
          </div>
        )}
      </div>
    </>
  );
}
