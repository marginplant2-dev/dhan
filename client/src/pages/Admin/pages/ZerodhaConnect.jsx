import { useState, useEffect } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';

function ZerodhaConnect() {
  const { API_URL } = useOutletContext();
  const [searchParams] = useSearchParams();
  
  const [settings, setSettings] = useState({
    apiKey: '',
    apiSecret: '',
    isConnected: false,
    lastConnected: null,
    wsStatus: 'disconnected',
    enabledSegments: {
      nseEq: true,
      bseEq: true,
      nseFut: true,
      nseOpt: true,
      mcxFut: true,
      mcxOpt: true,
      bseFut: false,
      bseOpt: false
    },
    subscribedInstruments: [],
    redirectUrl: ''
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSegment, setSearchSegment] = useState('nseEq');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [subscribingAll, setSubscribingAll] = useState(false);

  useEffect(() => {
    fetchSettings();
    
    // Check for OAuth callback params
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    
    if (success === 'true') {
      setMessage({ type: 'success', text: 'Successfully connected to Zerodha!' });
      fetchSettings();
    } else if (error) {
      setMessage({ type: 'error', text: `Connection failed: ${error}` });
    }
  }, [searchParams]);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/zerodha/settings`);
      const data = await res.json();
      if (data.success) {
        const es = data.settings?.enabledSegments || {};
        setSettings({
          ...data.settings,
          enabledSegments: {
            nseEq: es.nseEq !== false,
            bseEq: es.bseEq !== false,
            nseFut: es.nseFut !== false,
            nseOpt: es.nseOpt !== false,
            mcxFut: es.mcxFut !== false,
            mcxOpt: es.mcxOpt !== false,
            bseFut: !!es.bseFut,
            bseOpt: !!es.bseOpt
          }
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/zerodha/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: settings.apiKey,
          apiSecret: settings.apiSecret,
          enabledSegments: settings.enabledSegments,
          redirectUrl: settings.redirectUrl
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving settings' });
    } finally {
      setSaving(false);
    }
  };

  const connectZerodha = async () => {
    try {
      const res = await fetch(`${API_URL}/api/zerodha/login-url`);
      const data = await res.json();
      if (data.success && data.loginUrl) {
        window.location.href = data.loginUrl;
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to get login URL' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error connecting to Zerodha' });
    }
  };

  const disconnectZerodha = async () => {
    if (!confirm('Are you sure you want to disconnect from Zerodha?')) return;
    
    try {
      const res = await fetch(`${API_URL}/api/zerodha/logout`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Disconnected from Zerodha' });
        fetchSettings();
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error disconnecting' });
    }
  };

  const connectWebSocket = async () => {
    try {
      const res = await fetch(`${API_URL}/api/zerodha/connect-ws`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'WebSocket connected!' });
        fetchSettings();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to connect WebSocket' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error connecting WebSocket' });
    }
  };

  const disconnectWebSocket = async () => {
    try {
      const res = await fetch(`${API_URL}/api/zerodha/disconnect-ws`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'WebSocket disconnected' });
        fetchSettings();
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error disconnecting WebSocket' });
    }
  };

  const searchInstruments = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/zerodha/instruments/search?query=${encodeURIComponent(searchQuery)}&segment=${searchSegment}`);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.instruments || []);
      }
    } catch (error) {
      console.error('Error searching instruments:', error);
    } finally {
      setSearching(false);
    }
  };

  const subscribeInstrument = async (instrument) => {
    try {
      const res = await fetch(`${API_URL}/api/zerodha/instruments/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instrument })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Subscribed to ${instrument.symbol}` });
        fetchSettings();
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error subscribing to instrument' });
    }
  };

  const subscribeAllResults = async () => {
    const unsubscribed = searchResults.filter(inst => 
      !settings.subscribedInstruments?.some(s => s.token === inst.token)
    );
    
    if (unsubscribed.length === 0) {
      setMessage({ type: 'info', text: 'All instruments already subscribed' });
      return;
    }

    setMessage({ type: 'info', text: `Subscribing ${unsubscribed.length} instruments...` });
    
    try {
      const res = await fetch(`${API_URL}/api/zerodha/instruments/subscribe-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruments: unsubscribed })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Subscribed to ${data.count} instruments` });
        fetchSettings();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to subscribe' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error subscribing to instruments' });
    }
  };

  // Subscribe all instruments from an exchange
  const subscribeAllFromExchange = async (exchange) => {
    setSubscribingAll(true);
    setMessage({ type: 'info', text: `Fetching all instruments from ${exchange}...` });
    
    try {
      // First fetch all instruments from the exchange
      const res = await fetch(`${API_URL}/api/zerodha/instruments/${exchange}`);
      const data = await res.json();
      
      if (!data.success || !data.instruments || data.instruments.length === 0) {
        setMessage({ type: 'error', text: `No instruments found for ${exchange}` });
        setSubscribingAll(false);
        return;
      }

      const allInstruments = data.instruments;
      const alreadySubscribed = settings.subscribedInstruments?.map(s => s.token) || [];
      const toSubscribe = allInstruments.filter(inst => !alreadySubscribed.includes(inst.token));

      if (toSubscribe.length === 0) {
        setMessage({ type: 'info', text: `All ${allInstruments.length} instruments already subscribed` });
        setSubscribingAll(false);
        return;
      }

      setMessage({ type: 'info', text: `Subscribing ${toSubscribe.length} instruments from ${exchange}...` });

      // Subscribe in batches of 100
      const batchSize = 100;
      let subscribed = 0;
      
      for (let i = 0; i < toSubscribe.length; i += batchSize) {
        const batch = toSubscribe.slice(i, i + batchSize);
        const batchRes = await fetch(`${API_URL}/api/zerodha/instruments/subscribe-bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruments: batch })
        });
        const batchData = await batchRes.json();
        if (batchData.success) {
          subscribed += batchData.count || batch.length;
          setMessage({ type: 'info', text: `Subscribed ${subscribed}/${toSubscribe.length} instruments...` });
        }
      }

      setMessage({ type: 'success', text: `Successfully subscribed ${subscribed} instruments from ${exchange}` });
      fetchSettings();
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${error.message}` });
    } finally {
      setSubscribingAll(false);
    }
  };

  const unsubscribeInstrument = async (token) => {
    try {
      const res = await fetch(`${API_URL}/api/zerodha/instruments/subscribe/${token}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Unsubscribed from instrument' });
        fetchSettings();
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error unsubscribing' });
    }
  };

  const toggleSegment = (segment) => {
    setSettings(prev => ({
      ...prev,
      enabledSegments: {
        ...prev.enabledSegments,
        [segment]: !prev.enabledSegments[segment]
      }
    }));
  };

  const segmentLabels = {
    nseEq: 'NSE EQ',
    bseEq: 'BSE EQ',
    nseFut: 'NSE FUT',
    nseOpt: 'NSE OPT',
    mcxFut: 'MCX FUT',
    mcxOpt: 'MCX OPT',
    bseFut: 'BSE FUT',
    bseOpt: 'BSE OPT'
  };

  const wsStatusColors = {
    disconnected: '#ef4444',
    connecting: '#f59e0b',
    connected: '#10b981',
    error: '#ef4444'
  };

  if (loading) {
    return <div className="admin-page-container"><div style={{ padding: 40, textAlign: 'center' }}>Loading...</div></div>;
  }

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>Zerodha Connect</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
          Connect your Zerodha Kite API for live Indian market data
        </p>
      </div>

      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 20,
          background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`,
          color: message.type === 'success' ? '#10b981' : '#ef4444'
        }}>
          {message.text}
          <button onClick={() => setMessage({ type: '', text: '' })} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
        </div>
      )}

      {/* Token Expiry Warning */}
      {settings.isTokenExpired && settings.apiKey && (
        <div style={{
          padding: '16px 20px',
          borderRadius: 8,
          marginBottom: 20,
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <span style={{ fontSize: 24 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>
              Zerodha Token Expired!
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Your Zerodha access token has expired. Please reconnect to continue receiving live market data.
              Zerodha tokens expire daily and need to be refreshed.
            </div>
          </div>
        </div>
      )}

      {/* Connection Status */}
      <div className="admin-card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px 0' }}>Connection Status</h3>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: settings.isConnected && !settings.isTokenExpired ? '#10b981' : '#ef4444'
              }} />
              <span style={{ fontWeight: 500 }}>
                {settings.isConnected && !settings.isTokenExpired ? 'Connected to Zerodha' : settings.isTokenExpired ? 'Token Expired' : 'Not Connected'}
              </span>
            </div>
            {settings.lastConnected && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
                Last connected: {new Date(settings.lastConnected).toLocaleString()}
              </p>
            )}
            {settings.tokenExpiry && !settings.isTokenExpired && (
              <p style={{ color: '#f59e0b', fontSize: 13, margin: '4px 0 0 0' }}>
                Token expires: {new Date(settings.tokenExpiry).toLocaleString()}
              </p>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: wsStatusColors[settings.wsStatus]
              }} />
              <span style={{ fontWeight: 500 }}>
                WebSocket: {settings.wsStatus.charAt(0).toUpperCase() + settings.wsStatus.slice(1)}
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
              {settings.subscribedInstruments?.length || 0} instruments subscribed
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          {!settings.isConnected || settings.isTokenExpired ? (
            <button
              onClick={connectZerodha}
              disabled={!settings.apiKey}
              style={{
                // Explicit colours so it stays readable in both light and
                // dark admin themes — the .btn-primary class was being
                // overridden somewhere and the text was vanishing into the
                // background.
                background: settings.isTokenExpired ? '#f59e0b' : '#35DC85',
                color: '#ffffff',
                border: 'none',
                padding: '10px 22px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                cursor: settings.apiKey ? 'pointer' : 'not-allowed',
                opacity: settings.apiKey ? 1 : 0.55,
                boxShadow: '0 4px 12px rgba(43,78,255,0.25)',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => { if (settings.apiKey) e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={(e) => { if (settings.apiKey) e.currentTarget.style.opacity = '1'; }}
            >
              {settings.isTokenExpired ? '🔄 Reconnect to Zerodha' : 'Connect to Zerodha'}
            </button>
          ) : (
            <>
              <button onClick={disconnectZerodha} className="btn-danger">
                Disconnect
              </button>
              {settings.wsStatus !== 'connected' ? (
                <button onClick={connectWebSocket} className="btn-primary">
                  Connect WebSocket
                </button>
              ) : (
                <button onClick={disconnectWebSocket} className="btn-secondary">
                  Disconnect WebSocket
                </button>
              )}
            </>
          )}
        </div>

      </div>

      {/* API Credentials */}
      <div className="admin-card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px 0' }}>API Credentials</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div className="form-group">
            <label>API Key</label>
            <input
              type="text"
              value={settings.apiKey}
              onChange={(e) => setSettings(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder="Enter Zerodha API Key"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>API Secret</label>
            <input
              type="password"
              value={settings.apiSecret}
              onChange={(e) => setSettings(prev => ({ ...prev, apiSecret: e.target.value }))}
              placeholder="Enter Zerodha API Secret"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>Redirect URL</label>
            <input
              type="text"
              value={settings.redirectUrl}
              onChange={(e) => setSettings(prev => ({ ...prev, redirectUrl: e.target.value }))}
              placeholder="OAuth callback URL"
              className="form-input"
            />
            <small style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
              Set this in your Kite Connect app settings
            </small>
          </div>
        </div>
        <button onClick={saveSettings} className="btn-primary" disabled={saving} style={{ marginTop: 16, background: '#6366f1', color: '#fff', padding: '10px 24px', fontWeight: 600, border: 'none', borderRadius: '6px' }}>
          {saving ? 'Saving...' : '💾 Save Credentials'}
        </button>
      </div>

      {/* Enabled Segments */}
      <div className="admin-card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px 0' }}>Enabled Market Segments</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {Object.entries(segmentLabels).map(([key, label]) => (
            <label key={key} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
              background: 'var(--bg-secondary)', borderRadius: 8, cursor: 'pointer',
              border: settings.enabledSegments[key] ? '2px solid var(--primary)' : '2px solid transparent'
            }}>
              <input
                type="checkbox"
                checked={settings.enabledSegments[key]}
                onChange={() => toggleSegment(key)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontWeight: 500 }}>{label}</span>
            </label>
          ))}
        </div>
        <button onClick={saveSettings} className="btn-primary" disabled={saving} style={{ marginTop: 16, background: '#6366f1', color: '#fff', padding: '10px 24px', fontWeight: 600, border: 'none', borderRadius: '6px' }}>
          {saving ? 'Saving...' : '💾 Save Segments'}
        </button>
      </div>

      {/* Instrument Management - On-Demand System */}
      {settings.isConnected && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px 0' }}>📊 Instrument Management</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
            <strong>On-Demand System:</strong> Instruments are fetched only when users search for them.
            This keeps the system lightweight. Expired instruments are auto-removed.
          </p>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Subscribed Instruments</div>
              <div style={{ fontWeight: 600 }}>{settings.subscribedInstruments?.length || 0}</div>
            </div>
            <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Auto Remove Expired</div>
              <div style={{ fontWeight: 600, color: '#22c55e' }}>✓ Enabled</div>
            </div>
            <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading Mode</div>
              <div style={{ fontWeight: 600, color: '#6366f1' }}>On-Demand</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button 
              onClick={async () => {
                setSubscribingAll(true);
                setMessage({ type: 'info', text: 'Syncing instruments cache...' });
                try {
                  await fetch(`${API_URL}/api/zerodha/instruments/sync`, { method: 'POST' });
                  setMessage({ type: 'success', text: 'Cache synced! Search again to get fresh lot sizes.' });
                  fetchSettings();
                } catch (error) {
                  setMessage({ type: 'error', text: error.message });
                }
                setSubscribingAll(false);
              }} 
              className="btn-primary" 
              disabled={subscribingAll}
              style={{ background: '#3b82f6', color: '#fff', padding: '10px 24px', fontWeight: 600, border: 'none', borderRadius: '6px' }}
            >
              {subscribingAll ? '🔄 Syncing...' : '🔄 Sync Cache'}
            </button>
            <button 
              onClick={async () => {
                if (!confirm('This will clear all subscribed instruments and cache. Continue?')) return;
                setSubscribingAll(true);
                setMessage({ type: 'info', text: 'Clearing cache...' });
                try {
                  await fetch(`${API_URL}/api/zerodha/instruments/clear`, { method: 'POST' });
                  setMessage({ type: 'success', text: 'Cache cleared. Instruments will be fetched on-demand when searched.' });
                  fetchSettings();
                } catch (error) {
                  setMessage({ type: 'error', text: error.message });
                }
                setSubscribingAll(false);
              }} 
              className="btn-danger" 
              disabled={subscribingAll}
              style={{ background: '#ef4444', color: '#fff', padding: '10px 24px', fontWeight: 600, border: 'none', borderRadius: '6px' }}
            >
              {subscribingAll ? '🔄 Clearing...' : '🗑️ Clear All'}
            </button>
          </div>
        </div>
      )}

      {/* Instrument Search & Subscription */}
      {settings.isConnected && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px 0' }}>Subscribe to Instruments</h3>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <select
              value={searchSegment}
              onChange={(e) => setSearchSegment(e.target.value)}
              className="form-input"
              style={{ width: 160 }}
            >
              {Object.entries(segmentLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchInstruments()}
              placeholder="Search symbol (e.g. RELIANCE, NIFTY)"
              className="form-input"
              style={{ flex: 1, minWidth: 200 }}
            />
            <button onClick={searchInstruments} className="btn-primary" disabled={searching}>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                Found {searchResults.length} instruments
              </span>
              <button onClick={subscribeAllResults} className="btn-primary">
                Subscribe All ({searchResults.filter(inst => !settings.subscribedInstruments?.some(s => s.token === inst.token)).length})
              </button>
            </div>
          )}

          {searchResults.length > 0 && (
            <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16, overflowX: 'auto' }}>
              <table className="admin-table admin-cards-on-mobile">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Exchange</th>
                    <th>Type</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((inst, idx) => (
                    <tr key={inst.token || idx}>
                      <td data-label="Symbol" style={{ fontWeight: 500 }}>{inst.symbol}</td>
                      <td data-label="Name">{inst.name || '-'}</td>
                      <td data-label="Exchange">{inst.exchange}</td>
                      <td data-label="Type">{inst.instrumentType || inst.segment}</td>
                      <td data-label="Action">
                        <button
                          onClick={() => subscribeInstrument(inst)}
                          className="btn-sm btn-primary"
                          disabled={settings.subscribedInstruments?.some(s => s.token === inst.token)}
                        >
                          {settings.subscribedInstruments?.some(s => s.token === inst.token) ? 'Subscribed' : 'Subscribe'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Subscribed Instruments */}
      <div className="admin-card">
        <h3 style={{ margin: '0 0 16px 0' }}>Subscribed Instruments ({settings.subscribedInstruments?.length || 0})</h3>
        {settings.subscribedInstruments?.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>
            No instruments subscribed yet. Search and subscribe to instruments above.
          </p>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto' }}>
            <table className="admin-table admin-cards-on-mobile">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Exchange</th>
                  <th>Segment</th>
                  <th>Lot Size</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {settings.subscribedInstruments?.map((inst, idx) => (
                  <tr key={inst.token || idx}>
                    <td data-label="Symbol" style={{ fontWeight: 500 }}>{inst.symbol}</td>
                    <td data-label="Exchange">{inst.exchange}</td>
                    <td data-label="Segment">{inst.segment}</td>
                    <td data-label="Lot Size">{inst.lotSize}</td>
                    <td data-label="Action">
                      <button
                        onClick={() => unsubscribeInstrument(inst.token)}
                        className="btn-sm btn-danger"
                      >
                        Unsubscribe
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .admin-card {
          background: var(--bg-secondary);
          border-radius: 12px;
          padding: 20px;
          border: 1px solid var(--border);
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-weight: 500;
          font-size: 13px;
          color: var(--text-secondary);
        }
        .form-input {
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        .btn-primary {
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          background: var(--primary);
          color: white;
          font-weight: 500;
          cursor: pointer;
        }
        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-secondary {
          padding: 10px 20px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-weight: 500;
          cursor: pointer;
        }
        .btn-danger {
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          background: #ef4444;
          color: white;
          font-weight: 500;
          cursor: pointer;
        }
        .btn-sm {
          padding: 6px 12px;
          font-size: 12px;
        }
        .admin-table {
          width: 100%;
          border-collapse: collapse;
        }
        .admin-table th, .admin-table td {
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        .admin-table th {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}

export default ZerodhaConnect;
