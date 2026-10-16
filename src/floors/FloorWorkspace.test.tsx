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
});
