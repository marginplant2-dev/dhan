import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import ScopedUserSearch from './ScopedUserSearch';
import ScopedSegmentMatrix from './ScopedSegmentMatrix';
import ScopedScriptMatrix from './ScopedScriptMatrix';

/**
 * User Settings page — mirrors the admin's Users tab.
 *
 *   1. Pick a user from your scope.
 *   2. Two sub-tabs: "Segment Overrides" and "Script Overrides".
 *   3. Each sub-tab reuses the admin-style matrix in single-user mode, so the
 *      layout, inline editing, and category navigation match the Segments and
 *      Scripts sidebar pages exactly — just writes target this one user.
 *
 * Props
 *   mode: 'netting' | 'hedging'
 */
export default function ScopedSegmentUserSettings({ mode }) {
  const { API_URL } = useOutletContext();
  const [selectedUser, setSelectedUser] = useState(null);
  const [tab, setTab] = useState('segments');
  const label = mode === 'hedging' ? 'Hedging' : 'Netting';

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{label} — User Settings</h2>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Edit a single user's segment and script overrides. Users are filtered to your scope.
        </div>
      </div>

      <div style={{ maxWidth: 480, marginBottom: 14 }}>
        <label style={styles.label}>User</label>
        <ScopedUserSearch API_URL={API_URL} selected={selectedUser} onSelect={setSelectedUser} />
      </div>

      {!selectedUser ? (
        <div style={styles.emptyPrompt}>Pick a user above to begin editing their {label.toLowerCase()} overrides.</div>
      ) : (
        <>
          <div style={styles.tabs}>
            <button onClick={() => setTab('segments')} style={{ ...styles.tab, ...(tab === 'segments' ? styles.tabActive : null) }}>Segment Overrides</button>
            <button onClick={() => setTab('scripts')} style={{ ...styles.tab, ...(tab === 'scripts' ? styles.tabActive : null) }}>Script Overrides</button>
          </div>

          <div style={styles.body}>
            {tab === 'segments' && <ScopedSegmentMatrix key={`seg-${selectedUser._id}`} mode={mode} userId={selectedUser._id} />}
            {tab === 'scripts'  && <ScopedScriptMatrix  key={`scr-${selectedUser._id}`} mode={mode} userId={selectedUser._id} />}
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  label: { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 },
  tabs: { display: 'flex', gap: 4, marginBottom: 10, borderBottom: '1px solid var(--border-color)' },
  tab: { padding: '8px 14px', fontSize: 13, fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', borderBottom: '2px solid transparent' },
  tabActive: { color: '#3b82f6', borderBottomColor: '#3b82f6' },
  body: { border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', overflow: 'hidden' },
  emptyPrompt: { padding: 24, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: 10 },
};
