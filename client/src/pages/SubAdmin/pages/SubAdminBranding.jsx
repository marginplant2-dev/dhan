import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';

/**
 * Branding & custom domain for one admin.
 *
 * Every call here targets the caller's OWN row — there is no id in any of the
 * URLs, so there is nothing to tamper with. The lifecycle mirrors the server:
 * PENDING_DNS → VERIFYING → ISSUING_CERT → READY, or FAILED with a reason.
 */

const STATUS_STYLE = {
  NONE:         { label: 'Not connected', bg: '#3a3a4a', fg: '#c9c9d6' },
  PENDING_DNS:  { label: 'Waiting for DNS', bg: '#4a3d1a', fg: '#f5c451' },
  VERIFYING:    { label: 'Verifying…', bg: '#1a3a4a', fg: '#5ec5f5' },
  ISSUING_CERT: { label: 'Issuing certificate…', bg: '#1a3a4a', fg: '#5ec5f5' },
  READY:        { label: 'Live', bg: '#14401f', fg: '#4ade80' },
  FAILED:       { label: 'Failed', bg: '#4a1a1a', fg: '#f87171' },
};

const card = {
  background: 'var(--bg-secondary)', borderRadius: 12, padding: 24,
  marginBottom: 24, border: '1px solid var(--border)',
};
const input = {
  width: '100%', padding: 12, borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-primary)', color: 'var(--text-primary)',
};
const label = { display: 'block', marginBottom: 8, color: 'var(--text-secondary)', fontSize: 14 };

function SubAdminBranding() {
  const { API_URL } = useOutletContext();
  const [branding, setBranding] = useState(null);
  const [form, setForm] = useState({ brandName: '', logoUrl: '', customDomain: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [disabled, setDisabled] = useState(false);   // feature flag off
  const [message, setMessage] = useState('');
  const pollRef = useRef(null);

  const apply = (b) => {
    setBranding(b);
    setForm({
      brandName: b.brandName || '',
      logoUrl: b.logoUrl || '',
      customDomain: b.customDomain || '',
    });
  };

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/branding/me`);
      if (res.status === 503) { setDisabled(true); return; }
      const data = await res.json();
      if (data.success) apply(data.branding);
      else setMessage(data.error || 'Could not load branding');
    } catch {
      setMessage('Could not reach the server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Issuance happens off the request thread, so poll while it is in flight.
  useEffect(() => {
    clearInterval(pollRef.current);
    if (!branding || !['VERIFYING', 'ISSUING_CERT'].includes(branding.status)) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/branding/domain/status`);
        const data = await res.json();
        if (data.success && data.status !== branding.status) load();
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding?.status]);

  const save = async () => {
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) { apply(data.branding); setMessage('Saved.'); }
      else setMessage(data.error || 'Could not save');
    } finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/branding/domain/verify`, { method: 'POST' });
      const data = await res.json();
      if (data.branding) apply(data.branding);
      setMessage(data.success ? 'DNS verified — issuing the certificate.' : (data.error || 'Verification failed'));
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect this domain? Your users fall back to the platform domain immediately.')) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/branding/domain/disconnect`, { method: 'POST' });
      const data = await res.json();
      if (data.success) { apply(data.branding); setMessage('Domain disconnected.'); }
      else setMessage(data.error || 'Could not disconnect');
    } finally { setBusy(false); }
  };

  if (loading && !disabled) return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading…</div>;

  if (disabled) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ margin: '0 0 24px 0', color: 'var(--text-primary)' }}>Branding &amp; Domain</h2>
        <div style={card}>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Custom domains are not enabled on this platform yet. Ask the platform owner to switch them on.
          </p>
        </div>
      </div>
    );
  }

  const st = STATUS_STYLE[branding?.status] || STATUS_STYLE.NONE;
  const inFlight = ['VERIFYING', 'ISSUING_CERT'].includes(branding?.status);

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 24px 0', color: 'var(--text-primary)' }}>Branding &amp; Domain</h2>

      {message && (
        <div style={{ ...card, padding: 14, marginBottom: 16, color: 'var(--text-primary)' }}>{message}</div>
      )}

      <div style={card}>
        <h3 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)' }}>Identity</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
          <div>
            <label style={label}>Brand name</label>
            <input style={input} value={form.brandName} placeholder="Your company name"
                   onChange={(e) => setForm(f => ({ ...f, brandName: e.target.value }))} />
          </div>
          <div>
            <label style={label}>Logo URL</label>
            <input style={input} value={form.logoUrl} placeholder="https://…/logo.png"
                   onChange={(e) => setForm(f => ({ ...f, logoUrl: e.target.value }))} />
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Custom domain</h3>
          <span style={{ background: st.bg, color: st.fg, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}>
            {st.label}
          </span>
        </div>

        <label style={label}>Domain</label>
        <input style={{ ...input, maxWidth: 420 }} value={form.customDomain} placeholder="app.yourbrand.com"
               onChange={(e) => setForm(f => ({ ...f, customDomain: e.target.value }))} />

        {branding?.lastError && (
          <p style={{ color: '#f87171', fontSize: 13, marginTop: 12, marginBottom: 0 }}>{branding.lastError}</p>
        )}

        {branding?.dns?.length > 0 && (
          <>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '20px 0 8px' }}>
              Add these two records at your DNS provider, then press Verify. DNS changes can take up to an hour.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Type</th>
                    <th style={{ padding: '8px 10px' }}>Name</th>
                    <th style={{ padding: '8px 10px' }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {branding.dns.map((r) => (
                    <tr key={r.type} style={{ borderTop: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                      <td style={{ padding: '10px' }}>{r.type}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{r.name}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
          <button onClick={save} disabled={busy}
                  style={{ padding: '12px 22px', borderRadius: 8, border: 'none', background: 'var(--accent, #6366f1)', color: '#fff', fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Working…' : 'Save'}
          </button>
          {branding?.customDomain && (
            <button onClick={verify} disabled={busy || inFlight}
                    style={{ padding: '12px 22px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 600, cursor: (busy || inFlight) ? 'default' : 'pointer' }}>
              Verify DNS
            </button>
          )}
          {branding?.customDomain && (
            <button onClick={disconnect} disabled={busy}
                    style={{ padding: '12px 22px', borderRadius: 8, border: '1px solid #7f1d1d', background: 'transparent', color: '#f87171', fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
              Disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SubAdminBranding;
