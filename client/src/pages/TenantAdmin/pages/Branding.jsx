import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';

/**
 * Brand identity and the admin's own domain.
 *
 * Mirrors the server lifecycle exactly: PENDING_DNS → VERIFYING → ISSUING_CERT
 * → READY, or FAILED with the reason the server recorded.
 */

const STATUS = {
  NONE:         { label: 'Not connected', cls: '' },
  PENDING_DNS:  { label: 'Waiting for DNS', cls: 'tp-pill--wait' },
  VERIFYING:    { label: 'Verifying…', cls: 'tp-pill--wait' },
  ISSUING_CERT: { label: 'Issuing certificate…', cls: 'tp-pill--wait' },
  READY:        { label: 'Live', cls: 'tp-pill--ok' },
  FAILED:       { label: 'Failed', cls: 'tp-pill--off' },
};

export default function Branding() {
  const { API_URL } = useOutletContext();
  const [branding, setBranding] = useState(null);
  const [form, setForm] = useState({ brandName: '', logoUrl: '', customDomain: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [message, setMessage] = useState('');
  const poll = useRef(null);

  const apply = (b) => {
    setBranding(b);
    setForm({ brandName: b.brandName || '', logoUrl: b.logoUrl || '', customDomain: b.customDomain || '' });
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

  useEffect(() => { load(); return () => clearInterval(poll.current); /* eslint-disable-next-line */ }, []);

  // Certificate issuance runs off the request, so poll while it is in flight.
  useEffect(() => {
    clearInterval(poll.current);
    if (!branding || !['VERIFYING', 'ISSUING_CERT'].includes(branding.status)) return;
    poll.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/branding/domain/status`);
        const data = await res.json();
        if (data.success && data.status !== branding.status) load();
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(poll.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding?.status]);

  const call = async (path, init, okMessage) => {
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/branding${path}`, init);
      const data = await res.json();
      if (data.branding) apply(data.branding);
      setMessage(data.success ? okMessage : (data.error || 'That did not work'));
    } catch {
      setMessage('Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !disabled) return <div className="tp-card tp-muted">Loading…</div>;

  if (disabled) {
    return (
      <div className="tp-card">
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Custom domains are switched off</h3>
        <p className="tp-muted" style={{ margin: 0, fontSize: 14 }}>
          The platform owner has not enabled this yet. Your users stay on the platform domain until they do.
        </p>
      </div>
    );
  }

  const st = STATUS[branding?.status] || STATUS.NONE;
  const inFlight = ['VERIFYING', 'ISSUING_CERT'].includes(branding?.status);

  return (
    <>
      {message && <div className="tp-card" style={{ marginBottom: 16 }}>{message}</div>}

      <div className="tp-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Identity</h3>
        <div className="tp-grid-2">
          <div>
            <label className="tp-label">Brand name</label>
            <input className="tp-input" value={form.brandName} placeholder="Your company name"
                   onChange={(e) => setForm(f => ({ ...f, brandName: e.target.value }))} />
          </div>
          <div>
            <label className="tp-label">Logo URL</label>
            <input className="tp-input" value={form.logoUrl} placeholder="https://…/logo.png"
                   onChange={(e) => setForm(f => ({ ...f, logoUrl: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="tp-card">
        <div className="tp-row" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Custom domain</h3>
          <span className={`tp-pill ${st.cls}`}>{st.label}</span>
        </div>

        <label className="tp-label">Domain</label>
        <input className="tp-input" style={{ maxWidth: 420 }} value={form.customDomain}
               placeholder="app.yourbrand.com"
               onChange={(e) => setForm(f => ({ ...f, customDomain: e.target.value }))} />

        {branding?.lastError && (
          <p style={{ color: 'var(--tp-danger)', fontSize: 13, margin: '12px 0 0' }}>{branding.lastError}</p>
        )}

        {branding?.dns?.length > 0 && (
          <>
            <p className="tp-muted" style={{ fontSize: 13, margin: '20px 0 10px' }}>
              Add these two records at your DNS provider, then press Verify. DNS can take up to an hour.
            </p>
            <div className="tp-table-wrap">
              <table className="tp-table">
                <thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead>
                <tbody>
                  {branding.dns.map(r => (
                    <tr key={r.type}>
                      <td>{r.type}</td>
                      <td className="tp-mono" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{r.name}</td>
                      <td className="tp-mono" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="tp-row" style={{ marginTop: 22 }}>
          <button className="tp-btn tp-btn--primary" disabled={busy}
                  onClick={() => call('', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(form),
                  }, 'Saved.')}>
            {busy ? 'Working…' : 'Save'}
          </button>

          {branding?.customDomain && (
            <button className="tp-btn" disabled={busy || inFlight}
                    onClick={() => call('/domain/verify', { method: 'POST' }, 'DNS verified — issuing the certificate.')}>
              Verify DNS
            </button>
          )}

          {branding?.customDomain && (
            <button className="tp-btn tp-btn--danger" disabled={busy}
                    onClick={() => {
                      if (!window.confirm('Disconnect this domain? Your users fall back to the platform domain immediately.')) return;
                      call('/domain/disconnect', { method: 'POST' }, 'Domain disconnected.');
                    }}>
              Disconnect
            </button>
          )}
        </div>
      </div>
    </>
  );
}
