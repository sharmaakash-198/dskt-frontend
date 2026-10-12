import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { RoleCode } from '../auth/auth';
import {
  GRANTABLE_ROLES,
  createManagedUser,
  deactivateManagedUser,
  grantManagedRole,
  listManagedUsers,
  reclaimEditorLeases,
  revokeManagedRole,
  type GrantableRole,
  type ManagedUserView,
} from './api';

const ROLE_LABELS: Record<RoleCode, string> = {
  SYSTEM_ADMIN: 'System Admin',
  FACILITIES_ADMIN: 'Facilities Admin',
  WORKPLACE_PLANNER: 'Workplace Planner',
  VIEWER: 'Viewer',
};

export function AccessAdminPanel() {
  const [users, setUsers] = useState<ManagedUserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listManagedUsers(api).then((result) => {
      if (cancelled) {
        return;
      }
      setLoading(false);
      if (result.ok) {
        setUsers(result.users);
      } else {
        setErrorMessage(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function replaceUser(view: ManagedUserView) {
    setUsers((current) => {
      const index = current.findIndex((item) => item.user.id === view.user.id);
      if (index === -1) {
        return [...current, view];
      }
      const next = current.slice();
      next[index] = view;
      return next;
    });
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setErrorMessage(null);
    setNotice(null);
    const result = await createManagedUser(api, { email, displayName, username, password });
    setCreating(false);
    if (result.ok) {
      replaceUser(result.view);
      setEmail('');
      setDisplayName('');
      setUsername('');
      setPassword('');
      setNotice(`Created ${result.view.user.displayName}.`);
    } else {
      setErrorMessage(result.error);
    }
  }

  async function handleGrant(userId: string, role: GrantableRole) {
    setErrorMessage(null);
    setNotice(null);
    const result = await grantManagedRole(api, userId, role);
    if (result.ok) {
      replaceUser(result.view);
    } else {
      setErrorMessage(result.error);
    }
  }

  async function handleRevoke(userId: string, role: GrantableRole) {
    setErrorMessage(null);
    setNotice(null);
    const result = await revokeManagedRole(api, userId, role);
    if (result.ok) {
      replaceUser(result.view);
    } else {
      setErrorMessage(result.error);
    }
  }

  async function handleDeactivate(userId: string) {
    setErrorMessage(null);
    setNotice(null);
    const result = await deactivateManagedUser(api, userId);
    if (result.ok) {
      replaceUser(result.view);
      setNotice(`${result.view.user.displayName} is inactive.`);
    } else {
      setErrorMessage(result.error);
    }
  }

  async function handleReclaim(userId: string, display: string) {
    setErrorMessage(null);
    setNotice(null);
    const result = await reclaimEditorLeases(api, userId);
    if (result.ok) {
      setNotice(`Reclaimed ${result.reclaimed} editor leases for ${display}.`);
    } else {
      setErrorMessage(result.error);
    }
  }

  return (
    <section className="admin-panel" aria-label="Access administration">
      <h2>Local users</h2>
      {errorMessage && (
        <p role="alert" className="error-alert">
          {errorMessage}
        </p>
      )}
      {notice && <p className="notice">{notice}</p>}

      <form className="sign-in-form" onSubmit={(event) => void handleCreate(event)}>
        <div className="form-group">
          <label htmlFor="new-email">Email</label>
          <input
            id="new-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="new-display-name">Display name</label>
          <input
            id="new-display-name"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="new-username">Username</label>
          <input
            id="new-username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="new-password">Initial password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <button type="submit" disabled={creating}>
          {creating ? 'Creating user...' : 'Create user'}
        </button>
      </form>

      {loading && <p>Loading users...</p>}
      {!loading && users.length === 0 && !errorMessage && <p>No local users yet.</p>}

      <ul className="admin-user-list">
        {users.map((view) => (
          <UserRow
            key={view.user.id}
            view={view}
            onGrant={handleGrant}
            onRevoke={handleRevoke}
            onDeactivate={handleDeactivate}
            onReclaim={handleReclaim}
          />
        ))}
      </ul>
    </section>
  );
}

function UserRow({
  view,
  onGrant,
  onRevoke,
  onDeactivate,
  onReclaim,
}: {
  view: ManagedUserView;
  onGrant: (userId: string, role: GrantableRole) => Promise<void>;
  onRevoke: (userId: string, role: GrantableRole) => Promise<void>;
  onDeactivate: (userId: string) => Promise<void>;
  onReclaim: (userId: string, displayName: string) => Promise<void>;
}) {
  const [role, setRole] = useState<GrantableRole>('VIEWER');
  const granted = new Set(view.roles);

  return (
    <li className="admin-user">
      <h3>{view.user.displayName}</h3>
      <p>{view.user.email}</p>
      <p>{view.user.active ? 'Active' : 'Inactive'}</p>
      <p>
        Roles:{' '}
        {view.roles.length === 0 ? 'none' : view.roles.map((item) => ROLE_LABELS[item]).join(', ')}
      </p>
      <div className="admin-actions">
        <label htmlFor={`grant-${view.user.id}`}>Grant role</label>
        <select
          id={`grant-${view.user.id}`}
          value={role}
          onChange={(event) => setRole(event.target.value as GrantableRole)}
        >
          {GRANTABLE_ROLES.map((item) => (
            <option key={item} value={item}>
              {ROLE_LABELS[item]}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void onGrant(view.user.id, role)}>
          Grant
        </button>
        {GRANTABLE_ROLES.filter((item) => granted.has(item)).map((item) => (
          <button key={item} type="button" onClick={() => void onRevoke(view.user.id, item)}>
            Revoke {ROLE_LABELS[item]}
          </button>
        ))}
        {view.user.active && (
          <button type="button" onClick={() => void onDeactivate(view.user.id)}>
            Deactivate {view.user.displayName}
          </button>
        )}
        {!view.user.active && (
          <button type="button" onClick={() => void onReclaim(view.user.id, view.user.displayName)}>
            Reclaim editor leases
          </button>
        )}
      </div>
    </li>
  );
}
