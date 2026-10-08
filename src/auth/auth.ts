import type { Client } from 'openapi-fetch';
import type { paths } from '../api/schema';

export type User = {
  id: string;
  email: string;
  displayName: string;
};

export async function fetchCurrentSession(client: Client<paths>): Promise<User | null> {
  try {
    const { data, response } = await client.GET('/auth/session');
    if (response.ok && data) {
      return data.user;
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
): Promise<{ success: true; user: User } | { success: false; error: string }> {
  try {
    const { data, response } = await client.POST('/auth/local/sign-in', {
      body: { username, password },
    });
    if (response.ok && data) {
      return { success: true, user: data.user };
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
