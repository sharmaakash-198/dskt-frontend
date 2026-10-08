import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInPage } from './SignInPage';

const get = vi.fn();
const post = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    GET: (...args: unknown[]) => get(...args),
    POST: (...args: unknown[]) => post(...args),
  },
}));

function jsonResponse(status: number) {
  return { ok: status >= 200 && status < 300, status };
}

describe('SignInPage', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('restores an existing valid session on mount', async () => {
    get.mockResolvedValue({
      data: {
        user: {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'alice@local.dskt',
          displayName: 'Alice Local',
        },
      },
      response: jsonResponse(200),
    });

    render(<SignInPage />);

    expect(await screen.findByText('Welcome, Alice Local')).toBeInTheDocument();
    expect(screen.getByText('alice@local.dskt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('displays the sign-in form when there is no active session', async () => {
    get.mockResolvedValue({
      data: { error: 'unauthorized' },
      response: jsonResponse(401),
    });

    render(<SignInPage />);

    expect(await screen.findByRole('heading', { name: 'Sign in locally' })).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows generic error on invalid credentials without revealing username existence', async () => {
    get.mockResolvedValue({
      data: { error: 'unauthorized' },
      response: jsonResponse(401),
    });
    post.mockResolvedValue({
      data: { error: 'invalid_credentials' },
      response: jsonResponse(401),
    });

    render(<SignInPage />);

    expect(await screen.findByRole('heading', { name: 'Sign in locally' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password.');
  });

  it('successfully signs in and transitions to authenticated session view', async () => {
    get.mockResolvedValue({
      data: { error: 'unauthorized' },
      response: jsonResponse(401),
    });
    post.mockResolvedValue({
      data: {
        user: {
          id: '22222222-2222-2222-2222-222222222222',
          email: 'bob@local.dskt',
          displayName: 'Bob Admin',
        },
      },
      response: jsonResponse(200),
    });

    render(<SignInPage />);

    expect(await screen.findByRole('heading', { name: 'Sign in locally' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'bob' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Welcome, Bob Admin')).toBeInTheDocument();
    expect(screen.getByText('bob@local.dskt')).toBeInTheDocument();
  });

  it('signs out and returns to the sign-in form', async () => {
    get.mockResolvedValue({
      data: {
        user: {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'alice@local.dskt',
          displayName: 'Alice',
        },
      },
      response: jsonResponse(200),
    });
    post.mockResolvedValue({
      data: { ok: true },
      response: jsonResponse(200),
    });

    render(<SignInPage />);

    expect(await screen.findByText('Welcome, Alice')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in locally' })).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/auth/sign-out');
  });
});
