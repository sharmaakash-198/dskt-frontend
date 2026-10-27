import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssignSpacePanel } from './AssignSpacePanel';
import type { FloorPlanRevision, PlacedElement } from '../floors/floor-plan-api';
import type { Assignment } from './api';

const postMock = vi.fn();
const getMock = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    POST: (...args: unknown[]) => postMock(...args),
    GET: (...args: unknown[]) => getMock(...args),
  },
}));

function jsonResponse(status: number) {
  return { status, ok: status >= 200 && status < 300 } as Response;
}

const mockFloorId = '11111111-1111-1111-1111-111111111111';

const mockRevision: FloorPlanRevision = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  floorPlanId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  revisionNumber: 1,
  lifecycleState: 'PUBLISHED',
  editingScale: 1,
  concurrencyVersion: 1,
  publishedByUserId: 'user-1',
  publishedAt: '2026-10-20T00:00:00.000Z',
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
  boundary: [
    { x: 0, y: 0 },
    { x: 500, y: 0 },
    { x: 500, y: 500 },
    { x: 0, y: 500 },
  ],
  placements: [],
};

const physicalDesk1: PlacedElement = {
  id: 'desk-placement-1',
  floorPlanRevisionId: mockRevision.id,
  placementIdentityId: 'pi-desk-1',
  elementTemplateRevisionId: 'tmpl-rev-1',
  templateId: 'tmpl-1',
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
  label: 'WS-101',
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

const physicalDesk2: PlacedElement = {
  id: 'desk-placement-2',
  floorPlanRevisionId: mockRevision.id,
  placementIdentityId: 'pi-desk-2',
  elementTemplateRevisionId: 'tmpl-rev-1',
  templateId: 'tmpl-1',
  templateCode: 'DESK-A',
  templateName: 'Standard Desk',
  templateRevisionNumber: 1,
  assignable: true,
  spatialClass: 'PHYSICAL',
  borderColor: '#1e3a8a',
  fillColor: '#93c5fd',
  positionX: 300,
  positionY: 100,
  rotationDegrees: 0,
  label: 'WS-102',
  vertices: [
    { x: 300, y: 100 },
    { x: 400, y: 100 },
    { x: 400, y: 160 },
    { x: 300, y: 160 },
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

const nonAssignableZone: PlacedElement = {
  id: 'zone-placement-1',
  floorPlanRevisionId: mockRevision.id,
  placementIdentityId: 'pi-zone-1',
  elementTemplateRevisionId: 'tmpl-rev-2',
  templateId: 'tmpl-2',
  templateCode: 'ZONE-COLLAB',
  templateName: 'Collaboration Zone',
  templateRevisionNumber: 1,
  assignable: false,
  spatialClass: 'ZONE',
  borderColor: '#059669',
  fillColor: '#a7f3d0',
  positionX: 50,
  positionY: 300,
  rotationDegrees: 0,
  label: 'COLLAB-01',
  vertices: [
    { x: 50, y: 300 },
    { x: 250, y: 300 },
    { x: 250, y: 450 },
    { x: 50, y: 450 },
  ],
  localVertices: [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 150 },
    { x: 0, y: 150 },
  ],
  createdAt: '2026-10-22T00:00:00.000Z',
  updatedAt: '2026-10-22T00:00:00.000Z',
};

const mockEmployeeAlice = {
  id: 'emp-uuid-alice',
  employeeId: 'EMP-001',
  fullName: 'Alice Johnson',
  email: 'alice@acme.com',
  jobTitle: 'Senior Architect',
  department: { id: 'dept-1', code: 'ENG', name: 'Engineering' },
  team: { id: 'team-1', code: 'CORE', name: 'Core Architecture' },
  preferredSite: { id: 'site-1', code: 'SFO', name: 'San Francisco HQ' },
  employmentStatus: 'FULL_TIME',
  active: true,
};

const mockExistingAssignmentForAlice: Assignment = {
  id: 'assign-existing-1',
  placementIdentityId: 'pi-other-space',
  employeeId: 'emp-uuid-alice',
  employeeName: 'Alice Johnson',
  employeeCode: 'EMP-001',
  employeeEmail: 'alice@acme.com',
  departmentName: 'Engineering',
  spaceLabel: 'LAB-BENCH-4',
  floorId: 'floor-other',
  floorName: 'Floor 2',
  buildingName: 'Building A',
  siteName: 'San Francisco HQ',
  startedAt: '2026-10-01T09:00:00.000Z',
  endedAt: null,
  assignedByUserId: 'user-1',
  createdAt: '2026-10-01T09:00:00.000Z',
};

describe('AssignSpacePanel Component Tests (Ticket 26)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getMock.mockImplementation((path: string, options?: { params?: { query?: Record<string, unknown> } }) => {
      if (path === '/employees') {
        const query = options?.params?.query?.q as string | undefined;
        if (query && query.toLowerCase().includes('alice')) {
          return Promise.resolve({
            data: { total: 1, limit: 10, offset: 0, items: [mockEmployeeAlice] },
            response: jsonResponse(200),
          });
        }
        return Promise.resolve({
          data: { total: 0, limit: 10, offset: 0, items: [] },
          response: jsonResponse(200),
        });
      }

      if (path === '/assignments') {
        const empId = options?.params?.query?.employeeId as string | undefined;
        if (empId === 'emp-uuid-alice') {
          return Promise.resolve({
            data: [mockExistingAssignmentForAlice],
            response: jsonResponse(200),
          });
        }
        return Promise.resolve({
          data: [],
          response: jsonResponse(200),
        });
      }

      return Promise.resolve({ data: null, response: jsonResponse(404) });
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('filters candidate spaces to only assignable physical placements and displays candidate context', async () => {
    render(
      <AssignSpacePanel
        floorId={mockFloorId}
        floorName="Floor 1"
        buildingName="HQ-B1"
        siteName="San Francisco HQ"
        revision={mockRevision}
        placements={[physicalDesk1, physicalDesk2, nonAssignableZone]}
        onAssignmentCreated={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Candidate space dropdown should only have PHYSICAL assignable desks (not ZONE)
    const select = screen.getByTestId('candidate-space-select') as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
    expect(select.options.item(0)?.text).toContain('WS-101');
    expect(select.options.item(1)?.text).toContain('WS-102');

    // Shows candidate space context
    expect(screen.getByTestId('candidate-space-context')).toHaveTextContent('WS-101');
    expect(screen.getByTestId('candidate-space-context')).toHaveTextContent('Standard Desk');
    expect(screen.getByTestId('candidate-space-context')).toHaveTextContent('PHYSICAL (Assignable)');
    expect(screen.getByTestId('candidate-space-context')).toHaveTextContent('San Francisco HQ • HQ-B1 • Floor 1');
  });

  it('searches employees, displays selected employee, and shows their existing assignments beside candidate space', async () => {
    render(
      <AssignSpacePanel
        floorId={mockFloorId}
        floorName="Floor 1"
        buildingName="HQ-B1"
        siteName="San Francisco HQ"
        revision={mockRevision}
        placements={[physicalDesk1, physicalDesk2]}
        onAssignmentCreated={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Search for "Alice"
    const searchInput = screen.getByTestId('employee-search-input');
    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    // Wait for search result and select
    await waitFor(() => {
      expect(screen.getByTestId('select-emp-EMP-001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('select-emp-EMP-001'));

    // Selected employee card rendered
    expect(screen.getByTestId('selected-employee-card')).toHaveTextContent('Alice Johnson (EMP-001)');
    expect(screen.getByTestId('selected-employee-card')).toHaveTextContent('alice@acme.com');

    // Acceptance Criterion 1: Shows selected employee's existing assignments beside candidate-space context
    await waitFor(() => {
      expect(screen.getByTestId('employee-existing-assignments')).toHaveTextContent('LAB-BENCH-4');
      expect(screen.getByTestId('employee-existing-assignments')).toHaveTextContent('San Francisco HQ / Building A / Floor 2');
    });
  });

  it('validates period and prevents submission when end time is earlier than or equal to start time', async () => {
    render(
      <AssignSpacePanel
        floorId={mockFloorId}
        floorName="Floor 1"
        buildingName="HQ-B1"
        siteName="San Francisco HQ"
        revision={mockRevision}
        placements={[physicalDesk1]}
        onAssignmentCreated={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Select Alice
    fireEvent.change(screen.getByTestId('employee-search-input'), { target: { value: 'Alice' } });
    await waitFor(() => expect(screen.getByTestId('select-emp-EMP-001')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('select-emp-EMP-001'));

    // Set invalid period: end earlier than start
    const startInput = screen.getByTestId('start-date-input');
    const endInput = screen.getByTestId('end-date-input');

    fireEvent.change(startInput, { target: { value: '2026-11-01T17:00' } });
    fireEvent.change(endInput, { target: { value: '2026-11-01T09:00' } });

    // Period validation error displayed
    expect(screen.getByTestId('period-validation-error')).toHaveTextContent(
      'Assignment end time must be later than start time.',
    );

    // Confirm button is disabled
    const confirmBtn = screen.getByTestId('confirm-assignment-btn');
    expect(confirmBtn).toBeDisabled();
  });

  it('detects and warns when candidate space is already assigned during the selected period', async () => {
    // Mock that desk 1 already has an assignment on [2026-11-01T09:00Z, 2026-11-01T17:00Z)
    getMock.mockImplementation((path: string, options?: { params?: { query?: Record<string, unknown> } }) => {
      if (path === '/assignments' && options?.params?.query?.placementIdentityId === 'pi-desk-1') {
        return Promise.resolve({
          data: [
            {
              id: 'assign-desk-1-bob',
              placementIdentityId: 'pi-desk-1',
              employeeId: 'emp-bob',
              employeeName: 'Bob Smith',
              employeeCode: 'EMP-002',
              spaceLabel: 'WS-101',
              floorId: mockFloorId,
              floorName: 'Floor 1',
              buildingName: 'HQ-B1',
              siteName: 'San Francisco HQ',
              startedAt: '2026-11-01T09:00:00.000Z',
              endedAt: '2026-11-01T17:00:00.000Z',
              assignedByUserId: 'user-1',
              createdAt: '2026-10-20T00:00:00.000Z',
            },
          ],
          response: jsonResponse(200),
        });
      }
      return Promise.resolve({ data: [], response: jsonResponse(200) });
    });

    render(
      <AssignSpacePanel
        floorId={mockFloorId}
        floorName="Floor 1"
        buildingName="HQ-B1"
        siteName="San Francisco HQ"
        revision={mockRevision}
        placements={[physicalDesk1]}
        onAssignmentCreated={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Wait for space occupancy to load
    await waitFor(() => {
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });

    // Set proposed period that overlaps: [2026-11-01T12:00, 2026-11-01T15:00]
    fireEvent.change(screen.getByTestId('start-date-input'), { target: { value: '2026-11-01T12:00' } });
    fireEvent.change(screen.getByTestId('end-date-input'), { target: { value: '2026-11-01T15:00' } });

    // Conflict alert is rendered
    expect(screen.getByTestId('space-conflict-alert')).toHaveTextContent(
      'Space Already Occupied: This space has an overlapping assignment during the selected time period.',
    );
  });

  it('submits valid assignment transactionally with client command idempotency and notifies callback', async () => {
    const onCreated = vi.fn();
    const createdAssignment: Assignment = {
      id: 'new-assignment-uuid',
      placementIdentityId: 'pi-desk-1',
      employeeId: 'emp-uuid-alice',
      employeeName: 'Alice Johnson',
      employeeCode: 'EMP-001',
      employeeEmail: 'alice@acme.com',
      spaceLabel: 'WS-101',
      floorId: mockFloorId,
      floorName: 'Floor 1',
      buildingName: 'HQ-B1',
      siteName: 'San Francisco HQ',
      startedAt: '2026-11-01T09:00:00.000Z',
      endedAt: '2026-11-01T17:00:00.000Z',
      assignedByUserId: 'user-planner',
      clientCommandId: 'cmd-test',
      createdAt: '2026-10-27T00:00:00.000Z',
    };

    postMock.mockResolvedValueOnce({
      data: createdAssignment,
      response: jsonResponse(201),
    });

    render(
      <AssignSpacePanel
        floorId={mockFloorId}
        floorName="Floor 1"
        buildingName="HQ-B1"
        siteName="San Francisco HQ"
        revision={mockRevision}
        placements={[physicalDesk1]}
        onAssignmentCreated={onCreated}
        onClose={vi.fn()}
      />,
    );

    // Select Alice
    fireEvent.change(screen.getByTestId('employee-search-input'), { target: { value: 'Alice' } });
    await waitFor(() => expect(screen.getByTestId('select-emp-EMP-001')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('select-emp-EMP-001'));

    // Set valid period: [2026-11-01T09:00, 2026-11-01T17:00]
    fireEvent.change(screen.getByTestId('start-date-input'), { target: { value: '2026-11-01T09:00' } });
    fireEvent.change(screen.getByTestId('end-date-input'), { target: { value: '2026-11-01T17:00' } });

    // Submit
    const confirmBtn = screen.getByTestId('confirm-assignment-btn');
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        '/assignments',
        expect.objectContaining({
          body: expect.objectContaining({
            employeeId: 'emp-uuid-alice',
            placementIdentityId: 'pi-desk-1',
            clientCommandId: expect.stringMatching(/^cmd-assign-/),
          }),
        }),
      );
    });

    expect(onCreated).toHaveBeenCalledWith(createdAssignment);
    expect(screen.getByTestId('assignment-success-alert')).toHaveTextContent(
      'Successfully assigned Alice Johnson to space WS-101.',
    );
  });

  it('renders backend conflict error message when assignment is rejected due to server-side conflict', async () => {
    postMock.mockResolvedValueOnce({
      data: { error: 'space_already_assigned', message: 'Candidate space is already assigned for an overlapping time period' },
      response: jsonResponse(409),
    });

    render(
      <AssignSpacePanel
        floorId={mockFloorId}
        floorName="Floor 1"
        buildingName="HQ-B1"
        siteName="San Francisco HQ"
        revision={mockRevision}
        placements={[physicalDesk1]}
        onAssignmentCreated={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Select Alice
    fireEvent.change(screen.getByTestId('employee-search-input'), { target: { value: 'Alice' } });
    await waitFor(() => expect(screen.getByTestId('select-emp-EMP-001')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('select-emp-EMP-001'));

    fireEvent.click(screen.getByTestId('confirm-assignment-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('assignment-error-alert')).toHaveTextContent(
        'Assignment Failed: This space is already assigned for an overlapping time period.',
      );
    });
  });
});
