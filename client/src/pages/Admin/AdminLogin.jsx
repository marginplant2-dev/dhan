import { useState } from 'react';
import { LuEye, LuEyeOff, LuShieldCheck } from 'react-icons/lu';
import AuthShell from '../Auth/AuthShell';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function AdminLogin({ onLogin }) {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      if (data.success) {
        localStorage.setItem('dhanfunded-admin-token', data.token);
        localStorage.setItem('dhanfunded-admin-user', JSON.stringify(data.user));
        onLogin(data.user, data.token);
      }
    } catch {
      setError('Server not reachable. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      split={false}
      badge={<><LuShieldCheck size={12} /> Admin</>}
      title="Admin Console"
      subtitle="Restricted area. Authorised operators only."
      legal="All admin actions are logged against your account."
    >
      <form className="ac-form" onSubmit={handleSubmit}>
        {error && <div className="ac-error">{error}</div>}

        <div className="ac-field">
          <label htmlFor="username">Email or User ID</label>
          <input
            id="username"
            type="text"
            name="username"
            placeholder="admin@dhanfunded.com"
            value={formData.username}
            onChange={handleChange}
            required
            autoFocus
            autoComplete="username"
          />
        </div>

        <div className="ac-field">
          <label htmlFor="password">Password</label>
          <div className="ac-password-wrap">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              placeholder="Enter admin password"
              value={formData.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="ac-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label="Toggle password visibility"
            >
              {showPassword ? <LuEyeOff size={18} /> : <LuEye size={18} />}
            </button>
          </div>
        </div>

        <button type="submit" className="ac-submit" disabled={loading}>
          {loading && <span className="ac-spinner" />}
          {loading ? 'Signing in…' : 'Sign In to Admin'}
        </button>
      </form>

      <div className="ac-footer">
        <p><a href="/">← Back to DhanFunded</a></p>
        <p className="ac-links">
          <a href="/subadmin">Sub-Admin login</a> · <a href="/broker">Broker login</a>
        </p>
      </div>
    </AuthShell>
  );
}

export default AdminLogin;
