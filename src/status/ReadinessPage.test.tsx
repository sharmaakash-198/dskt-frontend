import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadinessPage } from './ReadinessPage';

const get = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    GET: (...args: unknown[]) => get(...args),
  },
}));

function jsonResponse(status: number) {
  return { ok: status >= 200 && status < 300, status };
}

describe('ReadinessPage', () => {
  beforeEach(() => {
    get.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows a live process and a database that is not ready', async () => {
    get.mockImplementation(async (path: string) => {
      if (path === '/health/live') {
        return { data: { status: 'live' }, response: jsonResponse(200) };
      }
      return { data: { status: 'not_ready' }, response: jsonResponse(503) };
    });

    render(<ReadinessPage />);

    expect(await screen.findByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Not ready')).toBeInTheDocument();
    expect(screen.getByText(/API process is still live/)).toBeInTheDocument();
  });

  it('does not treat an unreachable process as a database failure', async () => {
    get.mockRejectedValue(new Error('network down'));

    render(<ReadinessPage />);

    expect(await screen.findByText('Not reachable')).toBeInTheDocument();
    expect(screen.getByText('Not checked')).toBeInTheDocument();
  });

  it('checks again through the generated client', async () => {
    get.mockImplementation(async (path: string) => {
      if (path === '/health/live') {
        return { data: { status: 'live' }, response: jsonResponse(200) };
      }
      return { data: { status: 'ready' }, response: jsonResponse(200) };
    });

    render(<ReadinessPage />);
    expect(await screen.findByText('Ready')).toBeInTheDocument();

    get.mockImplementation(async (path: string) => {
      if (path === '/health/live') {
        return { data: { status: 'live' }, response: jsonResponse(200) };
      }
      return { data: { status: 'not_ready' }, response: jsonResponse(503) };
    });

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('Not ready')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/health/live');
    expect(get).toHaveBeenCalledWith('/health/ready');
  });
});
