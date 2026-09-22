import { useState, useEffect, useCallback } from 'react';

/**
 * AI Options admin: the plans that set the price, and the payment queue that
 * grants access. Approving a request is the ONLY thing that opens the feature
 * for a user, so the proof screenshot and UTR sit next to the button.
 */
const fmtInr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/* The admin app keeps its token here; without it these routes answer 401. */
const adminAuth = () => {
  const t = localStorage.getItem('dhanfunded-admin-token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const EMPTY_PLAN = { name: '', price: '', days: 30, description: '', features: '', popular: false, active: true, sortOrder: 0 };

function AiSubscriptionsPanel({ apiUrl }) {
  const [tab, setTab] = useState('requests');

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>AI Options</h2>
      </div>

      <div className="admin-tabs" style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[['requests', 'Payment Requests'], ['plans', 'Plans & Pricing'], ['api', 'Gemini API Key']].map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`admin-btn ${tab === k ? 'admin-btn-primary' : ''}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'requests' && <Requests apiUrl={apiUrl} />}
      {tab === 'plans' && <Plans apiUrl={apiUrl} />}
      {tab === 'api' && <ApiKey apiUrl={apiUrl} />}
    </div>
  );
}

/* ── payment queue ──────────────────────────────────────────────────── */
function Requests({ apiUrl }) {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [proof, setProof] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // The list carries no screenshots; one is fetched when "View" is clicked.
  const openProof = async (id) => {
    try {
      const res = await fetch(`${apiUrl}/api/prop/admin/transactions/${id}/proof`, { headers: adminAuth() });
      const d = await res.json();
      if (d.success && d.proofImage) setProof(d.proofImage);
      else alert(d.message || 'No screenshot on this request');
    } catch {
      alert('Could not load the screenshot');
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/ai-options/admin/requests?status=${status}`, { headers: adminAuth() });
      const d = await res.json();
      if (d.success) { setRows(d.requests || []); setStats(d.stats || {}); }
    } catch { /* leave the previous rows on screen */ }
    setLoading(false);
  }, [apiUrl, status]);

  useEffect(() => { load(); }, [load]);

  const act = async (id, what) => {
    if (what === 'approve' && !window.confirm('Approve this payment and open AI Options for the user?')) return;
    let reason = '';
    if (what === 'reject') {
      reason = window.prompt('Reason for rejection (shown to the user):', '') || '';
      if (reason === null) return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`${apiUrl}/api/ai-options/admin/requests/${id}/${what}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuth() },
        body: JSON.stringify({ reason }),
      });
      const d = await res.json();
      if (!d.success) alert(d.message || 'Failed');
      await load();
    } catch {
      alert('Could not reach the server');
    }
    setBusyId(null);
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['pending', 'Pending', stats.pending], ['approved', 'Approved', stats.approved],
          ['rejected', 'Rejected', stats.rejected], ['all', 'All', null]].map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            className={`admin-btn ${status === k ? 'admin-btn-primary' : ''}`}
            onClick={() => setStatus(k)}
          >
            {label}{n != null ? ` (${n})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="admin-loading">Loading requests…</div>
      ) : rows.length === 0 ? (
        <div className="admin-empty" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
          No {status === 'all' ? '' : status} requests.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Requested</th><th>User</th><th>Plan</th><th>Amount</th>
                <th>UPI / UTR</th><th>Proof</th><th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.createdAt)}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.user?.name || r.userName || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.user?.email || r.oderId}</div>
                  </td>
                  <td>
                    {r.paymentDetails?.aiPlanName || '—'}
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {r.paymentDetails?.aiPlanDays ? `${r.paymentDetails.aiPlanDays} days` : ''}
                    </div>
                  </td>
                  <td style={{ fontWeight: 700 }}>{fmtInr(r.amount)}</td>
                  <td style={{ fontSize: 12 }}>
                    <div>{r.paymentDetails?.upiId || '—'}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{r.paymentDetails?.utrNumber || ''}</div>
                  </td>
                  <td>
                    {r.hasProof
                      ? <button type="button" className="admin-btn" onClick={() => openProof(r._id)}>View</button>
                      : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                  </td>
                  <td>
                    <span className={`admin-badge admin-badge-${r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="admin-btn admin-btn-primary" disabled={busyId === r._id} onClick={() => act(r._id, 'approve')}>Approve</button>
                        <button type="button" className="admin-btn admin-btn-danger" disabled={busyId === r._id} onClick={() => act(r._id, 'reject')}>Reject</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {r.processedBy ? `by ${r.processedBy}` : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {proof && (
        <div
          onClick={() => setProof(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <img src={proof} alt="Payment proof" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 12 }} />
        </div>
      )}
    </>
  );
}

/* ── plans ──────────────────────────────────────────────────────────── */
function Plans({ apiUrl }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_PLAN);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/ai-options/admin/plans`, { headers: adminAuth() });
      const d = await res.json();
      if (d.success) setPlans(d.plans || []);
    } catch { /* keep what is on screen */ }
    setLoading(false);
  }, [apiUrl]);

  useEffect(() => { load(); }, [load]);

  const edit = (p) => {
    setEditId(p._id);
    setForm({
      name: p.name, price: p.price, days: p.days, description: p.description || '',
      features: (p.features || []).join('\n'),
      popular: !!p.popular, active: p.active !== false, sortOrder: p.sortOrder || 0,
    });
  };

  const save = async () => {
    if (!form.name.trim()) { alert('Plan name is required'); return; }
    if (!(Number(form.price) >= 0)) { alert('Price must be a number'); return; }
    if (!(Number(form.days) > 0)) { alert('Days must be at least 1'); return; }
    setSaving(true);
    try {
      const body = {
        ...form,
        price: Number(form.price),
        days: Number(form.days),
        sortOrder: Number(form.sortOrder) || 0,
        features: form.features.split('\n').map((f) => f.trim()).filter(Boolean),
      };
      const res = await fetch(
        editId ? `${apiUrl}/api/ai-options/admin/plans/${editId}` : `${apiUrl}/api/ai-options/admin/plans`,
        { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', ...adminAuth() }, body: JSON.stringify(body) },
      );
      const d = await res.json();
      if (!d.success) { alert(d.message || 'Could not save'); return; }
      setForm(EMPTY_PLAN); setEditId(null);
      await load();
    } catch {
      alert('Could not reach the server');
    }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this plan? Users who already paid keep their access.')) return;
    await fetch(`${apiUrl}/api/ai-options/admin/plans/${id}`, { method: 'DELETE', headers: adminAuth() }).catch(() => {});
    await load();
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20, alignItems: 'start' }}>
      <div>
        {loading ? (
          <div className="admin-loading">Loading plans…</div>
        ) : plans.length === 0 ? (
          <div className="admin-empty" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
            No plans yet. Create one on the right — until then the page shows no plans to buy.
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr><th>Plan</th><th>Price</th><th>Days</th><th>Popular</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p._id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    {p.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.description}</div>}
                  </td>
                  <td style={{ fontWeight: 700 }}>{fmtInr(p.price)}</td>
                  <td>{p.days}</td>
                  <td>{p.popular ? 'Yes' : '—'}</td>
                  <td>
                    <span className={`admin-badge admin-badge-${p.active ? 'success' : 'danger'}`}>
                      {p.active ? 'On sale' : 'Hidden'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="admin-btn" onClick={() => edit(p)}>Edit</button>
                      <button type="button" className="admin-btn admin-btn-danger" onClick={() => remove(p._id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-form-card">
        <h3>{editId ? 'Edit plan' : 'New plan'}</h3>
        <div className="admin-form-group">
          <label>Plan name</label>
          <input className="admin-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Monthly" />
        </div>
        <div className="admin-form-group">
          <label>Price (₹)</label>
          <input className="admin-input" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="999" />
        </div>
        <div className="admin-form-group">
          <label>Access length (days)</label>
          <input className="admin-input" type="number" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
        </div>
        <div className="admin-form-group">
          <label>Short description</label>
          <input className="admin-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Best for active traders" />
        </div>
        <div className="admin-form-group">
          <label>Features <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(one per line)</span></label>
          <textarea className="admin-input" rows={4} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} />
        </div>
        <div className="admin-form-group">
          <label>Sort order</label>
          <input className="admin-input" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
        </div>
        <div className="admin-toggle-group">
          <label className="admin-toggle">
            <input type="checkbox" checked={form.popular} onChange={(e) => setForm({ ...form, popular: e.target.checked })} />
            <span>Show a "Popular" ribbon</span>
          </label>
        </div>
        <div className="admin-toggle-group">
          <label className="admin-toggle">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <span>On sale</span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="admin-btn admin-btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : editId ? 'Save changes' : 'Create plan'}
          </button>
          {editId && (
            <button type="button" className="admin-btn" onClick={() => { setEditId(null); setForm(EMPTY_PLAN); }}>Cancel</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Gemini credential ──────────────────────────────────────────────── */
function ApiKey({ apiUrl }) {
  const [status, setStatus] = useState(null);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(null);   // null = untested this session

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/ai-options/admin/gemini`, { headers: adminAuth() });
      const d = await res.json();
      if (d.success) { setStatus(d); if (d.model) setModel(d.model); }
    } catch { /* the form still works */ }
  }, [apiUrl]);

  useEffect(() => { load(); }, [load]);

  /**
   * Ask Google which models this key can call. Hardcoding the list is what
   * broke before — gemini-2.0-flash was retired and the dropdown still offered
   * it. Runs with the typed key if there is one, else the saved key.
   */
  const loadModels = useCallback(async (withKey) => {
    setLoadingModels(true); setMsg('');
    try {
      const res = await fetch(`${apiUrl}/api/ai-options/admin/gemini/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuth() },
        body: JSON.stringify({ apiKey: withKey || '' }),
      });
      const d = await res.json();
      if (d.success) {
        const list = d.models || [];
        setModels(list);
        setModel((cur) => (cur && list.some((m) => m.id === cur) ? cur : (list[0]?.id || '')));
      } else {
        setOk(false); setMsg(d.message || 'Could not list models');
      }
    } catch {
      setOk(false); setMsg('Could not reach the server');
    }
    setLoadingModels(false);
  }, [apiUrl]);

  /* A saved key can list its models straight away. */
  useEffect(() => {
    if (status?.configured && !models.length) loadModels('');
  }, [status, models.length, loadModels]);

  /* Saving runs a live call first — a key that does not answer is not stored. */
  const save = async () => {
    if (!key.trim()) { setMsg('Paste your Gemini API key first'); setOk(false); return; }
    if (!model) { setMsg('Pick a model — press "Load models" to see what your key can call'); setOk(false); return; }
    setBusy(true); setMsg(''); setOk(null);
    try {
      const res = await fetch(`${apiUrl}/api/ai-options/admin/gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuth() },
        body: JSON.stringify({ apiKey: key.trim(), model }),
      });
      const d = await res.json();
      if (d.success && d.verified) {
        setOk(true); setMsg('Connected — Gemini answered with this key.'); setKey('');
        await load();
      } else {
        setOk(false); setMsg(d.message || 'Gemini rejected that key');
      }
    } catch {
      setOk(false); setMsg('Could not reach the server');
    }
    setBusy(false);
  };

  const test = async () => {
    setBusy(true); setMsg(''); setOk(null);
    try {
      const res = await fetch(`${apiUrl}/api/ai-options/admin/gemini/test`, { method: 'POST', headers: adminAuth() });
      const d = await res.json();
      setOk(!!d.verified);
      setMsg(d.verified ? 'Working — Gemini answered just now.' : (d.message || 'Test failed'));
      await load();
    } catch {
      setOk(false); setMsg('Could not reach the server');
    }
    setBusy(false);
  };

  /* Green only after a call actually came back. */
  const live = ok === true || (ok === null && status?.configured && status?.lastVerifiedAt && !status?.lastError);
  const tone = ok === false || status?.lastError ? 'bad' : live ? 'good' : 'idle';
  const toneColor = { good: '#10b981', bad: '#ef4444', idle: 'var(--text-secondary)' }[tone];

  return (
    <div style={{ maxWidth: 620 }}>
      <div className="admin-form-card">
        <h3>
          Gemini API Key
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 12,
            padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
            color: toneColor, background: `color-mix(in srgb, ${toneColor} 14%, transparent)`,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: toneColor }} />
            {tone === 'good' ? 'Connected' : tone === 'bad' ? 'Not working' : status?.configured ? 'Saved — not tested' : 'Not set'}
          </span>
        </h3>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Get a key at <strong>aistudio.google.com/apikey</strong>. Saving runs a real call first —
          the key is only stored if Gemini answers, so green means it genuinely works.
          Until a key is set, the AI Options page cannot produce any analysis.
        </p>

        {status?.configured && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 16, padding: '12px 14px', borderRadius: 10,
            marginBottom: 16, background: 'var(--bg-secondary)', fontSize: 12.5,
          }}>
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>Saved key</div>
              <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                {status.maskedKey || (status.fromEnv ? 'from server .env' : '—')}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>Model</div>
              <div style={{ fontWeight: 700 }}>{status.model}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)' }}>Last verified</div>
              <div style={{ fontWeight: 700 }}>{fmtDate(status.lastVerifiedAt)}</div>
            </div>
          </div>
        )}

        <div className="admin-form-group">
          <label>{status?.configured ? 'Replace the key' : 'API key'}</label>
          <input
            className="admin-input"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIza..."
          />
        </div>

        <div className="admin-form-group">
          <label>
            Model
            <button
              type="button"
              className="admin-btn"
              style={{ marginLeft: 10, padding: '3px 10px', fontSize: 12 }}
              disabled={loadingModels || (!key.trim() && !status?.configured)}
              onClick={() => loadModels(key.trim())}
            >
              {loadingModels ? 'Loading…' : 'Load models'}
            </button>
          </label>
          {models.length ? (
            <select className="admin-input" value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.id}{m.label ? ` — ${m.label}` : ''}</option>
              ))}
            </select>
          ) : (
            <input
              className="admin-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Paste a key, then press Load models"
            />
          )}
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0', lineHeight: 1.5 }}>
            This list comes from Google, so it only ever offers models your key can
            actually call today. <strong>gemini-flash-latest</strong> always points at
            the current fast model and will not retire under you.
          </p>
        </div>

        {msg && (
          <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px', color: ok === false ? '#ef4444' : '#10b981' }}>
            {msg}
          </p>
        )}
        {status?.lastError && ok === null && (
          <p style={{ fontSize: 12.5, margin: '0 0 12px', color: '#ef4444' }}>
            Last error: {status.lastError}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="admin-btn admin-btn-primary" disabled={busy} onClick={save}>
            {busy ? 'Checking…' : 'Connect & verify'}
          </button>
          {status?.configured && (
            <button type="button" className="admin-btn" disabled={busy} onClick={test}>
              Test saved key
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AiSubscriptionsPanel;
