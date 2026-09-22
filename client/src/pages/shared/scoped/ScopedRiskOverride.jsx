import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import scopedApi from './scopedApi';
import ScopedUserSearch from './ScopedUserSearch';

/**
 * Risk settings — two tabs:
 *   "My Settings"    — bulk write to every user in scope
 *   "User-Specific"  — pick one user, edit just their risk override
 */
const FIELDS = [
  { name: 'marginCallLevel', label: 'Margin Call Level (%)', type: 'number' },
  { name: 'stopOutLevel', label: 'Stop-out Level (%)', type: 'number' },
  { name: 'profitTradeHoldMinSeconds', label: 'Profit Position Hold (sec)', type: 'number' },
  { name: 'lossTradeHoldMinSeconds', label: 'Loss Position Hold (sec)', type: 'number' },
  { name: 'ledgerBalanceClose', label: 'Ledger Balance Close (≤)', type: 'number' },
  { name: 'blockLimitAboveBelowHighLow', label: 'Block Limits Outside H/L', type: 'checkbox' },
  { name: 'blockLimitBetweenHighLow', label: 'Block Limits Inside H/L', type: 'checkbox' },
  { name: 'exitOnlyMode', label: 'Exit-only Mode', type: 'checkbox' },
];

function Field({ f, value, onChange }) {
  if (f.type === 'checkbox') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{f.label}</span>
      </label>
    );
  }
  return (
    <div>
      <label style={styles.label}>{f.label}</label>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        style={styles.input}
      />
    </div>
  );
}

