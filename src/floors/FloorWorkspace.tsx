import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Building } from '../buildings/api';
import type { Site } from '../sites/api';
import type { Floor } from './api';
import {
  createDraftFloorPlan,
  createDraftRevision,
  getFloorPlan,
  listFloorPlanRevisions,
  type FloorPlan,
  type FloorPlanRevision,
} from './floor-plan-api';
import { AssignSpacePanel } from '../assignments/AssignSpacePanel';
import {
  endAssignment,
  getAssignmentHistory,
  listAssignments,
  type Assignment,
  type PaginatedAssignmentHistory,
} from '../assignments/api';
import { BatchLabelPanel } from './BatchLabelPanel';
import { BoundaryEditor } from './BoundaryEditor';

const EDITING_SCALES = [1, 2, 4, 8, 16, 32, 64, 128, 256];

export type FloorWorkspaceProps = {
  site: Site;
  building: Building;
  floor: Floor;
  canMutate?: boolean;
  isPlanner?: boolean;
  initialPlacementIdentityId?: string | null;
  onBack: () => void;
};

export function FloorWorkspace({
  site,
  building,
  floor,
  canMutate = false,
  isPlanner = false,
  initialPlacementIdentityId,
  onBack,
}: FloorWorkspaceProps) {
  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null);
  const [publishedRevision, setPublishedRevision] = useState<FloorPlanRevision | null>(null);
  const [revisions, setRevisions] = useState<FloorPlanRevision[]>([]);
  const [showBatchLabeling, setShowBatchLabeling] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedCandidatePlacementId, setSelectedCandidatePlacementId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [endingAssignment, setEndingAssignment] = useState<Assignment | null>(null);
  const [endTimestamp, setEndTimestamp] = useState<string>('');
  const [endingError, setEndingError] = useState<string | null>(null);
  const [endingSubmitting, setEndingSubmitting] = useState(false);
  const [showAssignmentHistory, setShowAssignmentHistory] = useState(false);
  const [historyData, setHistoryData] = useState<PaginatedAssignmentHistory | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const isPropArchived = Boolean(
    (floor as { archivedAt?: string | null }).archivedAt ||
    (building as { archivedAt?: string | null }).archivedAt ||
    (site as { archivedAt?: string | null }).archivedAt
  );

  const [loading, setLoading] = useState<boolean>(() => !isPropArchived);
  const [creating, setCreating] = useState(false);
  const [selectedScale, setSelectedScale] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
  const [reloadKey, setReloadKey] = useState(0);

  const isLocationArchived = Boolean(
    isPropArchived ||
    errorCode === 'floor_archived' ||
    errorCode === 'building_archived' ||
    errorCode === 'site_archived'
  );

  useEffect(() => {
    let cancelled = false;

    if (isPropArchived) {
      return;
    }

    async function fetchFloorPlanData() {
      setLoading(true);
      setErrorMessage(null);
      setErrorCode(null);

      try {
        const [planRes, revsRes] = await Promise.all([
          getFloorPlan(api, floor.id),
          listFloorPlanRevisions(api, floor.id),
        ]);

        if (cancelled) return;
        setLoading(false);

        if (planRes.ok) {
          setFloorPlan(planRes.floorPlan);
          if (planRes.publishedRevision) {
            setPublishedRevision(planRes.publishedRevision);
          }
        } else if (planRes.errorCode) {
          setErrorCode(planRes.errorCode);
          setErrorMessage(planRes.error);
          return;
        }

        if (revsRes.ok) {
          setRevisions(revsRes.revisions);
          const pub = revsRes.revisions.find((r) => r.lifecycleState === 'PUBLISHED');
          if (pub) {
            setPublishedRevision((prev) => prev ?? pub);
          }
        } else {
          if (revsRes.errorCode) {
            setErrorCode(revsRes.errorCode);
          }
          setErrorMessage(revsRes.error);
        }
      } catch {
        if (cancelled) return;
        setLoading(false);
        setErrorMessage('Floor plan details are unavailable.');
      }
    }

    void fetchFloorPlanData();

    return () => {
      cancelled = true;
    };
  }, [floor.id, isPropArchived, reloadKey]);

  async function handleCreateDraft(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setErrorMessage(null);

    const idempotencyKey = `create-draft-${floor.id}-${Date.now()}`;
    const result = await createDraftFloorPlan(api, floor.id, {
      editingScale: selectedScale,
      idempotencyKey,
    });
    setCreating(false);

    if (result.ok) {
      setFloorPlan(result.floorPlan);
      setRevisions([result.revision]);
      setViewMode('DRAFT');
    } else {
      setErrorMessage(result.error);
    }
  }

  async function handleCreateReplacementDraft() {
    setCreating(true);
    setErrorMessage(null);

    const idempotencyKey = `create-draft-rev-${floor.id}-${Date.now()}`;
    const result = await createDraftRevision(api, floor.id, {
      idempotencyKey,
    });
    setCreating(false);

    if (result.ok) {
      setRevisions((current) => [...current, result.revision]);
      setViewMode('DRAFT');
    } else {
      setErrorMessage(result.error);
    }
  }

  function handleRevisionUpdated(updated: FloorPlanRevision) {
    setRevisions((current) =>
      current.map((r) => (r.id === updated.id ? updated : r)),
    );
    if (updated.lifecycleState === 'PUBLISHED') {
      setPublishedRevision(updated);
      setViewMode('PUBLISHED');
    }
  }

  const draftRevision = revisions.find((r) => r.lifecycleState === 'DRAFT');
  const activePublishedRev = publishedRevision ?? revisions.find((r) => r.lifecycleState === 'PUBLISHED') ?? null;
  const hasRevisions = revisions.length > 0;

  // Load assignments for active published floor plan
  useEffect(() => {
    if (!activePublishedRev) return;

    let cancelled = false;
    async function fetchFloorAssignments() {
      const res = await listAssignments(api, { floorId: floor.id });
      if (!cancelled && res.ok && Array.isArray(res.assignments)) {
        setAssignments(res.assignments);
      }
    }

    void fetchFloorAssignments();
    return () => {
      cancelled = true;
    };
  }, [floor.id, activePublishedRev, reloadKey]);

  // Load assignment history for Workplace Planner and Facilities Admin
  useEffect(() => {
    if (!showAssignmentHistory) return;

    let cancelled = false;
    async function fetchHistory() {
      setHistoryLoading(true);
      setHistoryError(null);
      const res = await getAssignmentHistory(api, {
        floorId: floor.id,
        limit: 10,
        offset: (historyPage - 1) * 10,
      });

      if (!cancelled) {
        setHistoryLoading(false);
        if (res.ok) {
          setHistoryData(res.history);
        } else {
          setHistoryError(res.error);
        }
      }
    }

    void fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [showAssignmentHistory, historyPage, floor.id]);

  async function handleConfirmEndAssignment(e: FormEvent) {
    e.preventDefault();
    if (!endingAssignment) return;

    setEndingSubmitting(true);
    setEndingError(null);

    const endedAtIso = endTimestamp ? new Date(endTimestamp).toISOString() : new Date().toISOString();
    const res = await endAssignment(api, {
      assignmentId: endingAssignment.id,
      endedAt: endedAtIso,
      clientCommandId: `cmd-end-${Date.now()}-${endingAssignment.id.slice(0, 8)}`,
    });

    setEndingSubmitting(false);
    if (res.ok) {
      setAssignments((prev) =>
        prev.map((a) => (a.id === res.assignment.id ? res.assignment : a)),
      );
      setEndingAssignment(null);
      setReloadKey((k) => k + 1);
    } else {
      setEndingError(res.error);
    }
  }

  // Determine active view mode
  const effectiveViewMode = !canMutate || initialPlacementIdentityId
    ? 'PUBLISHED'
    : draftRevision
      ? viewMode
      : activePublishedRev
        ? 'PUBLISHED'
        : 'DRAFT';

  const isUnavailable = !loading && !isLocationArchived && Boolean(errorMessage) && !hasRevisions && !floorPlan;
  const isEmpty = !loading && !isLocationArchived && !isUnavailable && !hasRevisions && !floorPlan;
  const isUnpublished = !loading && !isLocationArchived && !isUnavailable && !isEmpty && !activePublishedRev && effectiveViewMode === 'PUBLISHED';

  return (
    <section className="floor-workspace" aria-label={`Floor ${floor.code}`}>
      <div className="location-breadcrumb">
        <button type="button" className="link-button" onClick={onBack}>
          Back to floors
        </button>
      </div>

      <h2>
        {site.code} / {building.code} / {floor.code}
      </h2>
      <p className="floor-subtitle">
        {floor.name}. Stable floor plan identity and revisions.
      </p>

      {errorMessage && !isUnavailable && !isLocationArchived && (
        <p role="alert" className="error-alert">
          {errorMessage}
        </p>
      )}

      {/* 1. Loading State */}
      {loading && (
        <div className="loading-state" data-testid="loading-state" role="status">
          <p>Loading floor plan...</p>
        </div>
      )}

      {/* 2. Archived Location State */}
      {!loading && isLocationArchived && (
        <div className="archived-location-state" data-testid="archived-location-state" role="status">
          <h3>Location Archived</h3>
          <p>
            This location is archived. Floor maps and revisions cannot be viewed or edited for archived locations.
          </p>
        </div>
      )}

      {/* 3. Unavailable State */}
      {isUnavailable && (
        <div className="unavailable-state" data-testid="unavailable-state" role="alert">
          <h3>Floor Plan Unavailable</h3>
          <p className="error-alert">{errorMessage}</p>
          <button type="button" className="secondary-button" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      )}

      {/* 4. Empty State */}
      {isEmpty && (
        <div className="empty-floor-plan" data-testid="empty-floor-plan">
          <p>This floor workspace is ready and currently empty. No floor plan revisions yet.</p>
          {canMutate ? (
            <form onSubmit={(e) => void handleCreateDraft(e)} className="create-plan-form">
              <div className="form-group">
                <label htmlFor="editing-scale-select">Editing scale</label>
                <select
                  id="editing-scale-select"
                  value={selectedScale}
                  onChange={(e) => setSelectedScale(Number(e.target.value))}
                >
                  {EDITING_SCALES.map((scale) => (
                    <option key={scale} value={scale}>
                      {scale}x (2^{Math.log2(scale)})
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={creating}>
                {creating ? 'Creating draft...' : 'Create draft floor plan'}
              </button>
            </form>
          ) : (
            <p className="empty-hint">No published floor plan exists for this floor yet.</p>
          )}
        </div>
      )}

      {/* View Switcher for Facilities Admin when both draft & published exist or draft exists */}
      {canMutate && !loading && !isLocationArchived && !isEmpty && !isUnavailable && (
        <div className="view-mode-selector" role="tablist" aria-label="Floor plan view mode">
          {draftRevision && (
            <button
              type="button"
              role="tab"
              aria-selected={effectiveViewMode === 'DRAFT'}
              className={`tab-button ${effectiveViewMode === 'DRAFT' ? 'active' : ''}`}
              onClick={() => setViewMode('DRAFT')}
              data-testid="tab-draft-editor"
            >
              Draft Editor (Rev {draftRevision.revisionNumber})
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={effectiveViewMode === 'PUBLISHED'}
            className={`tab-button ${effectiveViewMode === 'PUBLISHED' ? 'active' : ''}`}
            onClick={() => setViewMode('PUBLISHED')}
            data-testid="tab-published-map"
          >
            Published Map {activePublishedRev ? `(Rev ${activePublishedRev.revisionNumber})` : ''}
          </button>
        </div>
      )}

      {/* 5. Unpublished State (when viewing published mode but no published revision exists) */}
      {isUnpublished && (
        <div className="unpublished-floor-plan" data-testid="unpublished-floor-plan" role="status">
          <h3>Floor Plan Not Published</h3>
          <p>
            This floor plan has not been published yet. A published floor plan will appear here once Facilities Admin validates and publishes a revision.
          </p>
          {canMutate && draftRevision && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setViewMode('DRAFT')}
              data-testid="switch-to-draft-btn"
            >
              Switch to Draft Editor
            </button>
          )}
        </div>
      )}

      {/* Map Content */}
      {!loading && !isLocationArchived && !isEmpty && !isUnavailable && !isUnpublished && (
        <div className="floor-plan-content">
          {/* Draft view (Facilities Admin only) */}
          {canMutate && effectiveViewMode === 'DRAFT' && draftRevision && (
            <>
              <div className="draft-summary" role="region" aria-label="Draft revision details">
                <h3>Draft Floor Plan Active</h3>
                <p>
                  Revision {draftRevision.revisionNumber} is in Draft state at scale{' '}
                  {draftRevision.editingScale}x (Version {draftRevision.concurrencyVersion}).
                </p>
              </div>

              <BoundaryEditor
                floorId={floor.id}
                revision={draftRevision}
                canMutate={true}
                onRevisionUpdated={handleRevisionUpdated}
                onError={setErrorMessage}
              />
            </>
          )}

          {/* Published map view (Facilities Admin, Workplace Planner, and Viewer) */}
          {effectiveViewMode === 'PUBLISHED' && activePublishedRev && (
            <>
              <div className="published-summary" role="region" aria-label="Published revision details">
                <div className="published-summary-header">
                  <div>
                    <h3>Published Floor Plan Active</h3>
                    <p>
                      Revision {activePublishedRev.revisionNumber} is Published at scale{' '}
                      {activePublishedRev.editingScale}x (Version {activePublishedRev.concurrencyVersion}).
                    </p>
                  </div>
                  {canMutate && !draftRevision && (
                    <div className="facilities-actions-group" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span className="role-summary-tag" data-testid="facilities-admin-tag" style={{ fontSize: '12px', color: '#64748b', marginRight: '4px' }}>
                        Facilities Admin (Read-Only Assignments)
                      </span>
                      <button
                        type="button"
                        className="secondary-button create-replacement-draft-btn"
                        onClick={handleCreateReplacementDraft}
                        disabled={creating}
                        data-testid="create-replacement-draft-btn"
                      >
                        {creating ? 'Creating Draft...' : 'Create Replacement Draft'}
                      </button>
                    </div>
                  )}
                  {isPlanner && (
                    <div className="planner-actions-group" style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="primary-button assign-space-toggle-btn"
                        onClick={() => {
                          setSelectedCandidatePlacementId(null);
                          setShowAssignModal(true);
                          setShowBatchLabeling(false);
                          setShowAssignmentHistory(false);
                        }}
                        data-testid="open-assign-space-btn"
                      >
                        Assign Space
                      </button>
                      {!showBatchLabeling && (
                        <button
                          type="button"
                          className="secondary-button batch-label-toggle-btn"
                          onClick={() => {
                            setShowBatchLabeling(true);
                            setShowAssignModal(false);
                            setShowAssignmentHistory(false);
                          }}
                          data-testid="open-batch-labeling-btn"
                        >
                          Batch Label Spaces
                        </button>
                      )}
                    </div>
                  )}
                  {(isPlanner || canMutate) && (
                    <div className="history-actions-group" style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="secondary-button view-history-toggle-btn"
                        onClick={() => {
                          setShowAssignmentHistory(true);
                          setShowAssignModal(false);
                          setShowBatchLabeling(false);
                        }}
                        data-testid="view-assignment-history-btn"
                      >
                        Assignment History
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {isPlanner && showAssignModal && activePublishedRev && (
                <AssignSpacePanel
                  floorId={floor.id}
                  floorName={floor.name}
                  buildingName={building.name}
                  siteName={site.name}
                  revision={activePublishedRev}
                  placements={activePublishedRev.placements ?? []}
                  initialPlacementId={selectedCandidatePlacementId}
                  onAssignmentCreated={(newAssignment) => {
                    setAssignments((prev) => [
                      newAssignment,
                      ...prev.filter((a) => a.id !== newAssignment.id),
                    ]);
                    setShowAssignModal(false);
                  }}
                  onClose={() => setShowAssignModal(false)}
                />
              )}

              {isPlanner && showBatchLabeling && (
                <BatchLabelPanel
                  floorId={floor.id}
                  revision={activePublishedRev}
                  isPlanner={isPlanner}
                  onLabelsApplied={async () => {
                    try {
                      const revsRes = await listFloorPlanRevisions(api, floor.id);
                      if (revsRes.ok) {
                        setRevisions(revsRes.revisions);
                        const pub = revsRes.revisions.find((r) => r.lifecycleState === 'PUBLISHED');
                        if (pub) {
                          setPublishedRevision(pub);
                        }
                      }
                    } catch {
                      // ignore
                    }
                  }}
                  onClose={() => setShowBatchLabeling(false)}
                />
              )}

              <BoundaryEditor
                floorId={floor.id}
                revision={activePublishedRev}
                canMutate={false}
                isPlanner={isPlanner}
                assignments={assignments}
                initialPlacementIdentityId={initialPlacementIdentityId}
                onOpenAssignSpace={(placementId) => {
                  setSelectedCandidatePlacementId(placementId);
                  setShowAssignModal(true);
                  setShowBatchLabeling(false);
                  setShowAssignmentHistory(false);
                }}
                onOpenEndAssignment={(a) => {
                  setEndingAssignment(a);
                  setEndTimestamp(new Date().toISOString().slice(0, 16));
                  setEndingError(null);
                }}
                onRevisionUpdated={handleRevisionUpdated}
                onError={setErrorMessage}
              />

              {/* End Assignment Modal */}
              {endingAssignment && (
                <div className="modal-backdrop" role="dialog" aria-modal="true" data-testid="end-assignment-modal">
                  <div className="modal-dialog">
                    <div className="modal-header">
                      <h3>End Space Assignment</h3>
                      <button
                        type="button"
                        className="close-button"
                        onClick={() => setEndingAssignment(null)}
                        aria-label="Close end assignment modal"
                      >
                        ×
                      </button>
                    </div>
                    <form onSubmit={handleConfirmEndAssignment}>
                      <div className="modal-body">
                        {endingError && (
                          <div className="alert-banner alert-error" data-testid="end-assignment-error-alert">
                            {endingError}
                          </div>
                        )}
                        <p>
                          Are you sure you want to end the assignment for{' '}
                          <strong>{endingAssignment.employeeName}</strong> ({endingAssignment.employeeCode}) on space{' '}
                          <strong>{endingAssignment.spaceLabel ?? 'unlabeled'}</strong>?
                        </p>
                        <div className="form-group" style={{ marginTop: '12px' }}>
                          <label htmlFor="end-timestamp-input">End Date & Time</label>
                          <input
                            id="end-timestamp-input"
                            type="datetime-local"
                            value={endTimestamp}
                            onChange={(e) => setEndTimestamp(e.target.value)}
                            required
                            data-testid="end-assignment-datetime-input"
                          />
                          <small className="field-hint">
                            Must be later than start time ({new Date(endingAssignment.startedAt).toLocaleString()}).
                          </small>
                        </div>
                      </div>
                      <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setEndingAssignment(null)}
                          disabled={endingSubmitting}
                          data-testid="cancel-end-assignment-btn"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={endingSubmitting}
                          data-testid="confirm-end-assignment-btn"
                        >
                          {endingSubmitting ? 'Ending...' : 'Confirm End Assignment'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Assignment History Drawer / Modal */}
              {showAssignmentHistory && (
                <div className="modal-backdrop" role="dialog" aria-modal="true" data-testid="assignment-history-drawer">
                  <div className="modal-dialog" style={{ maxWidth: '750px', width: '90%' }}>
                    <div className="assignment-history-header">
                      <h3>Floor Assignment History</h3>
                      <button
                        type="button"
                        className="close-button"
                        onClick={() => setShowAssignmentHistory(false)}
                        data-testid="close-history-btn"
                        aria-label="Close history modal"
                      >
                        ×
                      </button>
                    </div>
                    {historyLoading ? (
                      <p className="loading-hint">Loading assignment history...</p>
                    ) : historyError ? (
                      <div className="alert-banner alert-error">{historyError}</div>
                    ) : !historyData || historyData.items.length === 0 ? (
                      <p className="empty-hint" data-testid="no-history-hint">No historical assignments for this floor.</p>
                    ) : (
                      <>
                        <table className="assignment-history-table" data-testid="assignment-history-table">
                          <thead>
                            <tr>
                              <th>Space</th>
                              <th>Employee</th>
                              <th>Period</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historyData.items.map((item) => (
                              <tr key={item.id} data-testid={`history-item-${item.id}`}>
                                <td><strong>{item.spaceLabel ?? 'Unlabeled'}</strong></td>
                                <td>{item.employeeName} ({item.employeeCode})</td>
                                <td>
                                  {new Date(item.startedAt).toLocaleDateString()}
                                  {item.endedAt ? ` – ${new Date(item.endedAt).toLocaleDateString()}` : ' – Ongoing'}
                                </td>
                                <td>
                                  <span className="status-badge ended">Ended</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="history-pagination" data-testid="history-pagination">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                            disabled={historyPage <= 1}
                            data-testid="history-prev-btn"
                          >
                            Previous
                          </button>
                          <span data-testid="history-page-info">
                            Page {historyPage} of {Math.ceil(historyData.total / (historyData.limit || 10)) || 1} ({historyData.total} records)
                          </span>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => setHistoryPage((p) => p + 1)}
                            disabled={historyPage >= Math.ceil(historyData.total / (historyData.limit || 10))}
                            data-testid="history-next-btn"
                          >
                            Next
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Revision History */}
          <h3>Revision History</h3>
          <ul className="revision-list" aria-label="Floor plan revisions">
            {revisions.map((rev) => (
              <li key={rev.id} className="revision-card">
                <div className="revision-header">
                  <strong>Revision {rev.revisionNumber}</strong>
                  <span
                    className={`status-badge status-${rev.lifecycleState.toLowerCase()}`}
                    aria-label={`State: ${rev.lifecycleState}`}
                  >
                    {rev.lifecycleState}
                  </span>
                </div>
                <div className="revision-meta">
                  <span>Editing Scale: {rev.editingScale}x</span>
                  <span>Concurrency Version: {rev.concurrencyVersion}</span>
                  {rev.publishedAt && (
                    <span>Published: {new Date(rev.publishedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
