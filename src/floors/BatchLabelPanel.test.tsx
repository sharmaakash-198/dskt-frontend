import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchLabelPanel } from './BatchLabelPanel';
import type { FloorPlanRevision, PlacedElement } from './floor-plan-api';

const postMock = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    POST: (...args: unknown[]) => postMock(...args),
  },
}));

function jsonResponse(status: number) {
  return { status, ok: status >= 200 && status < 300 } as Response;
}

const mockFloorId = '11111111-1111-1111-1111-111111111111';

const physicalPlacement1: PlacedElement = {
  id: '22222222-2222-2222-2222-222222222221',
  floorPlanRevisionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  placementIdentityId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  elementTemplateRevisionId: 'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  templateId: 'dddddddd-dddd-dddd-dddd-ddddddddddd1',
  templateCode: 'DESK-A',
  templateName: 'Standard Desk',
  templateRevisionNumber: 1,
  assignable: true,
  spatialClass: 'PHYSICAL',
  borderColor: '#1e3a8a',
  fillColor: '#93c5fd',
  positionX: 100,
  positionY: 100,
  rotationDegrees: 0,
  label: null,
  vertices: [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 160 },
    { x: 100, y: 160 },
  ],
  localVertices: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 60 },
    { x: 0, y: 60 },
  ],
  createdAt: '2026-10-22T00:00:00.000Z',
  updatedAt: '2026-10-22T00:00:00.000Z',
};

const physicalPlacement2: PlacedElement = {
  ...physicalPlacement1,
  id: '22222222-2222-2222-2222-222222222222',
  placementIdentityId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  positionX: 300,
  positionY: 100,
  label: 'OLD-01',
};

const zonePlacement: PlacedElement = {
  ...physicalPlacement1,
  id: '22222222-2222-2222-2222-222222222223',
  placementIdentityId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
  templateCode: 'ZONE-A',
  templateName: 'Collab Zone',
  spatialClass: 'ZONE',
  assignable: false,
};

const mockRevision: FloorPlanRevision = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  floorPlanId: '99999999-9999-9999-9999-999999999999',
  revisionNumber: 1,
  lifecycleState: 'PUBLISHED',
  editingScale: 1,
  concurrencyVersion: 3,
  boundary: [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ],
  placements: [physicalPlacement1, physicalPlacement2, zonePlacement],
  createdAt: '2026-10-22T00:00:00.000Z',
  updatedAt: '2026-10-22T00:00:00.000Z',
};

