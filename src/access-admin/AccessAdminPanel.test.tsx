import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessAdminPanel } from './AccessAdminPanel';

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    GET: (...args: unknown[]) => get(...args),
    POST: (...args: unknown[]) => post(...args),
    DELETE: (...args: unknown[]) => del(...args),
  },
}));

function jsonResponse(status: number) {
  return { ok: status >= 200 && status < 300, status };
}

const ada = {
  user: {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'ada@local.dskt',
    displayName: 'Ada',
    active: true,
    passwordHash: 'secret-hash',
    sessionToken: 'session-token',
  },
  roles: ['VIEWER'],
};

describe('AccessAdminPanel', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    del.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('lists users without showing password hashes or session tokens', async () => {
    get.mockResolvedValue({ data: { users: [ada] }, response: jsonResponse(200) });

    render(<AccessAdminPanel />);

    expect(await screen.findByRole('heading', { name: 'Ada' })).toBeInTheDocument();
    expect(screen.getByText('ada@local.dskt')).toBeInTheDocument();
    expect(screen.getByText('Roles: Viewer')).toBeInTheDocument();
    expect(screen.queryByText('secret-hash')).not.toBeInTheDocument();
    expect(screen.queryByText('session-token')).not.toBeInTheDocument();
  });

  it('creates a user and clears the initial password', async () => {
    get.mockResolvedValue({ data: { users: [] }, response: jsonResponse(200) });
    post.mockResolvedValue({
      data: {
        user: {
          id: '22222222-2222-2222-2222-222222222222',
          email: 'bea@local.dskt',
          displayName: 'Bea',
          active: true,
        },
        roles: [],
      },
      response: jsonResponse(201),
    });

    render(<AccessAdminPanel />);
    expect(await screen.findByText('No local users yet.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bea@local.dskt' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Bea' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'bea' } });
    fireEvent.change(screen.getByLabelText('Initial password'), {
      target: { value: 'out-of-band' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));

    expect(await screen.findByRole('heading', { name: 'Bea' })).toBeInTheDocument();
    expect(screen.getByLabelText('Initial password')).toHaveValue('');
    expect(screen.queryByText('out-of-band')).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/access-admin/users', {
      body: {
        email: 'bea@local.dskt',
        displayName: 'Bea',
        username: 'bea',
        password: 'out-of-band',
      },
    });
  });

  it('grants and revokes a product role', async () => {
    get.mockResolvedValue({ data: { users: [ada] }, response: jsonResponse(200) });
    post.mockResolvedValue({
      data: { ...ada, roles: ['VIEWER', 'FACILITIES_ADMIN'] },
      response: jsonResponse(200),
    });
    del.mockResolvedValue({
      data: { ...ada, roles: ['FACILITIES_ADMIN'] },
      response: jsonResponse(200),
    });

    render(<AccessAdminPanel />);
    expect(await screen.findByRole('heading', { name: 'Ada' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Grant role'), { target: { value: 'FACILITIES_ADMIN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Grant' }));
    expect(await screen.findByText('Roles: Viewer, Facilities Admin')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke Viewer' }));
    expect(await screen.findByText('Roles: Facilities Admin')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke Viewer' })).not.toBeInTheDocument();
  });

  it('deactivates a user and reclaims editor leases', async () => {
    get.mockResolvedValue({ data: { users: [ada] }, response: jsonResponse(200) });
    post.mockImplementation((path: string) => {
      if (path.endsWith('/deactivate')) {
        return Promise.resolve({
          data: { ...ada, user: { ...ada.user, active: false } },
          response: jsonResponse(200),
        });
      }
      return Promise.resolve({
        data: { reclaimed: 2 },
        response: jsonResponse(200),
      });
    });

    render(<AccessAdminPanel />);
    expect(await screen.findByRole('button', { name: 'Deactivate Ada' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Ada' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reclaim editor leases' }));
    expect(await screen.findByText('Reclaimed 2 editor leases for Ada.')).toBeInTheDocument();
  });

  it('shows a stable message when a username is already in use', async () => {
    get.mockResolvedValue({ data: { users: [] }, response: jsonResponse(200) });
    post.mockResolvedValue({
      data: { error: 'username_taken' },
      response: jsonResponse(409),
    });

    render(<AccessAdminPanel />);
    expect(await screen.findByText('No local users yet.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@local.dskt' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ada' } });
    fireEvent.change(screen.getByLabelText('Initial password'), {
      target: { value: 'out-of-band' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That username is already in use.');
  });
});
