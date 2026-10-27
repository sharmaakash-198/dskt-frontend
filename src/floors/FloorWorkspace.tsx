import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Building } from '../buildings/api';
import type { Site } from '../sites/api';
import type { Floor } from './api';
import {
  createDraftFloorPlan,
  getFloorPlan,
  listFloorPlanRevisions,
  type FloorPlan,
  type FloorPlanRevision,
} from './floor-plan-api';
import { BatchLabelPanel } from './BatchLabelPanel';
import { BoundaryEditor } from './BoundaryEditor';

const EDITING_SCALES = [1, 2, 4, 8, 16, 32, 64, 128, 256];

export type FloorWorkspaceProps = {
  site: Site;
  building: Building;
  floor: Floor;
  canMutate?: boolean;
  isPlanner?: boolean;
  onBack: () => void;
};

export function FloorWorkspace({
  site,
  building,
  floor,
  canMutate = false,
  isPlanner = false,
  onBack,
}: FloorWorkspaceProps) {
  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null);
  const [publishedRevision, setPublishedRevision] = useState<FloorPlanRevision | null>(null);
  const [revisions, setRevisions] = useState<FloorPlanRevision[]>([]);
  const [showBatchLabeling, setShowBatchLabeling] = useState(false);
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

  // Determine active view mode
  const effectiveViewMode = !canMutate ? 'PUBLISHED' : (viewMode === 'DRAFT' && draftRevision ? 'DRAFT' : (activePublishedRev ? viewMode : 'DRAFT'));

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
                  {isPlanner && !showBatchLabeling && (
                    <button
                      type="button"
                      className="primary-button batch-label-toggle-btn"
                      onClick={() => setShowBatchLabeling(true)}
                      data-testid="open-batch-labeling-btn"
                    >
                      Batch Label Spaces
                    </button>
                  )}
                </div>
              </div>

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
                onRevisionUpdated={handleRevisionUpdated}
                onError={setErrorMessage}
              />
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
