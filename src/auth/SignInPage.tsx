import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { WorkspaceShell } from '../workspace/WorkspaceShell';
import { fetchCurrentSession, performSignIn, performSignOut, type Session } from './auth';

export type SignInPageProps = {
  onShowReadiness?: () => void;
};

export function SignInPage({ onShowReadiness }: SignInPageProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCurrentSession(api).then((current) => {
      if (!cancelled) {
        setSession(current);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    const result = await performSignIn(api, username, password);
    setSubmitting(false);
    if (result.success) {
      setSession(result.session);
      setPassword('');
    } else {
      setErrorMessage(result.error);
    }
  }

  async function handleSignOut() {
    setSubmitting(true);
    await performSignOut(api);
    setSession(null);
    setSubmitting(false);
  }

  if (loading) {
    return (
      <main className="page" aria-busy="true">
        <p className="eyebrow">Local authentication</p>
        <h1>Checking session</h1>
        <p>Restoring existing session...</p>
      </main>
    );
  }

  if (session) {
    return (
      <WorkspaceShell
        session={session}
        onSignOut={() => void handleSignOut()}
        signingOut={submitting}
        onShowReadiness={onShowReadiness}
      />
    );
  }

  return (
    <main className="page">
      <div className="header-nav">
        <p className="eyebrow">Local authentication</p>
        {onShowReadiness && (
          <button type="button" className="link-button" onClick={onShowReadiness}>
            System status
          </button>
        )}
      </div>

      <section className="sign-in-section">
          <h1>Sign in locally</h1>
          <p className="lede">
            Development environment uses database-backed synthetic credentials.
          </p>

          {errorMessage && (
            <div role="alert" className="error-alert">
              {errorMessage}
            </div>
          )}

          <form onSubmit={(e) => void handleSignIn(e)} className="sign-in-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            <button type="submit" disabled={submitting || !username || !password}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </section>
    </main>
  );
}
