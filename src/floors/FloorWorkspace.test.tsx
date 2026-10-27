import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    });
  });
});
