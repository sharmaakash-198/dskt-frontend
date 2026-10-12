import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevisionComposer } from './RevisionComposer';

const post = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    POST: (...args: unknown[]) => post(...args),
  },
}));

const template = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  categoryId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  code: 'STD-DESK',
  name: 'Standard Desk',
  description: '',
  currentRevisionId: null,
  placeable: false,
  archivedAt: null,
};

describe('RevisionComposer diagnostics', () => {
  afterEach(() => {
    cleanup();
    post.mockReset();
  });

  it('lists advisory issues and focuses the affected vertex', async () => {
    render(
      <RevisionComposer
        template={template}
        canMutate
        onCreated={() => undefined}
        onError={() => undefined}
      />,
    );

    // Make geometry diagonal by editing: remove last two and add bad point via UI is hard;
    // instead remove vertices until count invalid, or inject by removing and adding.
    fireEvent.click(screen.getByRole('button', { name: 'Remove vertex 4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove vertex 3' }));
    expect(await screen.findByText(/between 4 and 100/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('X'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Y'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add snapped vertex' }));
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Y'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add snapped vertex' }));

    const diagonalButtons = await screen.findAllByRole('button', {
      name: /horizontal or vertical/i,
    });
    fireEvent.click(diagonalButtons[0]!);
    expect(screen.getByText(/Vertex 2:/i)).toHaveAttribute('aria-current', 'true');
  });

  it('shows server diagnostics when create fails and creates nothing on success path mock', async () => {
    post.mockResolvedValue({
      data: {
        error: 'invalid_geometry',
        diagnostics: [
          {
            code: 'not_anticlockwise',
            message: 'Vertices must be ordered anticlockwise (counter-clockwise).',
          },
        ],
      },
      response: { ok: false, status: 400 },
    });
    const onError = vi.fn();

    render(
      <RevisionComposer
        template={template}
        canMutate
        onCreated={() => undefined}
        onError={onError}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create immutable revision' }));
    expect(await screen.findByRole('button', { name: /anticlockwise/i })).toBeInTheDocument();
    expect(onError).toHaveBeenCalled();
  });
});
