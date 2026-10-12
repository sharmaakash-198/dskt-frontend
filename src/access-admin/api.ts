import type { Client } from 'openapi-fetch';
import type { paths } from '../api/schema';
import type { RoleCode } from '../auth/auth';

export const GRANTABLE_ROLES = ['FACILITIES_ADMIN', 'WORKPLACE_PLANNER', 'VIEWER'] as const;

export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

export type ManagedUser = {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
};

export type ManagedUserView = {
  user: ManagedUser;
  roles: RoleCode[];
};

const ERROR_COPY: Record<string, string> = {
  role_already_granted: 'That role is already granted.',
  role_not_granted: 'That role is not currently granted.',
  username_taken: 'That username is already in use.',
  email_taken: 'That email is already in use.',
  user_already_inactive: 'This user is already inactive.',
  user_still_active: 'Deactivate the user before reclaiming editor leases.',
  user_not_found: 'That user was not found.',
  role_not_grantable: 'That role cannot be granted from this workspace.',
  organization_missing: 'The organization is not ready for local users.',
  forbidden: 'You cannot administer access.',
  unauthorized: 'Your session is no longer valid.',
};

export function accessAdminErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return ERROR_COPY[data.error] ?? fallback;
  }
  return fallback;
}

function isUserView(data: unknown): data is ManagedUserView {
  return Boolean(data && typeof data === 'object' && 'user' in data && 'roles' in data);
}

export async function listManagedUsers(
  client: Client<paths>,
): Promise<{ ok: true; users: ManagedUserView[] } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.GET('/access-admin/users');
    if (response.ok && data && 'users' in data) {
      return { ok: true, users: data.users };
    }
    return { ok: false, error: accessAdminErrorMessage(data, 'Users are unavailable.') };
  } catch {
    return { ok: false, error: 'Users are unavailable.' };
  }
}

export async function createManagedUser(
  client: Client<paths>,
  body: { email: string; displayName: string; username: string; password: string },
): Promise<{ ok: true; view: ManagedUserView } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/access-admin/users', { body });
    if (response.ok && isUserView(data)) {
      return { ok: true, view: data };
    }
    return { ok: false, error: accessAdminErrorMessage(data, 'Could not create that user.') };
  } catch {
    return { ok: false, error: 'Could not create that user.' };
  }
}

export async function grantManagedRole(
  client: Client<paths>,
  userId: string,
  role: GrantableRole,
): Promise<{ ok: true; view: ManagedUserView } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/access-admin/users/{userId}/roles', {
      params: { path: { userId } },
      body: { role },
    });
    if (response.ok && isUserView(data)) {
      return { ok: true, view: data };
    }
    return { ok: false, error: accessAdminErrorMessage(data, 'Could not grant that role.') };
  } catch {
    return { ok: false, error: 'Could not grant that role.' };
  }
}

export async function revokeManagedRole(
  client: Client<paths>,
  userId: string,
  role: GrantableRole,
): Promise<{ ok: true; view: ManagedUserView } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.DELETE(
      '/access-admin/users/{userId}/roles/{role}',
      { params: { path: { userId, role } } },
    );
    if (response.ok && isUserView(data)) {
      return { ok: true, view: data };
    }
    return { ok: false, error: accessAdminErrorMessage(data, 'Could not revoke that role.') };
  } catch {
    return { ok: false, error: 'Could not revoke that role.' };
  }
}

export async function deactivateManagedUser(
  client: Client<paths>,
  userId: string,
): Promise<{ ok: true; view: ManagedUserView } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/access-admin/users/{userId}/deactivate', {
      params: { path: { userId } },
    });
    if (response.ok && isUserView(data)) {
      return { ok: true, view: data };
    }
    return { ok: false, error: accessAdminErrorMessage(data, 'Could not deactivate that user.') };
  } catch {
    return { ok: false, error: 'Could not deactivate that user.' };
  }
}

export async function reclaimEditorLeases(
  client: Client<paths>,
  userId: string,
): Promise<{ ok: true; reclaimed: number } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST(
      '/access-admin/users/{userId}/editor-leases/reclaim',
      { params: { path: { userId } } },
    );
    if (response.ok && data && 'reclaimed' in data) {
      return { ok: true, reclaimed: data.reclaimed };
    }
    return { ok: false, error: accessAdminErrorMessage(data, 'Could not reclaim editor leases.') };
  } catch {
    return { ok: false, error: 'Could not reclaim editor leases.' };
  }
}