function RiskForm({ form, setForm, onSave, onClear, saving, saveLabel, clearLabel }) {
  return (
    <div style={styles.card}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
        {FIELDS.filter(f => f.type !== 'checkbox').map(f => (
          <Field key={f.name} f={f} value={form[f.name]} onChange={(v) => setForm(p => ({ ...p, [f.name]: v }))} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border-color)' }}>
        {FIELDS.filter(f => f.type === 'checkbox').map(f => (
          <Field key={f.name} f={f} value={form[f.name]} onChange={(v) => setForm(p => ({ ...p, [f.name]: v }))} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={onSave} disabled={saving} style={styles.saveBtn}>
          {saving ? 'Saving…' : saveLabel}
        </button>
        {onClear && (
          <button onClick={onClear} disabled={saving} style={styles.dangerBtn}>{clearLabel}</button>
        )}
      </div>
    </div>
  );
}

function seedRiskForm(src) {
  const out = {};
  for (const f of FIELDS) out[f.name] = src?.[f.name] ?? null;
  return out;
}

export default function ScopedRiskOverride() {
  const { API_URL } = useOutletContext();
  const [tab, setTab] = useState('my');
  const [scope, setScope] = useState(null);
  const [error, setError] = useState(null);

  // My Settings
  const [myData, setMyData] = useState(null);
  const [myForm, setMyForm] = useState({});
  const [mySaving, setMySaving] = useState(false);

  // User-Specific
  const [selectedUser, setSelectedUser] = useState(null);
  const [userOverride, setUserOverride] = useState(null);
  const [userForm, setUserForm] = useState({});
  const [userSaving, setUserSaving] = useState(false);

  const fetchMy = useCallback(async () => {
    setError(null);
    try {
      const r = await scopedApi.readRisk(API_URL);
      setMyData(r);
      setScope(r.scope || null);
      const sample = (r.myOverrides || [])[0] || {};
      setMyForm(seedRiskForm(sample));
    } catch (e) { setError(e.message); }
  }, [API_URL]);

  useEffect(() => { fetchMy(); }, [fetchMy]);

  const saveMy = async () => {
    setMySaving(true); setError(null);
    try {
      const payload = {};
      for (const f of FIELDS) if (myForm[f.name] !== null && myForm[f.name] !== undefined) payload[f.name] = myForm[f.name];
      const r = await scopedApi.writeRisk(API_URL, payload);
      alert(`Risk override saved for ${r.affectedUsers} user(s). Fields: ${(r.fieldsApplied || []).join(', ')}`);
      await fetchMy();
    } catch (e) { setError(e.message); }
    finally { setMySaving(false); }
  };

  const clearMy = async () => {
    if (!confirm('Remove all risk overrides you have written?')) return;
    setMySaving(true); setError(null);
    try {
      const r = await scopedApi.clearRisk(API_URL);
      alert(`Deleted ${r.deletedCount} row(s).`);
      await fetchMy();
    } catch (e) { setError(e.message); }
    finally { setMySaving(false); }
  };

  useEffect(() => {
    if (!selectedUser) { setUserOverride(null); setUserForm({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await scopedApi.readUserRisk(API_URL, selectedUser._id);
        if (cancelled) return;
        setUserOverride(r.currentOverride || null);
        setUserForm(seedRiskForm(r.currentOverride || {}));
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
  }, [selectedUser, API_URL]);

  const saveUser = async () => {
    if (!selectedUser) return;
    setUserSaving(true); setError(null);
    try {
      const payload = {};
      for (const f of FIELDS) if (userForm[f.name] !== null && userForm[f.name] !== undefined) payload[f.name] = userForm[f.name];
      const r = await scopedApi.writeUserRisk(API_URL, selectedUser._id, payload);
      alert(`Risk saved for ${selectedUser.name || selectedUser.oderId}. Fields: ${(r.fieldsApplied || []).join(', ')}`);
      const fresh = await scopedApi.readUserRisk(API_URL, selectedUser._id);
      setUserOverride(fresh.currentOverride || null);
    } catch (e) { setError(e.message); }
    finally { setUserSaving(false); }
  };

  const clearUser = async () => {
    if (!selectedUser) return;
    if (!confirm(`Clear risk override for ${selectedUser.name || selectedUser.oderId}?`)) return;
    setUserSaving(true); setError(null);
    try {
      await scopedApi.clearUserRisk(API_URL, selectedUser._id);
      setUserOverride(null);
    } catch (e) { setError(e.message); }
    finally { setUserSaving(false); }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={styles.header}>
        <div>
          <h2 style={{ margin: 0 }}>Risk Settings</h2>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Empty fields are not written — leave blank to keep the previous / default value.
          </div>
        </div>
        {scope && (
          <div style={styles.scopeBadge}>Scope: {scope.role} · {scope.affectedUserCount ?? 'all'} user(s)</div>
        )}
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.tabs}>
        <button onClick={() => setTab('my')} style={{ ...styles.tab, ...(tab === 'my' ? styles.tabActive : null) }}>My Settings</button>
        <button onClick={() => setTab('user')} style={{ ...styles.tab, ...(tab === 'user' ? styles.tabActive : null) }}>User-Specific</button>
      </div>

      {tab === 'my' && (
        <RiskForm
          form={myForm} setForm={setMyForm}
          onSave={saveMy}
          onClear={(myData?.myOverrides || []).length > 0 ? clearMy : null}
          saving={mySaving}
          saveLabel="Apply to Scope"
          clearLabel="Clear Overrides"
        />
      )}

      {tab === 'user' && (
        <>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.label}>Pick a user from your scope</label>
            <ScopedUserSearch API_URL={API_URL} selected={selectedUser} onSelect={setSelectedUser} />
          </div>
          {selectedUser ? (
            <RiskForm
              form={userForm} setForm={setUserForm}
              onSave={saveUser}
              onClear={userOverride ? clearUser : null}
              saving={userSaving}
              saveLabel={`Save for ${selectedUser.name || selectedUser.oderId}`}
              clearLabel="Clear this user's override"
            />
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: 10 }}>
              Search and pick a user to edit their per-user risk override.
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  scopeBadge: { padding: '6px 10px', background: 'rgba(59,130,246,0.12)', color: '#3b82f6', borderRadius: 8, fontSize: 12, fontWeight: 600 },
  errorBox: { padding: 10, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', marginBottom: 12, fontSize: 13 },
  tabs: { display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border-color)' },
  tab: { padding: '8px 14px', fontSize: 13, fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', borderBottom: '2px solid transparent' },
  tabActive: { color: '#3b82f6', borderBottomColor: '#3b82f6' },
  card: { border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: 14 },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 },
  input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 },
  saveBtn: { padding: '8px 14px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  dangerBtn: { padding: '8px 14px', borderRadius: 6, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
};
