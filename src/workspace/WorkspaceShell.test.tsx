import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../auth/auth';
import { WorkspaceShell } from './WorkspaceShell';

const get = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    GET: (...args: unknown[]) => get(...args),
  },
}));

function jsonResponse(status: number) {
  return { ok: status >= 200 && status < 300, status };
}

function session(navigation: Session['navigation'], roles: Session['roles'] = []): Session {
  return {
    user: {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'ada@local.dskt',
      displayName: 'Ada',
    },
    roles,
    navigation,
  };
}

describe('WorkspaceShell', () => {
  beforeEach(() => {
    get.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the Facilities empty state for a Facilities Admin', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/sites') {
        return Promise.resolve({ data: { sites: [] }, response: jsonResponse(200) });
      }
      if (path === '/element-categories') {
        return Promise.resolve({ data: { categories: [] }, response: jsonResponse(200) });
      }
      return Promise.resolve({
        data: {
          workspace: 'facilities',
          title: 'Facilities',
          emptyState: 'No sites yet.',
        },
        response: jsonResponse(200),
      });
    });

    render(
      <WorkspaceShell
        session={session(['facilities'], ['FACILITIES_ADMIN'])}
        onSignOut={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Facilities' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Workplace' })).not.toBeInTheDocument();
    expect(await screen.findByText('No active sites.')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/workspace/facilities');
  });

  it('shows a read-only location hierarchy for a Workplace Planner', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/sites') {
        return Promise.resolve({ data: { sites: [] }, response: jsonResponse(200) });
      }
      if (path === '/element-categories') {
        return Promise.resolve({ data: { categories: [] }, response: jsonResponse(200) });
      }
      return Promise.resolve({
        data: {
          workspace: 'workplace',
          title: 'Workplace',
          emptyState: 'No published floors ready for assignment.',
        },
        response: jsonResponse(200),
      });
    });

    render(
      <WorkspaceShell
        session={session(['workplace'], ['WORKPLACE_PLANNER'])}
        onSignOut={() => undefined}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Sites' })).toBeInTheDocument();
    expect(await screen.findByText('No active sites.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create site' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create category' })).not.toBeInTheDocument();
  });

  it('shows a read-only location hierarchy for a Viewer', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/sites') {
        return Promise.resolve({ data: { sites: [] }, response: jsonResponse(200) });
      }
      if (path === '/element-categories') {
        return Promise.resolve({ data: { categories: [] }, response: jsonResponse(200) });
      }
      return Promise.resolve({
        data: {
          workspace: 'viewer',
          title: 'Viewer',
          emptyState: 'No published maps to browse yet.',
        },
        response: jsonResponse(200),
      });
    });

    render(<WorkspaceShell session={session(['viewer'], ['VIEWER'])} onSignOut={() => undefined} />);

    expect(await screen.findByRole('heading', { name: 'Sites' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create site' })).not.toBeInTheDocument();
  });

  it('lets a multi-role user open every granted workspace', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/sites') {
        return Promise.resolve({ data: { sites: [] }, response: jsonResponse(200) });
      }
      if (path === '/element-categories') {
        return Promise.resolve({ data: { categories: [] }, response: jsonResponse(200) });
      }
      if (path === '/workspace/viewer') {
        return Promise.resolve({
          data: {
            workspace: 'viewer',
            title: 'Viewer',
            emptyState: 'Viewer maps are empty.',
          },
          response: jsonResponse(200),
        });
      }
      return Promise.resolve({
        data: {
          workspace: 'facilities',
          title: 'Facilities',
          emptyState: 'Facilities is empty.',
        },
        response: jsonResponse(200),
      });
    });

    render(
      <WorkspaceShell
        session={session(['facilities', 'viewer'], ['FACILITIES_ADMIN', 'VIEWER'])}
        onSignOut={() => undefined}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Create site' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Viewer' }));
    expect(await screen.findByRole('heading', { name: 'Sites' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create site' })).not.toBeInTheDocument();
  });

  it('shows access denied without a workspace payload when the user has no role', () => {
    render(<WorkspaceShell session={session([])} onSignOut={() => undefined} />);

    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access to a workspace.');
    expect(screen.queryByRole('navigation', { name: 'Workspaces' })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('shows access denied without empty-state data when entry is forbidden', async () => {
    get.mockResolvedValue({
      data: { error: 'forbidden' },
      response: jsonResponse(403),
    });

    render(
      <WorkspaceShell
        session={session(['facilities'], ['FACILITIES_ADMIN'])}
        onSignOut={() => undefined}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have access to this workspace.',
    );
    expect(screen.queryByText('No sites yet.')).not.toBeInTheDocument();
  });
});
