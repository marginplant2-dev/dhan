import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../adminConfig';
import './ReorderSettings.css';

const SEGMENTS = [
  // Forex Segments
  { name: 'FOREX', label: 'Forex (All Pairs)' },
  { name: 'FOREX_MAJOR', label: 'Forex Major Pairs' },
  { name: 'FOREX_MINOR', label: 'Forex Minor Pairs' },
  // Crypto Segments
  { name: 'CRYPTO', label: 'Crypto' },
  // Commodities
  { name: 'COMMODITIES', label: 'Com (XAU, XAG, energy)' },
  // Indices
  { name: 'INDICES', label: 'Indices (US30, US100, etc)' },
  // Indian Segments (labels match Market / Netting UI)
  { name: 'NSE_EQ', label: 'NSE EQ' },
  { name: 'NSE_FUT', label: 'NSE FUT' },
  { name: 'NSE_OPT', label: 'NSE OPT' },
  { name: 'BSE_FUT', label: 'BSE FUT' },
  { name: 'BSE_OPT', label: 'BSE OPT' },
  { name: 'MCX_FUT', label: 'MCX FUT' },
  { name: 'MCX_OPT', label: 'MCX OPT' }
];

export default function ReorderSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: '' });

  // Form state
  const [isEnabled, setIsEnabled] = useState(false);
  const [globalDelay, setGlobalDelay] = useState(0);
  const [priceMode, setPriceMode] = useState('broker_advantage');
  const [segmentDelays, setSegmentDelays] = useState([]);
  
  // User-specific settings
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [userDelays, setUserDelays] = useState([]);
  const [selectedUserDelay, setSelectedUserDelay] = useState(2);
  const [searchingUsers, setSearchingUsers] = useState(false);
  
  // Expanded user for segment overrides
  const [expandedUserId, setExpandedUserId] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 3000);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Search users
  const searchUsers = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchingUsers(true);
    try {
      console.log('[Reboorder] Searching users:', query, 'API_URL:', API_URL);
      const res = await fetch(`${API_URL}/api/admin/users?search=${encodeURIComponent(query)}&limit=10`);
      const data = await res.json();
      console.log('[Reboorder] Search response:', data);
      if (data.success && data.users) {
        // Filter out users already in userDelays
        const existingUserIds = userDelays.map(u => u.userId);
        const filtered = data.users.filter(u => !existingUserIds.includes(u._id));
        console.log('[Reboorder] Filtered results:', filtered.length);
        setSearchResults(filtered);
      }
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearchingUsers(false);
    }
  }, [userDelays]);

  // Add user to delay list
  const addUserDelay = (user) => {
    setUserDelays(prev => [...prev, {
      userId: user._id,
      userName: user.name || user.email,
      userEmail: user.email,
      oderId: user.oderId,
      delaySeconds: selectedUserDelay,
      isEnabled: true,
      segmentOverrides: [] // Initialize empty segment overrides
    }]);
    setUserSearch('');
    setSearchResults([]);
  };
  
  // Update user segment override
  const updateUserSegmentOverride = (userId, segmentName, field, value) => {
    setUserDelays(prev => prev.map(u => {
      if (u.userId !== userId) return u;
      
      const overrides = u.segmentOverrides || [];
      const existingIndex = overrides.findIndex(s => s.segmentName === segmentName);
      
      if (existingIndex >= 0) {
        // Update existing override
        const newOverrides = [...overrides];
        newOverrides[existingIndex] = { ...newOverrides[existingIndex], [field]: value };
        return { ...u, segmentOverrides: newOverrides };
      } else {
        // Add new override
        return { 
          ...u, 
          segmentOverrides: [...overrides, { segmentName, delaySeconds: 0, isEnabled: true, [field]: value }]
        };
      }
    }));
  };
  
  // Get user segment override value
  const getUserSegmentOverride = (userId, segmentName) => {
    const user = userDelays.find(u => u.userId === userId);
    if (!user || !user.segmentOverrides) return null;
    return user.segmentOverrides.find(s => s.segmentName === segmentName);
  };

  // Remove user from delay list
  const removeUserDelay = (userId) => {
    setUserDelays(prev => prev.filter(u => u.userId !== userId));
  };

  // Update user delay
  const updateUserDelay = (userId, field, value) => {
    setUserDelays(prev => prev.map(u => 
      u.userId === userId ? { ...u, [field]: value } : u
    ));
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/reorder-settings`);
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        setIsEnabled(data.settings.isEnabled || false);
        setGlobalDelay(data.settings.globalDelaySeconds || 0);
        setPriceMode(data.settings.priceMode || 'broker_advantage');
        
        // Initialize segment delays
        const delays = SEGMENTS.map(seg => {
          const existing = data.settings.segmentDelays?.find(s => s.segmentName === seg.name);
          return {
            segmentName: seg.name,
            delaySeconds: existing?.delaySeconds || 0,
            isEnabled: existing?.isEnabled !== false
          };
        });
        setSegmentDelays(delays);
        
        // Initialize user delays
        if (data.settings.userDelays && data.settings.userDelays.length > 0) {
          // Fetch user details for each user delay
          const userDelaysWithDetails = await Promise.all(
            data.settings.userDelays.map(async (ud) => {
              try {
                const userRes = await fetch(`${API_URL}/api/admin/users/${ud.userId}`);
                const userData = await userRes.json();
                if (userData.success && userData.user) {
                  return {
                    userId: ud.userId,
                    userName: userData.user.name || userData.user.email,
                    userEmail: userData.user.email,
                    oderId: userData.user.oderId,
                    delaySeconds: ud.delaySeconds,
                    isEnabled: ud.isEnabled !== false,
                    segmentOverrides: ud.segmentOverrides || []
                  };
                }
              } catch (e) {
                console.error('Error fetching user:', e);
              }
              return {
                userId: ud.userId,
                userName: 'Unknown User',
                userEmail: '',
                oderId: '',
                delaySeconds: ud.delaySeconds,
                isEnabled: ud.isEnabled !== false,
                segmentOverrides: ud.segmentOverrides || []
              };
            })
          );
          setUserDelays(userDelaysWithDetails);
        }
      }
    } catch (error) {
      showToast('Error loading settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      // Format user delays for API (include segment overrides)
      const formattedUserDelays = userDelays.map(u => ({
        userId: u.userId,
        delaySeconds: u.delaySeconds,
        isEnabled: u.isEnabled,
        segmentOverrides: u.segmentOverrides || []
      }));
      
      const res = await fetch(`${API_URL}/api/admin/reorder-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isEnabled,
          globalDelaySeconds: globalDelay,
          priceMode,
          segmentDelays,
          userDelays: formattedUserDelays
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Settings saved successfully');
        setSettings(data.settings);
        // Update local state with saved values to ensure sync
        setGlobalDelay(data.settings.globalDelaySeconds || 0);
        setIsEnabled(data.settings.isEnabled || false);
        setPriceMode(data.settings.priceMode || 'broker_advantage');
      } else {
        showToast(data.error || 'Error saving settings', 'error');
      }
    } catch (error) {
      showToast('Error saving settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateSegmentDelay = (segmentName, field, value) => {
    setSegmentDelays(prev => prev.map(s => 
      s.segmentName === segmentName ? { ...s, [field]: value } : s
    ));
  };

  if (loading) {
    return (
      <div className="admin-page-container">
        <div className="loading-state">Loading...</div>
      </div>
    );
  }

  return (
    <div className="admin-page-container">
      {toast.show && (
        <div className={`toast-message ${toast.type}`}>
          {toast.message}
        </div>
      )}

      <div className="admin-page-header">
        <h2>⏱️ Reboorder Settings</h2>
        <p className="header-subtitle">
          Configure delayed trade execution with price advantage
        </p>
      </div>

      <div className="reorder-content">
        {/* Global Settings Card */}
        <div className="settings-card">
          <h3>Global Settings</h3>
          
          <div className="setting-row">
            <div className="setting-label">
              <span className="label-text">Enable Reorder</span>
              <span className="label-hint">When enabled, orders will be delayed before execution</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span className="label-text">Global Delay (seconds)</span>
              <span className="label-hint">Default delay applied to all positions</span>
            </div>
            <input
              type="number"
              min="0"
              max="30"
              value={globalDelay}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  setGlobalDelay(0);
                } else {
                  const parsed = parseInt(val, 10);
                  if (!isNaN(parsed) && parsed >= 0 && parsed <= 30) {
                    setGlobalDelay(parsed);
                  }
                }
              }}
              className="delay-input"
            />
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span className="label-text">Price Mode</span>
              <span className="label-hint">How to handle price changes during delay</span>
            </div>
            <select
              value={priceMode}
              onChange={(e) => setPriceMode(e.target.value)}
              className="mode-select"
            >
              <option value="broker_advantage">Broker Advantage</option>
              <option value="user_advantage">User Advantage</option>
              <option value="always_current">Always Current Price</option>
            </select>
          </div>

          <div className="price-mode-explanation">
            {priceMode === 'broker_advantage' && (
              <div className="mode-info broker">
                <strong>Broker Advantage:</strong>
                <ul>
                  <li><strong>BUY:</strong> If price goes UP during delay → Execute at higher price. If price goes DOWN → Execute at original price.</li>
                  <li><strong>SELL:</strong> If price goes DOWN during delay → Execute at lower price. If price goes UP → Execute at original price.</li>
                </ul>
              </div>
            )}
            {priceMode === 'user_advantage' && (
              <div className="mode-info user">
                <strong>User Advantage:</strong>
                <ul>
                  <li><strong>BUY:</strong> If price goes DOWN during delay → Execute at lower price. If price goes UP → Execute at original price.</li>
                  <li><strong>SELL:</strong> If price goes UP during delay → Execute at higher price. If price goes DOWN → Execute at original price.</li>
                </ul>
              </div>
            )}
            {priceMode === 'always_current' && (
              <div className="mode-info current">
                <strong>Always Current Price:</strong> Trade always executes at the current market price after the delay, regardless of direction.
              </div>
            )}
          </div>
        </div>

        {/* Segment-wise Settings */}
        <div className="settings-card">
          <h3>Segment-wise Delay Settings</h3>
          <p className="card-hint">Override global delay for specific segments</p>
          
          <div className="segment-delays-grid">
            {segmentDelays.map(seg => {
              const segInfo = SEGMENTS.find(s => s.name === seg.segmentName);
              return (
                <div key={seg.segmentName} className="segment-delay-row">
                  <div className="segment-info">
                    <label className="segment-toggle">
                      <input
                        type="checkbox"
                        checked={seg.isEnabled}
                        onChange={(e) => updateSegmentDelay(seg.segmentName, 'isEnabled', e.target.checked)}
                      />
                      <span className="segment-name">{segInfo?.label || seg.segmentName}</span>
                    </label>
                  </div>
                  <div className="segment-delay-input">
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={seg.delaySeconds}
                      onChange={(e) => updateSegmentDelay(seg.segmentName, 'delaySeconds', parseInt(e.target.value) || 0)}
                      disabled={!seg.isEnabled}
                    />
                    <span className="unit">sec</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* User-specific Delay Settings */}
        <div className="settings-card">
          <h3>👤 User-specific Delay Settings</h3>
          <p className="card-hint">Apply delay to specific users (overrides global and segment settings)</p>
          
          {/* User Search Input */}
          <div className="user-search-section">
            <div className="user-search-row">
              <div className="search-input-wrapper">
                <input
                  type="text"
                  placeholder="Type to search user by name, email or ID..."
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    searchUsers(e.target.value);
                  }}
                  className="user-search-input"
                />
                {searchingUsers && <span className="search-spinner">⏳</span>}
                
                {/* Search Results Dropdown */}
                {searchResults.length > 0 && (
                  <div className="search-results-dropdown">
                    {searchResults.map(user => (
                      <div 
                        key={user._id} 
                        className="search-result-item"
                        onClick={() => {
                          addUserDelay(user);
                          setUserSearch('');
                        }}
                      >
                        <div className="user-info">
                          <span className="user-name">{user.name || 'No Name'}</span>
                          <span className="user-email">{user.email}</span>
                        </div>
                        <span className="user-id">ID: {user.oderId || user._id.slice(-6)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="delay-preset">
                <label>Delay:</label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={selectedUserDelay}
                  onChange={(e) => setSelectedUserDelay(parseInt(e.target.value) || 0)}
                  className="delay-input-small"
                />
                <span>sec</span>
              </div>
            </div>
          </div>
          
          {/* Selected Users List */}
          {userDelays.length > 0 ? (
            <div className="user-delays-list">
              <div className="list-header">
                <span>User</span>
                <span>Default Delay</span>
                <span>Status</span>
                <span>Action</span>
              </div>
              {userDelays.map(user => (
                <div key={user.userId} className="user-delay-wrapper">
                  <div className="user-delay-row">
                    <div className="user-cell">
                      <span className="user-name">{user.userName}</span>
                      <span className="user-email">{user.userEmail}</span>
                    </div>
                    <div className="delay-cell">
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={user.delaySeconds}
                        onChange={(e) => updateUserDelay(user.userId, 'delaySeconds', parseInt(e.target.value) || 0)}
                        className="delay-input-small"
                      />
                      <span>sec</span>
                    </div>
                    <div className="status-cell">
                      <label className="mini-toggle">
                        <input
                          type="checkbox"
                          checked={user.isEnabled}
                          onChange={(e) => updateUserDelay(user.userId, 'isEnabled', e.target.checked)}
                        />
                        <span className="mini-slider"></span>
                      </label>
                    </div>
                    <div className="action-cell">
                      <button 
                        className="expand-btn"
                        onClick={() => setExpandedUserId(expandedUserId === user.userId ? null : user.userId)}
                        title="Configure segment overrides"
                      >
                        {expandedUserId === user.userId ? '▲' : '▼'}
                      </button>
                      <button 
                        className="remove-btn"
                        onClick={() => removeUserDelay(user.userId)}
                        title="Remove user"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  
                  {/* Segment Overrides for this user */}
                  {expandedUserId === user.userId && (
                    <div className="user-segment-overrides">
                      <div className="segment-overrides-header">
                        <span>📊 Segment-wise Overrides for {user.userName}</span>
                        <span className="hint">These override the user's default delay for specific segments</span>
                      </div>
                      <div className="segment-overrides-grid">
                        {SEGMENTS.map(seg => {
                          const override = getUserSegmentOverride(user.userId, seg.name);
                          const hasOverride = override && (override.delaySeconds > 0 || override.isEnabled === false);
                          return (
                            <div key={seg.name} className={`segment-override-row ${hasOverride ? 'has-override' : ''}`}>
                              <div className="segment-info">
                                <label className="segment-toggle">
                                  <input
                                    type="checkbox"
                                    checked={override?.isEnabled !== false}
                                    onChange={(e) => updateUserSegmentOverride(user.userId, seg.name, 'isEnabled', e.target.checked)}
                                  />
                                  <span className="segment-name">{seg.label}</span>
                                </label>
                              </div>
                              <div className="segment-delay-input">
                                <input
                                  type="number"
                                  min="0"
                                  max="30"
                                  value={override?.delaySeconds || 0}
                                  onChange={(e) => updateUserSegmentOverride(user.userId, seg.name, 'delaySeconds', parseInt(e.target.value) || 0)}
                                  placeholder="0"
                                />
                                <span className="unit">sec</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="no-users-message">
              No users added. Search and select users above to apply specific delay settings.
            </div>
          )}
        </div>

        {/* Example Scenarios */}
        <div className="settings-card example-card">
          <h3>📖 How It Works</h3>
          <div className="example-scenarios">
            <div className="scenario">
              <div className="scenario-title">Example: BUY Order with 2 sec delay (Broker Advantage)</div>
              <div className="scenario-steps">
                <div className="step">
                  <span className="step-num">1</span>
                  <span>User places BUY order at ₹100</span>
                </div>
                <div className="step">
                  <span className="step-num">2</span>
                  <span>System waits 2 seconds...</span>
                </div>
                <div className="step">
                  <span className="step-num">3</span>
                  <span>After 2 sec, price is ₹102 → Order executes at ₹102 (higher price)</span>
                </div>
                <div className="step alt">
                  <span className="step-num">3</span>
                  <span>After 2 sec, price is ₹98 → Order executes at ₹100 (original price)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="save-section">
          <button 
            className="save-btn"
            onClick={saveSettings}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
