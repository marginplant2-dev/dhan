import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuEye, LuEyeOff } from 'react-icons/lu';
import AuthShell from './AuthShell';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

function ForgotPassword() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const sendCode = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Request failed');
        setLoading(false);
        return;
      }
      setSuccess(data.message || 'Check your email for a reset code.');
      setStep(2);
    } catch {
      setError('Server error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    const otpDigits = otp.trim();
    if (!/^\d{6}$/.test(otpDigits)) {
      setError('Enter the 6-digit code from your email');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          otp: otpDigits,
          newPassword,
          confirmPassword
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Reset failed');
        setLoading(false);
        return;
      }
      setSuccess(data.message || 'Password updated.');
      setStep(3);
    } catch {
      setError('Server error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={step === 3 ? 'Password updated' : 'Reset your password'}
      subtitle={
        step === 1 ? 'Enter your registered email and we will send you a 6-digit reset code.'
          : step === 2 ? 'Enter the code from your email and choose a new password.'
            : 'You can now sign in with your new password.'
      }
    >
      {step === 1 && (
        <form className="ac-form" onSubmit={sendCode}>
          {error && <div className="ac-error">{error}</div>}
          {success && <div className="ac-success">{success}</div>}

          <div className="ac-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <button type="submit" className="ac-submit" disabled={loading}>
            {loading && <span className="ac-spinner" />}
            {loading ? 'Sending…' : 'Send Reset Code'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form className="ac-form" onSubmit={resetPassword}>
          {error && <div className="ac-error">{error}</div>}
          {success && <div className="ac-success">{success}</div>}

          <div className="ac-field">
            <label htmlFor="otp">Reset code</label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="ac-otp-input"
              required
              autoComplete="one-time-code"
            />
          </div>

          <div className="ac-field">
            <label htmlFor="np">New password</label>
            <div className="ac-password-wrap">
              <input
                id="np"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="ac-password-toggle"
                onClick={() => setShowNewPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
              >
                {showNewPassword ? <LuEyeOff size={18} /> : <LuEye size={18} />}
              </button>
            </div>
          </div>

          <div className="ac-field">
            <label htmlFor="cp">Confirm password</label>
            <div className="ac-password-wrap">
              <input
                id="cp"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                className="ac-password-toggle"
                onClick={() => setShowConfirmPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <LuEyeOff size={18} /> : <LuEye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="ac-submit" disabled={loading}>
            {loading && <span className="ac-spinner" />}
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      )}

      {step === 3 && (
        <div className="ac-form">
          <div className="ac-success">{success || 'Password updated.'}</div>
          <Link to="/login" className="ac-submit" style={{ textDecoration: 'none' }}>
            Back to Sign In
          </Link>
        </div>
      )}

      <div className="ac-footer">
        <p><Link to="/login">← Back to sign in</Link></p>
      </div>
    </AuthShell>
  );
}

export default ForgotPassword;
