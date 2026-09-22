import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import scopedApi from './scopedApi';
import ScopedUserSearch from './ScopedUserSearch';

/**
 * Reorder-delay settings — two tabs:
 *   "My Settings"    — bulk write (all scoped users)
 *   "User-Specific"  — pick one user, edit just their override
 */
function DelayForm({ form, setForm, onSave, onClear, saving, globalInfo, saveLabel, clearLabel }) {
  return (
    <div style={styles.card}>
      {globalInfo && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Global default: <strong style={{ color: 'var(--text-primary)' }}>
            {globalInfo.isEnabled ? `${globalInfo.globalDelaySeconds}s` : 'disabled'}
          </strong>
          {globalInfo.priceMode && <> · price mode: {globalInfo.priceMode}</>}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        <div>
          <label style={styles.label}>Delay (seconds)</label>
          <input
            type="number"
            min="0"
            value={form.delaySeconds ?? ''}
            onChange={(e) => setForm(p => ({ ...p, delaySeconds: e.target.value }))}
            style={styles.input}
          />
        </div>
        <div>
          <label style={styles.label}>Enabled</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingTop: 8 }}>
            <input type="checkbox" checked={!!form.isEnabled} onChange={(e) => setForm(p => ({ ...p, isEnabled: e.target.checked }))} />
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{form.isEnabled ? 'Delay enforced' : 'Disabled'}</span>
          </label>
        </div>
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

export default function ScopedReorderOverride() {
  const { API_URL } = useOutletContext();
  const [tab, setTab] = useState('my');
  const [scope, setScope] = useState(null);
  const [error, setError] = useState(null);

  // My Settings
  const [myData, setMyData] = useState(null);
  const [myForm, setMyForm] = useState({ delaySeconds: 0, isEnabled: true });
  const [mySaving, setMySaving] = useState(false);

  // User-Specific
  const [selectedUser, setSelectedUser] = useState(null);
  const [userOverride, setUserOverride] = useState(null);
  const [userForm, setUserForm] = useState({ delaySeconds: 0, isEnabled: true });
  const [userSaving, setUserSaving] = useState(false);

  const fetchMy = useCallback(async () => {
    setError(null);
    try {
      const r = await scopedApi.readReorder(API_URL);
      setMyData(r);
      setScope(r.scope || null);
      const sample = (r.myOverrides || [])[0];
      if (sample) setMyForm({ delaySeconds: sample.delaySeconds ?? 0, isEnabled: sample.isEnabled !== false });
      else if (r.global) setMyForm({ delaySeconds: r.global.globalDelaySeconds ?? 0, isEnabled: r.global.isEnabled !== false });
    } catch (e) { setError(e.message); }
  }, [API_URL]);

  useEffect(() => { fetchMy(); }, [fetchMy]);

  const saveMy = async () => {
    setMySaving(true); setError(null);
    try {
      const r = await scopedApi.writeReorder(API_URL, { delaySeconds: Number(myForm.delaySeconds) || 0, isEnabled: !!myForm.isEnabled });
      alert(`Reorder applied to ${r.affectedUsers} user(s).`);
      await fetchMy();
    } catch (e) { setError(e.message); }
    finally { setMySaving(false); }
  };

  const clearMy = async () => {
    if (!confirm('Remove all reorder overrides you have written? Users fall back to defaults.')) return;
    setMySaving(true); setError(null);
    try {
      const r = await scopedApi.clearReorder(API_URL);
      alert(`Removed ${r.removed} row(s).`);
      await fetchMy();
    } catch (e) { setError(e.message); }
    finally { setMySaving(false); }
  };

  // Load per-user override when user picked
  useEffect(() => {
    if (!selectedUser) { setUserOverride(null); setUserForm({ delaySeconds: 0, isEnabled: true }); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await scopedApi.readUserReorder(API_URL, selectedUser._id);
        if (cancelled) return;
        setUserOverride(r.currentOverride || null);
        if (r.currentOverride) {
          setUserForm({ delaySeconds: r.currentOverride.delaySeconds ?? 0, isEnabled: r.currentOverride.isEnabled !== false });
        } else if (myData?.global) {
          setUserForm({ delaySeconds: myData.global.globalDelaySeconds ?? 0, isEnabled: myData.global.isEnabled !== false });
        }
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
  }, [selectedUser, API_URL, myData]);

  const saveUser = async () => {
    if (!selectedUser) return;
    setUserSaving(true); setError(null);
    try {
      await scopedApi.writeUserReorder(API_URL, selectedUser._id, {
        delaySeconds: Number(userForm.delaySeconds) || 0,
        isEnabled: !!userForm.isEnabled,
      });
      alert(`Reorder saved for ${selectedUser.name || selectedUser.oderId}.`);
      const r = await scopedApi.readUserReorder(API_URL, selectedUser._id);
      setUserOverride(r.currentOverride || null);
    } catch (e) { setError(e.message); }
    finally { setUserSaving(false); }
  };

  const clearUser = async () => {
    if (!selectedUser) return;
    if (!confirm(`Clear reorder override for ${selectedUser.name || selectedUser.oderId}?`)) return;
    setUserSaving(true); setError(null);
    try {
      await scopedApi.clearUserReorder(API_URL, selectedUser._id);
      setUserOverride(null);
    } catch (e) { setError(e.message); }
    finally { setUserSaving(false); }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={styles.header}>
        <div>
          <h2 style={{ margin: 0 }}>Reorder Settings</h2>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Controls how long each trade sits pending before executing.
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
        <DelayForm
          form={myForm} setForm={setMyForm}
          globalInfo={myData?.global}
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
            <DelayForm
              form={userForm} setForm={setUserForm}
              globalInfo={myData?.global}
              onSave={saveUser}
              onClear={userOverride ? clearUser : null}
              saving={userSaving}
              saveLabel={`Save for ${selectedUser.name || selectedUser.oderId}`}
              clearLabel="Clear this user's override"
            />
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: 10 }}>
              Search and pick a user to edit their per-user reorder delay.
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
