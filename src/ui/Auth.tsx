import { useState, useEffect } from 'react';
import {
  signInWithPassword,
  signInWithMagicLink,
  sendPasswordReset,
  updateMyPassword,
  isEmailAllowlisted,
} from '../services/supabase';
import './Auth.css';

type AuthMode = 'login' | 'reset-request' | 'set-password' | 'magic-link';

interface AuthProps {
  onAuthSuccess: () => void;
}

/**
 * Detect if we landed here from a password reset email.
 * Supabase appends #type=recovery to the URL.
 */
function isRecoveryMode(): boolean {
  const hash = window.location.hash;
  return hash.includes('type=recovery');
}

/**
 * Clean up recovery params from URL after handling.
 */
function clearRecoveryParams(): void {
  if (window.location.hash) {
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  }
}

export function Auth({ onAuthSuccess }: AuthProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check for recovery mode on mount
  useEffect(() => {
    if (isRecoveryMode()) {
      setMode('set-password');
      setMessage({ type: 'success', text: 'Set your new password below.' });
    }
  }, []);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Please enter your email address' });
      return;
    }

    if (!password) {
      setMessage({ type: 'error', text: 'Please enter your password' });
      return;
    }

    if (!isEmailAllowlisted(email)) {
      setMessage({ type: 'error', text: 'This email is not authorized to access the app' });
      return;
    }

    setIsLoading(true);
    const { error } = await signInWithPassword(email, password);
    setIsLoading(false);

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      onAuthSuccess();
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Please enter your email address' });
      return;
    }

    setIsLoading(true);
    const { error } = await sendPasswordReset(email);
    setIsLoading(false);

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Check your email for the password reset link!' });
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!password) {
      setMessage({ type: 'error', text: 'Please enter a password' });
      return;
    }

    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }

    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setIsLoading(true);
    const { error } = await updateMyPassword(password);
    setIsLoading(false);

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      clearRecoveryParams();
      setMessage({ type: 'success', text: 'Password set! Redirecting...' });
      setTimeout(() => onAuthSuccess(), 1000);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Please enter your email address' });
      return;
    }

    if (!isEmailAllowlisted(email)) {
      setMessage({ type: 'error', text: 'This email is not authorized to access the app' });
      return;
    }

    setIsLoading(true);
    const { error } = await signInWithMagicLink(email);
    setIsLoading(false);

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Check your email for the magic link!' });
    }
  };

  const renderForm = () => {
    switch (mode) {
      case 'login':
        return (
          <form onSubmit={handlePasswordLogin} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={isLoading}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>

            {message && <div className={`message ${message.type}`}>{message.text}</div>}

            <button type="submit" disabled={isLoading} className="submit-btn">
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="auth-links">
              <button type="button" className="link-btn" onClick={() => { setMode('reset-request'); setMessage(null); }}>
                Forgot password?
              </button>
              <button type="button" className="link-btn" onClick={() => { setMode('magic-link'); setMessage(null); }}>
                Use magic link instead
              </button>
            </div>
          </form>
        );

      case 'reset-request':
        return (
          <form onSubmit={handleResetRequest} className="auth-form">
            <p className="form-description">Enter your email and we'll send you a link to reset your password.</p>

            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={isLoading}
                autoComplete="email"
              />
            </div>

            {message && <div className={`message ${message.type}`}>{message.text}</div>}

            <button type="submit" disabled={isLoading} className="submit-btn">
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div className="auth-links">
              <button type="button" className="link-btn" onClick={() => { setMode('login'); setMessage(null); }}>
                ← Back to login
              </button>
            </div>
          </form>
        );

      case 'set-password':
        return (
          <form onSubmit={handleSetPassword} className="auth-form">
            <p className="form-description">Choose a new password for your account.</p>

            <div className="form-group">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>

            {message && <div className={`message ${message.type}`}>{message.text}</div>}

            <button type="submit" disabled={isLoading} className="submit-btn">
              {isLoading ? 'Setting password...' : 'Set Password'}
            </button>
          </form>
        );

      case 'magic-link':
        return (
          <form onSubmit={handleMagicLink} className="auth-form">
            <p className="form-description">We'll send a sign-in link to your email.</p>

            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={isLoading}
                autoComplete="email"
              />
            </div>

            {message && <div className={`message ${message.type}`}>{message.text}</div>}

            <button type="submit" disabled={isLoading} className="submit-btn">
              {isLoading ? 'Sending...' : 'Send Magic Link'}
            </button>

            <div className="auth-links">
              <button type="button" className="link-btn" onClick={() => { setMode('login'); setMessage(null); }}>
                ← Back to password login
              </button>
            </div>
          </form>
        );
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Travel Atlas</h1>
          <p>Myles + Viktoria's shared travel map</p>
        </div>

        {renderForm()}

        <div className="auth-footer">
          <p>Only authorized users can access this app.</p>
        </div>
      </div>
    </div>
  );
}

export default Auth;