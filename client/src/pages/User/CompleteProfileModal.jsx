import { useState } from 'react';

/**
 * Forces a logged-in user to add at least their mobile number before using the
 * platform. Shows automatically whenever the account has no phone on file —
 * the common case for "Sign in with Google" users, since Google does NOT share
 * the phone number through OAuth. Saving posts to PUT /api/auth/profile (the
 * same endpoint the Settings page uses), then reloads so the fresh profile —
 * including the phone — flows everywhere and the modal does not reappear.
 */
export default function CompleteProfileModal({ user, apiUrl }) {
  const needsPhone = !!user && !String(user.phone || '').trim();
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!needsPhone) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('dhanfunded-token');
      const res = await fetch(`${apiUrl}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: user.email || '',
          phone: phone.trim(),
          city: city.trim(),
          state: stateName.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || data.message || 'Could not save. Please try again.');
        return;
      }
      // The app loads the logged-in user from the cached `dhanfunded-auth`
      // object in localStorage (it does NOT re-fetch /api/auth/me on reload).
      // A plain reload would therefore re-read the OLD user (no phone) and the
      // modal would pop straight back up. Patch the cached user with the new
      // phone/city/state FIRST, then reload — now the reloaded user has a phone
      // and the modal stays closed.
      try {
        const raw = localStorage.getItem('dhanfunded-auth');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.user) {
            parsed.user.phone = phone.trim();
            parsed.user.profile = { ...(parsed.user.profile || {}), city: city.trim(), state: stateName.trim() };
            localStorage.setItem('dhanfunded-auth', JSON.stringify(parsed));
          }
        }
      } catch (_) { /* localStorage may be unavailable */ }
      window.location.reload();
    } catch (_) {
      setError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay} role="dialog" aria-modal="true">
      <div style={S.card}>
        <div style={S.title}>👋 Complete your profile</div>
        <p style={S.sub}>
          Welcome{user.name ? `, ${user.name}` : ''}! Add your mobile number to continue — we need it
          for account verification, payouts and support.
        </p>
        <form onSubmit={submit}>
          <label style={S.lbl}>Mobile Number <span style={{ color: '#ef4444' }}>*</span></label>
          <input
            style={S.inp}
            type="tel"
            inputMode="numeric"
            placeholder="e.g. 9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={S.lbl}>City</label>
              <input style={S.inp} type="text" placeholder="Optional" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.lbl}>State</label>
              <input style={S.inp} type="text" placeholder="Optional" value={stateName} onChange={(e) => setStateName(e.target.value)} />
            </div>
          </div>
          {error && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 10 }}>{error}</div>}
          <button type="submit" disabled={saving} style={{ ...S.btn, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save & Continue'}
          </button>
        </form>
        <p style={S.note}>Your number is private and used only for account &amp; payout purposes.</p>
      </div>
    </div>
  );
}

const S = {
  overlay: { position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(8,10,20,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' },
  title: { fontSize: 22, fontWeight: 800, color: '#0A2130', marginBottom: 6 },
  sub: { fontSize: 14, color: '#6B7080', margin: '0 0 18px', lineHeight: 1.5 },
  lbl: { display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7080', margin: '12px 0 6px' },
  inp: { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, border: '1px solid #E2E5EE', fontSize: 15, color: '#0A2130', outline: 'none' },
  btn: { width: '100%', marginTop: 18, padding: '13px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg,#35DC85,#4B6AFF)', color: '#fff', fontSize: 15, fontWeight: 700 },
  note: { fontSize: 11, color: '#9FB5AB', textAlign: 'center', margin: '12px 0 0' },
};
