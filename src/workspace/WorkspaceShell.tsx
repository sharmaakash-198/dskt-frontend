import { useEffect, useState } from 'react';
import { AccessAdminPanel } from '../access-admin/AccessAdminPanel';
import { api } from '../api/client';
import { SitesPanel } from '../sites/SitesPanel';
import { TemplatesCatalog } from '../templates/TemplatesCatalog';
import {
  enterWorkspace,
  type NavigationKey,
  type Session,
  type WorkspaceEntry,
} from '../auth/auth';

const NAV_LABELS: Record<NavigationKey, string> = {
  facilities: 'Facilities',
  workplace: 'Workplace',
  viewer: 'Viewer',
  access_admin: 'Access administration',
};

export type WorkspaceShellProps = {
  session: Session;
  onSignOut: () => void;
  signingOut?: boolean;
  onShowReadiness?: () => void;
};

export function WorkspaceShell({
  session,
  onSignOut,
  signingOut = false,
  onShowReadiness,
}: WorkspaceShellProps) {
  const [selected, setSelected] = useState<NavigationKey | null>(session.navigation[0] ?? null);
  const [entry, setEntry] = useState<WorkspaceEntry | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(session.navigation.length > 0);

  useEffect(() => {
    if (!selected) {
      return;
    }
    let cancelled = false;
    void enterWorkspace(api, selected).then((result) => {
      if (cancelled) {
        return;
      }
      setLoading(false);
      if (result.ok) {
        setEntry(result.entry);
        setDenied(false);
      } else {
        setEntry(null);
        setDenied(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  function selectWorkspace(key: NavigationKey) {
    setSelected(key);
    setEntry(null);
    setDenied(false);
    setLoading(true);
  }

  return (
    <main className="page">
      <div className="header-nav">
        <p className="eyebrow">Workspace</p>
        {onShowReadiness && (
          <button type="button" className="link-button" onClick={onShowReadiness}>
            System status
          </button>
        )}
      </div>

      <section className="session-card" aria-label="Authenticated session">
        <h1>Welcome, {session.user.displayName}</h1>
        <p className="lede">{session.user.email}</p>
        <button type="button" onClick={onSignOut} disabled={signingOut}>
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </section>

      {session.navigation.length === 0 ? (
        <p role="alert" className="error-alert">
          You do not have access to a workspace.
        </p>
      ) : (
        <>
          <nav className="workspace-nav" aria-label="Workspaces">
            {session.navigation.map((key) => (
              <button
                key={key}
                type="button"
                aria-current={key === selected ? 'page' : undefined}
                onClick={() => selectWorkspace(key)}
              >
                {NAV_LABELS[key]}
              </button>
            ))}
          </nav>
          {loading && <p>Loading workspace...</p>}
          {denied && (
            <p role="alert" className="error-alert">
              You do not have access to this workspace.
            </p>
          )}
          {entry && selected === 'access_admin' && <AccessAdminPanel />}
          {entry &&
            (selected === 'facilities' || selected === 'workplace' || selected === 'viewer') && (
              <>
                <SitesPanel
                  canMutate={
                    selected === 'facilities' && session.roles.includes('FACILITIES_ADMIN')
                  }
                />
                <TemplatesCatalog
                  canMutate={
                    selected === 'facilities' && session.roles.includes('FACILITIES_ADMIN')
                  }
                />
              </>
            )}
        </>
      )}
    </main>
  );
}
