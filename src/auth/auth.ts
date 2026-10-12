import type { Client } from 'openapi-fetch';
import type { paths } from '../api/schema';

export type User = {
  id: string;
  email: string;
  displayName: string;
};

export type RoleCode = 'SYSTEM_ADMIN' | 'FACILITIES_ADMIN' | 'WORKPLACE_PLANNER' | 'VIEWER';

export type NavigationKey = 'facilities' | 'workplace' | 'viewer' | 'access_admin';

export type Session = {
  user: User;
  roles: RoleCode[];
  navigation: NavigationKey[];
};

export type WorkspaceEntry = {
  workspace: NavigationKey;
  title: string;
  emptyState: string;
};

const WORKSPACE_PATH = {
  facilities: '/workspace/facilities',
  workplace: '/workspace/workplace',
  viewer: '/workspace/viewer',
  access_admin: '/workspace/access-admin',
} as const satisfies Record<NavigationKey, keyof paths>;

type SessionBody = {
  user: User;
  roles?: RoleCode[];
  navigation?: NavigationKey[];
};

function toSession(data: SessionBody): Session {
  return {
    user: data.user,
    roles: data.roles ?? [],
    navigation: data.navigation ?? [],
  };
}

export async function fetchCurrentSession(client: Client<paths>): Promise<Session | null> {
  try {
    const { data, response } = await client.GET('/auth/session');
    if (response.ok && data && 'user' in data) {
      return toSession(data);
    }
  } catch {
    // network or parse error treats session as unauthenticated
  }
  return null;
}

export async function performSignIn(
  client: Client<paths>,
  username: string,
  password: string,
): Promise<{ success: true; session: Session } | { success: false; error: string }> {
  try {
    const { data, response } = await client.POST('/auth/local/sign-in', {
      body: { username, password },
    });
    if (response.ok && data && 'user' in data) {
      return { success: true, session: toSession(data) };
    }
  } catch {
    // network failure returns generic error
  }
  return { success: false, error: 'Invalid username or password.' };
}

export async function performSignOut(client: Client<paths>): Promise<void> {
  try {
    await client.POST('/auth/sign-out');
  } catch {
    // best-effort sign out
  }
}

export async function enterWorkspace(
  client: Client<paths>,
  key: NavigationKey,
): Promise<
  | { ok: true; entry: WorkspaceEntry }
  | { ok: false; error: 'unauthorized' | 'forbidden' | 'unavailable' }
> {
  try {
    const { data, response } = await client.GET(WORKSPACE_PATH[key]);
    if (response.ok && data && 'emptyState' in data && 'title' in data) {
      return { ok: true, entry: data };
    }
    if (response.status === 401) {
      return { ok: false, error: 'unauthorized' };
    }
    if (response.status === 403) {
      return { ok: false, error: 'forbidden' };
    }
  } catch {
    // network failure is treated as unavailable
  }
  return { ok: false, error: 'unavailable' };
}
