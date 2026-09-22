import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';

const SAMPLE_VARS = {
  code: '123456',
  otp: '123456',
  expiryMinutes: '10',
  brandName: 'DhanFunded',
  supportEmail: 'support@example.com',
  userName: 'Demo User',
  loginUrl: 'https://example.com/login',
  reason: 'Policy review',
  amount: '1,000.00',
  currency: 'USD'
};

function interpolate(str, vars) {
  if (!str) return '';
  const merged = { ...SAMPLE_VARS, ...vars };
  return str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) =>
    merged[key] !== undefined && merged[key] !== null ? String(merged[key]) : ''
  );
}

function EmailTemplatesPanel() {
  const { API_URL } = useOutletContext();
  const base = useMemo(() => `${API_URL}/api/admin/email-templates`, [API_URL]);

  const headers = useCallback(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('dhanfunded-admin-token')}`
    }),
    []
  );

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [smtpVerify, setSmtpVerify] = useState({ checking: false, ok: null, error: null });
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);

  const [previewHtml, setPreviewHtml] = useState(null);

  const [testOpen, setTestOpen] = useState(false);
  const [testSlug, setTestSlug] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testSending, setTestSending] = useState(false);

  const loadList = useCallback(async () => {
    const res = await fetch(`${base}/`, { headers: headers() });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to load templates');
    setTemplates(data.templates || []);
  }, [base, headers]);

  const loadStatus = useCallback(async () => {
    const res = await fetch(`${base}/status`, { headers: headers() });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to load status');
    setStatus(data);
  }, [base, headers]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadList(), loadStatus()]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [loadList, loadStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runVerifySmtp = async () => {
    setSmtpVerify({ checking: true, ok: null, error: null });
    try {
      const res = await fetch(`${base}/verify-smtp`, { method: 'POST', headers: headers() });
      const data = await res.json();
      if (data.success) {
        setSmtpVerify({ checking: false, ok: true, error: null });
        setMessage('SMTP connection verified.');
      } else {
        setSmtpVerify({ checking: false, ok: false, error: data.error || 'Verify failed' });
      }
    } catch (e) {
      setSmtpVerify({ checking: false, ok: false, error: e.message });
    }
  };

  useEffect(() => {
    if (!status?.smtpConfigured) return;
    let cancelled = false;
    (async () => {
      setSmtpVerify({ checking: true, ok: null, error: null });
      try {
        const res = await fetch(`${base}/verify-smtp`, { method: 'POST', headers: headers() });
        const data = await res.json();
        if (cancelled) return;
        if (data.success) {
          setSmtpVerify({ checking: false, ok: true, error: null });
        } else {
          setSmtpVerify({ checking: false, ok: false, error: data.error || 'Verify failed' });
        }
      } catch (e) {
        if (!cancelled) setSmtpVerify({ checking: false, ok: false, error: e.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status?.smtpConfigured, base, headers]);

  const toggleSignupOtp = async (enabled) => {
    setError(null);
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ signupOtpEmailEnabled: enabled })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadStatus();
      setMessage(enabled ? 'Signup email OTP enabled.' : 'Signup email OTP disabled (env may still apply).');
    } catch (e) {
      setError(e.message);
    }
  };

  const seedTemplates = async () => {
    setError(null);
    try {
      const res = await fetch(`${base}/seed`, { method: 'POST', headers: headers() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setMessage(data.message);
      await loadList();
    } catch (e) {
      setError(e.message);
    }
  };

  const resetDb = async () => {
    if (!window.confirm('Delete ALL email templates and restore factory defaults?')) return;
    setError(null);
    try {
      const res = await fetch(`${base}/reset`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ confirm: 'RESET_ALL_EMAIL_TEMPLATES' })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setMessage(`Restored ${data.restored} template(s).`);
      await loadList();
    } catch (e) {
      setError(e.message);
    }
  };

  const openEdit = async (slug) => {
    setError(null);
    try {
      const res = await fetch(`${base}/${slug}`, { headers: headers() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setEditForm(data.template);
      setEditOpen(true);
    } catch (e) {
      setError(e.message);
    }
  };

  const saveEdit = async () => {
    if (!editForm) return;
    try {
      const res = await fetch(`${base}/${editForm.slug}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description,
          subject: editForm.subject,
          htmlBody: editForm.htmlBody,
          textBody: editForm.textBody,
          variableKeys: editForm.variableKeys,
          enabled: editForm.enabled
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setEditOpen(false);
      setMessage('Template saved.');
      await loadList();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleEnabled = async (t) => {
    try {
      const res = await fetch(`${base}/${t.slug}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ enabled: !t.enabled })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadList();
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteTpl = async (slug) => {
    if (!window.confirm(`Delete template "${slug}"?`)) return;
    try {
      const res = await fetch(`${base}/${slug}`, { method: 'DELETE', headers: headers() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setMessage('Template deleted.');
      await loadList();
    } catch (e) {
      setError(e.message);
    }
  };

  const openPreview = async (slug) => {
    setError(null);
    try {
      const res = await fetch(`${base}/${slug}`, { headers: headers() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const v = { ...SAMPLE_VARS };
      if (slug === 'password_reset') v.expiryMinutes = '15';
      const html = interpolate(data.template.htmlBody, v);
      setPreviewHtml(html);
    } catch (e) {
      setError(e.message);
    }
  };

  const openTest = (slug) => {
    setTestSlug(slug);
    setTestTo('');
    setTestOpen(true);
  };

  const sendTest = async () => {
    setTestSending(true);
    setError(null);
    try {
      const res = await fetch(`${base}/test-send`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ slug: testSlug, to: testTo.trim() })
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON body */
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Send failed (HTTP ${res.status})`);
      }
      setMessage('Test email sent.');
      setTestOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setTestSending(false);
    }
  };

  const signupOtpEffective = !!status?.signupOtpEffective;

  return (
    <div className="email-tpl-root">
      <p className="email-tpl-sub">
        Manage email templates for verification, deposits, withdrawals, and account notifications. Use <strong>{'{{variable}}'}</strong>{' '}
        placeholders listed on each card.
      </p>

      {message && (
        <div className="email-tpl-flash email-tpl-flash-ok" onClick={() => setMessage(null)}>
          {message}
        </div>
      )}
      {error && (
        <div className="email-tpl-flash email-tpl-flash-err" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <div className={`email-tpl-banner ${signupOtpEffective ? 'email-tpl-banner-on' : 'email-tpl-banner-off'}`}>
        <div>
          <div className="email-tpl-banner-title">Email system (SMTP)</div>
          <div className="email-tpl-banner-desc">
            {!status?.smtpConfigured
              ? 'SMTP not configured in server environment (.env).'
              : signupOtpEffective
                ? 'Signup email OTP is active for new registrations.'
                : status?.requireSignupOtpEnvOff
                  ? 'Signup OTP is off via REQUIRE_SIGNUP_OTP=false in environment.'
                  : status?.signupOtpEmailEnabled === false
                    ? 'Signup OTP is turned off in this panel (toggle on to enable when SMTP is set).'
                    : 'Signup OTP is not active (check SMTP and settings).'}
          </div>
        </div>
        {status?.smtpConfigured && (
          <label className="email-tpl-switch">
            <input
              type="checkbox"
              checked={status?.signupOtpEmailEnabled !== false}
              onChange={(e) => toggleSignupOtp(e.target.checked)}
            />
            <span className="email-tpl-switch-slider" />
          </label>
        )}
      </div>

      {status?.smtpProfile?.host && (
        <p className="email-tpl-smtp-profile">
          Active SMTP: <strong>{status.smtpProfile.host}</strong> · port{' '}
          <strong>{status.smtpProfile.port}</strong> · SSL/TLS implicit:{' '}
          <strong>{status.smtpProfile.secure ? 'yes (465-style)' : 'no (587 STARTTLS)'}</strong>
          {status.smtpProfile.userHint ? (
            <>
              {' '}
              · login <strong>{status.smtpProfile.userHint}</strong>
            </>
          ) : null}
        </p>
      )}

      <div className="email-tpl-toolbar">
        <button
          type="button"
          className={`admin-btn ${smtpVerify.ok ? 'email-tpl-smtp-ok' : smtpVerify.ok === false ? 'email-tpl-smtp-bad' : ''}`}
          onClick={runVerifySmtp}
          disabled={!status?.smtpConfigured || smtpVerify.checking}
        >
          {smtpVerify.checking
            ? 'Checking SMTP…'
            : smtpVerify.ok
              ? '✓ SMTP connected'
              : smtpVerify.ok === false
                ? '✕ SMTP failed — retry'
                : 'Verify SMTP'}
        </button>
        {smtpVerify.error && <span className="email-tpl-verify-err">{smtpVerify.error}</span>}
        <button type="button" className="admin-btn secondary" onClick={seedTemplates}>
          Seed templates
        </button>
        <button type="button" className="admin-btn danger" onClick={resetDb}>
          Reset DB
        </button>
        <button type="button" className="admin-btn secondary" onClick={refresh} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="admin-loading">Loading templates…</div>
      ) : templates.length === 0 ? (
        <div className="email-tpl-empty">
          No templates in database. Click <strong>Seed templates</strong> or restart the server (defaults are seeded on boot).
        </div>
      ) : (
        <div className="email-tpl-grid">
          {templates.map((t) => (
            <div key={t.slug} className="email-tpl-card">
              <div className="email-tpl-card-head">
                <h3>{t.name}</h3>
                <code className="email-tpl-slug">{t.slug}</code>
              </div>
              <p className="email-tpl-desc">{t.description}</p>
              <p className="email-tpl-vars">{(t.variableKeys || []).length} variables</p>
              <div className="email-tpl-actions">
                <button type="button" className="admin-btn secondary" onClick={() => openPreview(t.slug)} title="Preview">
                  👁 Preview
                </button>
                <button type="button" className="admin-btn primary" onClick={() => openEdit(t.slug)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="admin-btn email-tpl-send"
                  onClick={() => openTest(t.slug)}
                  disabled={!status?.smtpConfigured}
                  title="Send test email"
                >
                  ✈
                </button>
                <button type="button" className="admin-btn danger" onClick={() => deleteTpl(t.slug)} title="Delete">
                  🗑
                </button>
              </div>
              <label className="email-tpl-row">
                <span>Enabled</span>
                <input type="checkbox" checked={!!t.enabled} onChange={() => toggleEnabled(t)} />
              </label>
            </div>
          ))}
        </div>
      )}

      {editOpen && editForm && (
        <div className="email-tpl-modal-backdrop" onClick={() => setEditOpen(false)}>
          <div className="email-tpl-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit: {editForm.name}</h3>
            <label>Subject</label>
            <input
              className="admin-input"
              value={editForm.subject}
              onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
            />
            <label>HTML body</label>
            <textarea
              className="admin-input"
              rows={12}
              value={editForm.htmlBody}
              onChange={(e) => setEditForm({ ...editForm, htmlBody: e.target.value })}
            />
            <label>Plain text body</label>
            <textarea
              className="admin-input"
              rows={6}
              value={editForm.textBody || ''}
              onChange={(e) => setEditForm({ ...editForm, textBody: e.target.value })}
            />
            <div className="email-tpl-modal-actions">
              <button type="button" className="admin-btn secondary" onClick={() => setEditOpen(false)}>
                Cancel
              </button>
              <button type="button" className="admin-btn primary" onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {previewHtml !== null && (
        <div className="email-tpl-modal-backdrop" onClick={() => setPreviewHtml(null)}>
          <div className="email-tpl-modal email-tpl-preview-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Preview (sample data)</h3>
            <iframe title="preview" className="email-tpl-preview-frame" srcDoc={previewHtml} />
            <button type="button" className="admin-btn secondary" onClick={() => setPreviewHtml(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {testOpen && (
        <div className="email-tpl-modal-backdrop" onClick={() => !testSending && setTestOpen(false)}>
          <div className="email-tpl-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Test send: {testSlug}</h3>
            <p className="email-tpl-muted">Sends with sample placeholder values. Subject is prefixed with [TEST].</p>
            <label>Recipient email</label>
            <input
              className="admin-input"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
            />
            <div className="email-tpl-modal-actions">
              <button type="button" className="admin-btn secondary" disabled={testSending} onClick={() => setTestOpen(false)}>
                Cancel
              </button>
              <button type="button" className="admin-btn primary" disabled={testSending || !testTo.trim()} onClick={sendTest}>
                {testSending ? 'Sending…' : 'Send test'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmailTemplatesPanel;
