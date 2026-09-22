import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LuEye, LuEyeOff } from 'react-icons/lu';
import AuthShell from './AuthShell';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const countries = [
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+1', name: 'United States', flag: '🇺🇸' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '+971', name: 'UAE', flag: '🇦🇪' },
  { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: '+33', name: 'France', flag: '🇫🇷' },
  { code: '+81', name: 'Japan', flag: '🇯🇵' },
  { code: '+86', name: 'China', flag: '🇨🇳' },
  { code: '+82', name: 'South Korea', flag: '🇰🇷' },
  { code: '+7', name: 'Russia', flag: '🇷🇺' },
  { code: '+55', name: 'Brazil', flag: '🇧🇷' },
  { code: '+27', name: 'South Africa', flag: '🇿🇦' },
  { code: '+234', name: 'Nigeria', flag: '🇳🇬' },
  { code: '+254', name: 'Kenya', flag: '🇰🇪' },
  { code: '+60', name: 'Malaysia', flag: '🇲🇾' },
  { code: '+63', name: 'Philippines', flag: '🇵🇭' },
  { code: '+62', name: 'Indonesia', flag: '🇮🇩' },
  { code: '+66', name: 'Thailand', flag: '🇹🇭' },
  { code: '+84', name: 'Vietnam', flag: '🇻🇳' },
  { code: '+92', name: 'Pakistan', flag: '🇵🇰' },
  { code: '+880', name: 'Bangladesh', flag: '🇧🇩' },
  { code: '+94', name: 'Sri Lanka', flag: '🇱🇰' },
  { code: '+977', name: 'Nepal', flag: '🇳🇵' },
];

