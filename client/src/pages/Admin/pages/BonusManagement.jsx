import { useState, useEffect, useMemo } from 'react';
import { API_URL } from '../adminConfig';

/**
 * Bonus Management — Fix 21.
 *
 * MT5-style bonus management with three tabs:
 *   1. Bonus Templates  — admin-defined reusable bonus rules
 *   2. User Bonuses     — list of all granted bonuses across users
 *   3. Add/Deduct Bonus — manually grant a bonus to a user
 *
 * All amounts in INR (matches Fix 20). The credit lands on user.wallet.credit
 * which is already wired into the user's footer Credit segment.
 */

const TYPE_LABELS = {
  first_deposit: 'First Deposit',
  regular_deposit: 'Regular Deposit',
  reload: 'Reload Bonus',
  special: 'Special Bonus'
};
const TYPE_COLORS = {
  first_deposit: { bg: '#3b82f620', text: '#60a5fa' },
  regular_deposit: { bg: '#10b98120', text: '#34d399' },
  reload: { bg: '#f59e0b20', text: '#fbbf24' },
  special: { bg: '#a855f720', text: '#c084fc' }
};

const STATUS_COLORS = {
  active: { bg: '#10b98120', text: '#34d399' },
  inactive: { bg: '#6b728020', text: '#9ca3af' },
  pending: { bg: '#f59e0b20', text: '#fbbf24' },
  completed: { bg: '#3b82f620', text: '#60a5fa' },
  expired: { bg: '#6b728020', text: '#9ca3af' },
  cancelled: { bg: '#ef444420', text: '#f87171' }
};

const EMPTY_FORM = {
  name: '',
  type: 'first_deposit',
  bonusType: 'percentage',
  bonusValue: 100,
  minDeposit: 50,
  maxBonus: '',
  wagerRequirement: 30,
  duration: 30,
  endDate: '',
  status: 'active',
  description: ''
};

