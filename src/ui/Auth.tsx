import { useState } from 'react';
import { signInWithMagicLink, isEmailAllowlisted } from '../services/supabase';
import './Auth.css';

interface AuthProps {
  onAuthSuccess: () => void;
}

export function Auth({ onAuthSuccess }: AuthProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Please enter your email address' });
      return;
    }

    if (!isEmailAllowlisted(email)) {
      setMessage({ type: 'error', text: 'This email is not authorized to access the app' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    const { error } = await signInWithMagicLink(email);

    setIsLoading(false);

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({
        type: 'success',
        text: 'Check your email for the magic link!',
      });
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Travel Atlas</h1>
          <p>Myles + Viktoria's shared travel map</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={isLoading}
            />
          </div>

          {message && (
            <div className={`message ${message.type}`}>
              {message.text}
            </div>
          )}

          <button type="submit" disabled={isLoading} className="submit-btn">
            {isLoading ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Only authorized users can access this app.</p>
        </div>
      </div>
    </div>
  );
}

export default Auth;
