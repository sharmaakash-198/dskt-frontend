import { useState } from 'react';
import { SignInPage } from './auth/SignInPage';
import { ReadinessPage } from './status/ReadinessPage';

export function App() {
  const [view, setView] = useState<'auth' | 'readiness'>('auth');

  if (view === 'readiness') {
    return <ReadinessPage onShowSignIn={() => setView('auth')} />;
  }

  return <SignInPage onShowReadiness={() => setView('readiness')} />;
}
