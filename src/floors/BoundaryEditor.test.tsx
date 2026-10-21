import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoundaryEditor } from './BoundaryEditor';
import type { FloorPlanRevision } from './floor-plan-api';

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const patch = vi.fn();
const del = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    GET: (...args: unknown[]) => get(...args),
    POST: (...args: unknown[]) => post(...args),
    PUT: (...args: unknown[]) => put(...args),
    PATCH: (...args: unknown[]) => patch(...args),
    DELETE: (...args: unknown[]) => del(...args),
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
    get.mockReset();
    post.mockReset();
    put.mockReset();
    patch.mockReset();
    del.mockReset();
    get.mockImplementation(async (path: string, options?: { params?: { path?: Record<string, string> } }) => {
      if (path === '/element-categories') {
        return {
          data: {
            categories: [{ id: 'cat-1', code: 'SPACES', name: 'Spaces', sortOrder: 1, archivedAt: null }],
          },
          response: jsonResponse(200),
        };
      }
      if (path === '/element-categories/{categoryId}/templates') {
        return {
          data: {
            templates: [
              {
                id: 'tmpl-1',
                categoryId: 'cat-1',
                code: 'OFFICE-STD',
                name: 'Standard Office',
                description: 'Office space',
                currentRevisionId: 'rev-phys-1',
                placeable: true,
                archivedAt: null,
              },
              {
                id: 'tmpl-zone',
                categoryId: 'cat-1',
                code: 'ZONE-A',
                name: 'Zone A',
                description: 'Logical zone',
                currentRevisionId: 'rev-zone-1',
                placeable: true,
                archivedAt: null,
              },
              {
                id: 'tmpl-archived',
                categoryId: 'cat-1',
                code: 'OLD-ROOM',
                name: 'Old Room',
                description: 'Archived room',
                currentRevisionId: 'rev-arch-1',
                placeable: true,
                archivedAt: '2026-01-01T00:00:00Z',
              },
            ],
          },
          response: jsonResponse(200),
        };
      }
      if (path === '/element-templates/{templateId}/revisions') {
        const tmplId = options?.params?.path?.templateId;
        if (tmplId === 'tmpl-zone') {
          return {
            data: {
              revisions: [
                {
                  id: 'rev-zone-1',
                  templateId: 'tmpl-zone',
                  revisionNumber: 1,
                  spatialClass: 'ZONE',
                  assignable: true,
                  isCurrent: true,
                  vertices: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 10, y: 10 },
                    { x: 0, y: 10 },
                  ],
                  fillColor: '#fef08a',
                  borderColor: '#ca8a04',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
            },
            response: jsonResponse(200),
          };
        }
        if (tmplId === 'tmpl-archived') {
          return {
            data: {
              revisions: [
                {
                  id: 'rev-arch-1',
                  templateId: 'tmpl-archived',
                  revisionNumber: 1,
                  spatialClass: 'PHYSICAL',
                  assignable: true,
                  isCurrent: true,
                  vertices: [],
                  fillColor: '#93c5fd',
                  borderColor: '#1e3a8a',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
            },
            response: jsonResponse(200),
          };
        }
        return {
          data: {
            revisions: [
              {
                id: 'rev-phys-1',
                templateId: 'tmpl-1',
                revisionNumber: 1,
                spatialClass: 'PHYSICAL',
                assignable: true,
                isCurrent: true,
                vertices: [
                  { x: 0, y: 0 },
                  { x: 20, y: 0 },
                  { x: 20, y: 20 },
                  { x: 0, y: 20 },
                ],
                fillColor: '#93c5fd',
                borderColor: '#1e3a8a',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          },
          response: jsonResponse(200),
        };
      }
      if (path === '/floors/{floorId}/floor-plan/revisions/{revisionId}/placements') {
        return {
          data: { placements: [] },
          response: jsonResponse(200),
        };
      }
      if (path === '/floors/{floorId}/floor-plan/revisions/{revisionId}') {
        return {
          data: { revision: sampleDraftRevision },
          response: jsonResponse(200),
        };
      }
      return { data: [], response: jsonResponse(200) };
    });
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
        body: expect.objectContaining({ concurrencyVersion: 0, editingScale: 4 }),
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

  it('catalog palette offers only active physical templates with current revisions', async () => {
    render(
      <BoundaryEditor
        floorId="floor-1"
        revision={sampleDraftRevision}
        canMutate={true}
        onRevisionUpdated={() => undefined}
        onError={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('template-card-OFFICE-STD')).toBeInTheDocument();
    });

    expect(screen.getByText('Standard Office')).toBeInTheDocument();
    expect(screen.getByText(/SPACES \/ OFFICE-STD/i)).toBeInTheDocument();
    expect(screen.getByText(/20 × 20 world units/i)).toBeInTheDocument();

    // Zone template is active and placeable; archived template must NOT appear
    expect(screen.getByTestId('template-card-ZONE-A')).toBeInTheDocument();
    expect(screen.queryByTestId('template-card-OLD-ROOM')).not.toBeInTheDocument();
  });

  it('shows snapped preview and distinguishes invalid positions without relying on color alone', async () => {
    render(
      <BoundaryEditor
        floorId="floor-1"
        revision={sampleDraftRevision}
        canMutate={true}
        onRevisionUpdated={() => undefined}
        onError={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('template-card-OFFICE-STD')).toBeInTheDocument();
    });

    const card = screen.getByTestId('template-card-OFFICE-STD');
    fireEvent.dragStart(card, {
      dataTransfer: { setData: vi.fn() },
    });

    const canvas = screen.getByLabelText('Floor boundary canvas');

    // Drag over valid coordinate inside boundary (pan is 40, 40; clientX: 90 -> worldX: 50, worldY: 50)
    const validDragEvent = new Event('dragover', { bubbles: true, cancelable: true });
    Object.assign(validDragEvent, {
      clientX: 90,
      clientY: 90,
      dataTransfer: { dropEffect: '' },
    });
    fireEvent(canvas, validDragEvent);

    expect(screen.getByTestId('placement-preview')).toBeInTheDocument();
    expect(screen.getByTestId('placement-preview')).toHaveTextContent('✓ Valid');
    expect(screen.getByTestId('preview-status')).toHaveTextContent(/✓ Valid Position/i);

    // Drag over invalid coordinate outside boundary (clientX: 250 -> worldX: 210 > boundary width 200)
    const invalidDragEvent = new Event('dragover', { bubbles: true, cancelable: true });
    Object.assign(invalidDragEvent, {
      clientX: 250,
      clientY: 90,
      dataTransfer: { dropEffect: '' },
    });
    fireEvent(canvas, invalidDragEvent);

    const preview = screen.getByTestId('placement-preview');
    // Non-color visual hatch pattern applied
    expect(preview.querySelector('polygon')).toHaveAttribute('fill', 'url(#invalid-hatch)');
    // Non-color warning badge text / icon
    expect(preview).toHaveTextContent('⚠ Invalid');
    // Screen reader accessible live region status
    expect(screen.getByTestId('preview-status')).toHaveTextContent(/⚠ Invalid Position: Outside boundary/i);
  });

  it('commits placement creating a placed element with quarter-turn rotation and integer coordinates', async () => {
    post.mockResolvedValue({
      data: {
        id: 'placed-1',
        placementIdentityId: 'pi-1',
        templateRevisionId: 'rev-phys-1',
        templateCode: 'OFFICE-STD',
        templateName: 'Standard Office',
        spatialClass: 'PHYSICAL',
        positionX: 30,
        positionY: 40,
        rotationDegrees: 0,
        label: 'Room 101',
        vertices: [
          { x: 30, y: 40 },
          { x: 50, y: 40 },
          { x: 50, y: 60 },
          { x: 30, y: 60 },
        ],
        fillColor: '#93c5fd',
        borderColor: '#1e3a8a',
      },
      response: jsonResponse(201),
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

    await waitFor(() => {
      expect(screen.getByTestId('template-card-OFFICE-STD')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('X:'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Y:'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Label:'), { target: { value: 'Room 101' } });

    fireEvent.click(screen.getByRole('button', { name: 'Place space' }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/floors/{floorId}/floor-plan/revisions/{revisionId}/placements',
        expect.objectContaining({
          body: expect.objectContaining({
            templateRevisionId: 'rev-phys-1',
            positionX: 30,
            positionY: 40,
            rotationDegrees: 0,
            label: 'Room 101',
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Placed Spaces' })).toHaveTextContent(/Room 101 \(OFFICE-STD\)/i);
    });
  });

  it('reconstructs the same geometry through the shared renderer on reload', () => {
    const revisionWithPlacements: FloorPlanRevision = {
      ...sampleDraftRevision,
      placements: [
        {
          id: 'pl-saved-1',
          floorPlanRevisionId: 'rev-draft-1',
          placementIdentityId: 'pi-1',
          elementTemplateRevisionId: 'rev-phys-1',
          templateId: 'tmpl-1',
          templateCode: 'OFFICE-STD',
          templateName: 'Standard Office',
          templateRevisionNumber: 1,
          assignable: true,
          spatialClass: 'PHYSICAL',
          positionX: 50,
          positionY: 60,
          rotationDegrees: 90,
          label: 'Conference Room',
          vertices: [
            { x: 50, y: 60 },
            { x: 90, y: 60 },
            { x: 90, y: 80 },
            { x: 50, y: 80 },
          ],
          localVertices: [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 20, y: 40 },
            { x: 0, y: 40 },
          ],
          fillColor: '#93c5fd',
          borderColor: '#1e3a8a',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    render(
      <BoundaryEditor
        floorId="floor-1"
        revision={revisionWithPlacements}
        canMutate={true}
        onRevisionUpdated={() => undefined}
        onError={() => undefined}
      />,
    );

    const placedSpace = screen.getByTestId('placed-space-pl-saved-1');
    expect(placedSpace).toBeInTheDocument();

    const polygon = placedSpace.querySelector('polygon');
    expect(polygon).toHaveAttribute('points', '50,60 90,60 90,80 50,80');
    expect(polygon).toHaveAttribute('fill', '#93c5fd');

    expect(screen.getByTestId('labels-layer')).toHaveTextContent('Conference Room (OFFICE-STD)');
    expect(screen.getByRole('region', { name: 'Placed Spaces' })).toHaveTextContent(
      'Conference Room (OFFICE-STD) at (50, 60) • Rotation 90°',
    );
  });

  it('selection exposes an accessible details panel with Template Revision, coordinates, rotation, assignability, and validation state', () => {
    const revisionWithPlacements: FloorPlanRevision = {
      ...sampleDraftRevision,
      placements: [
        {
          id: 'pl-select-1',
          floorPlanRevisionId: 'rev-draft-1',
          placementIdentityId: 'pi-1',
          elementTemplateRevisionId: 'rev-phys-1',
          templateId: 'tmpl-1',
          templateCode: 'OFFICE-STD',
          templateName: 'Standard Office',
          templateRevisionNumber: 2,
          assignable: true,
          spatialClass: 'PHYSICAL',
          positionX: 50,
          positionY: 60,
          rotationDegrees: 90,
          label: 'Room 201',
          vertices: [
            { x: 50, y: 60 },
            { x: 70, y: 60 },
            { x: 70, y: 80 },
            { x: 50, y: 80 },
          ],
          localVertices: [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 20, y: 20 },
            { x: 0, y: 20 },
          ],
          fillColor: '#93c5fd',
          borderColor: '#1e3a8a',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    render(
      <BoundaryEditor
        floorId="floor-1"
        revision={revisionWithPlacements}
        canMutate={true}
        onRevisionUpdated={() => undefined}
        onError={() => undefined}
      />,
    );

    // Click to select the space
    fireEvent.click(screen.getByTestId('placed-space-pl-select-1'));

    const panel = screen.getByTestId('placement-details-panel');
    expect(panel).toBeInTheDocument();

    // Template Revision info
    expect(panel).toHaveTextContent(/Standard Office \(OFFICE-STD\) • Revision 2/i);
    // Coordinates info
    expect(panel).toHaveTextContent(/\(50, 60\) world units \(500 × 600 cm\)/i);
    // Rotation info
    expect(panel).toHaveTextContent(/90° \(Quarter turn\)/i);
    // Assignability info
    expect(panel).toHaveTextContent(/Assignable \(Workplace assignments permitted\)/i);
    // Validation State
    expect(panel).toHaveTextContent(/✓ Valid \(Within boundary, no collisions\)/i);
  });

  it('translates placed space and provides responsive preview distinguishing invalid coordinates', async () => {
    const placed = {
      id: 'pl-trans-1',
      floorPlanRevisionId: 'rev-draft-1',
      placementIdentityId: 'pi-1',
      elementTemplateRevisionId: 'rev-phys-1',
      templateId: 'tmpl-1',
      templateCode: 'OFFICE-STD',
      templateName: 'Standard Office',
      templateRevisionNumber: 1,
      assignable: true,
      spatialClass: 'PHYSICAL' as const,
      positionX: 50,
      positionY: 60,
      rotationDegrees: 0,
      label: 'Room 101',
      vertices: [
        { x: 50, y: 60 },
        { x: 70, y: 60 },
        { x: 70, y: 80 },
        { x: 50, y: 80 },
      ],
      localVertices: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ],
      fillColor: '#93c5fd',
      borderColor: '#1e3a8a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    patch.mockResolvedValue({
      data: {
        ...placed,
        positionX: 70,
        positionY: 80,
        vertices: [
          { x: 70, y: 80 },
          { x: 90, y: 80 },
          { x: 90, y: 100 },
          { x: 70, y: 100 },
        ],
      },
      response: jsonResponse(200),
    });

    render(
      <BoundaryEditor
        floorId="floor-1"
        revision={{ ...sampleDraftRevision, placements: [placed] }}
        canMutate={true}
        onRevisionUpdated={() => undefined}
        onError={() => undefined}
      />,
    );

    // Select the space
    fireEvent.click(screen.getByTestId('placed-space-pl-trans-1'));

    // Move to invalid coordinates (X: 190, which extends to 210 > 200 boundary width)
    const xInput = screen.getByLabelText('X Coordinate');
    fireEvent.change(xInput, { target: { value: '190' } });

    // Preview shows invalid badge and alert
    expect(screen.getByTestId('transform-preview')).toHaveTextContent('⚠ Invalid');
    expect(screen.getByRole('alert')).toHaveTextContent(/⚠ Invalid Transform: Outside boundary/i);
    expect(screen.getByRole('button', { name: 'Save Transform' })).toBeDisabled();

    // Set to valid coordinates
    fireEvent.change(xInput, { target: { value: '70' } });
    const yInput = screen.getByLabelText('Y Coordinate');
    fireEvent.change(yInput, { target: { value: '80' } });

    // Preview is valid and save button is enabled
    expect(screen.getByTestId('transform-preview')).toHaveTextContent('✓ Preview');
    expect(screen.getByRole('button', { name: 'Save Transform' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save Transform' }));

    await waitFor(() => {
      expect(patch).toHaveBeenCalledWith(
        '/floors/{floorId}/floor-plan/revisions/{revisionId}/placements/{placementId}',
        expect.objectContaining({
          body: expect.objectContaining({
            positionX: 70,
            positionY: 80,
            rotationDegrees: 0,
          }),
        }),
      );
    });
  });

  it('quarter-turn rotation toggles 90, 180, 270 degrees and commits changes', async () => {
    const placed = {
      id: 'pl-rot-1',
      floorPlanRevisionId: 'rev-draft-1',
      placementIdentityId: 'pi-1',
      elementTemplateRevisionId: 'rev-phys-1',
      templateId: 'tmpl-1',
      templateCode: 'OFFICE-STD',
      templateName: 'Standard Office',
      templateRevisionNumber: 1,
      assignable: true,
      spatialClass: 'PHYSICAL' as const,
      positionX: 50,
      positionY: 60,
      rotationDegrees: 90,
      label: 'Room 101',
      vertices: [
        { x: 50, y: 60 },
        { x: 50, y: 80 },
        { x: 30, y: 80 },
        { x: 30, y: 60 },
      ],
      localVertices: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ],
      fillColor: '#93c5fd',
      borderColor: '#1e3a8a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    patch.mockResolvedValue({
      data: {
        ...placed,
        rotationDegrees: 180,
      },
      response: jsonResponse(200),
    });

    render(
      <BoundaryEditor
        floorId="floor-1"
        revision={{ ...sampleDraftRevision, placements: [placed] }}
        canMutate={true}
        onRevisionUpdated={() => undefined}
        onError={() => undefined}
      />,
    );

    // Select the space
    fireEvent.click(screen.getByTestId('placed-space-pl-rot-1'));

    // Current rotation starts at 90°
    expect(screen.getByText('90°', { selector: '.current-rotation-badge' })).toBeInTheDocument();

    // Click Rotate 90° CW -> 180°
    fireEvent.click(screen.getByRole('button', { name: 'Rotate 90 degrees clockwise' }));
    expect(screen.getByText('180°', { selector: '.current-rotation-badge' })).toBeInTheDocument();

    // Click Rotate 90° CW -> 270°
    fireEvent.click(screen.getByRole('button', { name: 'Rotate 90 degrees clockwise' }));
    expect(screen.getByText('270°', { selector: '.current-rotation-badge' })).toBeInTheDocument();

    // Click Rotate 90° CCW -> back to 180°
    fireEvent.click(screen.getByRole('button', { name: 'Rotate 90 degrees counter-clockwise' }));
    expect(screen.getByText('180°', { selector: '.current-rotation-badge' })).toBeInTheDocument();

    // Save rotation
    fireEvent.click(screen.getByRole('button', { name: 'Save Transform' }));

    await waitFor(() => {
      expect(patch).toHaveBeenCalledWith(
        '/floors/{floorId}/floor-plan/revisions/{revisionId}/placements/{placementId}',
        expect.objectContaining({
          body: expect.objectContaining({
            rotationDegrees: 180,
          }),
        }),
      );
    });
  });

  it('removing a placement removes it from draft list and updates concurrency version', async () => {
    const placed = {
      id: 'pl-del-1',
      floorPlanRevisionId: 'rev-draft-1',
      placementIdentityId: 'pi-1',
      elementTemplateRevisionId: 'rev-phys-1',
      templateId: 'tmpl-1',
      templateCode: 'OFFICE-STD',
      templateName: 'Standard Office',
      templateRevisionNumber: 1,
      assignable: true,
      spatialClass: 'PHYSICAL' as const,
      positionX: 50,
      positionY: 60,
      rotationDegrees: 0,
      label: 'Room to Delete',
      vertices: [
        { x: 50, y: 60 },
        { x: 70, y: 60 },
        { x: 70, y: 80 },
        { x: 50, y: 80 },
      ],
      localVertices: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ],
      fillColor: '#93c5fd',
      borderColor: '#1e3a8a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    del.mockResolvedValue({
      data: {
        ok: true,
        concurrencyVersion: 5,
      },
      response: jsonResponse(200),
    });

    const onRevisionUpdated = vi.fn();

    render(
      <BoundaryEditor
        floorId="floor-1"
        revision={{ ...sampleDraftRevision, placements: [placed] }}
        canMutate={true}
        onRevisionUpdated={onRevisionUpdated}
        onError={() => undefined}
      />,
    );

    // Select the space
    fireEvent.click(screen.getByTestId('placed-space-pl-del-1'));
    expect(screen.getByTestId('placement-details-panel')).toBeInTheDocument();

    // Click Remove from Draft button
    fireEvent.click(screen.getByRole('button', { name: /Remove .* from Draft/i }));

    await waitFor(() => {
      expect(del).toHaveBeenCalledWith(
        '/floors/{floorId}/floor-plan/revisions/{revisionId}/placements/{placementId}',
        expect.objectContaining({
          params: expect.objectContaining({
            path: {
              floorId: 'floor-1',
              revisionId: 'rev-draft-1',
              placementId: 'pl-del-1',
            },
            query: expect.objectContaining({ concurrencyVersion: 0 }),
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByTestId('placed-space-pl-del-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('placement-details-panel')).not.toBeInTheDocument();
    });

    expect(onRevisionUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrencyVersion: 5,
        placements: [],
      }),
    );
  });

  it('renders ZONE, OBSTACLE, and PHYSICAL spaces in predictable layer order with accessible labels and affordances', async () => {
    const mixedPlacements = [
      {
        id: 'pl-phys-1',
        floorPlanRevisionId: 'rev-draft-1',
        placementIdentityId: 'pi-1',
        elementTemplateRevisionId: 'rev-phys-1',
        templateId: 'tmpl-1',
        templateCode: 'OFFICE-STD',
        templateName: 'Standard Office',
        templateRevisionNumber: 1,
        assignable: true,
        spatialClass: 'PHYSICAL' as const,
        positionX: 30,
        positionY: 30,
        rotationDegrees: 0,
        label: 'Office 1',
        vertices: [
          { x: 30, y: 30 },
          { x: 50, y: 30 },
          { x: 50, y: 50 },
          { x: 30, y: 50 },
        ],
        localVertices: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
        fillColor: '#93c5fd',
        borderColor: '#1e3a8a',
        createdAt: '2026-01-01T10:00:00Z',
        updatedAt: '2026-01-01T10:00:00Z',
      },
      {
        id: 'pl-zone-1',
        floorPlanRevisionId: 'rev-draft-1',
        placementIdentityId: 'pi-2',
        elementTemplateRevisionId: 'rev-zone-1',
        templateId: 'tmpl-zone',
        templateCode: 'ZONE-A',
        templateName: 'Zone A',
        templateRevisionNumber: 1,
        assignable: false,
        spatialClass: 'ZONE' as const,
        positionX: 10,
        positionY: 10,
        rotationDegrees: 0,
        label: 'Engineering Zone',
        vertices: [
          { x: 10, y: 10 },
          { x: 110, y: 10 },
          { x: 110, y: 90 },
          { x: 10, y: 90 },
        ],
        localVertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 80 },
          { x: 0, y: 80 },
        ],
        fillColor: '#d1fae5',
        borderColor: '#047857',
        createdAt: '2026-01-01T10:01:00Z',
        updatedAt: '2026-01-01T10:01:00Z',
      },
      {
        id: 'pl-obs-1',
        floorPlanRevisionId: 'rev-draft-1',
        placementIdentityId: 'pi-3',
        elementTemplateRevisionId: 'rev-obs-1',
        templateId: 'tmpl-obs',
        templateCode: 'COL-1',
        templateName: 'Column',
        templateRevisionNumber: 1,
        assignable: false,
        spatialClass: 'OBSTACLE' as const,
        positionX: 80,
        positionY: 80,
        rotationDegrees: 0,
        label: 'Column A',
        vertices: [
          { x: 80, y: 80 },
          { x: 90, y: 80 },
          { x: 90, y: 90 },
          { x: 80, y: 90 },
        ],
        localVertices: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        fillColor: '#fee2e2',
        borderColor: '#b91c1c',
        createdAt: '2026-01-01T10:02:00Z',
        updatedAt: '2026-01-01T10:02:00Z',
      },
    ];

    const { container } = render(
      <BoundaryEditor
        floorId="floor-1"
        revision={{ ...sampleDraftRevision, placements: mixedPlacements }}
        canMutate={true}
        onRevisionUpdated={() => undefined}
        onError={() => undefined}
      />,
    );

    // Verify all 3 placed spaces rendered
    expect(screen.getByTestId('placed-space-pl-zone-1')).toBeInTheDocument();
    expect(screen.getByTestId('placed-space-pl-obs-1')).toBeInTheDocument();
    expect(screen.getByTestId('placed-space-pl-phys-1')).toBeInTheDocument();

    // Verify layer ordering in DOM:
    // Placed spaces group must contain ZONE first, then OBSTACLE, then PHYSICAL
    const placedSpaces = container.querySelectorAll('.placed-spaces-group .placed-space');
    expect(placedSpaces.length).toBe(3);
    expect(placedSpaces[0]).toHaveAttribute('data-testid', 'placed-space-pl-zone-1');
    expect(placedSpaces[0]).toHaveAttribute('data-spatial-class', 'ZONE');
    expect(placedSpaces[1]).toHaveAttribute('data-testid', 'placed-space-pl-obs-1');
    expect(placedSpaces[1]).toHaveAttribute('data-spatial-class', 'OBSTACLE');
    expect(placedSpaces[2]).toHaveAttribute('data-testid', 'placed-space-pl-phys-1');
    expect(placedSpaces[2]).toHaveAttribute('data-spatial-class', 'PHYSICAL');

    // Labels layer is present and contains text labels for all elements
    const labelsLayer = screen.getByTestId('labels-layer');
    expect(labelsLayer).toBeInTheDocument();
    expect(labelsLayer).toHaveTextContent(/Engineering Zone/);
    expect(labelsLayer).toHaveTextContent(/Column A/);
    expect(labelsLayer).toHaveTextContent(/Office 1/);

    // Select Zone -> selection affordance is rendered
    fireEvent.click(screen.getByTestId('placed-space-pl-zone-1'));
    expect(screen.getByTestId('selection-affordance')).toBeInTheDocument();

    // Details panel identifies spatial class with accessible badge and semantics
    const spatialClassValue = screen.getByTestId('spatial-class-value');
    expect(spatialClassValue).toHaveTextContent('ZONE');
    expect(spatialClassValue).toHaveTextContent(/Semantic zone region/i);

    // Select Obstacle
    fireEvent.click(screen.getByTestId('placed-space-pl-obs-1'));
    const obsClassValue = screen.getByTestId('spatial-class-value');
    expect(obsClassValue).toHaveTextContent('OBSTACLE');
    expect(obsClassValue).toHaveTextContent(/Structural obstacle/i);

    // Select Physical space
    fireEvent.click(screen.getByTestId('placed-space-pl-phys-1'));
    const physClassValue = screen.getByTestId('spatial-class-value');
    expect(physClassValue).toHaveTextContent('PHYSICAL');
    expect(physClassValue).toHaveTextContent(/Physical space/i);
  });

  describe('Ticket 16: Editor lease and autosave states', () => {
    it('acquires lease on mount, displays lease owner and expiry timer, and releases lease on unmount', async () => {
      post.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan/revisions/{revisionId}/lease') {
          return {
            data: {
              floorPlanRevisionId: 'rev-draft-1',
              token: 'lease-secret-tok-123',
              acquiredAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 60000).toISOString(),
              renewedAt: new Date().toISOString(),
              releasedAt: null,
              isExpired: false,
              owner: {
                id: 'user-fac-1',
                displayName: 'Facilities Lead',
                email: 'fac@dskt.local',
              },
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions/{revisionId}/lease/release') {
          return {
            data: { ok: true },
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      const { unmount } = render(
        <BoundaryEditor
          floorId="floor-1"
          revision={sampleDraftRevision}
          canMutate={true}
          onRevisionUpdated={() => undefined}
          onError={() => undefined}
        />,
      );

      // Verify acquire called
      await waitFor(() => {
        expect(post).toHaveBeenCalledWith(
          '/floors/{floorId}/floor-plan/revisions/{revisionId}/lease',
          expect.objectContaining({
            params: { path: { floorId: 'floor-1', revisionId: 'rev-draft-1' } },
          }),
        );
      });

      // Verify banner displays owner and timer
      await waitFor(() => {
        const leaseBanner = screen.getByTestId('lease-status-banner');
        expect(leaseBanner).toHaveTextContent(/Held by Facilities Lead/i);
        expect(screen.getByTestId('lease-timer')).toBeInTheDocument();
      });

      // Unmount -> releases lease
      unmount();
      await waitFor(() => {
        expect(post).toHaveBeenCalledWith(
          '/floors/{floorId}/floor-plan/revisions/{revisionId}/lease/release',
          expect.objectContaining({
            params: {
              path: { floorId: 'floor-1', revisionId: 'rev-draft-1' },
              header: { 'x-lease-token': 'lease-secret-tok-123' },
            },
          }),
        );
      });
    });

    it('shows read-only conflict state and takeover button when leased by another user', async () => {
      post.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan/revisions/{revisionId}/lease') {
          return {
            data: { error: 'lease_conflict' },
            response: jsonResponse(409),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions/{revisionId}/lease/takeover') {
          return {
            data: {
              floorPlanRevisionId: 'rev-draft-1',
              token: 'takeover-token-abc',
              acquiredAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 60000).toISOString(),
              renewedAt: new Date().toISOString(),
              releasedAt: null,
              isExpired: false,
              owner: {
                id: 'my-user-id',
                displayName: 'Facilities Admin',
                email: 'admin@dskt.local',
              },
            },
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan/revisions/{revisionId}/lease') {
          return {
            data: {
              hasActiveLease: true,
              isCurrentHolder: false,
              lease: {
                floorPlanRevisionId: 'rev-draft-1',
                acquiredAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 60000).toISOString(),
                renewedAt: new Date().toISOString(),
                releasedAt: null,
                isExpired: false,
                owner: {
                  id: 'other-user-99',
                  displayName: 'Other Planner',
                  email: 'other@dskt.local',
                },
              },
            },
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <BoundaryEditor
          floorId="floor-1"
          revision={sampleDraftRevision}
          canMutate={true}
          onRevisionUpdated={() => undefined}
          onError={() => undefined}
        />,
      );

      // Verify conflict banner rendered
      await waitFor(() => {
        const conflictBanner = screen.getByTestId('lease-conflict-banner');
        expect(conflictBanner).toHaveTextContent(/This floor plan is currently being edited by Other Planner/i);
        expect(screen.getByTestId('takeover-lease-btn')).toBeInTheDocument();
      });

      // Click takeover button
      fireEvent.click(screen.getByTestId('takeover-lease-btn'));

      // Verify takeover requested
      await waitFor(() => {
        expect(post).toHaveBeenCalledWith(
          '/floors/{floorId}/floor-plan/revisions/{revisionId}/lease/takeover',
          expect.objectContaining({
            params: { path: { floorId: 'floor-1', revisionId: 'rev-draft-1' } },
          }),
        );
      });

      // After takeover, banner switches to active lease holder
      await waitFor(() => {
        expect(screen.queryByTestId('lease-conflict-banner')).not.toBeInTheDocument();
        expect(screen.getByTestId('lease-status-banner')).toHaveTextContent(/Held by Facilities Admin/i);
      });
    });

    it('autosave status badge reflects saving and saved states, and passes x-lease-token and clientCommandId', async () => {
      post.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan/revisions/{revisionId}/lease') {
          return {
            data: {
              floorPlanRevisionId: 'rev-draft-1',
              token: 'tok-autosave-456',
              acquiredAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 60000).toISOString(),
              renewedAt: new Date().toISOString(),
              releasedAt: null,
              isExpired: false,
              owner: {
                id: 'fac-1',
                displayName: 'Facilities Lead',
                email: 'fac@dskt.local',
              },
            },
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      put.mockResolvedValue({
        data: {
          ...sampleDraftRevision,
          concurrencyVersion: 1,
        },
        response: jsonResponse(200),
      });

      patch.mockResolvedValue({
        data: {
          ...sampleDraftRevision,
          editingScale: 2,
          concurrencyVersion: 1,
        },
        response: jsonResponse(200),
      });

      render(
        <BoundaryEditor
          floorId="floor-1"
          revision={sampleDraftRevision}
          canMutate={true}
          onRevisionUpdated={() => undefined}
          onError={() => undefined}
        />,
      );

      // Wait for initial lease acquisition
      await waitFor(() => {
        expect(screen.getByTestId('lease-status-banner')).toBeInTheDocument();
      });

      // Change editing scale to trigger immediate autosave
      const scaleSelect = screen.getByLabelText('Editing Scale');
      fireEvent.change(scaleSelect, { target: { value: '2' } });

      // Wait for autosave to trigger PATCH
      await waitFor(() => {
        expect(patch).toHaveBeenCalledWith(
          '/floors/{floorId}/floor-plan/revisions/{revisionId}/scale',
          expect.objectContaining({
            params: expect.objectContaining({
              header: expect.objectContaining({
                'x-lease-token': 'tok-autosave-456',
                'x-client-command-id': expect.any(String),
              }),
            }),
            body: expect.objectContaining({
              leaseToken: 'tok-autosave-456',
              clientCommandId: expect.any(String),
              editingScale: 2,
            }),
          }),
        );
      });

      // Verify autosave badge shows saved
      await waitFor(() => {
        expect(screen.getByTestId('autosave-status')).toHaveTextContent('✓ Saved');
      });
    });
  });

  describe('Ticket 17: Undo, redo, and recover conflicts', () => {
    it('supports multi-step undo and redo of boundary vertex additions via toolbar buttons and keyboard shortcuts', async () => {
      post.mockResolvedValue({
        data: {
          floorPlanRevisionId: 'rev-draft-1',
          token: 'tok-history-1',
          acquiredAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          renewedAt: new Date().toISOString(),
          releasedAt: null,
          isExpired: false,
          owner: { id: 'usr-fac-1', displayName: 'Facilities Admin', email: 'fac@dskt.local' },
        },
        response: jsonResponse(200),
      });

      render(
        <BoundaryEditor
          floorId="floor-1"
          revision={sampleDraftRevision}
          canMutate={true}
          onRevisionUpdated={() => undefined}
          onError={() => undefined}
        />,
      );

      const undoBtn = screen.getByTestId('undo-button');
      const redoBtn = screen.getByTestId('redo-button');

      // Initially undo and redo are disabled
      expect(undoBtn).toBeDisabled();
      expect(redoBtn).toBeDisabled();

      // Step 1: Add vertex (100, 20)
      const xInput = screen.getByLabelText('New vertex X coordinate');
      const yInput = screen.getByLabelText('New vertex Y coordinate');
      const addBtn = screen.getByRole('button', { name: 'Add Vertex' });

      fireEvent.change(xInput, { target: { value: '100' } });
      fireEvent.change(yInput, { target: { value: '20' } });
      fireEvent.click(addBtn);

      // Undo is now enabled, Redo is disabled
      expect(undoBtn).toBeEnabled();
      expect(redoBtn).toBeDisabled();
      expect(screen.getByText('(100, 20)')).toBeInTheDocument();

      // Step 2: Add another vertex (100, 40)
      fireEvent.change(xInput, { target: { value: '100' } });
      fireEvent.change(yInput, { target: { value: '40' } });
      fireEvent.click(addBtn);

      expect(screen.getByText('(100, 40)')).toBeInTheDocument();

      // Click Undo -> removes vertex (100, 40)
      fireEvent.click(undoBtn);
      expect(screen.queryByText('(100, 40)')).not.toBeInTheDocument();
      expect(screen.getByText('(100, 20)')).toBeInTheDocument();
      expect(redoBtn).toBeEnabled();

      // Undo via keyboard shortcut (Ctrl+Z)
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
      expect(screen.queryByText('(100, 20)')).not.toBeInTheDocument();
      expect(undoBtn).toBeDisabled();

      // Redo via keyboard shortcut (Ctrl+Y) -> restores (100, 20)
      fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
      expect(screen.getByText('(100, 20)')).toBeInTheDocument();
      expect(undoBtn).toBeEnabled();

      // Redo via toolbar button -> restores (100, 40)
      fireEvent.click(redoBtn);
      expect(screen.getByText('(100, 40)')).toBeInTheDocument();
      expect(redoBtn).toBeDisabled();
    });

    it('discards invalid redo branch when a new edit is made after undo', async () => {
      post.mockResolvedValue({
        data: {
          floorPlanRevisionId: 'rev-draft-1',
          token: 'tok-history-2',
          acquiredAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          renewedAt: new Date().toISOString(),
          releasedAt: null,
          isExpired: false,
          owner: { id: 'usr-fac-1', displayName: 'Facilities Admin', email: 'fac@dskt.local' },
        },
        response: jsonResponse(200),
      });

      render(
        <BoundaryEditor
          floorId="floor-1"
          revision={sampleDraftRevision}
          canMutate={true}
          onRevisionUpdated={() => undefined}
          onError={() => undefined}
        />,
      );

      const undoBtn = screen.getByTestId('undo-button');
      const redoBtn = screen.getByTestId('redo-button');
      const xInput = screen.getByLabelText('New vertex X coordinate');
      const yInput = screen.getByLabelText('New vertex Y coordinate');
      const addBtn = screen.getByRole('button', { name: 'Add Vertex' });

      // Add vertex (100, 20)
      fireEvent.change(xInput, { target: { value: '100' } });
      fireEvent.change(yInput, { target: { value: '20' } });
      fireEvent.click(addBtn);

      // Undo
      fireEvent.click(undoBtn);
      expect(redoBtn).toBeEnabled();

      // Make a different new edit: Add vertex (100, 50)
      fireEvent.change(xInput, { target: { value: '100' } });
      fireEvent.change(yInput, { target: { value: '50' } });
      fireEvent.click(addBtn);

      // Redo branch discarded
      expect(redoBtn).toBeDisabled();
      expect(screen.getByText('(100, 50)')).toBeInTheDocument();
      expect(screen.queryByText('(100, 20)')).not.toBeInTheDocument();
    });

    it('excludes zoom, pan, and selection from domain undo history', () => {
      render(
        <BoundaryEditor
          floorId="floor-1"
          revision={sampleDraftRevision}
          canMutate={true}
          onRevisionUpdated={() => undefined}
          onError={() => undefined}
        />,
      );

      const undoBtn = screen.getByTestId('undo-button');
      expect(undoBtn).toBeDisabled();

      // Change zoom
      const zoomSelect = screen.getByLabelText('Zoom');
      fireEvent.change(zoomSelect, { target: { value: '2' } });

      // Reset Pan
      const panBtn = screen.getByRole('button', { name: /reset pan/i });
      fireEvent.click(panBtn);

      // Undo stack must remain completely empty
      expect(undoBtn).toBeDisabled();
    });

    it('handles stale concurrency conflict: prevents silent overwrite, displays unsaved work, and reloads server draft', async () => {
      post.mockResolvedValue({
        data: {
          floorPlanRevisionId: 'rev-draft-1',
          token: 'tok-conflict-1',
          acquiredAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          renewedAt: new Date().toISOString(),
          releasedAt: null,
          isExpired: false,
          owner: { id: 'usr-fac-1', displayName: 'Facilities Admin', email: 'fac@dskt.local' },
        },
        response: jsonResponse(200),
      });

      // Backend rejects save with 409 concurrency_conflict and current server version 2
      put.mockResolvedValue({
        data: {
          error: 'concurrency_conflict',
          currentConcurrencyVersion: 2,
        },
        response: jsonResponse(409),
      });

      const onUpdate = vi.fn();
      render(
        <BoundaryEditor
          floorId="floor-1"
          revision={sampleDraftRevision}
          canMutate={true}
          onRevisionUpdated={onUpdate}
          onError={() => undefined}
        />,
      );

      // Click Save Draft Boundary to trigger PUT
      const saveBtn = screen.getByRole('button', { name: 'Save Draft Boundary' });
      fireEvent.click(saveBtn);

      // Wait for autosave failure
      await waitFor(() => {
        expect(screen.getByTestId('concurrency-conflict-banner')).toBeInTheDocument();
      });

      // Verify conflict state is identified
      expect(screen.getByTestId('autosave-status')).toHaveTextContent('⚠ Conflict');

      // Now simulate "Reload Server Draft"
      const serverUpdatedRevision: FloorPlanRevision = {
        ...sampleDraftRevision,
        concurrencyVersion: 2,
        boundary: [
          { x: 0, y: 0 },
          { x: 300, y: 0 },
          { x: 300, y: 200 },
          { x: 0, y: 200 },
        ],
      };

      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan/revisions/{revisionId}') {
          return {
            data: { revision: serverUpdatedRevision },
            response: jsonResponse(200),
          };
        }
        return { data: [], response: jsonResponse(200) };
      });

      const reloadBtn = screen.getByTestId('reload-server-draft-button');
      fireEvent.click(reloadBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('concurrency-conflict-banner')).not.toBeInTheDocument();
      });

      // Confirmed server boundary is restored
      expect(screen.getByText('(300, 0)')).toBeInTheDocument();
      expect(screen.getByTestId('autosave-status')).toHaveTextContent('✓ Saved');
      expect(onUpdate).toHaveBeenCalledWith(serverUpdatedRevision);
    });

    it('safely reapplies unsaved work on conflict recovery', async () => {
      post.mockResolvedValue({
        data: {
          floorPlanRevisionId: 'rev-draft-1',
          token: 'tok-conflict-2',
          acquiredAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          renewedAt: new Date().toISOString(),
          releasedAt: null,
          isExpired: false,
          owner: { id: 'usr-fac-1', displayName: 'Facilities Admin', email: 'fac@dskt.local' },
        },
        response: jsonResponse(200),
      });

      // First save returns 409 concurrency_conflict
      put.mockResolvedValueOnce({
        data: {
          error: 'concurrency_conflict',
          currentConcurrencyVersion: 3,
        },
        response: jsonResponse(409),
      });

      render(
        <BoundaryEditor
          floorId="floor-1"
          revision={sampleDraftRevision}
          canMutate={true}
          onRevisionUpdated={() => undefined}
          onError={() => undefined}
        />,
      );

      const saveBtn = screen.getByRole('button', { name: 'Save Draft Boundary' });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByTestId('concurrency-conflict-banner')).toBeInTheDocument();
      });

      // Prepare get revision mock returning version 3
      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan/revisions/{revisionId}') {
          return {
            data: { revision: { ...sampleDraftRevision, concurrencyVersion: 3 } },
            response: jsonResponse(200),
          };
        }
        return { data: [], response: jsonResponse(200) };
      });

      // Next PUT with version 3 succeeds
      const reappliedRevision: FloorPlanRevision = {
        ...sampleDraftRevision,
        concurrencyVersion: 4,
      };
      put.mockResolvedValueOnce({
        data: reappliedRevision,
        response: jsonResponse(200),
      });

      const reapplyBtn = screen.getByTestId('reapply-unsaved-button');
      fireEvent.click(reapplyBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('concurrency-conflict-banner')).not.toBeInTheDocument();
      });

      expect(put).toHaveBeenCalledWith(
        '/floors/{floorId}/floor-plan/revisions/{revisionId}/boundary',
        expect.objectContaining({
          body: expect.objectContaining({
            concurrencyVersion: 3,
          }),
        }),
      );
      expect(screen.getByTestId('autosave-status')).toHaveTextContent('✓ Saved');
    });

    it('validation failures do not corrupt committed history or report false saved state', async () => {
      post.mockResolvedValue({
        data: {
          floorPlanRevisionId: 'rev-draft-1',
          token: 'tok-val-1',
          acquiredAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          renewedAt: new Date().toISOString(),
          releasedAt: null,
          isExpired: false,
          owner: { id: 'usr-fac-1', displayName: 'Facilities Admin', email: 'fac@dskt.local' },
        },
        response: jsonResponse(200),
      });

      render(
        <BoundaryEditor
          floorId="floor-1"
          revision={sampleDraftRevision}
          canMutate={true}
          onRevisionUpdated={() => undefined}
          onError={() => undefined}
        />,
      );

      // Add a non-orthogonal vertex e.g. (37, 43) which creates advisory diagnostic
      const xInput = screen.getByLabelText('New vertex X coordinate');
      const yInput = screen.getByLabelText('New vertex Y coordinate');
      const addBtn = screen.getByRole('button', { name: 'Add Vertex' });

      fireEvent.change(xInput, { target: { value: '37' } });
      fireEvent.change(yInput, { target: { value: '43' } });
      fireEvent.click(addBtn);

      // Autosave status must show Validation Error, NOT Saved
      await waitFor(() => {
        expect(screen.getByTestId('autosave-status')).toHaveTextContent('Validation Error');
      });

      // Undo reverts the invalid vertex
      const undoBtn = screen.getByTestId('undo-button');
      expect(undoBtn).toBeEnabled();
      fireEvent.click(undoBtn);

      // After undo, invalid vertex is removed
      expect(screen.queryByText('(37, 43)')).not.toBeInTheDocument();
    });
  });
});
