import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const RiskManagement = () => {
  const [globalSettings, setGlobalSettings] = useState({
    ledgerBalanceClose: 0, profitTradeHoldMinSeconds: 0, lossTradeHoldMinSeconds: 0,
    blockLimitAboveBelowHighLow: false, blockLimitBetweenHighLow: false, exitOnlyMode: false,
    marginCallLevel: 100, stopOutLevel: 50
  });
  const [originalSettings, setOriginalSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userSettings, setUserSettings] = useState(null);
  const [savingUserSettings, setSavingUserSettings] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const fetchGlobalSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/admin/risk-settings`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      if (data.success && data.settings) {
        const s = {
          ledgerBalanceClose: data.settings.ledgerBalanceClose || 0,
          profitTradeHoldMinSeconds: data.settings.profitTradeHoldMinSeconds || 0,
          lossTradeHoldMinSeconds: data.settings.lossTradeHoldMinSeconds || 0,
          blockLimitAboveBelowHighLow: data.settings.blockLimitAboveBelowHighLow || false,
          blockLimitBetweenHighLow: data.settings.blockLimitBetweenHighLow || false,
          exitOnlyMode: data.settings.exitOnlyMode || false,
          marginCallLevel: data.settings.marginCallLevel ?? 100,
          stopOutLevel: data.settings.stopOutLevel ?? 50
        };
        setGlobalSettings(s);
        setOriginalSettings(s);
      }
    } catch (error) { console.error('Error:', error); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchGlobalSettings(); }, [fetchGlobalSettings]);

  const hasChanges = originalSettings && JSON.stringify(globalSettings) !== JSON.stringify(originalSettings);

  const saveGlobalSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/risk-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` },
        body: JSON.stringify(globalSettings)
      });
      const data = await res.json();
      if (data.success) { showToast('Settings saved'); setOriginalSettings(globalSettings); }
      else throw new Error(data.error);
    } catch (error) { showToast(error.message, 'error'); }
    finally { setSaving(false); }
  };

  const searchUsers = async (query) => {
    if (!query || query.length < 2) { setUserSearchResults([]); return; }
    setUserSearchLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/search?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      if (data.success) setUserSearchResults(data.users || []);
    } catch (error) { console.error(error); }
    finally { setUserSearchLoading(false); }
  };

  const selectUser = async (user) => {
    setSelectedUser(user); setUserSearch(''); setUserSearchResults([]);
    try {
      const res = await fetch(`${API_URL}/api/admin/user-risk-settings/${user._id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      const data = await res.json();
      setUserSettings(data.success ? (data.settings || null) : null);
    } catch (error) { setUserSettings(null); }
  };

  const saveUserSettings = async () => {
    if (!selectedUser) return;
    setSavingUserSettings(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/user-risk-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` },
        body: JSON.stringify({ userId: selectedUser._id, oderId: selectedUser.oderId, ...userSettings })
      });
      const data = await res.json();
      if (data.success) { showToast('User settings saved'); setUserSettings(data.settings); }
      else throw new Error(data.error);
    } catch (error) { showToast(error.message, 'error'); }
    finally { setSavingUserSettings(false); }
  };

  const resetUserToDefaults = async () => {
    if (!selectedUser || !confirm('Reset user to global defaults?')) return;
    try {
      await fetch(`${API_URL}/api/admin/user-risk-settings/${selectedUser._id}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('dhanfunded-admin-token')}` }
      });
      showToast('User reset to defaults'); setUserSettings(null);
    } catch (error) { showToast(error.message, 'error'); }
  };

  const inputStyle = { width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 14 };
  const cardStyle = { background: 'var(--bg-secondary)', borderRadius: 12, padding: 24, border: '1px solid var(--border-color)', marginBottom: 24 };

  const ToggleBtn = ({ value, onChange, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 8, marginBottom: 12 }}>
      <span style={{ fontWeight: 500, fontSize: 13 }}>{label}</span>
      <button onClick={onChange} style={{ padding: '6px 16px', border: 'none', borderRadius: 6, background: value ? '#22c55e' : '#3f3f46', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
        {value ? 'Enabled' : 'Disabled'}
      </button>
    </div>
  );

  return (
    <div style={{ padding: 0 }}>
      {toast.show && <div style={{ position: 'fixed', top: 20, right: 20, padding: '12px 24px', background: toast.type === 'error' ? '#ef4444' : '#22c55e', color: '#fff', borderRadius: 8, zIndex: 9999, fontWeight: 500 }}>{toast.message}</div>}

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>🛡️ Risk & Position Management</h2>
        <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>Configure risk controls and position holding parameters</p>
      </div>

      {/* Global Settings */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🌐</div>
          <div><h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Global Default Settings</h3><p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Applies to all users unless overridden</p></div>
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div> : (
          <>
            {/* MT5-style Margin Call & Stop Out */}
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#3b82f6' }}>📊 MT5-Style Margin Control</h4>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
                Margin Level = (Equity / Used Margin) × 100%. Works globally for both Hedging and Netting modes.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Margin Call Level (%)</label>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px' }}>Warning when margin level falls to this %</p>
                  <input type="number" value={globalSettings.marginCallLevel} onChange={(e) => setGlobalSettings(p => ({ ...p, marginCallLevel: Number(e.target.value) }))} min="0" max="1000" style={{ ...inputStyle, maxWidth: 150 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Stop Out Level (%)</label>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px' }}>Auto-close positions at this margin level</p>
                  <input type="number" value={globalSettings.stopOutLevel} onChange={(e) => setGlobalSettings(p => ({ ...p, stopOutLevel: Number(e.target.value) }))} min="0" max="100" style={{ ...inputStyle, maxWidth: 150 }} />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Profit Position Hold Min Seconds</label>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px' }}>Zero = no hold. Minimum holding time for profitable positions</p>
              <input type="number" value={globalSettings.profitTradeHoldMinSeconds} onChange={(e) => setGlobalSettings(p => ({ ...p, profitTradeHoldMinSeconds: Number(e.target.value) }))} min="0" style={{ ...inputStyle, maxWidth: 200 }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Loss Position Hold Min Seconds</label>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px' }}>Zero = no hold. Minimum holding time for losing positions</p>
              <input type="number" value={globalSettings.lossTradeHoldMinSeconds} onChange={(e) => setGlobalSettings(p => ({ ...p, lossTradeHoldMinSeconds: Number(e.target.value) }))} min="0" style={{ ...inputStyle, maxWidth: 200 }} />
            </div>
            <ToggleBtn label="Block Limit Above/Below High Low" value={globalSettings.blockLimitAboveBelowHighLow} onChange={() => setGlobalSettings(p => ({ ...p, blockLimitAboveBelowHighLow: !p.blockLimitAboveBelowHighLow }))} />
            <ToggleBtn label="Block Limit Between High Low" value={globalSettings.blockLimitBetweenHighLow} onChange={() => setGlobalSettings(p => ({ ...p, blockLimitBetweenHighLow: !p.blockLimitBetweenHighLow }))} />
            <ToggleBtn label="Exit Only Mode" value={globalSettings.exitOnlyMode} onChange={() => setGlobalSettings(p => ({ ...p, exitOnlyMode: !p.exitOnlyMode }))} />
            <button onClick={saveGlobalSettings} disabled={saving || !hasChanges} style={{ marginTop: 12, padding: '12px 24px', border: 'none', borderRadius: 8, background: hasChanges ? '#22c55e' : '#3f3f46', color: '#fff', cursor: hasChanges ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600 }}>
              💾 {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </>
        )}
      </div>

      {/* User Settings */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>👤</div>
          <div><h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>User-Specific Settings</h3><p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Override global settings for specific users</p></div>
        </div>

        <div style={{ marginBottom: 20, position: 'relative' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Search User</label>
          <input type="text" value={userSearch} onChange={(e) => { setUserSearch(e.target.value); searchUsers(e.target.value); }} placeholder="Search by name, email, or Order ID..." style={{ ...inputStyle, maxWidth: 400 }} />
          {userSearchResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, maxWidth: 400, width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: 'auto', zIndex: 10 }}>
              {userSearchResults.map(user => (
                <div key={user._id} onClick={() => selectUser(user)} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                  <div><div style={{ fontWeight: 500 }}>{user.name}</div><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{user.email}</div></div>
                  <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>{user.oderId}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedUser ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
              <div><span style={{ fontWeight: 600 }}>{selectedUser.name}</span><span style={{ marginLeft: 12, color: 'var(--text-secondary)', fontSize: 13 }}>{selectedUser.oderId}</span>
                {userSettings && <span style={{ marginLeft: 12, padding: '2px 8px', background: 'rgba(59,130,246,0.2)', color: '#3b82f6', borderRadius: 4, fontSize: 11 }}>Custom</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {userSettings && <button onClick={resetUserToDefaults} style={{ padding: '6px 12px', border: '1px solid #ef4444', borderRadius: 6, background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>Reset to Default</button>}
                <button onClick={() => { setSelectedUser(null); setUserSettings(null); }} style={{ padding: '6px 12px', border: '1px solid var(--border-color)', borderRadius: 6, background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>Clear</button>
              </div>
            </div>

            {/* MT5-style Margin Control for User */}
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#3b82f6' }}>📊 MT5-Style Margin Control</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Margin Call Level (%)</label>
                  <input type="number" value={userSettings?.marginCallLevel ?? ''} onChange={(e) => setUserSettings(p => ({ ...p, marginCallLevel: e.target.value ? Number(e.target.value) : null }))} placeholder={`Default: ${globalSettings.marginCallLevel}`} min="0" max="1000" style={{ ...inputStyle, maxWidth: 150 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Stop Out Level (%)</label>
                  <input type="number" value={userSettings?.stopOutLevel ?? ''} onChange={(e) => setUserSettings(p => ({ ...p, stopOutLevel: e.target.value ? Number(e.target.value) : null }))} placeholder={`Default: ${globalSettings.stopOutLevel}`} min="0" max="100" style={{ ...inputStyle, maxWidth: 150 }} />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Profit Position Hold Min Seconds</label>
              <input type="number" value={userSettings?.profitTradeHoldMinSeconds ?? ''} onChange={(e) => setUserSettings(p => ({ ...p, profitTradeHoldMinSeconds: e.target.value ? Number(e.target.value) : null }))} placeholder={`Default: ${globalSettings.profitTradeHoldMinSeconds}`} min="0" style={{ ...inputStyle, maxWidth: 200 }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Loss Position Hold Min Seconds</label>
              <input type="number" value={userSettings?.lossTradeHoldMinSeconds ?? ''} onChange={(e) => setUserSettings(p => ({ ...p, lossTradeHoldMinSeconds: e.target.value ? Number(e.target.value) : null }))} placeholder={`Default: ${globalSettings.lossTradeHoldMinSeconds}`} min="0" style={{ ...inputStyle, maxWidth: 200 }} />
            </div>
            <ToggleBtn label="Block Limit Above/Below High Low" value={userSettings?.blockLimitAboveBelowHighLow ?? globalSettings.blockLimitAboveBelowHighLow} onChange={() => setUserSettings(p => ({ ...p, blockLimitAboveBelowHighLow: !(p?.blockLimitAboveBelowHighLow ?? globalSettings.blockLimitAboveBelowHighLow) }))} />
            <ToggleBtn label="Block Limit Between High Low" value={userSettings?.blockLimitBetweenHighLow ?? globalSettings.blockLimitBetweenHighLow} onChange={() => setUserSettings(p => ({ ...p, blockLimitBetweenHighLow: !(p?.blockLimitBetweenHighLow ?? globalSettings.blockLimitBetweenHighLow) }))} />
            <ToggleBtn label="Exit Only Mode" value={userSettings?.exitOnlyMode ?? globalSettings.exitOnlyMode} onChange={() => setUserSettings(p => ({ ...p, exitOnlyMode: !(p?.exitOnlyMode ?? globalSettings.exitOnlyMode) }))} />
            <button onClick={saveUserSettings} disabled={savingUserSettings} style={{ marginTop: 12, padding: '12px 24px', border: 'none', borderRadius: 8, background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              💾 {savingUserSettings ? 'Saving...' : 'Save User Settings'}
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
            <div>Search and select a user to configure their risk settings</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RiskManagement;
