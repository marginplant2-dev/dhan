import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function BinarySettings() {
  const [settings, setSettings] = useState({
    enabled: true,
    minTradeAmount: 100,
    maxTradeAmount: 1000000,
    minExpiry: 60,
    maxExpiry: 3600,
    payoutPercent: 85,
    refundOnTie: true,
    expiryOptions: [60, 300, 900, 3600]
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_URL}/api/settings/trade-modes`);
        const data = await res.json();
        if (data?.binary) {
          setSettings(prev => ({ ...prev, ...data.binary }));
        }
      } catch (error) {
        console.error('Error fetching binary settings:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleExpiryChange = (index, value) => {
    const newExpiries = [...settings.expiryOptions];
    newExpiries[index] = parseInt(value) || 0;
    setSettings(prev => ({ ...prev, expiryOptions: newExpiries }));
  };

  const addExpiry = () => {
    setSettings(prev => ({ ...prev, expiryOptions: [...prev.expiryOptions, 1800] }));
  };

  const removeExpiry = (index) => {
    const newExpiries = settings.expiryOptions.filter((_, i) => i !== index);
    setSettings(prev => ({ ...prev, expiryOptions: newExpiries }));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      // Auto-set minExpiry to the lowest expiry option
      const lowestExpiry = Math.min(...settings.expiryOptions);
      const settingsToSave = {
        ...settings,
        minExpiry: Math.min(settings.minExpiry, lowestExpiry)
      };
      
      const res = await fetch(`${API_URL}/api/settings/trade-modes/binary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'binary', ...settingsToSave })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Binary mode settings saved successfully!');
        // Update local state with saved minExpiry
        setSettings(prev => ({ ...prev, minExpiry: settingsToSave.minExpiry }));
      } else {
        showToast(`Error: ${data.error}`, 'error');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      showToast('Error saving settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const formatExpiry = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  if (loading) {
    return (
      <div className="admin-page">
        <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      {/* Toast */}
      {toast.show && (
        <div style={{
          position: 'fixed', top: 20, right: 20, padding: '12px 20px',
          background: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: '#fff', borderRadius: 8, zIndex: 9999, fontWeight: 500
        }}>
          {toast.message}
        </div>
      )}

      <div className="admin-page-header">
        <h1>⏱️ Binary Mode Settings</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
          Configure binary options trading parameters
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginTop: 20 }}>
        {/* Mode Status */}
        <div className="admin-form-card" style={{ 
          background: settings.enabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
          border: `1px solid ${settings.enabled ? '#10b981' : '#ef4444'}`,
          padding: 20, borderRadius: 12
        }}>
          <h4 style={{ margin: '0 0 16px', fontSize: 16 }}>Mode Status</h4>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={settings.enabled} 
              onChange={(e) => handleChange('enabled', e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              Binary Mode {settings.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
            {settings.enabled ? '✓ Users can access binary options' : '✗ Binary access is disabled for all users'}
          </p>
        </div>

        {/* Order Amount Settings */}
        <div className="admin-form-card" style={{ padding: 20, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <h4 style={{ margin: '0 0 16px', fontSize: 16 }}>💰 Order Amount (INR)</h4>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
            Minimum and maximum stake are in Indian rupees (₹). The platform converts to USD for the wallet using the live USD/INR rate.
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Min Order Amount (₹)</label>
              <input 
                type="number" 
                value={settings.minTradeAmount} 
                onChange={(e) => handleChange('minTradeAmount', parseFloat(e.target.value))}
                style={{ width: '100%', padding: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Max Order Amount (₹)</label>
              <input 
                type="number" 
                value={settings.maxTradeAmount} 
                onChange={(e) => handleChange('maxTradeAmount', parseFloat(e.target.value))}
                style={{ width: '100%', padding: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)' }}
              />
            </div>
          </div>
        </div>

        {/* Payout Settings */}
        <div className="admin-form-card" style={{ padding: 20, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <h4 style={{ margin: '0 0 16px', fontSize: 16 }}>📊 Payout Settings</h4>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Payout Percent (%)</label>
              <input 
                type="number" 
                value={settings.payoutPercent} 
                onChange={(e) => handleChange('payoutPercent', parseFloat(e.target.value))}
                min="1" max="100"
                style={{ width: '100%', padding: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)' }}
              />
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Winning positions receive {settings.payoutPercent}% profit
              </p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
              <input 
                type="checkbox" 
                checked={settings.refundOnTie} 
                onChange={(e) => handleChange('refundOnTie', e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 14 }}>Refund on Tie (price unchanged)</span>
            </label>
          </div>
        </div>

        {/* Expiry Settings */}
        <div className="admin-form-card" style={{ padding: 20, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <h4 style={{ margin: '0 0 16px', fontSize: 16 }}>⏱️ Expiry Time Range</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Min Expiry (seconds)</label>
              <input 
                type="number" 
                value={settings.minExpiry} 
                onChange={(e) => handleChange('minExpiry', parseInt(e.target.value))}
                style={{ width: '100%', padding: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Max Expiry (seconds)</label>
              <input 
                type="number" 
                value={settings.maxExpiry} 
                onChange={(e) => handleChange('maxExpiry', parseInt(e.target.value))}
                style={{ width: '100%', padding: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)' }}
              />
            </div>
          </div>
        </div>

        {/* Expiry Options */}
        <div className="admin-form-card" style={{ padding: 20, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0, fontSize: 16 }}>🎯 Quick Expiry Options</h4>
            <button 
              onClick={addExpiry}
              style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
            >
              + Add Option
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {settings.expiryOptions.map((expiry, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-tertiary)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <input 
                  type="number" 
                  value={expiry} 
                  onChange={(e) => handleExpiryChange(index, e.target.value)}
                  style={{ width: 80, padding: 6, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-primary)', textAlign: 'center' }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>sec ({formatExpiry(expiry)})</span>
                {settings.expiryOptions.length > 1 && (
                  <button 
                    onClick={() => removeExpiry(index)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 12 }}>
            These are the quick-select expiry options shown to users when placing binary trades
          </p>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          onClick={saveSettings}
          disabled={saving}
          style={{ 
            padding: '12px 32px', 
            background: saving ? '#6b7280' : '#10b981', 
            color: '#fff', 
            border: 'none', 
            borderRadius: 8, 
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 14,
            fontWeight: 600
          }}
        >
          {saving ? 'Saving...' : '💾 Save Binary Settings'}
        </button>
      </div>
    </div>
  );
}

export default BinarySettings;
