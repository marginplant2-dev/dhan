import { useState, useEffect } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';
import AdminMyAccount from './AdminMyAccount';

function Settings() {
  const { API_URL } = useOutletContext();
  const location = useLocation();
  const [settings, setSettings] = useState({
    siteName: 'DhanFunded',
    siteUrl: '',
    supportEmail: '',
    supportPhone: '',
    supportWhatsapp: '',
    phoneHours: '',
    whatsappHours: '',
    emailResponseNote: '',
    legalEntityName: '',
    registeredAddress: '',
    operationalAddress: '',
    contactPhone: '',
    contactEmail: '',
    socialInstagram: '',
    socialFacebook: '',
    socialYoutube: '',
    socialTelegram: '',
    maintenanceMode: false,
    registrationEnabled: true,
    demoAccountEnabled: true,
    minDeposit: 100,
    maxWithdrawal: 100000
  });
  const [loading, setLoading] = useState(false);

  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('/account')) return 'admin-account';
    if (path.includes('/security')) return 'security-settings';
    if (path.includes('/api')) return 'api-settings';
    if (path.includes('/backup')) return 'backup-settings';
    return 'general-settings';
  };

  const activeTab = getActiveTab();

  const getTabTitle = () => {
    const titles = {
      'general-settings': 'General Settings',
      'admin-account': 'My account',
      'security-settings': 'Security Settings',
      'api-settings': 'API Keys',
      'backup-settings': 'Backup Settings'
    };
    return titles[activeTab] || 'Settings';
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/settings`);
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(prev => ({ ...prev, ...data.settings }));
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.success) {
        // Re-read what the server actually stored, so the form never shows
        // something different from what the website will use.
        await fetchSettings();
        alert('Settings saved successfully');
      } else {
        alert(data.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'general-settings') {
      fetchSettings();
    }
  }, [activeTab]);

  if (activeTab === 'admin-account') {
    return <AdminMyAccount API_URL={API_URL} />;
  }

  if (activeTab === 'general-settings') {
    return (
      <div className="admin-page-container">
        <div className="admin-page-header">
          <h2>{getTabTitle()}</h2>
          <button onClick={saveSettings} className="admin-btn primary">Save Settings</button>
        </div>

        {loading ? (
          <div className="admin-loading">Loading settings...</div>
        ) : (
          <div className="admin-settings-grid">
            <div className="admin-form-card">
              <h3>Site Information</h3>
              <div className="admin-form-group">
                <label>Site Name</label>
                <input type="text" value={settings.siteName} onChange={(e) => setSettings(prev => ({ ...prev, siteName: e.target.value }))} className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Site URL</label>
                <input type="text" value={settings.siteUrl} onChange={(e) => setSettings(prev => ({ ...prev, siteUrl: e.target.value }))} placeholder="https://example.com" className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Support Email</label>
                <input type="email" value={settings.supportEmail} onChange={(e) => setSettings(prev => ({ ...prev, supportEmail: e.target.value }))} placeholder="support@example.com" className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Email Response Note</label>
                <input type="text" value={settings.emailResponseNote} onChange={(e) => setSettings(prev => ({ ...prev, emailResponseNote: e.target.value }))} placeholder="Response within 2 hours" className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Support Phone</label>
                <input type="text" value={settings.supportPhone} onChange={(e) => setSettings(prev => ({ ...prev, supportPhone: e.target.value }))} placeholder="+91 9876543210" className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Phone Hours</label>
                <input type="text" value={settings.phoneHours} onChange={(e) => setSettings(prev => ({ ...prev, phoneHours: e.target.value }))} placeholder="Mon–Sat, 9AM–6PM IST" className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Support WhatsApp</label>
                <input type="text" value={settings.supportWhatsapp} onChange={(e) => setSettings(prev => ({ ...prev, supportWhatsapp: e.target.value }))} placeholder="+91 9876543210" className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>WhatsApp Hours</label>
                <input type="text" value={settings.whatsappHours} onChange={(e) => setSettings(prev => ({ ...prev, whatsappHours: e.target.value }))} placeholder="Mon–Sat, 9AM–9PM IST" className="admin-input" />
              </div>
            </div>

            {/* Social pages — these drive the website footer icons and the
                user dashboard Contact page. Leave one blank to hide its icon. */}
            <div className="admin-form-card">
              <h3>Social Links <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>(footer + user Contact page; blank hides the icon)</span></h3>
              <div className="admin-form-group">
                <label>Instagram Page URL</label>
                <input type="text" value={settings.socialInstagram} onChange={(e) => setSettings(prev => ({ ...prev, socialInstagram: e.target.value }))} placeholder="https://www.instagram.com/yourpage" className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Facebook Page URL</label>
                <input type="text" value={settings.socialFacebook} onChange={(e) => setSettings(prev => ({ ...prev, socialFacebook: e.target.value }))} placeholder="https://www.facebook.com/yourpage" className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>YouTube Channel URL</label>
                <input type="text" value={settings.socialYoutube} onChange={(e) => setSettings(prev => ({ ...prev, socialYoutube: e.target.value }))} placeholder="https://youtube.com/@yourchannel" className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Telegram Channel URL</label>
                <input type="text" value={settings.socialTelegram} onChange={(e) => setSettings(prev => ({ ...prev, socialTelegram: e.target.value }))} placeholder="https://t.me/yourchannel" className="admin-input" />
              </div>
            </div>

            <div className="admin-form-card">
              <h3>Feature Toggles</h3>
              <div className="admin-toggle-group">
                <label className="admin-toggle">
                  <input type="checkbox" checked={settings.maintenanceMode} onChange={(e) => setSettings(prev => ({ ...prev, maintenanceMode: e.target.checked }))} />
                  <span>Maintenance Mode</span>
                </label>
              </div>
              <div className="admin-toggle-group">
                <label className="admin-toggle">
                  <input type="checkbox" checked={settings.registrationEnabled} onChange={(e) => setSettings(prev => ({ ...prev, registrationEnabled: e.target.checked }))} />
                  <span>User Registration Enabled</span>
                </label>
              </div>
            </div>

            <div className="admin-form-card">
              <h3>Transaction Limits</h3>
              <div className="admin-form-group">
                <label>Minimum Deposit (₹)</label>
                <input type="number" value={settings.minDeposit} onChange={(e) => setSettings(prev => ({ ...prev, minDeposit: parseInt(e.target.value) }))} className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Maximum Withdrawal (₹)</label>
                <input type="number" value={settings.maxWithdrawal} onChange={(e) => setSettings(prev => ({ ...prev, maxWithdrawal: parseInt(e.target.value) }))} className="admin-input" />
              </div>
            </div>

            {/* Legal / merchant contact block shown at the bottom of /contact-us.
                Editing these + Save updates the public website instantly. */}
            <div className="admin-form-card">
              <h3>Merchant / Legal Contact <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>(shown on the Contact Us page)</span></h3>
              <div className="admin-form-group">
                <label>Merchant Legal Entity Name</label>
                <input type="text" value={settings.legalEntityName} onChange={(e) => setSettings(prev => ({ ...prev, legalEntityName: e.target.value }))} placeholder="dhanfunded" className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Registered Address</label>
                <textarea value={settings.registeredAddress} onChange={(e) => setSettings(prev => ({ ...prev, registeredAddress: e.target.value }))} placeholder="Full registered address" className="admin-input" rows={3} />
              </div>
              <div className="admin-form-group">
                <label>Operational Address</label>
                <textarea value={settings.operationalAddress} onChange={(e) => setSettings(prev => ({ ...prev, operationalAddress: e.target.value }))} placeholder="Full operational address" className="admin-input" rows={3} />
              </div>
              <div className="admin-form-group">
                <label>Contact Telephone No</label>
                <input type="text" value={settings.contactPhone} onChange={(e) => setSettings(prev => ({ ...prev, contactPhone: e.target.value }))} placeholder="9499979997" className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Contact E-Mail ID</label>
                <input type="email" value={settings.contactEmail} onChange={(e) => setSettings(prev => ({ ...prev, contactEmail: e.target.value }))} placeholder="adsbft1@gmail.com" className="admin-input" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>{getTabTitle()}</h2>
      </div>
      <div className="admin-placeholder">
        <div className="placeholder-icon">⚙️</div>
        <p>This section is under development.</p>
      </div>
    </div>
  );
}

export default Settings;
