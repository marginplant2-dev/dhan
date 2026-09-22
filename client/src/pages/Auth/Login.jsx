import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuEye, LuEyeOff } from 'react-icons/lu';
import AuthShell from './AuthShell';
import InstallAppButton from '../../components/InstallAppButton';
import tradingSounds from '../../utils/sounds';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function Login({ onLogin }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: '', password: '' });
  // A session that ran out sends the user here with ?expired=1. Saying so
  // beats dropping them on a blank login form with no explanation.
  const [error, setError] = useState(
    new URLSearchParams(window.location.search).get('expired')
      ? 'Your session ended. Please sign in again.'
      : ''
  );
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleInitialized = useRef(false);
  const googleBtnRef = useRef(null);

  const handleGoogleResponse = useCallback(async (response) => {
    if (!response?.credential) return;
    setGoogleLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Google login failed'); return; }
      const authData = { isAuthenticated: true, token: data.token, user: data.user };
      localStorage.setItem('dhanfunded-auth', JSON.stringify(authData));
      localStorage.setItem('dhanfunded-token', data.token);
      tradingSounds.playLogin();
      onLogin(authData);
      navigate('/app/challenges');
    } catch (err) {
      setError('Google login failed. Please try again.');
      console.error('Google login error:', err);
    } finally {
      setGoogleLoading(false);
    }
  }, [navigate, onLogin]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || googleInitialized.current) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        // Render Google's OFFICIAL sign-in button. Clicking it reliably fires
        // the credential callback (→ handleGoogleResponse → /auth/google).
        // The previous approach used One Tap prompt() + the deprecated
        // isNotDisplayed()/isSkippedMoment() checks + an implicit-redirect
        // fallback (response_type=id_token). One Tap is frequently suppressed
        // and those methods are deprecated under FedCM, so the button often
        // did nothing on click. renderButton has none of those problems.
        if (googleBtnRef.current) {
          googleBtnRef.current.innerHTML = '';
          // Match the form width instead of a fixed 320px, which read as a
          // stray box next to the full-width Sign In button. Google caps
          // renderButton at 400 and the widget can't shrink below its set
          // width, so clamp for narrow phones too.
          const w = Math.min(400, Math.max(240, googleBtnRef.current.offsetWidth || 320));
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'filled_black', // matches the dark auth card
            size: 'large',
            text: 'continue_with',
            shape: 'pill',
            logo_alignment: 'center',
            width: w,
          });
        }
        googleInitialized.current = true;
      }
    };
    document.head.appendChild(script);
    return () => { if (script.parentNode) script.parentNode.removeChild(script); };
  }, [handleGoogleResponse]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (!formData.username || !formData.password) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: formData.username, password: formData.password })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }
      const authData = { isAuthenticated: true, token: data.token, user: data.user };
      localStorage.setItem('dhanfunded-auth', JSON.stringify(authData));
      localStorage.setItem('dhanfunded-token', data.token);
      tradingSounds.playLogin();
      onLogin(authData);
      navigate('/app/challenges');
    } catch (err) {
      setError('Server error. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your DhanFunded account to trade your challenge."
      legal={<>Trading involves risk. Read the <a href="/risk-disclaimer">risk disclaimer</a> before you trade.</>}
    >
      <form className="ac-form" onSubmit={handleSubmit}>
        {error && <div className="ac-error">{error}</div>}

        <div className="ac-field">
          <label htmlFor="username">User ID / Email / Phone</label>
          <input
            type="text"
            id="username"
            name="username"
            value={formData.username}
            onChange={handleChange}
            placeholder="Enter your ID, email or phone"
            autoComplete="username"
          />
        </div>

        <div className="ac-field">
          <label htmlFor="password">Password</label>
          <div className="ac-password-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter your password"
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

        <div className="ac-row">
          <label className="ac-remember">
            <input type="checkbox" />
            <span>Remember me</span>
          </label>
          <Link to="/forgot-password" className="ac-forgot">Forgot Password?</Link>
        </div>

        <button type="submit" className="ac-submit" disabled={loading}>
          {loading && <span className="ac-spinner" />}
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        {GOOGLE_CLIENT_ID && (
          <>
            <div className="ac-divider"><span>or</span></div>
            <div style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }}>
              {/* Google renders its official button in here. The wrapper must be
                  full width or offsetWidth reads 0 and the width clamp above
                  falls back to 320. */}
              <div ref={googleBtnRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }} />
            </div>
            {googleLoading && (
              <div className="ac-hint" style={{ textAlign: 'center' }}>Signing in…</div>
            )}
          </>
        )}
      </form>

      <div className="ac-footer">
        <p>Don't have an account? <Link to="/register">Register Now</Link></p>
        <div className="ac-install-row">
          <InstallAppButton label="Install App" />
        </div>
      </div>
    </AuthShell>
  );
}

export default Login;
