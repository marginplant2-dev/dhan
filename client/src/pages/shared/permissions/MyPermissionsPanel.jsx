import { useEffect, useState } from 'react';
import PermissionPicker from '../../Admin/pages/PermissionPicker';

/**
 * Read-only "what can I do" panel. Renders in sub-admin and broker settings
 * pages so each admin can audit the exact permission set the super-admin (or
 * parent sub-admin) granted them.
 *
 * Fetches /api/admin/auth/me on mount so the view is always fresh — not stale
 * localStorage from an old login. Falls back to the passed-in user if the
 * network call fails.
 */
export default function MyPermissionsPanel({ API_URL, fallbackUser }) {
  const [admin, setAdmin] = useState(fallbackUser || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/admin/auth/me`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        if (cancelled) return;
        if (data?.success && data.admin) setAdmin(data.admin);
        else setError('Could not load permissions');
      })
      .catch(() => {
        if (cancelled) return;
        setError('Using cached permissions — refresh to see latest');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [API_URL]);

  const enabledCount = admin?.permissions
    ? Object.values(admin.permissions).filter(Boolean).length
    : 0;

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 24, marginTop: 24, border: '1px solid var(--border-color, var(--border))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>My Permissions</h3>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Read-only view of what you're authorized to do. Granted by your parent admin.
            {admin?.role && <> · Role: <strong style={{ color: 'var(--text-primary)' }}>{admin.role}</strong></>}
          </div>
        </div>
        <div style={{ padding: '6px 12px', borderRadius: 10, background: 'rgba(59,130,246,0.12)', color: '#3b82f6', fontWeight: 600, fontSize: 12 }}>
          {enabledCount} enabled
        </div>
      </div>

      {error && (
        <div style={{ padding: 10, borderRadius: 6, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading && !admin && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading permissions…
        </div>
      )}

      {admin && (
        <PermissionPicker
          value={admin.permissions || {}}
          onChange={() => {}}
          role={admin.role}
          readOnly
        />
      )}
    </div>
  );
}
