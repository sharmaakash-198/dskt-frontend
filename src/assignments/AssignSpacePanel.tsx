import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { FloorPlanRevision, PlacedElement } from '../floors/floor-plan-api';
import {
  searchEmployees,
  type EmployeeDirectoryItem,
} from '../workforce/api';
import {
  createAssignment,
  listAssignments,
  type Assignment,
} from './api';

export type AssignSpacePanelProps = {
  floorId: string;
  floorName: string;
  buildingName: string;
  siteName: string;
  revision: FloorPlanRevision;
  placements: PlacedElement[];
  initialPlacementId?: string | null;
  onAssignmentCreated: (assignment: Assignment) => void;
  onClose: () => void;
};

export function AssignSpacePanel({
  floorName,
  buildingName,
  siteName,
  revision,
  placements,
  initialPlacementId,
  onAssignmentCreated,
  onClose,
}: AssignSpacePanelProps) {
  // Only assignable physical spaces in the published revision can receive an assignment
  const assignablePlacements = placements.filter(
    (p) => p.assignable && p.spatialClass === 'PHYSICAL',
  );

  const initialPlacement =
    assignablePlacements.find((p) => p.id === initialPlacementId) ??
    assignablePlacements[0] ??
    null;

  const [selectedPlacementId, setSelectedPlacementId] = useState<string>(
    initialPlacement ? initialPlacement.id : '',
  );

  // Employee search and selection
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [employeeResults, setEmployeeResults] = useState<EmployeeDirectoryItem[]>([]);
  const [isSearchingEmployees, setIsSearchingEmployees] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeDirectoryItem | null>(null);

  // Selected Employee's existing assignments
  const [employeeAssignments, setEmployeeAssignments] = useState<Assignment[]>([]);
  const [loadingEmployeeAssignments, setLoadingEmployeeAssignments] = useState(false);

  // Space's existing assignments
  const [spaceAssignments, setSpaceAssignments] = useState<Assignment[]>([]);
  const [loadingSpaceAssignments, setLoadingSpaceAssignments] = useState(false);

  // Period inputs
  const defaultStart = new Date().toISOString().slice(0, 16);
  const [startedAt, setStartedAt] = useState(defaultStart);
  const [endedAt, setEndedAt] = useState('');

  // Status and submission
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedPlacement =
    assignablePlacements.find((p) => p.id === selectedPlacementId) ?? null;

  // Search employees when query changes
  useEffect(() => {
    const trimmed = employeeSearchQuery.trim();
    if (!trimmed) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setIsSearchingEmployees(true);
      const res = await searchEmployees(api, {
        q: trimmed,
        includeInactive: false,
        limit: 10,
      });

      if (!cancelled) {
        setIsSearchingEmployees(false);
        if (res.ok) {
          setEmployeeResults(res.data.items);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [employeeSearchQuery]);

  // Load selected employee's existing assignments
  useEffect(() => {
    if (!selectedEmployee) return;

    let cancelled = false;
    async function fetchEmpAssignments() {
      setLoadingEmployeeAssignments(true);
      const res = await listAssignments(api, { employeeId: selectedEmployee!.id });
      if (!cancelled) {
        setLoadingEmployeeAssignments(false);
        if (res.ok) {
          setEmployeeAssignments(res.assignments);
        }
      }
    }

    void fetchEmpAssignments();
    return () => {
      cancelled = true;
    };
  }, [selectedEmployee]);

  // Load selected space's existing assignments
  useEffect(() => {
    if (!selectedPlacement) return;

    let cancelled = false;
    async function fetchSpaceAssignments() {
      setLoadingSpaceAssignments(true);
      const res = await listAssignments(api, {
        placementIdentityId: selectedPlacement!.placementIdentityId,
      });
      if (!cancelled) {
        setLoadingSpaceAssignments(false);
        if (res.ok) {
          setSpaceAssignments(res.assignments);
        }
      }
    }

    void fetchSpaceAssignments();
    return () => {
      cancelled = true;
    };
  }, [selectedPlacement]);

  // Period validation
  const startDate = new Date(startedAt);
  const endDate = endedAt ? new Date(endedAt) : null;
  const isPeriodInvalid =
    isNaN(startDate.getTime()) ||
    (endDate !== null && (isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()));

  // Local space conflict check for advisory alert
  const hasSpaceConflict =
    selectedPlacement &&
    !isPeriodInvalid &&
    spaceAssignments.some((existing) => {
      const exStart = new Date(existing.startedAt).getTime();
      const exEnd = existing.endedAt ? new Date(existing.endedAt).getTime() : Infinity;
      const propStart = startDate.getTime();
      const propEnd = endDate ? endDate.getTime() : Infinity;

      // Overlap occurs if existing started before proposed ends AND existing ends after proposed starts
      return exStart < propEnd && exEnd > propStart;
    });

  async function handleAssignSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedPlacement || !selectedEmployee || isPeriodInvalid || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const clientCommandId = `cmd-assign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const res = await createAssignment(api, {
      employeeId: selectedEmployee.id,
      placementIdentityId: selectedPlacement.placementIdentityId,
      startedAt: startDate.toISOString(),
      endedAt: endDate ? endDate.toISOString() : null,
      clientCommandId,
    });

    setSubmitting(false);

    if (res.ok) {
      setSuccessMessage(
        `Successfully assigned ${res.assignment.employeeName} to space ${res.assignment.spaceLabel ?? 'unlabeled'}.`,
      );
      onAssignmentCreated(res.assignment);
    } else {
      setErrorMessage(res.error);
    }
  }

  return (
    <section
      className="batch-labels-panel assign-space-panel"
      role="region"
      aria-label="Assign space to employee"
      data-testid="assign-space-panel"
    >
      <div className="panel-header">
        <div>
          <h3>Assign Space to Employee</h3>
          <p className="panel-subtitle">
            Create a time-bounded space assignment on Published Revision {revision.revisionNumber} ({siteName} / {buildingName} / {floorName}).
          </p>
        </div>
        <button
          type="button"
          className="close-button"
          onClick={onClose}
          aria-label="Close assignment panel"
        >
          ✕
        </button>
      </div>

      {errorMessage && (
        <div className="error-alert" role="alert" data-testid="assignment-error-alert">
          <strong>Assignment Failed:</strong> {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="success-alert" role="status" data-testid="assignment-success-alert">
          {successMessage}
        </div>
      )}

      {hasSpaceConflict && (
        <div className="conflict-alert" role="alert" data-testid="space-conflict-alert">
          <strong>Space Already Occupied:</strong> This space has an overlapping assignment during the selected time period.
        </div>
      )}

      <form onSubmit={(e) => void handleAssignSubmit(e)} className="assignment-form">
        {/* Step 1 & Context: Candidate Space Selection & Details */}
        <div className="form-section candidate-space-section" data-testid="candidate-space-context">
          <h4>Candidate Space</h4>
          {assignablePlacements.length === 0 ? (
            <p className="empty-hint">No assignable physical spaces exist on this published floor plan.</p>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="space-select">Select Candidate Space</label>
                <select
                  id="space-select"
                  value={selectedPlacementId}
                  onChange={(e) => setSelectedPlacementId(e.target.value)}
                  data-testid="candidate-space-select"
                >
                  {assignablePlacements.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label ? `${p.label} (${p.templateName})` : `${p.templateName} (${p.id.slice(0, 8)})`}
                    </option>
                  ))}
                </select>
              </div>

              {selectedPlacement && (
                <div className="space-context-card" data-testid="space-context-card">
                  <div className="detail-row">
                    <span className="detail-label">Space Label:</span>
                    <span className="detail-value">{selectedPlacement.label ?? '(Unlabeled)'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Template:</span>
                    <span className="detail-value">
                      {selectedPlacement.templateName} ({selectedPlacement.templateCode})
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Spatial Class:</span>
                    <span className="detail-value badge-physical">PHYSICAL (Assignable)</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Location:</span>
                    <span className="detail-value">
                      {siteName} • {buildingName} • {floorName}
                    </span>
                  </div>

                  {/* Existing space occupancy */}
                  <div className="space-assignments-summary">
                    <strong>Current/Scheduled Occupancy:</strong>
                    {loadingSpaceAssignments ? (
                      <p className="loading-hint">Loading space assignments...</p>
                    ) : spaceAssignments.length === 0 ? (
                      <p className="empty-hint">Space is currently vacant (no active or scheduled assignments).</p>
                    ) : (
                      <ul className="assignment-mini-list" aria-label="Space existing assignments">
                        {spaceAssignments.map((a) => (
                          <li key={a.id} className="assignment-mini-item">
                            <span>
                              <strong>{a.employeeName}</strong> ({a.employeeCode})
                            </span>
                            <span className="period-badge">
                              {new Date(a.startedAt).toLocaleDateString()}
                              {a.endedAt ? ` – ${new Date(a.endedAt).toLocaleDateString()}` : ' – Ongoing'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Step 2: Employee Selection & Existing Assignments Display */}
        <div className="form-section employee-selection-section" data-testid="employee-selection-section">
          <h4>Employee Selection</h4>
          <div className="form-group">
            <label htmlFor="employee-search-input">Search Employee (Name or ID)</label>
            <input
              id="employee-search-input"
              type="text"
              placeholder="e.g. Alice, EMP-001..."
              value={employeeSearchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setEmployeeSearchQuery(val);
                if (!val.trim()) {
                  setEmployeeResults([]);
                }
              }}
              data-testid="employee-search-input"
            />
          </div>

          {isSearchingEmployees && <p className="loading-hint">Searching employee directory...</p>}

          {employeeResults.length > 0 && !selectedEmployee && (
            <ul className="employee-results-list" aria-label="Employee search results" data-testid="employee-results-list">
              {employeeResults.map((emp) => (
                <li key={emp.id} className="employee-result-item">
                  <div>
                    <strong>{emp.fullName}</strong> ({emp.employeeId})
                    {emp.jobTitle && <span className="emp-title"> • {emp.jobTitle}</span>}
                    {emp.department && <span className="emp-dept"> • {emp.department.name}</span>}
                  </div>
                  <button
                    type="button"
                    className="secondary-button select-emp-btn"
                    onClick={() => {
                      setSelectedEmployee(emp);
                      setEmployeeResults([]);
                      setEmployeeSearchQuery('');
                    }}
                    data-testid={`select-emp-${emp.employeeId}`}
                  >
                    Select
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedEmployee && (
            <div className="selected-employee-card" data-testid="selected-employee-card">
              <div className="selected-employee-header">
                <div>
                  <strong>{selectedEmployee.fullName}</strong> ({selectedEmployee.employeeId})
                  {selectedEmployee.email && <div className="emp-email">{selectedEmployee.email}</div>}
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setSelectedEmployee(null);
                    setEmployeeAssignments([]);
                  }}
                  data-testid="clear-employee-btn"
                >
                  Change Employee
                </button>
              </div>

              {/* Acceptance Criterion 1: Show selected employee's existing assignments beside candidate-space context */}
              <div className="employee-existing-assignments" data-testid="employee-existing-assignments">
                <h5>Selected Employee’s Existing Assignments</h5>
                {loadingEmployeeAssignments ? (
                  <p className="loading-hint">Loading employee assignments...</p>
                ) : employeeAssignments.length === 0 ? (
                  <p className="empty-hint" data-testid="no-employee-assignments-hint">
                    No existing assignments held by {selectedEmployee.fullName}.
                  </p>
                ) : (
                  <ul className="assignment-mini-list" aria-label="Selected employee existing assignments">
                    {employeeAssignments.map((a) => (
                      <li key={a.id} className="assignment-mini-item" data-testid={`emp-assignment-${a.id}`}>
                        <div className="assignment-details">
                          <strong>{a.spaceLabel ?? 'Space'}</strong> ({a.siteName} / {a.buildingName} / {a.floorName})
                        </div>
                        <span className="period-badge">
                          {new Date(a.startedAt).toLocaleDateString()}
                          {a.endedAt ? ` – ${new Date(a.endedAt).toLocaleDateString()}` : ' – Ongoing'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Assignment Period */}
        <div className="form-section period-section">
          <h4>Assignment Period</h4>
          <div className="form-row">
            <div className="form-group inline">
              <label htmlFor="start-date-input">Start Date & Time</label>
              <input
                id="start-date-input"
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                required
                data-testid="start-date-input"
              />
            </div>
            <div className="form-group inline">
              <label htmlFor="end-date-input">End Date & Time (Optional)</label>
              <input
                id="end-date-input"
                type="datetime-local"
                value={endedAt}
                onChange={(e) => setEndedAt(e.target.value)}
                placeholder="Leave blank for ongoing"
                data-testid="end-date-input"
              />
            </div>
          </div>
          {endedAt && isPeriodInvalid && (
            <p className="error-text" role="alert" data-testid="period-validation-error">
              Assignment end time must be later than start time.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="panel-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={!selectedPlacement || !selectedEmployee || isPeriodInvalid || submitting}
            data-testid="confirm-assignment-btn"
          >
            {submitting ? 'Assigning Space...' : 'Confirm Assignment'}
          </button>
        </div>
      </form>
    </section>
  );
}