function Register({ onLogin }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [referralId, setReferralId] = useState('');
  // referralFromLink kept for future UI affordance; intentionally unused for now.
  const [, setReferralFromLink] = useState(false);
  const [formData, setFormData] = useState({
    name: '', email: '', countryCode: '+91', phone: '',
    password: '', confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [step, setStep] = useState('details');
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  // Server decides whether signup needs an email OTP (it only does when SMTP is
  // configured). Without this the button promised a code that never arrives —
  // send-signup-otp 503s and handleSendOtp quietly registers instead.
  const [otpRequired, setOtpRequired] = useState(null);
  const cooldownRef = useRef(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleInitialized = useRef(false);
  const googleBtnRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/auth/email-config`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setOtpRequired(!!d?.signupOtpRequired); })
      .catch(() => { if (!cancelled) setOtpRequired(false); });
    return () => { cancelled = true; };
  }, []);

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
      if (!res.ok) { setError(data.error || 'Google sign-up failed'); return; }
      const authData = { isAuthenticated: true, token: data.token, user: data.user };
      localStorage.setItem('dhanfunded-auth', JSON.stringify(authData));
      localStorage.setItem('dhanfunded-token', data.token);
      if (typeof onLogin === 'function') onLogin(authData);
      navigate('/app/challenges', { replace: true });
    } catch (err) {
      setError('Google sign-up failed. Please try again.');
      console.error('Google sign-up error:', err);
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
        // Google's OFFICIAL button, same as Login. The old custom button called
        // One Tap prompt() and branched on isNotDisplayed()/isSkippedMoment() —
        // both deprecated under FedCM — so it frequently did nothing on click.
        if (googleBtnRef.current) {
          googleBtnRef.current.innerHTML = '';
          const w = Math.min(400, Math.max(240, googleBtnRef.current.offsetWidth || 320));
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'filled_black',
            size: 'large',
            text: 'signup_with',
            shape: 'pill',
            logo_alignment: 'center',
            width: w,
          });
        }
        googleInitialized.current = true;
      }
    };
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, [handleGoogleResponse]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('id_token=')) {
      const params = new URLSearchParams(hash.substring(1));
      const idToken = params.get('id_token');
      if (idToken) {
        window.location.hash = '';
        handleGoogleResponse({ credential: idToken });
      }
    }
  }, [handleGoogleResponse]);

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) { setReferralId(ref); setReferralFromLink(true); }
  }, [searchParams]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    cooldownRef.current = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(cooldownRef.current);
  }, [resendCooldown]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      setFormData({ ...formData, phone: value.replace(/[^0-9]/g, '') });
    } else {
      setFormData({ ...formData, [name]: value });
    }
    setError('');
  };

  const selectedCountry = countries.find(c => c.code === formData.countryCode) || countries[0];

  const validateDetails = () => {
    if (!formData.name || !formData.email || !formData.phone || !formData.password || !formData.confirmPassword) {
      setError('Please fill in all required fields'); return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match'); return false;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters'); return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address'); return false;
    }
    return true;
  };

  const submitRegistration = async (otpCode) => {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        emailOtp: otpCode || undefined,
        parentAdminId: referralId || undefined
      })
    });
    return { response, data: await response.json() };
  };

  const handleSendOtp = async (e) => {
    e?.preventDefault?.();
    if (!validateDetails()) return;
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_URL}/auth/send-signup-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email })
      });
      const data = await res.json();
      if (res.status === 503) {
        const { response, data: regData } = await submitRegistration();
        finishRegistration(response, regData);
        return;
      }
      if (!res.ok) {
        setError(data.error || 'Could not send verification code'); setLoading(false); return;
      }
      setStep('otp');
      setResendCooldown(45);
    } catch {
      setError('Server error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRegister = async (e) => {
    e?.preventDefault?.();
    setError('');
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code from your email'); return;
    }
    setLoading(true);
    try {
      const { response, data } = await submitRegistration(otp);
      finishRegistration(response, data);
    } catch {
      setError('Server error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const finishRegistration = (response, data) => {
    if (!response.ok) {
      setError(data.error || 'Registration failed');
      return;
    }
    if (data.token && data.user) {
      const authData = { isAuthenticated: true, token: data.token, user: data.user };
      localStorage.setItem('dhanfunded-auth', JSON.stringify(authData));
      localStorage.setItem('dhanfunded-token', data.token);
      setSuccess(`Account created! Welcome, ${data.user.name || 'there'} · ID ${data.user.oderId}`);
      if (typeof onLogin === 'function') onLogin(authData);
      navigate('/app/challenges', { replace: true });
      return;
    }
    setSuccess(`Registration successful! Your User ID is: ${data.user?.oderId}. Redirecting to login…`);
    setTimeout(() => navigate('/login'), 2000);
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError(''); setSuccess(''); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/send-signup-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not resend code'); return; }
      setSuccess('A new code is on its way.');
      setResendCooldown(45);
    } catch {
      setError('Server error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={step === 'otp' ? 'Verify your email' : 'Create your account'}
      subtitle={step === 'otp'
        ? 'Enter the 6-digit code we just emailed you.'
        : 'Buy a challenge, prove your edge, trade a simulated account.'}
      legal={<>By registering you agree to our <a href="/terms">terms</a> and <a href="/privacy-policy">privacy policy</a>.</>}
    >
      {GOOGLE_CLIENT_ID && step === 'details' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }}>
            <div ref={googleBtnRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }} />
          </div>
          {googleLoading && (
            <div className="ac-hint" style={{ textAlign: 'center' }}>Signing up…</div>
          )}
          <div className="ac-divider"><span>or fill the form</span></div>
        </>
      )}

      {step === 'details' ? (
        <form className="ac-form ac-form--2col" onSubmit={handleSendOtp}>
          {error && <div className="ac-error">{error}</div>}
          {success && <div className="ac-success">{success}</div>}

          <div className="ac-field">
            <label htmlFor="name">Full Name <span className="ac-required">*</span></label>
            <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} placeholder="John Doe" autoComplete="name" />
          </div>

          <div className="ac-field">
            <label htmlFor="email">Email Address <span className="ac-required">*</span></label>
            <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" autoComplete="email" />
          </div>

          <div className="ac-field ac-field--full">
            <label htmlFor="phone">Phone Number <span className="ac-required">*</span></label>
            <div className="ac-phone-row">
              <select name="countryCode" value={formData.countryCode} onChange={handleChange}>
                {countries.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
              </select>
              <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange} placeholder="9876543210" autoComplete="tel" />
            </div>
            <span className="ac-hint">{selectedCountry.flag} {selectedCountry.name}</span>
          </div>

          <div className="ac-field">
            <label htmlFor="password">Password <span className="ac-required">*</span></label>
            <div className="ac-password-wrap">
              <input type={showPassword ? 'text' : 'password'} id="password" name="password" value={formData.password} onChange={handleChange} placeholder="Min. 6 chars" autoComplete="new-password" />
              <button type="button" className="ac-password-toggle" onClick={() => setShowPassword(!showPassword)} tabIndex={-1} aria-label="Toggle password">
                {showPassword ? <LuEyeOff size={18} /> : <LuEye size={18} />}
              </button>
            </div>
          </div>

          <div className="ac-field">
            <label htmlFor="confirmPassword">Confirm Password <span className="ac-required">*</span></label>
            <div className="ac-password-wrap">
              <input type={showConfirmPassword ? 'text' : 'password'} id="confirmPassword" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="Repeat it" autoComplete="new-password" />
              <button type="button" className="ac-password-toggle" onClick={() => setShowConfirmPassword(!showConfirmPassword)} tabIndex={-1} aria-label="Toggle password">
                {showConfirmPassword ? <LuEyeOff size={18} /> : <LuEye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="ac-submit" disabled={loading}>
            {loading && <span className="ac-spinner" />}
            {loading
              ? (otpRequired ? 'Sending code…' : 'Creating account…')
              : (otpRequired ? 'Send Verification Code' : 'Create Account')}
          </button>
        </form>
      ) : (
        <form className="ac-form" onSubmit={handleVerifyAndRegister}>
          {error && <div className="ac-error">{error}</div>}
          {success && <div className="ac-success">{success}</div>}

          <div className="ac-info">
            We sent a 6-digit code to <strong>{formData.email}</strong>. Enter it below to finish creating your account.
          </div>

          <div className="ac-field">
            <label htmlFor="otp">Verification Code <span className="ac-required">*</span></label>
            <input
              type="text"
              id="otp"
              name="otp"
              value={otp}
              onChange={(e) => { setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="ac-otp-input"
            />
            <span className="ac-hint">Code expires in 10 minutes.</span>
          </div>

          <button type="submit" className="ac-submit" disabled={loading || otp.length !== 6}>
            {loading && <span className="ac-spinner" />}
            {loading ? 'Verifying…' : 'Verify & Create Account'}
          </button>

          <div className="ac-row">
            <button
              type="button"
              className="ac-back"
              onClick={() => { setStep('details'); setOtp(''); setError(''); setSuccess(''); }}
            >
              ← Edit details
            </button>
            <button
              type="button"
              className="ac-link"
              onClick={handleResendOtp}
              disabled={resendCooldown > 0 || loading}
              style={{
                background: 'none', border: 'none', padding: 0,
                cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                color: resendCooldown > 0 ? 'var(--a-faint)' : 'var(--a-gold)',
              }}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}

      <div className="ac-footer">
        <p>Already have an account? <Link to="/login">Login</Link></p>
      </div>
    </AuthShell>
  );
}

export default Register;
