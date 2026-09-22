import { useState, useEffect } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';
import EmailTemplatesPanel from './EmailTemplatesPanel';

function Notifications() {
  const { API_URL } = useOutletContext();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newNotification, setNewNotification] = useState({
    title: '',
    message: '',
    type: 'info',
    image: '',
    targetMode: 'all', // 'all' | 'specific'
    channel: 'push'    // 'push' (in-app) | 'email' (real email to inbox)
  });
  // Selected user objects when targeting specific users (shown as chips)
  const [selectedUsers, setSelectedUsers] = useState([]);
  // User search
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);

  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('/email')) return 'email-templates';
    return 'push-notifications';
  };

  const activeTab = getActiveTab();

  const getTabTitle = () => {
    const titles = {
      'push-notifications': 'Push Notifications',
      'email-templates': 'Email Templates'
    };
    return titles[activeTab] || 'Notifications';
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/notifications`);
      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Debounced user search when targeting specific users
  useEffect(() => {
    if (newNotification.targetMode !== 'specific') return;
    const q = userSearchQuery.trim();
    if (q.length < 2) {
      setUserSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setUserSearchLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/admin/users/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await res.json();
        if (data.success) setUserSearchResults(data.users || []);
      } catch (err) {
        if (err.name !== 'AbortError') console.error('User search failed:', err);
      } finally {
        setUserSearchLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [userSearchQuery, newNotification.targetMode, API_URL]);

  const addSelectedUser = (user) => {
    setSelectedUsers(prev => (prev.some(u => u._id === user._id) ? prev : [...prev, user]));
    setUserSearchQuery('');
    setUserSearchResults([]);
  };

  const removeSelectedUser = (userId) => {
    setSelectedUsers(prev => prev.filter(u => u._id !== userId));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be smaller than 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setNewNotification(prev => ({ ...prev, image: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const sendNotification = async () => {
    const isEmail = newNotification.channel === 'email';
    if (!newNotification.title || !newNotification.message) {
      alert(isEmail ? 'Please fill the email subject and message' : 'Please fill title and message');
      return;
    }
    const targetUserIds = newNotification.targetMode === 'specific'
      ? selectedUsers.map(u => u.oderId).filter(Boolean)
      : [];
    if (newNotification.targetMode === 'specific' && targetUserIds.length === 0) {
      alert('Please select at least one user');
      return;
    }
    if (isEmail && newNotification.targetMode === 'all' &&
        !window.confirm('Send this email to ALL users? This goes to every registered inbox.')) return;

    setSending(true);
    try {
      const url = isEmail ? `${API_URL}/api/admin/send-email` : `${API_URL}/api/admin/notifications/send`;
      const body = isEmail
        ? { subject: newNotification.title, message: newNotification.message, targetUserIds }
        : { title: newNotification.title, message: newNotification.message, type: newNotification.type, image: newNotification.image || null, targetUserIds };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        alert(isEmail ? (data.message || 'Email sent') : 'Notification sent successfully');
        setNewNotification({ title: '', message: '', type: 'info', image: '', targetMode: 'all', channel: newNotification.channel });
        setSelectedUsers([]);
        setUserSearchQuery('');
        setUserSearchResults([]);
        if (!isEmail) fetchNotifications();
      } else {
        alert(data.error || (isEmail ? 'Failed to send email' : 'Failed to send notification'));
      }
    } catch (error) {
      console.error('Error sending:', error);
      alert(isEmail ? 'Failed to send email' : 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  const deleteNotification = async (id) => {
    if (!confirm('Delete this notification? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/notifications/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setNotifications(prev => prev.filter(n => n._id !== id));
      } else {
        alert(data.error || 'Failed to delete notification');
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
      alert('Failed to delete notification');
    }
  };

  useEffect(() => {
    if (activeTab === 'push-notifications') {
      fetchNotifications();
    }
  }, [activeTab]);

  if (activeTab === 'push-notifications') {
    return (
      <div className="admin-page-container">
        <div className="admin-page-header">
          <h2>{getTabTitle()}</h2>
        </div>

        <div className="admin-form-card">
          <h3>Send New Notification</h3>

          {/* Channel: in-app push vs real email to the user's inbox */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {[{ k: 'push', l: '📱 In-App Push' }, { k: 'email', l: '📧 Email to Inbox' }].map(c => (
              <button
                key={c.k}
                type="button"
                onClick={() => setNewNotification(prev => ({ ...prev, channel: c.k }))}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: newNotification.channel === c.k ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                  background: newNotification.channel === c.k ? 'rgba(59,130,246,0.12)' : 'var(--bg-primary)',
                  color: newNotification.channel === c.k ? '#3b82f6' : 'var(--text-primary)'
                }}
              >{c.l}</button>
            ))}
          </div>

          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>{newNotification.channel === 'email' ? 'Subject' : 'Title'}</label>
              <input type="text" value={newNotification.title} onChange={(e) => setNewNotification(prev => ({ ...prev, title: e.target.value }))} placeholder={newNotification.channel === 'email' ? 'Email subject' : 'Notification title'} className="admin-input" />
            </div>
            {newNotification.channel !== 'email' && (
              <div className="admin-form-group">
                <label>Type</label>
                <select value={newNotification.type} onChange={(e) => setNewNotification(prev => ({ ...prev, type: e.target.value }))} className="admin-select">
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
              </div>
            )}
            <div className="admin-form-group">
              <label>Send To</label>
              <select
                value={newNotification.targetMode}
                onChange={(e) => setNewNotification(prev => ({ ...prev, targetMode: e.target.value }))}
                className="admin-select"
              >
                <option value="all">All Users</option>
                <option value="specific">Specific User(s)</option>
              </select>
            </div>
          </div>
          {newNotification.targetMode === 'specific' && (
            <div className="admin-form-group" style={{ marginTop: 12, width: '100%', position: 'relative' }}>
              <label>Select Users</label>
              {selectedUsers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {selectedUsers.map(u => (
                    <span
                      key={u._id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 8px 4px 10px',
                        borderRadius: 999,
                        background: 'var(--accent-primary, #3b82f6)',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600
                      }}
                    >
                      {u.name || u.email || u.oderId}
                      <small style={{ opacity: 0.8, fontWeight: 400 }}>#{u.oderId}</small>
                      <button
                        type="button"
                        onClick={() => removeSelectedUser(u._id)}
                        style={{
                          background: 'rgba(255,255,255,0.25)',
                          color: '#fff',
                          border: 'none',
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          cursor: 'pointer',
                          fontSize: 12,
                          lineHeight: 1,
                          padding: 0
                        }}
                        aria-label={`Remove ${u.name || u.oderId}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search by name, email, oderId, or phone (min 2 chars)"
                className="admin-input"
              />
              {(userSearchResults.length > 0 || userSearchLoading) && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    maxHeight: 260,
                    overflowY: 'auto',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    zIndex: 50
                  }}
                >
                  {userSearchLoading ? (
                    <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 13 }}>Searching…</div>
                  ) : (
                    userSearchResults.map(u => {
                      const already = selectedUsers.some(s => s._id === u._id);
                      return (
                        <button
                          key={u._id}
                          type="button"
                          disabled={already}
                          onClick={() => addSelectedUser(u)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            padding: '10px 12px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px solid var(--border-color)',
                            color: already ? 'var(--text-muted)' : 'var(--text-primary)',
                            cursor: already ? 'default' : 'pointer',
                            textAlign: 'left',
                            fontSize: 13
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>{u.name || '(no name)'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              {u.email} · #{u.oderId}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {already ? 'Added' : 'Add'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
          <div className="admin-form-group" style={{ marginTop: 12, width: '100%' }}>
            <label>Message</label>
            <textarea value={newNotification.message} onChange={(e) => setNewNotification(prev => ({ ...prev, message: e.target.value }))} placeholder="Notification message" className="admin-input" rows={3} style={{ width: '100%', resize: 'vertical' }} />
          </div>
          {newNotification.channel !== 'email' && (
          <div className="admin-form-group" style={{ marginTop: 12, width: '100%' }}>
            <label>Image (optional, max 2MB)</label>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="admin-input" />
            {newNotification.image && (
              <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
                <img
                  src={newNotification.image}
                  alt="Preview"
                  style={{ maxHeight: 120, maxWidth: 220, borderRadius: 8, border: '1px solid var(--border-color)' }}
                />
                <button
                  type="button"
                  onClick={() => setNewNotification(prev => ({ ...prev, image: '' }))}
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    border: 'none',
                    background: '#ef4444',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                  aria-label="Remove image"
                >
                  ×
                </button>
              </div>
            )}
          </div>
          )}
          {newNotification.channel === 'email' && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
              📧 This sends a real email to the recipient's inbox from the support address. Users get it in Gmail — not just in-app.
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <button onClick={sendNotification} className="admin-btn primary" disabled={sending}>
              {sending
                ? 'Sending…'
                : `${newNotification.channel === 'email' ? '📧 Email' : 'Send'} ${newNotification.targetMode === 'all' ? 'to All Users' : 'to Selected User(s)'}`}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="admin-loading">Loading notifications...</div>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Title</th>
                  <th>Message</th>
                  <th>Type</th>
                  <th>Sent To</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {notifications.length === 0 ? (
                  <tr><td colSpan="7" className="no-data">No notifications sent yet</td></tr>
                ) : (
                  notifications.map((notif, idx) => (
                    <tr key={notif._id || idx}>
                      <td>
                        {notif.image ? (
                          <img
                            src={notif.image}
                            alt=""
                            style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border-color)' }}
                          />
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>{notif.title}</td>
                      <td>{notif.message?.length > 50 ? `${notif.message.substring(0, 50)}…` : notif.message}</td>
                      <td><span className={`status-badge status-${notif.type}`}>{notif.type}</span></td>
                      <td>{notif.targetType === 'specific' ? `${notif.targetUsers?.length || 0} user(s)` : 'All Users'}</td>
                      <td>{new Date(notif.createdAt).toLocaleString()}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-btn danger"
                          onClick={() => deleteNotification(notif._id)}
                          style={{ padding: '4px 10px', fontSize: 12 }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'email-templates') {
    return (
      <div className="admin-page-container">
        <div className="admin-page-header email-tpl-page-header">
          <h2>{getTabTitle()}</h2>
          <span className="email-tpl-admin-badge">Admin mode</span>
        </div>
        <EmailTemplatesPanel />
      </div>
    );
  }

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>{getTabTitle()}</h2>
      </div>
      <div className="admin-placeholder">
        <div className="placeholder-icon">🔔</div>
        <p>This section is under development.</p>
      </div>
    </div>
  );
}

export default Notifications;
