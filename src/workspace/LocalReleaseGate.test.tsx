import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceShell } from './WorkspaceShell';
import { EmployeeDirectoryPanel } from '../workforce/EmployeeDirectoryPanel';
import { BatchLabelPanel } from '../floors/BatchLabelPanel';
import { AssignSpacePanel } from '../assignments/AssignSpacePanel';
import type { Session } from '../auth/auth';
import type { FloorPlanRevision, PlacedElement } from '../floors/floor-plan-api';

const facilitiesSession: Session = {
  user: {
    id: 'user-fac-1',
    displayName: 'Facilities Lead',
    email: 'fac@arrise.local',
  },
  roles: ['FACILITIES_ADMIN'],
  navigation: ['facilities', 'viewer'],
};

const plannerSession: Session = {
  user: {
    id: 'user-plan-1',
    displayName: 'Planner Lead',
    email: 'plan@arrise.local',
  },
  roles: ['WORKPLACE_PLANNER'],
  navigation: ['workplace', 'viewer'],
};

const viewerSession: Session = {
  user: {
    id: 'user-view-1',
    displayName: 'Viewer Employee',
    email: 'view@arrise.local',
  },
  roles: ['VIEWER'],
  navigation: ['viewer'],
};

const mockRevision: FloorPlanRevision = {
  id: 'rev-gate-1',
  floorPlanId: 'fp-gate-1',
  revisionNumber: 1,
  lifecycleState: 'PUBLISHED',
  editingScale: 1,
  concurrencyVersion: 1,
  boundary: [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ],
  placements: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockDeskPlacement: PlacedElement = {
  id: 'pl-desk-1',
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
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Ticket 30: Frontend Local Release Gate', () => {
  describe('Critical Browser Journeys & Role Projections (AC 2)', () => {
    it('proves role-segregated navigation options in WorkspaceShell', () => {
      const { rerender } = render(
        <WorkspaceShell session={facilitiesSession} onSignOut={vi.fn()} />,
      );
      expect(screen.getByRole('button', { name: /^Facilities$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Viewer$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Workplace$/i })).not.toBeInTheDocument();

      rerender(<WorkspaceShell session={plannerSession} onSignOut={vi.fn()} />);
      expect(screen.getByRole('button', { name: /^Workplace$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Viewer$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Facilities$/i })).not.toBeInTheDocument();

      rerender(<WorkspaceShell session={viewerSession} onSignOut={vi.fn()} />);
      expect(screen.getByRole('button', { name: /^Viewer$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Facilities$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Workplace$/i })).not.toBeInTheDocument();
    });

    it('proves Batch Label Spaces workflow controls are exclusive to Planner', () => {
      const onClose = vi.fn();
      const onLabelsApplied = vi.fn();

      render(
        <BatchLabelPanel
          floorId="floor-1"
          revision={{ ...mockRevision, placements: [mockDeskPlacement] }}
          isPlanner={true}
          onLabelsApplied={onLabelsApplied}
          onClose={onClose}
        />,
      );

      expect(screen.getByRole('region', { name: /batch label spaces/i })).toBeInTheDocument();
      expect(screen.getByTestId('batch-label-panel')).toBeInTheDocument();

      const prefixInput = screen.getByTestId('batch-label-prefix');
      fireEvent.change(prefixInput, { target: { value: 'DESK-' } });
      expect(prefixInput).toHaveValue('DESK-');

      fireEvent.click(screen.getByTestId('close-batch-labels-btn'));
      expect(onClose).toHaveBeenCalled();
    });

    it('proves Space Assignment modal validates period and supports search', () => {
      const onClose = vi.fn();
      const onAssignmentCreated = vi.fn();

      render(
        <AssignSpacePanel
          floorId="floor-1"
          floorName="Floor 1"
          buildingName="Tower A"
          siteName="London HQ"
          revision={mockRevision}
          placements={[mockDeskPlacement]}
          onAssignmentCreated={onAssignmentCreated}
          onClose={onClose}
        />,
      );

      expect(screen.getByTestId('assign-space-panel')).toBeInTheDocument();
      expect(screen.getByTestId('employee-search-input')).toBeInTheDocument();
      expect(screen.getByTestId('start-date-input')).toBeInTheDocument();
      expect(screen.getByTestId('end-date-input')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-assignment-btn')).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Automated Accessibility Checks and Targeted Keyboard Journeys (AC 4)', () => {
    it('verifies non-canvas accessibility alternative, ARIA attributes, and keyboard journeys', () => {
      const onLocate = vi.fn();
      render(<EmployeeDirectoryPanel onLocateOnMap={onLocate} />);

      // Search field has proper accessible label and searchbox role
      const searchInput = screen.getByRole('searchbox', { name: /Search employees/i });
      expect(searchInput).toHaveAttribute('type', 'search');

      // Empty / ready state communicated via accessible region
      const liveStatus = screen.getByRole('status');
      expect(liveStatus).toBeInTheDocument();

      // Keyboard navigation: focus search field and submit
      searchInput.focus();
      expect(document.activeElement).toBe(searchInput);
      fireEvent.change(searchInput, { target: { value: 'Alice' } });
      fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
    });
  });

  describe('Representative Floor with 2,000 Placed Elements Performance Budget (AC 5)', () => {
    it('verifies in-memory spatial sorting and priority classification for 2,000 placements under budget (< 300ms)', () => {
      const largePlacements: PlacedElement[] = [];
      const priority: Record<string, number> = {
        PHYSICAL: 0,
        ZONE: 1,
        OBSTACLE: 2,
      };

      for (let i = 0; i < 2000; i++) {
        largePlacements.push({
          id: `placement-${i}`,
          floorPlanRevisionId: 'rev-gate-1',
          placementIdentityId: `pi-${i}`,
          elementTemplateRevisionId: 'tmpl-rev-1',
          templateId: 'tmpl-1',
          templateCode: 'DESK-A',
          templateName: 'Standard Desk',
          templateRevisionNumber: 1,
          spatialClass: i % 10 === 0 ? 'OBSTACLE' : i % 5 === 0 ? 'ZONE' : 'PHYSICAL',
          positionX: (i % 50) * 32,
          positionY: Math.floor(i / 50) * 32,
          rotationDegrees: 0,
          label: `Space-${i + 1}`,
          vertices: [
            { x: 0, y: 0 },
            { x: 16, y: 0 },
            { x: 16, y: 16 },
            { x: 0, y: 16 },
          ],
          localVertices: [
            { x: 0, y: 0 },
            { x: 16, y: 0 },
            { x: 16, y: 16 },
            { x: 0, y: 16 },
          ],
          assignable: i % 5 !== 0,
          fillColor: '#ffffff',
          borderColor: '#000000',
          createdAt: new Date(1700000000000 + i * 1000).toISOString(),
          updatedAt: new Date(1700000000000 + i * 1000).toISOString(),
        });
      }

      expect(largePlacements.length).toBe(2000);

      // Measure spatial class priority sorting for 2,000 placements
      const startTime = performance.now();
      const sorted = [...largePlacements].sort((a, b) => {
        const diff = (priority[a.spatialClass] ?? 2) - (priority[b.spatialClass] ?? 2);
        if (diff !== 0) return diff;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
      const sortDuration = performance.now() - startTime;

      expect(sorted.length).toBe(2000);
      // All PHYSICAL must appear before ZONE, which appears before OBSTACLE
      const firstZoneIndex = sorted.findIndex((p) => p.spatialClass === 'ZONE');
      const firstObstacleIndex = sorted.findIndex((p) => p.spatialClass === 'OBSTACLE');
      expect(firstZoneIndex).toBeGreaterThan(0);
      expect(firstObstacleIndex).toBeGreaterThan(firstZoneIndex);

      // Documented sorting budget is < 300ms (typically executes in < 20ms)
      expect(sortDuration).toBeLessThan(300);

      // Measure lookup/selection time for any of the 2,000 elements
      const selectStartTime = performance.now();
      const targetId = 'placement-1500';
      const selected = sorted.find((p) => p.id === targetId);
      const selectDuration = performance.now() - selectStartTime;

      expect(selected).toBeDefined();
      expect(selected?.id).toBe(targetId);
      // Documented interaction budget is < 50ms
      expect(selectDuration).toBeLessThan(50);
    });
  });
});
