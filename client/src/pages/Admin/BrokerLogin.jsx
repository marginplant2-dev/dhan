import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuEye, LuEyeOff, LuBriefcase } from 'react-icons/lu';
import AuthShell from '../Auth/AuthShell';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function BrokerLogin() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
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
      const res = await fetch(`${API_URL}/api/admin/auth/login`, {
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

      if (data.success && data.admin) {
        // Check if this is a broker
        if (data.admin.role !== 'broker') {
          setError('Access denied. This login is for Brokers only.');
          setLoading(false);
          return;
        }

        // Store admin data
        localStorage.setItem('dhanfunded-admin-token', 'admin-' + data.admin._id);
        localStorage.setItem('dhanfunded-admin-user', JSON.stringify(data.admin));
        localStorage.setItem('dhanfunded-admin', JSON.stringify(data.admin));
        navigate('/broker-panel');
        window.location.reload();
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
      badge={<><LuBriefcase size={12} /> Broker</>}
      title="Broker Login"
      subtitle="Access your client book, trades and fund requests."
    >
      <form className="ac-form" onSubmit={handleSubmit}>
        {error && <div className="ac-error">{error}</div>}

        <div className="ac-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            name="email"
            placeholder="you@dhanfunded.com"
            value={formData.email}
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
              placeholder="Enter your password"
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
          {loading ? 'Signing in…' : 'Sign In as Broker'}
        </button>
      </form>

      <div className="ac-footer">
        <p><a href="/">← Back to DhanFunded</a></p>
        <p className="ac-links">
          <a href="/subadmin">Sub-Admin login</a> · <a href="/admin">Admin login</a>
        </p>
      </div>
    </AuthShell>
  );
}

export default BrokerLogin;