function BonusManagement() {
  const [activeTab, setActiveTab] = useState('templates');
  const [templates, setTemplates] = useState([]);
  const [userBonuses, setUserBonuses] = useState([]);
  const [loading, setLoading] = useState(false);

  // Create/edit template modal
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState(EMPTY_FORM);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Add/Deduct tab form
  const [grantForm, setGrantForm] = useState({
    userId: '',
    templateId: '',
    depositAmount: '',
    customAmount: '',
    notes: ''
  });
  const [granting, setGranting] = useState(false);

  // ---- Fetchers ---------------------------------------------------------

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/bonus-templates`);
      const data = await res.json();
      if (data.success) setTemplates(data.templates || []);
    } catch (err) {
      console.error('fetchTemplates error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserBonuses = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/user-bonuses?limit=100`);
      const data = await res.json();
      if (data.success) setUserBonuses(data.bonuses || []);
    } catch (err) {
      console.error('fetchUserBonuses error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (activeTab === 'user-bonuses') fetchUserBonuses();
  }, [activeTab]);

  // ---- Template CRUD ----------------------------------------------------

  const openCreateModal = () => {
    setEditingTemplateId(null);
    setTemplateForm(EMPTY_FORM);
    setTemplateModalOpen(true);
  };

  const openEditModal = (t) => {
    setEditingTemplateId(t._id);
    setTemplateForm({
      name: t.name || '',
      type: t.type || 'first_deposit',
      bonusType: t.bonusType || 'percentage',
      bonusValue: t.bonusValue ?? 0,
      minDeposit: t.minDeposit ?? 0,
      maxBonus: t.maxBonus ?? '',
      wagerRequirement: t.wagerRequirement ?? 30,
      duration: t.duration ?? 30,
      endDate: t.endDate ? new Date(t.endDate).toISOString().slice(0, 10) : '',
      status: t.status || 'active',
      description: t.description || ''
    });
    setTemplateModalOpen(true);
  };

  const saveTemplate = async () => {
    if (!templateForm.name?.trim()) {
      alert('Name is required');
      return;
    }
    setSavingTemplate(true);
    try {
      const url = editingTemplateId
        ? `${API_URL}/api/admin/bonus-templates/${editingTemplateId}`
        : `${API_URL}/api/admin/bonus-templates`;
      const method = editingTemplateId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to save template');
        return;
      }
      setTemplateModalOpen(false);
      setEditingTemplateId(null);
      setTemplateForm(EMPTY_FORM);
      await fetchTemplates();
    } catch (err) {
      alert('Failed to save template: ' + err.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  const deleteTemplate = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/bonus-templates/${t._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to delete');
        return;
      }
      await fetchTemplates();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  // ---- Grant / Cancel ---------------------------------------------------

  const grantBonus = async () => {
    if (!grantForm.userId?.trim()) {
      alert('User ID is required');
      return;
    }
    if (!grantForm.templateId && !grantForm.customAmount) {
      alert('Pick a template OR enter a custom amount');
      return;
    }
    setGranting(true);
    try {
      const payload = {
        userId: grantForm.userId.trim(),
        notes: grantForm.notes || ''
      };
      if (grantForm.templateId) {
        payload.templateId = grantForm.templateId;
        payload.depositAmount = Number(grantForm.depositAmount) || 0;
      } else {
        payload.amount = Number(grantForm.customAmount) || 0;
      }
      const res = await fetch(`${API_URL}/api/admin/user-bonuses/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to grant bonus');
        return;
      }
      alert(data.message || 'Bonus granted');
      setGrantForm({ userId: '', templateId: '', depositAmount: '', customAmount: '', notes: '' });
      // Refresh both lists since template usedCount changed
      await fetchTemplates();
      if (activeTab === 'user-bonuses') await fetchUserBonuses();
    } catch (err) {
      alert('Failed to grant bonus: ' + err.message);
    } finally {
      setGranting(false);
    }
  };

  const cancelBonus = async (b) => {
    if (!window.confirm(`Cancel ₹${b.amount.toFixed(2)} bonus for ${b.userId}? The amount will be deducted from their credit.`)) return;
    const reason = window.prompt('Reason (optional):', '') || '';
    try {
      const res = await fetch(`${API_URL}/api/admin/user-bonuses/${b._id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to cancel');
        return;
      }
      await fetchUserBonuses();
    } catch (err) {
      alert('Failed to cancel: ' + err.message);
    }
  };

  // ---- Derived ----------------------------------------------------------

  const activeTemplates = useMemo(
    () => templates.filter((t) => t.status === 'active'),
    [templates]
  );

  // ======================================================================
  // RENDER
  // ======================================================================

  return (
    // NOTE: don't use `className="page-content"` here — that's a user-side
    // class with `display: flex; align-items: center; justify-content: center`
    // which would center the entire admin page in the viewport. Use a plain
    // div with padding instead, matching how other admin pages (e.g.
    // RiskManagement) structure their root.
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '24px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span role="img" aria-label="gift">🎁</span> Bonus Management
        </h2>
        {activeTab === 'templates' && (
          <button
            onClick={openCreateModal}
            style={{
              padding: '10px 18px',
              background: '#fbbf24',
              color: '#1f2937',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 14
            }}
          >
            + Create Bonus
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--border-color)', marginBottom: 20 }}>
        {[
          { id: 'templates', label: 'Bonus Templates' },
          { id: 'user-bonuses', label: 'User Bonuses' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 4px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #fbbf24' : '2px solid transparent',
              color: activeTab === tab.id ? '#fbbf24' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 600 : 400,
              fontSize: 14
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Templates tab */}
      {activeTab === 'templates' && (
        <div>
          {loading && templates.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
          ) : templates.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center', border: '1px dashed var(--border-color)', borderRadius: 12 }}>
              No bonus templates yet. Click <strong>+ Create Bonus</strong> to add one.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {templates.map((t) => {
                const typeColor = TYPE_COLORS[t.type] || TYPE_COLORS.special;
                const statusColor = STATUS_COLORS[t.status] || STATUS_COLORS.inactive;
                return (
                  <div
                    key={t._id}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 12,
                      padding: 18
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 17 }}>{t.name}</h3>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => openEditModal(t)} title="Edit" style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}>✎</button>
                        <button onClick={() => deleteTemplate(t)} title="Delete" style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}>🗑</button>
                      </div>
                    </div>
                    <div style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, background: typeColor.bg, color: typeColor.text, fontSize: 11, fontWeight: 700, marginBottom: 12, letterSpacing: 0.3 }}>
                      {(TYPE_LABELS[t.type] || t.type).toUpperCase()}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 6, columnGap: 8, fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Bonus:</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                        {t.bonusType === 'percentage' ? `${t.bonusValue}%` : `₹${Number(t.bonusValue).toLocaleString('en-IN')}`}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>Min Deposit:</span>
                      <span style={{ color: 'var(--text-primary)' }}>₹{Number(t.minDeposit || 0).toLocaleString('en-IN')}</span>
                      {t.maxBonus != null && (
                        <>
                          <span style={{ color: 'var(--text-muted)' }}>Max Bonus:</span>
                          <span style={{ color: 'var(--text-primary)' }}>₹{Number(t.maxBonus).toLocaleString('en-IN')}</span>
                        </>
                      )}
                      <span style={{ color: 'var(--text-muted)' }}>Wager:</span>
                      <span style={{ color: 'var(--text-primary)' }}>{t.wagerRequirement}x</span>
                      <span style={{ color: 'var(--text-muted)' }}>Duration:</span>
                      <span style={{ color: 'var(--text-primary)' }}>{t.duration} days</span>
                      <span style={{ color: 'var(--text-muted)' }}>Used:</span>
                      <span style={{ color: 'var(--text-primary)' }}>{t.usedCount || 0}</span>
                      <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                      <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 5, background: statusColor.bg, color: statusColor.text, fontSize: 11, fontWeight: 700, justifySelf: 'end' }}>
                        {(t.status || 'inactive').toUpperCase()}
                      </span>
                    </div>
                    {t.description && (
                      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
                        {t.description}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* User Bonuses tab */}
      {activeTab === 'user-bonuses' && (
        <div>
          {loading && userBonuses.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
          ) : userBonuses.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center', border: '1px dashed var(--border-color)', borderRadius: 12 }}>
              No bonuses granted yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text-primary)' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Granted</th>
                    <th style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>User</th>
                    <th style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Template</th>
                    <th style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Type</th>
                    <th style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Amount (₹)</th>
                    <th style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Wager</th>
                    <th style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Expires</th>
                    <th style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {userBonuses.map((b) => {
                    const typeColor = TYPE_COLORS[b.type] || TYPE_COLORS.special;
                    const statusColor = STATUS_COLORS[b.status] || STATUS_COLORS.inactive;
                    return (
                      <tr key={b._id} style={{ borderTop: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>{new Date(b.grantedAt).toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, fontFamily: 'monospace' }}>{b.userId}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>{b.templateName || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 5, background: typeColor.bg, color: typeColor.text, fontSize: 10, fontWeight: 700 }}>
                            {(TYPE_LABELS[b.type] || b.type).toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#fbbf24', textAlign: 'right' }}>
                          ₹{Number(b.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12, textAlign: 'right' }}>
                          {b.wagerProgress || 0} / {b.wagerRequirement}x
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>{b.expiresAt ? new Date(b.expiresAt).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 5, background: statusColor.bg, color: statusColor.text, fontSize: 10, fontWeight: 700 }}>
                            {(b.status || '—').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {(b.status === 'active' || b.status === 'pending') && (
                            <button onClick={() => cancelBonus(b)} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#f87171', borderRadius: 5, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Template Modal */}
      {templateModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '40px 20px' }}>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, width: 720, maxWidth: '100%', border: '1px solid var(--border-color)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{editingTemplateId ? 'Edit Bonus Template' : 'Create Bonus Template'}</h3>
              <button onClick={() => setTemplateModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Bonus Name</label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="e.g. Diwali Welcome Bonus"
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Type</label>
                <select
                  value={templateForm.type}
                  onChange={(e) => setTemplateForm({ ...templateForm, type: e.target.value })}
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="first_deposit">First Deposit</option>
                  <option value="regular_deposit">Regular Deposit</option>
                  <option value="reload">Reload Bonus</option>
                  <option value="special">Special Bonus</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Bonus Type</label>
                <select
                  value={templateForm.bonusType}
                  onChange={(e) => setTemplateForm({ ...templateForm, bonusType: e.target.value })}
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="percentage">Percentage of Deposit</option>
                  <option value="fixed">Fixed ₹ Amount</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                  {templateForm.bonusType === 'percentage' ? 'Bonus %' : 'Bonus Amount (₹)'}
                </label>
                <input
                  type="number"
                  value={templateForm.bonusValue}
                  onChange={(e) => setTemplateForm({ ...templateForm, bonusValue: e.target.value })}
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Min Deposit (₹)</label>
                <input
                  type="number"
                  value={templateForm.minDeposit}
                  onChange={(e) => setTemplateForm({ ...templateForm, minDeposit: e.target.value })}
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Max Bonus (₹) — optional</label>
                <input
                  type="number"
                  value={templateForm.maxBonus}
                  onChange={(e) => setTemplateForm({ ...templateForm, maxBonus: e.target.value })}
                  placeholder="Leave blank for no cap"
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Wager Requirement (x)</label>
                <input
                  type="number"
                  value={templateForm.wagerRequirement}
                  onChange={(e) => setTemplateForm({ ...templateForm, wagerRequirement: e.target.value })}
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Duration (Days)</label>
                <input
                  type="number"
                  value={templateForm.duration}
                  onChange={(e) => setTemplateForm({ ...templateForm, duration: e.target.value })}
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>End Date (optional)</label>
                <input
                  type="date"
                  value={templateForm.endDate}
                  onChange={(e) => setTemplateForm({ ...templateForm, endDate: e.target.value })}
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Status</label>
                <select
                  value={templateForm.status}
                  onChange={(e) => setTemplateForm({ ...templateForm, status: e.target.value })}
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Description</label>
                <textarea
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                  rows={3}
                  placeholder="Free-form description shown on the template card"
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical' }}
                />
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setTemplateModalOpen(false)}
                style={{ padding: '10px 18px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={saveTemplate}
                disabled={savingTemplate}
                style={{ padding: '10px 18px', background: '#fbbf24', color: '#1f2937', border: 'none', borderRadius: 6, cursor: savingTemplate ? 'not-allowed' : 'pointer', fontWeight: 700 }}
              >
                {savingTemplate ? 'Saving…' : (editingTemplateId ? 'Save Changes' : 'Create Bonus')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BonusManagement;
