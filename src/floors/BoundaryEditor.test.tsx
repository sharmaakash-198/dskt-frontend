import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoundaryEditor } from './BoundaryEditor';
import type { FloorPlanRevision } from './floor-plan-api';

const put = vi.fn();
const patch = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    PUT: (...args: unknown[]) => put(...args),
    PATCH: (...args: unknown[]) => patch(...args),
  },
}));

function jsonResponse(status: number) {
  return { ok: status >= 200 && status < 300, status };
}

const sampleDraftRevision: FloorPlanRevision = {
  id: 'rev-draft-1',
  floorPlanId: 'fp-1',
  revisionNumber: 1,
  lifecycleState: 'DRAFT',
  editingScale: 1,
  concurrencyVersion: 0,
  boundary: [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 150 },
    { x: 0, y: 150 },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('BoundaryEditor', () => {
  beforeEach(() => {
    put.mockReset();
    patch.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders boundary dimensions, coordinate feedback, and accessible summary', () => {
    render(
      <BoundaryEditor
        floorId="floor-1"
        revision={sampleDraftRevision}
        canMutate={true}
        onRevisionUpdated={() => undefined}
        onError={() => undefined}
      />,
    );

    expect(screen.getByText(/Dimensions:/i)).toBeInTheDocument();
    expect(screen.getByText(/200 × 150 world units/i)).toBeInTheDocument();
    expect(screen.getByText(/Accessible Boundary Summary/i)).toBeInTheDocument();
    expect(screen.getByText(/4 vertices; 200 by 150 world units/i)).toBeInTheDocument();
  });

  it('changing editing scale updates scale independently without changing domain coordinates', async () => {
    patch.mockResolvedValue({
      data: { ...sampleDraftRevision, editingScale: 4, concurrencyVersion: 1 },
      response: jsonResponse(200),
    });
    const onRevisionUpdated = vi.fn();

    render(
      <BoundaryEditor
        floorId="floor-1"
        revision={sampleDraftRevision}
        canMutate={true}
        onRevisionUpdated={onRevisionUpdated}
        onError={() => undefined}
      />,
    );

    const scaleSelect = screen.getByLabelText('Editing Scale');
    fireEvent.change(scaleSelect, { target: { value: '4' } });

    expect(patch).toHaveBeenCalledWith(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/scale',
      expect.objectContaining({
        body: { concurrencyVersion: 0, editingScale: 4 },
      }),
    );
    await waitFor(() => {
      expect(onRevisionUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ editingScale: 4, concurrencyVersion: 1 }),
      );
    });
    // Boundary dimensions remain 200 x 150 (domain coordinates preserved)
    expect(screen.getByText(/200 × 150 world units/i)).toBeInTheDocument();
  });

  it('zoom changes viewport scale and pan changes offset without mutating domain coordinates', () => {
    render(
      <BoundaryEditor
        floorId="floor-1"
        revision={sampleDraftRevision}
        canMutate={true}
        onRevisionUpdated={() => undefined}
        onError={() => undefined}
      />,
    );

    const zoomSelect = screen.getByLabelText('Zoom');
    fireEvent.change(zoomSelect, { target: { value: '2' } });

    // Zooming doesn't alter vertex domain coordinates or dimensions
    expect(screen.getByText(/200 × 150 world units/i)).toBeInTheDocument();

    const resetPanBtn = screen.getByRole('button', { name: 'Reset pan' });
    fireEvent.click(resetPanBtn);

    expect(screen.getByText(/4 vertices; 200 by 150 world units/i)).toBeInTheDocument();
  });

  it('saves boundary with concurrencyVersion and updates revision', async () => {
    const updatedRevision = {
      ...sampleDraftRevision,
      concurrencyVersion: 1,
    };
    put.mockResolvedValue({
      data: updatedRevision,
      response: jsonResponse(200),
    });
    const onRevisionUpdated = vi.fn();

    render(
      <BoundaryEditor
        floorId="floor-1"
        revision={sampleDraftRevision}
        canMutate={true}
        onRevisionUpdated={onRevisionUpdated}
        onError={() => undefined}
      />,
    );

    const saveBtn = screen.getByRole('button', { name: 'Save Draft Boundary' });
    fireEvent.click(saveBtn);

    expect(put).toHaveBeenCalledWith(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/boundary',
      expect.objectContaining({
        body: expect.objectContaining({
          concurrencyVersion: 0,
          vertices: sampleDraftRevision.boundary,
        }),
      }),
    );
    await waitFor(() => {
      expect(onRevisionUpdated).toHaveBeenCalledWith(updatedRevision);
    });
  });

  it('displays orthogonality guidance when vertices violate orthogonal constraints', () => {
    const nonOrthogonalRevision: FloorPlanRevision = {
      ...sampleDraftRevision,
      boundary: [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    };

    render(
      <BoundaryEditor
        floorId="floor-1"
        revision={nonOrthogonalRevision}
        canMutate={true}
        onRevisionUpdated={() => undefined}
        onError={() => undefined}
      />,
    );

    expect(screen.getByRole('alert', { name: 'Orthogonality guidance' })).toBeInTheDocument();
    expect(screen.getByText(/non_orthogonal_edge/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Draft Boundary' })).toBeDisabled();
  });
});