describe('BatchLabelPanel', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders sequence configuration inputs and pre-selects eligible physical spaces', () => {
    render(
      <BatchLabelPanel
        floorId={mockFloorId}
        revision={mockRevision}
        isPlanner={true}
        onLabelsApplied={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: /batch label spaces/i })).toBeInTheDocument();
    expect(screen.getByTestId('batch-label-prefix')).toHaveValue('WS-');
    expect(screen.getByTestId('batch-label-start-number')).toHaveValue(1);
    expect(screen.getByTestId('batch-label-width')).toHaveValue(2);
    expect(screen.getByTestId('batch-label-ordering')).toHaveValue('ROW_MAJOR');

    // 2 physical spaces should be selected by default, zone space is unselected
    const cb1 = screen.getByTestId(`checkbox-placement-${physicalPlacement1.id}`);
    const cb2 = screen.getByTestId(`checkbox-placement-${physicalPlacement2.id}`);
    const cb3 = screen.getByTestId(`checkbox-placement-${zonePlacement.id}`);

    expect(cb1).toBeChecked();
    expect(cb2).toBeChecked();
    expect(cb3).not.toBeChecked();

    expect(screen.getByText(/Select Spaces to Label \(2 of 2 selected\)/i)).toBeInTheDocument();
  });

  it('allows selecting and clearing spaces with quick action buttons', () => {
    render(
      <BatchLabelPanel
        floorId={mockFloorId}
        revision={mockRevision}
        isPlanner={true}
        onLabelsApplied={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Click clear
    fireEvent.click(screen.getByTestId('clear-selection-btn'));
    expect(screen.getByTestId(`checkbox-placement-${physicalPlacement1.id}`)).not.toBeChecked();
    expect(screen.getByTestId(`checkbox-placement-${physicalPlacement2.id}`)).not.toBeChecked();
    expect(screen.getByTestId('preview-batch-labels-btn')).toBeDisabled();

    // Click select all physical
    fireEvent.click(screen.getByTestId('select-all-physical-btn'));
    expect(screen.getByTestId(`checkbox-placement-${physicalPlacement1.id}`)).toBeChecked();
    expect(screen.getByTestId(`checkbox-placement-${physicalPlacement2.id}`)).toBeChecked();
    expect(screen.getByTestId('preview-batch-labels-btn')).not.toBeDisabled();
  });

  it('generates deterministic preview proposal without mutating records', async () => {
    const mockPreviewResponse = {
      ok: true as const,
      previewToken: 'fake-token-sha256-abc123',
      concurrencyVersion: 3,
      proposedLabels: [
        {
          placementId: physicalPlacement1.id,
          placementIdentityId: physicalPlacement1.placementIdentityId,
          currentLabel: null,
          proposedLabel: 'WS-01',
          positionX: 100,
          positionY: 100,
        },
        {
          placementId: physicalPlacement2.id,
          placementIdentityId: physicalPlacement2.placementIdentityId,
          currentLabel: 'OLD-01',
          proposedLabel: 'WS-02',
          positionX: 300,
          positionY: 100,
        },
      ],
      conflicts: [],
      canConfirm: true,
    };

    postMock.mockResolvedValueOnce({
      data: mockPreviewResponse,
      response: jsonResponse(200),
    });

    render(
      <BatchLabelPanel
        floorId={mockFloorId}
        revision={mockRevision}
        isPlanner={true}
        onLabelsApplied={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('preview-batch-labels-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('batch-label-preview-section')).toBeInTheDocument();
    });

    // Check preview table
    const table = screen.getByTestId('proposed-labels-table');
    expect(within(table).getByText('WS-01')).toBeInTheDocument();
    expect(within(table).getByText('WS-02')).toBeInTheDocument();
    expect(within(table).getByText('OLD-01')).toBeInTheDocument();
    expect(screen.getByText(/Revision concurrency v3/i)).toBeInTheDocument();

    // Confirm button should be enabled
    expect(screen.getByTestId('confirm-batch-labels-btn')).not.toBeDisabled();

    // Verify post payload
    expect(postMock).toHaveBeenCalledWith(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/batch-labels/preview',
      expect.objectContaining({
        params: {
          path: { floorId: mockFloorId, revisionId: mockRevision.id },
        },
        body: expect.objectContaining({
          placementIds: [physicalPlacement1.id, physicalPlacement2.id],
          prefix: 'WS-',
          startNumber: 1,
          width: 2,
          ordering: 'ROW_MAJOR',
          concurrencyVersion: 3,
        }),
      }),
    );
  });

  it('displays conflicts and denies confirmation when conflicts exist', async () => {
    const mockPreviewWithConflicts = {
      ok: true as const,
      previewToken: 'fake-token-with-conflict',
      concurrencyVersion: 3,
      proposedLabels: [
        {
          placementId: physicalPlacement1.id,
          placementIdentityId: physicalPlacement1.placementIdentityId,
          currentLabel: null,
          proposedLabel: 'EXISTING-COLLISION',
          positionX: 100,
          positionY: 100,
        },
      ],
      conflicts: [
        {
          type: 'collision' as const,
          placementId: physicalPlacement1.id,
          label: 'EXISTING-COLLISION',
          message: 'Proposed label "EXISTING-COLLISION" collides with existing placement.',
        },
        {
          type: 'ineligible_space' as const,
          placementId: zonePlacement.id,
          message: 'Space is of class ZONE. Only PHYSICAL spaces are eligible for batch labeling.',
        },
      ],
      canConfirm: false,
    };

    postMock.mockResolvedValueOnce({
      data: mockPreviewWithConflicts,
      response: jsonResponse(200),
    });

    render(
      <BatchLabelPanel
        floorId={mockFloorId}
        revision={mockRevision}
        isPlanner={true}
        onLabelsApplied={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('preview-batch-labels-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('batch-label-conflicts')).toBeInTheDocument();
    });

    expect(screen.getByText(/Conflicts Detected \(2\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Proposed label "EXISTING-COLLISION" collides with existing placement./i),
    ).toBeInTheDocument();

    // Confirm button must be disabled
    expect(screen.getByTestId('confirm-batch-labels-btn')).toBeDisabled();
  });

  it('confirms accepted preview in one transaction and notifies callback on success', async () => {
    const onApplied = vi.fn();

    const mockPreviewResponse = {
      ok: true as const,
      previewToken: 'token-to-confirm-123',
      concurrencyVersion: 3,
      proposedLabels: [
        {
          placementId: physicalPlacement1.id,
          placementIdentityId: physicalPlacement1.placementIdentityId,
          currentLabel: null,
          proposedLabel: 'WS-01',
          positionX: 100,
          positionY: 100,
        },
      ],
      conflicts: [],
      canConfirm: true,
    };

    const mockConfirmResponse = {
      ok: true as const,
      revisionId: mockRevision.id,
      updatedCount: 1,
      concurrencyVersion: 4,
    };

    postMock
      .mockResolvedValueOnce({
        data: mockPreviewResponse,
        response: jsonResponse(200),
      })
      .mockResolvedValueOnce({
        data: mockConfirmResponse,
        response: jsonResponse(200),
      });

    render(
      <BatchLabelPanel
        floorId={mockFloorId}
        revision={mockRevision}
        isPlanner={true}
        onLabelsApplied={onApplied}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('preview-batch-labels-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-batch-labels-btn')).not.toBeDisabled();
    });

    fireEvent.click(screen.getByTestId('confirm-batch-labels-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('batch-label-success')).toBeInTheDocument();
    });

    expect(screen.getByText(/Successfully applied batch labels to 1 spaces./i)).toBeInTheDocument();
    expect(onApplied).toHaveBeenCalled();

    // Verify confirmation call payload
    expect(postMock).toHaveBeenLastCalledWith(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/batch-labels/confirm',
      expect.objectContaining({
        body: expect.objectContaining({
          previewToken: 'token-to-confirm-123',
          concurrencyVersion: 3,
          assignments: [{ placementId: physicalPlacement1.id, label: 'WS-01' }],
          clientCommandId: expect.any(String),
        }),
      }),
    );
  });

  it('handles stale revision concurrency error on confirmation', async () => {
    const mockPreviewResponse = {
      ok: true as const,
      previewToken: 'token-stale-test',
      concurrencyVersion: 3,
      proposedLabels: [
        {
          placementId: physicalPlacement1.id,
          placementIdentityId: physicalPlacement1.placementIdentityId,
          currentLabel: null,
          proposedLabel: 'WS-01',
          positionX: 100,
          positionY: 100,
        },
      ],
      conflicts: [],
      canConfirm: true,
    };

    postMock
      .mockResolvedValueOnce({
        data: mockPreviewResponse,
        response: jsonResponse(200),
      })
      .mockResolvedValueOnce({
        data: { error: 'stale_revision', currentConcurrencyVersion: 4 },
        response: jsonResponse(409),
      });

    render(
      <BatchLabelPanel
        floorId={mockFloorId}
        revision={mockRevision}
        isPlanner={true}
        onLabelsApplied={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('preview-batch-labels-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-batch-labels-btn')).not.toBeDisabled();
    });

    fireEvent.click(screen.getByTestId('confirm-batch-labels-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('batch-label-error')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/This revision was updated concurrently. Refresh and review proposed labels again./i),
    ).toBeInTheDocument();
  });

  it('enforces role authorization by disabling actions for non-planners', () => {
    render(
      <BatchLabelPanel
        floorId={mockFloorId}
        revision={mockRevision}
        isPlanner={false}
        onLabelsApplied={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Only Workplace Planners are authorized to preview and apply batch labels./i),
    ).toBeInTheDocument();

    expect(screen.getByTestId('preview-batch-labels-btn')).toBeDisabled();
    expect(screen.getByTestId(`checkbox-placement-${physicalPlacement1.id}`)).toBeDisabled();
  });
});
