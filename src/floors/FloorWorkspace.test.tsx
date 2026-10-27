import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FloorWorkspace } from './FloorWorkspace';

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

const site = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  code: 'NOIDA',
  name: 'Noida HQ',
  timeZone: 'Asia/Kolkata',
  address: {
    addressLine1: null,
    addressLine2: null,
    city: 'Noida',
    region: null,
    postalCode: null,
    country: null,
  },
};

const building = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  siteId: site.id,
  code: 'A',
  name: 'Building A',
};

const floor = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  buildingId: building.id,
  code: 'L1',
  name: 'Level 1',
};

describe('FloorWorkspace', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the empty floor workspace and returns to floors', async () => {
    get.mockResolvedValue({ data: { revisions: [] }, response: jsonResponse(200) });
    const onBack = vi.fn();

    render(<FloorWorkspace site={site} building={building} floor={floor} onBack={onBack} />);

    expect(screen.getByRole('heading', { name: 'NOIDA / A / L1' })).toBeInTheDocument();
    expect(await screen.findByText(/currently empty/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to floors' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('allows Facilities Admin to create the first draft floor plan from an empty floor', async () => {
    get.mockResolvedValue({ data: { revisions: [] }, response: jsonResponse(200) });
    post.mockResolvedValue({
      data: {
        floorPlan: {
          id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          floorId: floor.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        revision: {
          id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
          floorPlanId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          revisionNumber: 1,
          lifecycleState: 'DRAFT',
          editingScale: 2,
          concurrencyVersion: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      response: jsonResponse(201),
    });

    render(
      <FloorWorkspace
        site={site}
        building={building}
        floor={floor}
        canMutate={true}
        onBack={() => undefined}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Create draft floor plan' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Editing scale'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft floor plan' }));

    expect(await screen.findByText(/Draft Floor Plan Active/i)).toBeInTheDocument();
    expect(screen.getByText(/Revision 1 is in Draft state at scale 2x/i)).toBeInTheDocument();
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
  });

  it('distinguishes Draft, Published, and Archived states in revision history', async () => {
    get.mockResolvedValue({
      data: {
        revisions: [
          {
            id: 'rev-1',
            floorPlanId: 'fp-1',
            revisionNumber: 1,
            lifecycleState: 'ARCHIVED',
            editingScale: 1,
            concurrencyVersion: 5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'rev-2',
            floorPlanId: 'fp-1',
            revisionNumber: 2,
            lifecycleState: 'PUBLISHED',
            editingScale: 1,
            concurrencyVersion: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'rev-3',
            floorPlanId: 'fp-1',
            revisionNumber: 3,
            lifecycleState: 'DRAFT',
            editingScale: 2,
            concurrencyVersion: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
      response: jsonResponse(200),
    });

    render(
      <FloorWorkspace
        site={site}
        building={building}
        floor={floor}
        canMutate={false}
        onBack={() => undefined}
      />,
    );

    expect(await screen.findByText('Revision History')).toBeInTheDocument();
    expect(screen.getByText('ARCHIVED')).toBeInTheDocument();
    expect(screen.getByText('PUBLISHED')).toBeInTheDocument();
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
  });

  it('hides create button when canMutate is false on an empty floor', async () => {
    get.mockResolvedValue({ data: { revisions: [] }, response: jsonResponse(200) });

    render(
      <FloorWorkspace
        site={site}
        building={building}
        floor={floor}
        canMutate={false}
        onBack={() => undefined}
      />,
    );

    expect(await screen.findByText(/currently empty/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create draft floor plan' })).not.toBeInTheDocument();
  });

  describe('Ticket 20: Browse Published maps and revision history', () => {
    const publishedRev = {
      id: 'rev-pub-1',
      floorPlanId: 'fp-1',
      revisionNumber: 1,
      lifecycleState: 'PUBLISHED' as const,
      editingScale: 1,
      concurrencyVersion: 5,
      boundary: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      placements: [
        {
          id: 'place-zone-1',
          floorPlanRevisionId: 'rev-pub-1',
          placementIdentityId: 'pi-1',
          elementTemplateRevisionId: 'tmpl-rev-1',
          templateId: 't-1',
          templateCode: 'ZONE-A',
          templateName: 'Zone Alpha',
          templateRevisionNumber: 1,
          assignable: false,
          spatialClass: 'ZONE' as const,
          borderColor: '#3b82f6',
          fillColor: '#93c5fd',
          positionX: 5,
          positionY: 5,
          rotationDegrees: 0,
          label: 'Zone 1',
          vertices: [{ x: 5, y: 5 }, { x: 45, y: 5 }, { x: 45, y: 45 }, { x: 5, y: 45 }],
          localVertices: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'place-desk-1',
          floorPlanRevisionId: 'rev-pub-1',
          placementIdentityId: 'pi-2',
          elementTemplateRevisionId: 'tmpl-rev-2',
          templateId: 't-2',
          templateCode: 'DESK-STD',
          templateName: 'Standard Desk',
          templateRevisionNumber: 1,
          assignable: true,
          spatialClass: 'PHYSICAL' as const,
          borderColor: '#10b981',
          fillColor: '#6ee7b7',
          positionX: 10,
          positionY: 10,
          rotationDegrees: 90,
          label: 'Desk 1',
          vertices: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }],
          localVertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'place-obs-1',
          floorPlanRevisionId: 'rev-pub-1',
          placementIdentityId: 'pi-3',
          elementTemplateRevisionId: 'tmpl-rev-3',
          templateId: 't-3',
          templateCode: 'COL-STR',
          templateName: 'Structural Column',
          templateRevisionNumber: 1,
          assignable: false,
          spatialClass: 'OBSTACLE' as const,
          borderColor: '#6b7280',
          fillColor: '#d1d5db',
          positionX: 60,
          positionY: 60,
          rotationDegrees: 0,
          label: 'Column 1',
          vertices: [{ x: 60, y: 60 }, { x: 70, y: 60 }, { x: 70, y: 70 }, { x: 60, y: 70 }],
          localVertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('opens Published map with shared renderer and all element classes for non-facilities roles', async () => {
      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              activeRevision: publishedRev,
              publishedRevision: publishedRev,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: { revisions: [publishedRev] },
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          onBack={() => undefined}
        />,
      );

      // 1. Heading confirms published map active
      expect(await screen.findByText(/Published Floor Plan Active/i)).toBeInTheDocument();
      expect(screen.getByText(/Revision 1 is Published at scale 1x/i)).toBeInTheDocument();

      // 2. Placed elements from all three classes (ZONE, PHYSICAL, OBSTACLE) are present
      expect(screen.getByTestId('placed-space-place-zone-1')).toBeInTheDocument();
      expect(screen.getByTestId('placed-space-place-desk-1')).toBeInTheDocument();
      expect(screen.getByTestId('placed-space-place-obs-1')).toBeInTheDocument();

      // 3. Inspecting a placed element opens accessible details
      fireEvent.click(screen.getByRole('button', { name: /Select Desk 1/i }));
      expect(await screen.findByRole('region', { name: 'Details for Desk 1' })).toBeInTheDocument();
      expect(screen.getByText(/Standard Desk/i)).toBeInTheDocument();
      expect(screen.getByTestId('spatial-class-value')).toHaveTextContent('PHYSICAL');
      expect(screen.getByText(/Assignable \(Workplace assignments permitted\)/i)).toBeInTheDocument();
    });

    it('strictly hides all editing controls in Published experience', async () => {
      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              activeRevision: publishedRev,
              publishedRevision: publishedRev,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: { revisions: [publishedRev] },
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          onBack={() => undefined}
        />,
      );

      expect(await screen.findByText(/Published Floor Plan Active/i)).toBeInTheDocument();

      // NO editing scale dropdown
      expect(screen.queryByLabelText('Editing Scale')).not.toBeInTheDocument();
      // NO undo/redo buttons
      expect(screen.queryByTestId('undo-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('redo-button')).not.toBeInTheDocument();
      // NO autosave badge
      expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument();
      // NO validation or publish button
      expect(screen.queryByTestId('validate-publication-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('publish-floor-plan-button')).not.toBeInTheDocument();
      // NO catalog palette
      expect(screen.queryByRole('region', { name: 'Template Catalog Palette' })).not.toBeInTheDocument();
      // NO boundary mutation form
      expect(screen.queryByRole('button', { name: 'Add Vertex' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save Draft Boundary' })).not.toBeInTheDocument();
    });

    it('allows Facilities Admin to switch between Draft Editor and Published Map', async () => {
      const draftRev = {
        id: 'rev-draft-2',
        floorPlanId: 'fp-1',
        revisionNumber: 2,
        lifecycleState: 'DRAFT' as const,
        editingScale: 2,
        concurrencyVersion: 1,
        boundary: publishedRev.boundary,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              activeRevision: draftRev,
              publishedRevision: publishedRev,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: { revisions: [publishedRev, draftRev] },
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={true}
          onBack={() => undefined}
        />,
      );

      // Draft editor active by default
      expect(await screen.findByText(/Draft Floor Plan Active/i)).toBeInTheDocument();
      expect(screen.getByTestId('tab-draft-editor')).toBeInTheDocument();
      expect(screen.getByTestId('tab-published-map')).toBeInTheDocument();

      // Switch to Published Map
      fireEvent.click(screen.getByTestId('tab-published-map'));
      expect(await screen.findByText(/Published Floor Plan Active/i)).toBeInTheDocument();
      expect(screen.getByText(/Revision 1 is Published at scale 1x/i)).toBeInTheDocument();
    });

    it('renders explicit unpublished state when draft exists but no revision is published for viewers', async () => {
      const draftRev = {
        id: 'rev-draft-1',
        floorPlanId: 'fp-1',
        revisionNumber: 1,
        lifecycleState: 'DRAFT' as const,
        editingScale: 1,
        concurrencyVersion: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              activeRevision: null, // Viewer gets null activeRevision
              publishedRevision: null,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: { revisions: [draftRev] },
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          onBack={() => undefined}
        />,
      );

      // Viewer cannot see draft geometry; unpublished state is explicit
      expect(await screen.findByTestId('unpublished-floor-plan')).toBeInTheDocument();
      expect(screen.getByText(/This floor plan has not been published yet/i)).toBeInTheDocument();
    });

    it('renders explicit archived-location state when location is archived', async () => {
      const archivedFloor = { ...floor, archivedAt: new Date().toISOString() };

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={archivedFloor}
          canMutate={false}
          onBack={() => undefined}
        />,
      );

      expect(await screen.findByTestId('archived-location-state')).toBeInTheDocument();
      expect(screen.getByText(/Location Archived/i)).toBeInTheDocument();
      expect(screen.getByText(/Floor maps and revisions cannot be viewed or edited for archived locations/i)).toBeInTheDocument();
    });

    it('renders explicit unavailable state when network/server error occurs', async () => {
      get.mockRejectedValue(new Error('Network error'));

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          onBack={() => undefined}
        />,
      );

      expect(await screen.findByTestId('unavailable-state')).toBeInTheDocument();
      expect(screen.getByText(/Floor Plan Unavailable/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
  });

  describe('Ticket 25: Batch Labeling in Published Map', () => {
    const publishedRev = {
      id: 'rev-published-batch',
      floorPlanId: 'fp-1',
      revisionNumber: 1,
      lifecycleState: 'PUBLISHED' as const,
      editingScale: 1,
      concurrencyVersion: 1,
      boundary: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1000 },
        { x: 0, y: 1000 },
      ],
      placements: [
        {
          id: 'place-desk-1',
          floorPlanRevisionId: 'rev-published-batch',
          placementIdentityId: 'pi-1',
          elementTemplateRevisionId: 'tmpl-rev-1',
          templateId: 'tmpl-1',
          templateCode: 'DESK',
          templateName: 'Desk 1',
          templateRevisionNumber: 1,
          assignable: true,
          spatialClass: 'PHYSICAL' as const,
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('shows Batch Label Spaces button for Workplace Planner and opens panel', async () => {
      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              activeRevision: publishedRev,
              publishedRevision: publishedRev,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: { revisions: [publishedRev] },
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          isPlanner={true}
          onBack={() => undefined}
        />,
      );

      const batchBtn = await screen.findByTestId('open-batch-labeling-btn');
      expect(batchBtn).toBeInTheDocument();

      fireEvent.click(batchBtn);

      expect(await screen.findByTestId('batch-label-panel')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /batch label spaces/i })).toBeInTheDocument();
    });

    it('does not show Batch Label Spaces button for Viewer or non-planner', async () => {
      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              activeRevision: publishedRev,
              publishedRevision: publishedRev,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: { revisions: [publishedRev] },
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          isPlanner={false}
          onBack={() => undefined}
        />,
      );

      expect(await screen.findByText(/Published Floor Plan Active/i)).toBeInTheDocument();
      expect(screen.queryByTestId('open-batch-labeling-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('open-assign-space-btn')).not.toBeInTheDocument();
    });

    it('allows Workplace Planner to open the Assign Space workflow from the published header', async () => {
      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              activeRevision: publishedRev,
              publishedRevision: publishedRev,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: { revisions: [publishedRev] },
            response: jsonResponse(200),
          };
        }
        if (path === '/assignments') {
          return { data: [], response: jsonResponse(200) };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          isPlanner={true}
          onBack={() => undefined}
        />,
      );

      const assignBtn = await screen.findByTestId('open-assign-space-btn');
      expect(assignBtn).toBeInTheDocument();

      fireEvent.click(assignBtn);

      expect(await screen.findByTestId('assign-space-panel')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /assign space to employee/i })).toBeInTheDocument();
    });

    it('shows vacancy or current assignment and allow assigning when inspecting an assignable space', async () => {
      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              activeRevision: publishedRev,
              publishedRevision: publishedRev,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: { revisions: [publishedRev] },
            response: jsonResponse(200),
          };
        }
        if (path === '/assignments') {
          return {
            data: [
              {
                id: 'assign-1',
                placementIdentityId: 'pi-1',
                employeeId: 'emp-1',
                employeeName: 'Jane Doe',
                employeeCode: 'EMP-999',
                spaceLabel: 'Space 1',
                floorId: floor.id,
                floorName: floor.name,
                buildingName: building.name,
                siteName: site.name,
                startedAt: '2026-10-01T09:00:00.000Z',
                endedAt: null,
                assignedByUserId: 'user-1',
                createdAt: '2026-10-01T09:00:00.000Z',
              },
            ],
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          isPlanner={true}
          onBack={() => undefined}
        />,
      );

      // Select placement 1
      const selectPlacementBtn = await screen.findByRole('button', { name: /Select Desk 1/i });
      fireEvent.click(selectPlacementBtn);

      // Verify assignment status in inspector
      const statusSection = await screen.findByTestId('placement-assignment-status');
      expect(statusSection).toHaveTextContent('Jane Doe (EMP-999)');

      // Verify assign space action button
      const assignSpaceBtn = screen.getByTestId('assign-space-btn');
      expect(assignSpaceBtn).toBeInTheDocument();
      fireEvent.click(assignSpaceBtn);

      expect(await screen.findByTestId('assign-space-panel')).toBeInTheDocument();
    });
  });

  describe('Ticket 27: End and inspect assignments', () => {
    const publishedRevWithPlacements = {
      id: 'rev-pub-1',
      floorPlanId: 'fp-1',
      revisionNumber: 1,
      lifecycleState: 'PUBLISHED',
      editingScale: 1,
      concurrencyVersion: 1,
      boundary: [
        { sequence: 0, x: 0, y: 0 },
        { sequence: 1, x: 100, y: 0 },
        { sequence: 2, x: 100, y: 100 },
        { sequence: 3, x: 0, y: 100 },
      ],
      placements: [
        {
          id: 'p-1',
          placementIdentityId: 'pi-1',
          label: 'Desk 1',
          positionX: 10,
          positionY: 10,
          rotationDegrees: 0,
          spatialClass: 'PHYSICAL',
          assignable: true,
          elementTemplateId: 'tmpl-1',
          elementTemplateRevisionId: 'rev-tmpl-1',
          templateName: 'Standard Desk',
          templateCode: 'DESK-STD',
          categoryName: 'Furniture',
          categoryCode: 'FURN',
          vertices: [
            { sequence: 0, x: 0, y: 0 },
            { sequence: 1, x: 10, y: 0 },
            { sequence: 2, x: 10, y: 10 },
            { sequence: 3, x: 0, y: 10 },
          ],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'p-2',
          placementIdentityId: 'pi-2',
          label: 'Desk 2',
          positionX: 30,
          positionY: 10,
          rotationDegrees: 0,
          spatialClass: 'PHYSICAL',
          assignable: true,
          elementTemplateId: 'tmpl-1',
          elementTemplateRevisionId: 'rev-tmpl-1',
          templateName: 'Standard Desk',
          templateCode: 'DESK-STD',
          categoryName: 'Furniture',
          categoryCode: 'FURN',
          vertices: [
            { sequence: 0, x: 0, y: 0 },
            { sequence: 1, x: 10, y: 0 },
            { sequence: 2, x: 10, y: 10 },
            { sequence: 3, x: 0, y: 10 },
          ],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    it('distinguishes current, future, and unassigned states in inspector', async () => {
      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              publishedRevision: publishedRevWithPlacements,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: { revisions: [publishedRevWithPlacements] },
            response: jsonResponse(200),
          };
        }
        if (path === '/assignments') {
          return {
            data: [
              {
                id: 'asgn-curr-1',
                placementIdentityId: 'pi-1',
                employeeId: 'emp-1',
                employeeName: 'Jane Doe',
                employeeCode: 'EMP-999',
                floorId: floor.id,
                startedAt: '2026-01-01T00:00:00.000Z',
                endedAt: null,
                status: 'CURRENT',
                assignedByUserId: 'usr-1',
                createdAt: '2026-01-01T00:00:00.000Z',
              },
              {
                id: 'asgn-fut-1',
                placementIdentityId: 'pi-1',
                employeeId: 'emp-2',
                employeeName: 'Bob Builder',
                employeeCode: 'EMP-888',
                floorId: floor.id,
                startedAt: '2026-12-01T00:00:00.000Z',
                endedAt: '2026-12-31T00:00:00.000Z',
                status: 'FUTURE',
                assignedByUserId: 'usr-1',
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          isPlanner={true}
          onBack={() => undefined}
        />,
      );

      // Select placement 1 (has current and future assignment)
      const selectPlacement1Btn = await screen.findByRole('button', { name: /Select Desk 1/i });
      fireEvent.click(selectPlacement1Btn);

      expect(await screen.findByTestId('assignment-status-current')).toBeInTheDocument();
      expect(screen.getByTestId('placement-assignment-status')).toHaveTextContent('Jane Doe (EMP-999)');
      expect(screen.getByTestId('assignment-status-future')).toBeInTheDocument();
      expect(screen.getByTestId('placement-future-assignments')).toHaveTextContent('Bob Builder (EMP-888)');

      // Select placement 2 (vacant / unassigned)
      const selectPlacement2Btn = await screen.findByRole('button', { name: /Select Desk 2/i });
      fireEvent.click(selectPlacement2Btn);

      expect(await screen.findByTestId('assignment-status-unassigned')).toBeInTheDocument();
      expect(screen.getByTestId('placement-assignment-status')).toHaveTextContent('Vacant');
    });

    it('allows Workplace Planner to end an active assignment and updates UI', async () => {
      const activeAsgn = {
        id: 'asgn-1',
        placementIdentityId: 'pi-1',
        employeeId: 'emp-1',
        employeeName: 'Jane Doe',
        employeeCode: 'EMP-999',
        floorId: floor.id,
        startedAt: '2026-01-01T00:00:00.000Z',
        endedAt: null,
        status: 'CURRENT' as const,
        assignedByUserId: 'usr-1',
        createdAt: '2026-01-01T00:00:00.000Z',
      };

      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              publishedRevision: publishedRevWithPlacements,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: { revisions: [publishedRevWithPlacements] },
            response: jsonResponse(200),
          };
        }
        if (path === '/assignments') {
          return {
            data: [activeAsgn],
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      post.mockImplementation(async (path: string) => {
        if (path === '/assignments/{id}/end') {
          return {
            data: {
              ...activeAsgn,
              endedAt: '2026-10-27T12:00:00.000Z',
              status: 'ENDED',
            },
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          isPlanner={true}
          onBack={() => undefined}
        />,
      );

      // Select placement 1
      const selectPlacement1Btn = await screen.findByRole('button', { name: /Select Desk 1/i });
      fireEvent.click(selectPlacement1Btn);

      const endBtn = await screen.findByTestId('end-assignment-btn');
      fireEvent.click(endBtn);

      // End assignment modal opens
      expect(screen.getByTestId('end-assignment-modal')).toBeInTheDocument();
      expect(screen.getByTestId('end-assignment-datetime-input')).toBeInTheDocument();

      // Submit end assignment
      const confirmBtn = screen.getByTestId('confirm-end-assignment-btn');
      fireEvent.click(confirmBtn);

      expect(post).toHaveBeenCalledWith(
        '/assignments/{id}/end',
        expect.objectContaining({
          params: { path: { id: 'asgn-1' } },
        }),
      );

      // Modal closes
      await waitFor(() => {
        expect(screen.queryByTestId('end-assignment-modal')).not.toBeInTheDocument();
      });
    });

    it('opens paginated assignment history drawer and displays records', async () => {
      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              publishedRevision: publishedRevWithPlacements,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: { revisions: [publishedRevWithPlacements] },
            response: jsonResponse(200),
          };
        }
        if (path === '/assignments') {
          return { data: [], response: jsonResponse(200) };
        }
        if (path === '/assignments/history') {
          return {
            data: {
              total: 2,
              limit: 10,
              offset: 0,
              items: [
                {
                  id: 'hist-1',
                  placementIdentityId: 'pi-1',
                  spaceLabel: 'Desk 1',
                  employeeId: 'emp-1',
                  employeeName: 'Alice Old',
                  employeeCode: 'EMP-111',
                  floorId: floor.id,
                  startedAt: '2025-01-01T00:00:00.000Z',
                  endedAt: '2025-06-01T00:00:00.000Z',
                  status: 'ENDED',
                  assignedByUserId: 'usr-1',
                  createdAt: '2025-01-01T00:00:00.000Z',
                },
              ],
            },
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          isPlanner={true}
          onBack={() => undefined}
        />,
      );

      const historyBtn = await screen.findByTestId('view-assignment-history-btn');
      fireEvent.click(historyBtn);

      expect(await screen.findByTestId('assignment-history-drawer')).toBeInTheDocument();
      expect(screen.getByTestId('history-item-hist-1')).toHaveTextContent('Alice Old (EMP-111)');
      expect(screen.getByTestId('history-page-info')).toHaveTextContent('Page 1 of 1');

      // Close drawer
      fireEvent.click(screen.getByTestId('close-history-btn'));
      expect(screen.queryByTestId('assignment-history-drawer')).not.toBeInTheDocument();
    });

    it('prohibits viewer from seeing assignment history button or action controls', async () => {
      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              publishedRevision: publishedRevWithPlacements,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: { revisions: [publishedRevWithPlacements] },
            response: jsonResponse(200),
          };
        }
        if (path === '/assignments') {
          return { data: [], response: jsonResponse(200) };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          isPlanner={false}
          onBack={() => undefined}
        />,
      );

      // Verify that viewer does not see history button or mutate buttons
      await screen.findByRole('button', { name: /Select Desk 1/i });
      expect(screen.queryByTestId('view-assignment-history-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('open-assign-space-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('end-assignment-btn')).not.toBeInTheDocument();
    });

    it('displays documented read-only summary for Facilities Admin without mutate actions', async () => {
      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              publishedRevision: publishedRevWithPlacements,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: { revisions: [publishedRevWithPlacements] },
            response: jsonResponse(200),
          };
        }
        if (path === '/assignments') {
          return { data: [], response: jsonResponse(200) };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={true}
          isPlanner={false}
          onBack={() => undefined}
        />,
      );

      // Facilities Admin has view access to history and tag
      expect(await screen.findByTestId('facilities-admin-tag')).toHaveTextContent(
        'Facilities Admin (Read-Only Assignments)',
      );
      expect(screen.getByTestId('view-assignment-history-btn')).toBeInTheDocument();
      // But no mutate actions
      expect(screen.queryByTestId('open-assign-space-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('end-assignment-btn')).not.toBeInTheDocument();
    });
  });

  describe('Ticket 28: Carry Assignments into a replacement revision', () => {
    it('renders Create Replacement Draft button for Facilities Admin when floor plan is published without active draft', async () => {
      get.mockImplementation(async (path: string) => {
        if (path.includes('/floor-plan/revisions')) {
          return {
            data: {
              revisions: [
                {
                  id: 'rev-pub-1',
                  floorPlanId: 'fp-1',
                  revisionNumber: 1,
                  lifecycleState: 'PUBLISHED',
                  editingScale: 1,
                  concurrencyVersion: 5,
                  createdByUserId: 'user-1',
                  publishedByUserId: 'user-1',
                  publishedAt: '2026-10-01T09:00:00.000Z',
                  boundaryVertices: [],
                  placements: [],
                  createdAt: '2026-10-01T09:00:00.000Z',
                  updatedAt: '2026-10-01T09:00:00.000Z',
                },
              ],
            },
            response: jsonResponse(200),
          };
        }
        if (path === `/floors/${floor.id}/floor-plan`) {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              activeRevision: null,
              publishedRevision: {
                id: 'rev-pub-1',
                floorPlanId: 'fp-1',
                revisionNumber: 1,
                lifecycleState: 'PUBLISHED',
                editingScale: 1,
                concurrencyVersion: 5,
                createdByUserId: 'user-1',
                publishedByUserId: 'user-1',
                publishedAt: '2026-10-01T09:00:00.000Z',
                boundaryVertices: [],
                placements: [],
                createdAt: '2026-10-01T09:00:00.000Z',
                updatedAt: '2026-10-01T09:00:00.000Z',
              },
            },
            response: jsonResponse(200),
          };
        }
        if (path.includes('/assignments')) {
          return { data: [], response: jsonResponse(200) };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={true}
          isPlanner={false}
          onBack={() => undefined}
        />,
      );

      // Verify "Create Replacement Draft" button is visible for Facilities Admin
      const createDraftBtn = await screen.findByTestId('create-replacement-draft-btn');
      expect(createDraftBtn).toBeInTheDocument();
      expect(createDraftBtn).toHaveTextContent('Create Replacement Draft');
    });

    it('creates replacement draft revision from published revision and switches to Draft Editor', async () => {
      get.mockImplementation(async (path: string) => {
        if (path.includes('/floor-plan/revisions')) {
          return {
            data: {
              revisions: [
                {
                  id: 'rev-pub-1',
                  floorPlanId: 'fp-1',
                  revisionNumber: 1,
                  lifecycleState: 'PUBLISHED',
                  editingScale: 1,
                  concurrencyVersion: 5,
                  createdByUserId: 'user-1',
                  publishedByUserId: 'user-1',
                  publishedAt: '2026-10-01T09:00:00.000Z',
                  boundaryVertices: [],
                  placements: [],
                  createdAt: '2026-10-01T09:00:00.000Z',
                  updatedAt: '2026-10-01T09:00:00.000Z',
                },
              ],
            },
            response: jsonResponse(200),
          };
        }
        if (path === `/floors/${floor.id}/floor-plan`) {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              activeRevision: null,
              publishedRevision: {
                id: 'rev-pub-1',
                floorPlanId: 'fp-1',
                revisionNumber: 1,
                lifecycleState: 'PUBLISHED',
                editingScale: 1,
                concurrencyVersion: 5,
                createdByUserId: 'user-1',
                publishedByUserId: 'user-1',
                publishedAt: '2026-10-01T09:00:00.000Z',
                boundaryVertices: [],
                placements: [],
                createdAt: '2026-10-01T09:00:00.000Z',
                updatedAt: '2026-10-01T09:00:00.000Z',
              },
            },
            response: jsonResponse(200),
          };
        }
        if (path.includes('/assignments')) {
          return { data: [], response: jsonResponse(200) };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      post.mockImplementation(async (path: string) => {
        if (path.includes('/revisions') && !path.includes('/lease')) {
          return {
            data: {
              id: 'rev-draft-2',
              floorPlanId: 'fp-1',
              revisionNumber: 2,
              lifecycleState: 'DRAFT',
              editingScale: 1,
              concurrencyVersion: 0,
              createdByUserId: 'user-1',
              boundaryVertices: [],
              placements: [],
              createdAt: '2026-10-27T10:00:00.000Z',
              updatedAt: '2026-10-27T10:00:00.000Z',
            },
            response: jsonResponse(201),
          };
        }
        if (path.includes('/lease')) {
          return {
            data: {
              floorPlanRevisionId: 'rev-draft-2',
              token: 'lease-tok-2',
              acquiredAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 60000).toISOString(),
              renewedAt: new Date().toISOString(),
              releasedAt: null,
              isExpired: false,
              owner: { id: 'user-1', displayName: 'Facilities Admin', email: 'fac@dskt.local' },
            },
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={true}
          isPlanner={false}
          onBack={() => undefined}
        />,
      );

      const createDraftBtn = await screen.findByTestId('create-replacement-draft-btn');
      fireEvent.click(createDraftBtn);

      // Verify workspace enters Draft Editor for Revision 2
      expect(await screen.findByTestId('tab-draft-editor')).toHaveTextContent('Draft Editor (Rev 2)');
      expect(screen.getByText(/Revision 2 is in Draft state/i)).toBeInTheDocument();
    });

    it('hides Create Replacement Draft button for non-facilities roles', async () => {
      get.mockImplementation(async (path: string) => {
        if (path.includes('/floor-plan/revisions')) {
          return {
            data: {
              revisions: [
                {
                  id: 'rev-pub-1',
                  floorPlanId: 'fp-1',
                  revisionNumber: 1,
                  lifecycleState: 'PUBLISHED',
                  editingScale: 1,
                  concurrencyVersion: 5,
                  createdByUserId: 'user-1',
                  publishedByUserId: 'user-1',
                  publishedAt: '2026-10-01T09:00:00.000Z',
                  boundaryVertices: [],
                  placements: [],
                  createdAt: '2026-10-01T09:00:00.000Z',
                  updatedAt: '2026-10-01T09:00:00.000Z',
                },
              ],
            },
            response: jsonResponse(200),
          };
        }
        if (path === `/floors/${floor.id}/floor-plan`) {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              activeRevision: null,
              publishedRevision: {
                id: 'rev-pub-1',
                floorPlanId: 'fp-1',
                revisionNumber: 1,
                lifecycleState: 'PUBLISHED',
                editingScale: 1,
                concurrencyVersion: 5,
                createdByUserId: 'user-1',
                publishedByUserId: 'user-1',
                publishedAt: '2026-10-01T09:00:00.000Z',
                boundaryVertices: [],
                placements: [],
                createdAt: '2026-10-01T09:00:00.000Z',
                updatedAt: '2026-10-01T09:00:00.000Z',
              },
            },
            response: jsonResponse(200),
          };
        }
        if (path.includes('/assignments')) {
          return { data: [], response: jsonResponse(200) };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          isPlanner={true}
          onBack={() => undefined}
        />,
      );

      await screen.findByRole('heading', { name: /Published Floor Plan Active/i });
      expect(screen.queryByTestId('create-replacement-draft-btn')).toBeNull();
    });

    it('focuses space on published map and opens space details for Viewer without relying on color alone (Ticket 29)', async () => {
      const deskPlacement = {
        id: 'place-desk-1',
        floorPlanRevisionId: 'rev-pub-1',
        placementIdentityId: 'pi-desk-target',
        elementTemplateRevisionId: 'tmpl-rev-1',
        templateId: 't-1',
        templateCode: 'DESK-STD',
        templateName: 'Standard Desk',
        templateRevisionNumber: 1,
        assignable: true,
        spatialClass: 'PHYSICAL' as const,
        borderColor: '#1e3a8a',
        fillColor: '#93c5fd',
        positionX: 20,
        positionY: 20,
        rotationDegrees: 0,
        label: 'Desk A-101',
        vertices: [
          { x: 20, y: 20 },
          { x: 30, y: 20 },
          { x: 30, y: 30 },
          { x: 20, y: 30 },
        ],
        localVertices: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const pubRevWithDesk = {
        id: 'rev-pub-1',
        floorPlanId: 'fp-1',
        revisionNumber: 1,
        lifecycleState: 'PUBLISHED' as const,
        editingScale: 1,
        concurrencyVersion: 1,
        boundary: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        placements: [deskPlacement],
        createdAt: '2026-10-01T09:00:00.000Z',
        updatedAt: '2026-10-01T09:00:00.000Z',
      };

      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: {
              revisions: [pubRevWithDesk],
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              activeRevision: null,
              publishedRevision: pubRevWithDesk,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/assignments') {
          return {
            data: [
              {
                id: 'asgn-1',
                placementIdentityId: 'pi-desk-target',
                employeeId: 'emp-1',
                employeeName: 'Alice Walker',
                employeeCode: 'EMP-001',
                spaceLabel: 'Desk A-101',
                floorId: floor.id,
                floorName: floor.name,
                buildingName: building.name,
                siteName: site.name,
                startedAt: '2026-01-01T00:00:00.000Z',
                endedAt: null,
                status: 'CURRENT',
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
            response: jsonResponse(200),
          };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          isPlanner={false}
          initialPlacementIdentityId="pi-desk-target"
          onBack={() => undefined}
        />,
      );

      // Verify published floor plan is active
      await screen.findByRole('heading', { name: /Published Floor Plan Active/i });

      // Verify the target space is automatically focused and selected
      await waitFor(() => {
        expect(screen.getByTestId('selection-affordance')).toBeInTheDocument();
      });

      // Verify accessible space inspector is open with employee details without relying on color alone
      const inspector = await screen.findByRole('region', { name: /Details for Desk A-101/i });
      expect(inspector).toBeInTheDocument();
      expect(inspector).toHaveTextContent('Desk A-101');
      expect(inspector).toHaveTextContent('Alice Walker');
      expect(inspector).toHaveTextContent('EMP-001');
      expect(screen.getByTestId('assignment-status-current')).toHaveTextContent('Current');
    });

    it('renders safe state when target space placement is stale or deleted (Ticket 29)', async () => {
      const pubRevEmpty = {
        id: 'rev-pub-1',
        floorPlanId: 'fp-1',
        revisionNumber: 1,
        lifecycleState: 'PUBLISHED' as const,
        editingScale: 1,
        concurrencyVersion: 1,
        boundary: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        placements: [
          {
            id: 'place-desk-other',
            floorPlanRevisionId: 'rev-pub-1',
            placementIdentityId: 'pi-other',
            elementTemplateRevisionId: 'tmpl-rev-1',
            templateId: 't-1',
            templateCode: 'DESK-STD',
            templateName: 'Standard Desk',
            templateRevisionNumber: 1,
            assignable: true,
            spatialClass: 'PHYSICAL' as const,
            borderColor: '#1e3a8a',
            fillColor: '#93c5fd',
            positionX: 20,
            positionY: 20,
            rotationDegrees: 0,
            label: 'Desk Other',
            vertices: [
              { x: 20, y: 20 },
              { x: 30, y: 20 },
              { x: 30, y: 30 },
              { x: 20, y: 30 },
            ],
            localVertices: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 10 },
              { x: 0, y: 10 },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        createdAt: '2026-10-01T09:00:00.000Z',
        updatedAt: '2026-10-01T09:00:00.000Z',
      };

      get.mockImplementation(async (path: string) => {
        if (path === '/floors/{floorId}/floor-plan/revisions') {
          return {
            data: {
              revisions: [pubRevEmpty],
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/floors/{floorId}/floor-plan') {
          return {
            data: {
              floorPlan: { id: 'fp-1', floorId: floor.id },
              activeRevision: null,
              publishedRevision: pubRevEmpty,
            },
            response: jsonResponse(200),
          };
        }
        if (path === '/assignments') {
          return { data: [], response: jsonResponse(200) };
        }
        return { data: {}, response: jsonResponse(200) };
      });

      render(
        <FloorWorkspace
          site={site}
          building={building}
          floor={floor}
          canMutate={false}
          isPlanner={false}
          initialPlacementIdentityId="pi-nonexistent-or-stale"
          onBack={() => undefined}
        />,
      );

      await screen.findByRole('heading', { name: /Published Floor Plan Active/i });
      expect(screen.getByTestId('stale-location-state')).toHaveTextContent(
        /assigned space is no longer present on the current published map/i,
      );
    });
  });
});
