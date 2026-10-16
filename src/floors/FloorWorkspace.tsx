import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Building } from '../buildings/api';
import type { Site } from '../sites/api';
import type { Floor } from './api';
import {
  createDraftFloorPlan,
  listFloorPlanRevisions,
  type FloorPlanRevision,
} from './floor-plan-api';
import { BoundaryEditor } from './BoundaryEditor';

const EDITING_SCALES = [1, 2, 4, 8, 16, 32, 64, 128, 256];

export type FloorWorkspaceProps = {
  site: Site;
  building: Building;
  floor: Floor;
  canMutate?: boolean;
  onBack: () => void;
};

export function FloorWorkspace({
  site,
  building,
  floor,
  canMutate = false,
  onBack,
}: FloorWorkspaceProps) {
  const [revisions, setRevisions] = useState<FloorPlanRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedScale, setSelectedScale] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listFloorPlanRevisions(api, floor.id).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setRevisions(result.revisions);
      } else {
        setErrorMessage(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [floor.id]);

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
      setRevisions([result.revision]);
    } else {
      setErrorMessage(result.error);
    }
  }

  function handleRevisionUpdated(updated: FloorPlanRevision) {
    setRevisions((current) =>
      current.map((r) => (r.id === updated.id ? updated : r)),
    );
  }

  const hasRevisions = revisions.length > 0;
  const draftRevision = revisions.find((r) => r.lifecycleState === 'DRAFT');

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

      {errorMessage && (
        <p role="alert" className="error-alert">
          {errorMessage}
        </p>
      )}

      {loading && <p>Loading floor plan...</p>}

      {!loading && !hasRevisions && (
        <div className="empty-floor-plan">
          <p>This floor workspace is ready and currently empty. No floor plan revisions yet.</p>
          {canMutate && (
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
          )}
        </div>
      )}

      {!loading && hasRevisions && (
        <div className="floor-plan-content">
          {draftRevision && (
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
                canMutate={canMutate}
                onRevisionUpdated={handleRevisionUpdated}
                onError={setErrorMessage}
              />
            </>
          )}

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
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
