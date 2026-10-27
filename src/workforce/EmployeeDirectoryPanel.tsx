import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api } from '../api/client';
import {
  searchEmployees,
  type EmployeeActiveAssignment,
  type EmployeeDirectoryItem,
  type SearchEmployeesParams,
} from './api';

export type EmployeeDirectoryPanelProps = {
  canSearch?: boolean;
  isPlanner?: boolean;
  role?: 'WORKPLACE_PLANNER' | 'VIEWER' | 'FACILITIES_ADMIN';
  onSelectEmployee?: (employee: EmployeeDirectoryItem) => void;
  onLocateOnMap?: (assignment: EmployeeActiveAssignment) => void;
};

export function EmployeeDirectoryPanel({
  canSearch = true,
  isPlanner = false,
  role = 'VIEWER',
  onSelectEmployee,
  onLocateOnMap,
}: EmployeeDirectoryPanelProps) {
  const [query, setQuery] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [siteCode, setSiteCode] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const [items, setItems] = useState<EmployeeDirectoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);

  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'no_results' | 'unavailable' | 'denied'
  >(canSearch ? 'idle' : 'denied');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeDirectoryItem | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const resultsListRef = useRef<HTMLUListElement | null>(null);

  async function executeSearch(pageOffset = 0) {
    if (!canSearch) {
      setStatus('denied');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);
    setFocusedIndex(-1);

    const params: SearchEmployeesParams = {
      q: query.trim() ? query.trim() : undefined,
      departmentCode: departmentCode.trim() ? departmentCode.trim() : undefined,
      teamCode: teamCode.trim() ? teamCode.trim() : undefined,
      siteCode: siteCode.trim() ? siteCode.trim() : undefined,
      employmentStatus: isPlanner && employmentStatus.trim() ? employmentStatus.trim() : undefined,
      includeInactive: isPlanner ? includeInactive : undefined,
      limit,
      offset: pageOffset,
    };

    const result = await searchEmployees(api, params);

    if (result.ok) {
      setItems(result.data.items);
      setTotal(result.data.total);
      setOffset(pageOffset);
      if (result.data.items.length === 0) {
        setStatus('no_results');
      } else {
        setStatus('success');
      }
    } else {
      if (result.statusCode === 403) {
        setStatus('denied');
      } else {
        setStatus('unavailable');
        setErrorMessage(result.error);
      }
      setItems([]);
      setTotal(0);
    }
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    setOffset(0);
    void executeSearch(0);
  }

  function handleReset() {
    setQuery('');
    setDepartmentCode('');
    setTeamCode('');
    setSiteCode('');
    setEmploymentStatus('');
    setIncludeInactive(false);
    setItems([]);
    setTotal(0);
    setOffset(0);
    setSelectedEmployee(null);
    setFocusedIndex(-1);
    setStatus(canSearch ? 'idle' : 'denied');
    setErrorMessage(null);
  }

  function handleSelect(employee: EmployeeDirectoryItem) {
    setSelectedEmployee(employee);
    if (onSelectEmployee) {
      onSelectEmployee(employee);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev < items.length - 1 ? prev + 1 : 0;
        focusItem(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : items.length - 1;
        focusItem(next);
        return next;
      });
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (focusedIndex >= 0 && focusedIndex < items.length) {
        e.preventDefault();
        const item = items[focusedIndex];
        if (item) handleSelect(item);
      }
    } else if (e.key === 'Escape') {
      if (selectedEmployee) {
        e.preventDefault();
        setSelectedEmployee(null);
      }
    }
  }

  function focusItem(index: number) {
    if (!resultsListRef.current) return;
    const itemElements = resultsListRef.current.querySelectorAll<HTMLButtonElement>('button.directory-item-btn');
    const target = itemElements[index];
    if (target) {
      target.focus();
    }
  }

  if (status === 'denied' || !canSearch) {
    return (
      <section className="directory-panel" aria-label="Employee directory">
        <div className="section-header">
          <h2>Employee Directory</h2>
        </div>
        <div role="alert" className="error-alert">
          You do not have permission to search the employee directory.
        </div>
      </section>
    );
  }

  return (
    <section className="directory-panel" aria-label="Employee directory">
      <div className="section-header">
        <h2>Employee Directory</h2>
        <p className="section-subtitle">
          Search active employees and inspect directory details permitted by your role.
        </p>
      </div>

      <form onSubmit={handleSearchSubmit} className="directory-search-form" aria-label="Search filters">
        <div className="search-input-row">
          <div className="form-group flex-1">
            <label htmlFor="directory-search-query">Search employees</label>
            <input
              id="directory-search-query"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by ID, name, or email..."
              maxLength={100}
              aria-label="Search employees by ID, name, or email"
            />
          </div>
          <button type="submit" className="primary-button" disabled={status === 'loading'}>
            {status === 'loading' ? 'Searching...' : 'Search'}
          </button>
          <button type="button" className="secondary-button" onClick={handleReset} disabled={status === 'loading'}>
            Reset
          </button>
        </div>

        <div className="search-filters-row">
          <div className="form-group">
            <label htmlFor="filter-department">Department code</label>
            <input
              id="filter-department"
              type="text"
              value={departmentCode}
              onChange={(e) => setDepartmentCode(e.target.value)}
              placeholder="e.g. ENG"
              maxLength={50}
              aria-label="Filter by department code"
            />
          </div>

          <div className="form-group">
            <label htmlFor="filter-team">Team code</label>
            <input
              id="filter-team"
              type="text"
              value={teamCode}
              onChange={(e) => setTeamCode(e.target.value)}
              placeholder="e.g. FE"
              maxLength={50}
              aria-label="Filter by team code"
            />
          </div>

          <div className="form-group">
            <label htmlFor="filter-site">Site code</label>
            <input
              id="filter-site"
              type="text"
              value={siteCode}
              onChange={(e) => setSiteCode(e.target.value)}
              placeholder="e.g. NYC"
              maxLength={50}
              aria-label="Filter by site code"
            />
          </div>

          {isPlanner && (
            <>
              <div className="form-group">
                <label htmlFor="filter-status">Employment status</label>
                <input
                  id="filter-status"
                  type="text"
                  value={employmentStatus}
                  onChange={(e) => setEmploymentStatus(e.target.value)}
                  placeholder="e.g. FULL_TIME"
                  maxLength={50}
                  aria-label="Filter by employment status"
                />
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeInactive}
                    onChange={(e) => setIncludeInactive(e.target.checked)}
                    aria-label="Include inactive employees"
                  />
                  Include inactive
                </label>
              </div>
            </>
          )}
        </div>
      </form>

      {/* Accessible Feedback States */}
      {status === 'loading' && (
        <div role="status" aria-live="polite" aria-busy="true" className="directory-state-callout loading">
          <p>Searching employee directory...</p>
        </div>
      )}

      {status === 'unavailable' && (
        <div role="alert" className="error-alert">
          {errorMessage || 'Directory search is temporarily unavailable. Please try again later.'}
        </div>
      )}

      {status === 'idle' && (
        <div role="status" aria-live="polite" className="directory-state-callout empty">
          <p>Enter an employee ID, name, or select filters to search the directory.</p>
        </div>
      )}

      {status === 'no_results' && (
        <div role="status" aria-live="polite" className="directory-state-callout no-results">
          <p>No employees found matching the specified criteria.</p>
        </div>
      )}

      {/* Search Results */}
      {status === 'success' && items.length > 0 && (
        <div className="directory-results-container">
          <div className="results-summary-bar">
            <span className="results-count" aria-live="polite">
              Showing {offset + 1}–{Math.min(offset + limit, total)} of {total} employees
            </span>
          </div>

          <ul
            ref={resultsListRef}
            className="directory-results-list"
            role="list"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            aria-label="Employee directory search results. Use Arrow keys to navigate, Enter to inspect details."
          >
            {items.map((emp, index) => {
              const isSelected = selectedEmployee?.id === emp.id;
              const isFocused = focusedIndex === index;
              return (
                <li key={emp.id} className={`directory-result-item ${isSelected ? 'selected' : ''}`}>
                  <button
                    type="button"
                    className={`directory-item-btn ${isFocused ? 'keyboard-focused' : ''}`}
                    onClick={() => handleSelect(emp)}
                    aria-pressed={isSelected}
                    aria-label={`Inspect ${emp.fullName}, ID ${emp.employeeId}`}
                  >
                    <div className="item-header">
                      <span className="emp-name">{emp.fullName}</span>
                      <span className="emp-id mono">{emp.employeeId}</span>
                      {emp.active === false && <span className="badge badge-inactive">Inactive</span>}
                      {/* Communicates unassigned, one-active-space, and multiple-active-space states without relying on color alone */}
                      {emp.activeAssignmentCount === 0 ||
                      (!emp.activeAssignmentCount &&
                        (!emp.activeAssignments || emp.activeAssignments.length === 0)) ? (
                        <span className="badge badge-unassigned" data-testid="assignment-status-unassigned">
                          Unassigned
                        </span>
                      ) : emp.activeAssignmentCount === 1 || emp.activeAssignments?.length === 1 ? (
                        <span className="badge badge-single-assignment" data-testid="assignment-status-single">
                          1 active space
                        </span>
                      ) : (
                        <span className="badge badge-multiple-assignments" data-testid="assignment-status-multiple">
                          {emp.activeAssignmentCount ?? emp.activeAssignments?.length} active spaces
                        </span>
                      )}
                    </div>
                    <div className="item-meta">
                      {emp.jobTitle && <span className="meta-item title">{emp.jobTitle}</span>}
                      {emp.department && (
                        <span className="meta-item dept">
                          {emp.department.name} ({emp.department.code})
                        </span>
                      )}
                      {emp.team && (
                        <span className="meta-item team">
                          {emp.team.name} ({emp.team.code})
                        </span>
                      )}
                      {emp.preferredSite && (
                        <span className="meta-item site">
                          {emp.preferredSite.name} ({emp.preferredSite.code})
                        </span>
                      )}
                      {emp.activeAssignments && emp.activeAssignments.length === 1 && emp.activeAssignments[0] && (
                        <span className="meta-item location" data-testid="single-assignment-location">
                          {emp.activeAssignments[0].spaceLabel ?? 'Space'} • {emp.activeAssignments[0].floorName} (
                          {emp.activeAssignments[0].siteName})
                        </span>
                      )}
                    </div>
                    {/* Viewer & Planner email projection */}
                    {emp.email && <div className="item-contact">{emp.email}</div>}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Bounded Pagination Controls */}
          {total > limit && (
            <div className="pagination-bar" aria-label="Directory pagination">
              <button
                type="button"
                className="secondary-button"
                disabled={offset === 0}
                onClick={() => executeSearch(Math.max(0, offset - limit))}
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)}
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={offset + limit >= total}
                onClick={() => executeSearch(offset + limit)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Inspected Employee Details Drawer */}
      {selectedEmployee && (
        <section className="employee-details-card mt-4 border rounded p-4" aria-label="Employee details">
          <div className="details-header flex justify-between items-center">
            <h3>{selectedEmployee.fullName}</h3>
            <button
              type="button"
              className="secondary-button btn-sm"
              onClick={() => setSelectedEmployee(null)}
              aria-label="Close employee details"
            >
              Close details
            </button>
          </div>

          <dl className="details-grid">
            <div className="detail-item">
              <dt>Employee ID</dt>
              <dd className="mono">{selectedEmployee.employeeId}</dd>
            </div>

            <div className="detail-item">
              <dt>Job Title</dt>
              <dd>{selectedEmployee.jobTitle ?? 'Not specified'}</dd>
            </div>

            {selectedEmployee.email !== undefined && (
              <div className="detail-item">
                <dt>Email</dt>
                <dd>{selectedEmployee.email ?? 'None'}</dd>
              </div>
            )}

            <div className="detail-item">
              <dt>Department</dt>
              <dd>
                {selectedEmployee.department
                  ? `${selectedEmployee.department.name} (${selectedEmployee.department.code})`
                  : 'None'}
              </dd>
            </div>

            <div className="detail-item">
              <dt>Team</dt>
              <dd>
                {selectedEmployee.team
                  ? `${selectedEmployee.team.name} (${selectedEmployee.team.code})`
                  : 'None'}
              </dd>
            </div>

            <div className="detail-item">
              <dt>Preferred Site</dt>
              <dd>
                {selectedEmployee.preferredSite
                  ? `${selectedEmployee.preferredSite.name} (${selectedEmployee.preferredSite.code})`
                  : 'None'}
              </dd>
            </div>

            {/* Workplace Planner specific inspection details */}
            {(isPlanner || role === 'WORKPLACE_PLANNER') && (
              <>
                <div className="detail-item">
                  <dt>Employment Status</dt>
                  <dd>{selectedEmployee.employmentStatus ?? 'Unknown'}</dd>
                </div>

                <div className="detail-item">
                  <dt>Active Status</dt>
                  <dd>
                    <span className={`badge ${selectedEmployee.active ? 'badge-active' : 'badge-inactive'}`}>
                      {selectedEmployee.active ? 'Active' : 'Inactive'}
                    </span>
                  </dd>
                </div>

                <div className="detail-item">
                  <dt>Manager</dt>
                  <dd>
                    {selectedEmployee.manager
                      ? `${selectedEmployee.manager.fullName} (${selectedEmployee.manager.employeeId})`
                      : selectedEmployee.managerEmployeeId
                        ? `ID: ${selectedEmployee.managerEmployeeId}`
                        : 'None (Direct Report / None)'}
                  </dd>
                </div>
              </>
            )}
          </dl>

          {/* Non-canvas search and details path: complete permitted location information */}
          <section
            className="employee-locations-section mt-4 pt-3 border-t"
            data-testid="non-canvas-location-details"
            aria-label="Active space assignments"
          >
            <h4>Active Space Locations</h4>
            {!selectedEmployee.activeAssignments || selectedEmployee.activeAssignments.length === 0 ? (
              <p className="unassigned-text" data-testid="details-unassigned-message">
                Employee currently has no active space assignments.
              </p>
            ) : (
              <ul className="active-assignments-list" data-testid="employee-active-assignments">
                {selectedEmployee.activeAssignments.map((assignment) => (
                  <li
                    key={assignment.id}
                    className="active-assignment-item p-2 mb-2 border rounded"
                    data-testid={`active-assignment-item-${assignment.id}`}
                  >
                    <div className="assignment-details-row flex justify-between items-center">
                      <div>
                        <strong>{assignment.spaceLabel ?? 'Unlabeled Space'}</strong>
                        <div className="text-sm text-muted">
                          <span>{assignment.siteName}</span> • <span>{assignment.buildingName}</span> •{' '}
                          <span>{assignment.floorName}</span>
                        </div>
                        <div className="text-xs text-muted">
                          Active from {new Date(assignment.startedAt).toLocaleDateString()}
                          {assignment.endedAt
                            ? ` to ${new Date(assignment.endedAt).toLocaleDateString()}`
                            : ' (ongoing)'}
                        </div>
                      </div>
                      <div className="assignment-actions flex items-center gap-2">
                        {assignment.isAccessible ? (
                          <span className="badge badge-active-location" data-testid="location-status-active">
                            Active on Published Map
                          </span>
                        ) : (
                          <span
                            className="badge badge-inaccessible-location"
                            data-testid="location-status-inaccessible"
                          >
                            Location Unavailable / Archived
                          </span>
                        )}
                        {onLocateOnMap && (
                          <button
                            type="button"
                            className="primary-button locate-map-btn btn-sm"
                            disabled={!assignment.isAccessible}
                            onClick={() => onLocateOnMap(assignment)}
                            data-testid={`locate-on-map-btn-${assignment.id}`}
                            aria-label={`Locate ${selectedEmployee.fullName} on ${assignment.floorName} map`}
                          >
                            Locate on Map
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      )}
    </section>
  );
}
