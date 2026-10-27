import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeeDirectoryPanel } from './EmployeeDirectoryPanel';
import * as workforceApi from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    searchEmployees: vi.fn(),
  };
});

describe('EmployeeDirectoryPanel (Component & Keyboard Navigation Tests)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders initial idle / empty state ready for search', () => {
    render(<EmployeeDirectoryPanel canSearch={true} />);

    expect(screen.getByRole('heading', { name: 'Employee Directory' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /search employees/i })).toBeInTheDocument();
    expect(
      screen.getByText(/enter an employee id, name, or select filters to search the directory/i),
    ).toBeInTheDocument();
  });

  it('renders accessible permission denied state when canSearch is false', () => {
    render(<EmployeeDirectoryPanel canSearch={false} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/you do not have permission to search the employee directory/i);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('handles loading and no-result states gracefully', async () => {
    const searchMock = vi.mocked(workforceApi.searchEmployees);
    searchMock.mockResolvedValueOnce({
      ok: true,
      data: {
        total: 0,
        limit: 20,
        offset: 0,
        items: [],
      },
    });

    render(<EmployeeDirectoryPanel canSearch={true} />);

    const searchInput = screen.getByRole('searchbox', { name: /search employees/i });
    fireEvent.change(searchInput, { target: { value: 'Nonexistent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(
        screen.getByText(/no employees found matching the specified criteria/i),
      ).toBeInTheDocument();
    });
  });

  it('handles unavailable error state when API request fails', async () => {
    const searchMock = vi.mocked(workforceApi.searchEmployees);
    searchMock.mockResolvedValueOnce({
      ok: false,
      error: 'Backend network connection error.',
      statusCode: 500,
    });

    render(<EmployeeDirectoryPanel canSearch={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/backend network connection error/i);
    });
  });

  it('displays search results and supports inspection with field-level role projections', async () => {
    const searchMock = vi.mocked(workforceApi.searchEmployees);
    searchMock.mockResolvedValueOnce({
      ok: true,
      data: {
        total: 1,
        limit: 20,
        offset: 0,
        items: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            employeeId: 'EMP-001',
            fullName: 'Alice Smith',
            jobTitle: 'VP Engineering',
            email: 'alice@acme.com',
            department: { id: 'd1', code: 'ENG', name: 'Engineering' },
            team: { id: 't1', code: 'FE', name: 'Frontend Team' },
            preferredSite: { id: 's1', code: 'NYC', name: 'New York Office' },
            employmentStatus: 'FULL_TIME',
            active: true,
            managerEmployeeId: null,
            manager: null,
          },
        ],
      },
    });

    // Test with Planner role
    render(<EmployeeDirectoryPanel canSearch={true} isPlanner={true} role="WORKPLACE_PLANNER" />);

    // Inactive filter checkbox should be visible for Planner
    expect(screen.getByLabelText(/include inactive/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: /search employees/i }), {
      target: { value: 'Alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    // Inspect Alice
    fireEvent.click(screen.getByRole('button', { name: /inspect alice smith/i }));

    const details = screen.getByRole('region', { name: 'Employee details' });
    expect(details).toHaveTextContent('Alice Smith');
    expect(details).toHaveTextContent('EMP-001');
    expect(details).toHaveTextContent('alice@acme.com');
    expect(details).toHaveTextContent('VP Engineering');
    expect(details).toHaveTextContent('Engineering (ENG)');
    expect(details).toHaveTextContent('Frontend Team (FE)');
    expect(details).toHaveTextContent('New York Office (NYC)');
    // Planner sees employment status and active badge
    expect(details).toHaveTextContent('FULL_TIME');
    expect(details).toHaveTextContent('Active');

    // Close details
    fireEvent.click(screen.getByRole('button', { name: /close employee details/i }));
    expect(screen.queryByRole('region', { name: 'Employee details' })).not.toBeInTheDocument();
  });

  it('supports keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)', async () => {
    const searchMock = vi.mocked(workforceApi.searchEmployees);
    searchMock.mockResolvedValueOnce({
      ok: true,
      data: {
        total: 2,
        limit: 20,
        offset: 0,
        items: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            employeeId: 'EMP-001',
            fullName: 'Alice Smith',
            jobTitle: 'VP Engineering',
            department: null,
            team: null,
            preferredSite: null,
          },
          {
            id: '22222222-2222-2222-2222-222222222222',
            employeeId: 'EMP-002',
            fullName: 'Bob Jones',
            jobTitle: 'Staff Engineer',
            department: null,
            team: null,
            preferredSite: null,
          },
        ],
      },
    });

    render(<EmployeeDirectoryPanel canSearch={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    });

    const resultsList = screen.getByRole('list', { name: /employee directory search results/i });

    // Press ArrowDown to navigate to first item
    fireEvent.keyDown(resultsList, { key: 'ArrowDown' });
    // Press ArrowDown again to navigate to second item (Bob)
    fireEvent.keyDown(resultsList, { key: 'ArrowDown' });
    // Press Enter to select Bob
    fireEvent.keyDown(resultsList, { key: 'Enter' });

    expect(await screen.findByRole('region', { name: 'Employee details' })).toHaveTextContent('Bob Jones');

    // Press Escape on the list to dismiss details
    fireEvent.keyDown(resultsList, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Employee details' })).not.toBeInTheDocument();
  });

  it('supports bounded pagination', async () => {
    const searchMock = vi.mocked(workforceApi.searchEmployees);
    searchMock
      .mockResolvedValueOnce({
        ok: true,
        data: {
          total: 25,
          limit: 20,
          offset: 0,
          items: Array.from({ length: 20 }, (_, i) => ({
            id: `id-${i}`,
            employeeId: `EMP-${i}`,
            fullName: `Person ${i}`,
            jobTitle: 'Engineer',
            department: null,
            team: null,
            preferredSite: null,
          })),
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          total: 25,
          limit: 20,
          offset: 20,
          items: Array.from({ length: 5 }, (_, i) => ({
            id: `id-${i + 20}`,
            employeeId: `EMP-${i + 20}`,
            fullName: `Person ${i + 20}`,
            jobTitle: 'Engineer',
            department: null,
            team: null,
            preferredSite: null,
          })),
        },
      });

    render(<EmployeeDirectoryPanel canSearch={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText(/showing 1–20 of 25 employees/i)).toBeInTheDocument();
    });

    const nextBtn = screen.getByRole('button', { name: 'Next' });
    expect(nextBtn).toBeEnabled();
    const prevBtn = screen.getByRole('button', { name: 'Previous' });
    expect(prevBtn).toBeDisabled();

    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText(/showing 21–25 of 25 employees/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('communicates unassigned, single-active-space, and multiple-active-space states in search results without relying on color alone (Ticket 29)', async () => {
    const searchMock = vi.mocked(workforceApi.searchEmployees);
    searchMock.mockResolvedValueOnce({
      ok: true,
      data: {
        total: 3,
        limit: 20,
        offset: 0,
        items: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            employeeId: 'EMP-001',
            fullName: 'Alice Walker',
            jobTitle: 'Senior Engineer',
            department: { id: 'd1', code: 'ENG', name: 'Engineering' },
            team: null,
            preferredSite: { id: 's1', code: 'NYC', name: 'New York HQ' },
            activeAssignmentCount: 1,
            activeAssignments: [
              {
                id: 'a1',
                placementIdentityId: 'pi1',
                spaceLabel: 'Desk 101',
                siteId: 's1',
                siteName: 'New York HQ',
                buildingId: 'b1',
                buildingName: 'Tower A',
                floorId: 'f1',
                floorName: 'Floor 1',
                startedAt: '2026-01-01T00:00:00.000Z',
                endedAt: null,
                isAccessible: true,
              },
            ],
          },
          {
            id: '22222222-2222-2222-2222-222222222222',
            employeeId: 'EMP-002',
            fullName: 'Bob Smith',
            jobTitle: 'Architect',
            department: { id: 'd1', code: 'ENG', name: 'Engineering' },
            team: null,
            preferredSite: { id: 's1', code: 'NYC', name: 'New York HQ' },
            activeAssignmentCount: 2,
            activeAssignments: [
              {
                id: 'a2',
                placementIdentityId: 'pi2',
                spaceLabel: 'Desk 102',
                siteId: 's1',
                siteName: 'New York HQ',
                buildingId: 'b1',
                buildingName: 'Tower A',
                floorId: 'f1',
                floorName: 'Floor 1',
                startedAt: '2026-01-01T00:00:00.000Z',
                endedAt: null,
                isAccessible: true,
              },
              {
                id: 'a3',
                placementIdentityId: 'pi3',
                spaceLabel: 'Desk 201',
                siteId: 's1',
                siteName: 'New York HQ',
                buildingId: 'b1',
                buildingName: 'Tower A',
                floorId: 'f2',
                floorName: 'Floor 2',
                startedAt: '2026-01-01T00:00:00.000Z',
                endedAt: null,
                isAccessible: true,
              },
            ],
          },
          {
            id: '33333333-3333-3333-3333-333333333333',
            employeeId: 'EMP-003',
            fullName: 'Carol Danvers',
            jobTitle: 'Analyst',
            department: null,
            team: null,
            preferredSite: null,
            activeAssignmentCount: 0,
            activeAssignments: [],
          },
        ],
      },
    });

    render(<EmployeeDirectoryPanel canSearch={true} role="VIEWER" />);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('Alice Walker')).toBeInTheDocument();
    });

    // Check Alice: 1 active space badge + location details
    expect(screen.getByTestId('assignment-status-single')).toHaveTextContent('1 active space');
    expect(screen.getByTestId('single-assignment-location')).toHaveTextContent('Desk 101 • Floor 1 (New York HQ)');

    // Check Bob: 2 active spaces badge
    expect(screen.getByTestId('assignment-status-multiple')).toHaveTextContent('2 active spaces');

    // Check Carol: Unassigned badge
    expect(screen.getByTestId('assignment-status-unassigned')).toHaveTextContent('Unassigned');
  });

  it('exposes permitted location info via non-canvas path and triggers locate-on-map navigation (Ticket 29)', async () => {
    const handleLocateOnMap = vi.fn();
    const searchMock = vi.mocked(workforceApi.searchEmployees);
    searchMock.mockResolvedValueOnce({
      ok: true,
      data: {
        total: 1,
        limit: 20,
        offset: 0,
        items: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            employeeId: 'EMP-002',
            fullName: 'Bob Smith',
            jobTitle: 'Architect',
            department: { id: 'd1', code: 'ENG', name: 'Engineering' },
            team: null,
            preferredSite: { id: 's1', code: 'NYC', name: 'New York HQ' },
            activeAssignmentCount: 2,
            activeAssignments: [
              {
                id: 'a2',
                placementIdentityId: 'pi2',
                spaceLabel: 'Desk 102',
                siteId: 's1',
                siteName: 'New York HQ',
                buildingId: 'b1',
                buildingName: 'Tower A',
                floorId: 'f1',
                floorName: 'Floor 1',
                startedAt: '2026-01-01T00:00:00.000Z',
                endedAt: null,
                isAccessible: true,
              },
              {
                id: 'a3',
                placementIdentityId: 'pi3',
                spaceLabel: 'Desk 201',
                siteId: 's1',
                siteName: 'New York HQ',
                buildingId: 'b1',
                buildingName: 'Tower A',
                floorId: 'f2',
                floorName: 'Floor 2',
                startedAt: '2026-01-01T00:00:00.000Z',
                endedAt: null,
                isAccessible: false, // archived/inaccessible
              },
            ],
          },
        ],
      },
    });

    render(<EmployeeDirectoryPanel canSearch={true} role="VIEWER" onLocateOnMap={handleLocateOnMap} />);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });

    // Inspect Bob
    fireEvent.click(screen.getByRole('button', { name: /inspect bob smith/i }));

    // Non-canvas location details region
    const nonCanvasDetails = screen.getByTestId('non-canvas-location-details');
    expect(nonCanvasDetails).toBeInTheDocument();
    expect(nonCanvasDetails).toHaveTextContent('Desk 102');
    expect(nonCanvasDetails).toHaveTextContent('Floor 1');
    expect(nonCanvasDetails).toHaveTextContent('Desk 201');
    expect(nonCanvasDetails).toHaveTextContent('Floor 2');

    // Check status badges for active and inaccessible
    expect(screen.getByTestId('location-status-active')).toHaveTextContent('Active on Published Map');
    expect(screen.getByTestId('location-status-inaccessible')).toHaveTextContent('Location Unavailable / Archived');

    // Inaccessible assignment button is disabled
    const disabledBtn = screen.getByTestId('locate-on-map-btn-a3');
    expect(disabledBtn).toBeDisabled();

    // Click active assignment "Locate on Map"
    const locateBtn = screen.getByTestId('locate-on-map-btn-a2');
    expect(locateBtn).toBeEnabled();
    fireEvent.click(locateBtn);

    expect(handleLocateOnMap).toHaveBeenCalledTimes(1);
    expect(handleLocateOnMap).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'a2',
        placementIdentityId: 'pi2',
        spaceLabel: 'Desk 102',
        siteId: 's1',
        buildingId: 'b1',
        floorId: 'f1',
      }),
    );
  });
});
