import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import {
  confirmBatchLabels,
  previewBatchLabels,
  type FloorPlanRevision,
  type LabelConflict,
  type OrderingStrategy,
  type PlacedElement,
  type ProposedLabelView,
} from './floor-plan-api';

export type BatchLabelPanelProps = {
  floorId: string;
  revision: FloorPlanRevision;
  isPlanner?: boolean;
  onLabelsApplied: (updatedRevision?: FloorPlanRevision) => void;
  onClose: () => void;
};

export function BatchLabelPanel({
  floorId,
  revision,
  isPlanner = true,
  onLabelsApplied,
  onClose,
}: BatchLabelPanelProps) {
  const placements: PlacedElement[] = revision.placements ?? [];

  // Configuration state
  const [prefix, setPrefix] = useState('WS-');
  const [startNumber, setStartNumber] = useState<number>(1);
  const [width, setWidth] = useState<number>(2);
  const [ordering, setOrdering] = useState<OrderingStrategy>('ROW_MAJOR');

  // Space selection state (tracks selection order for SELECTION strategy)
  const [selectedPlacementIds, setSelectedPlacementIds] = useState<string[]>(() =>
    placements.filter((p) => p.spatialClass === 'PHYSICAL').map((p) => p.id),
  );

  // Preview & Confirmation state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [proposedLabels, setProposedLabels] = useState<ProposedLabelView[] | null>(null);
  const [conflicts, setConflicts] = useState<LabelConflict[]>([]);
  const [canConfirm, setCanConfirm] = useState(false);
  const [previewConcurrencyVersion, setPreviewConcurrencyVersion] = useState<number>(
    revision.concurrencyVersion,
  );

  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Toggle selection
  function handleTogglePlacement(id: string) {
    setErrorMessage(null);
    setSuccessMessage(null);
    // Invalidate prior preview on selection changes
    setPreviewToken(null);
    setProposedLabels(null);
    setConflicts([]);
    setCanConfirm(false);

    setSelectedPlacementIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  }

  function handleSelectAllPhysical() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setPreviewToken(null);
    setProposedLabels(null);
    setConflicts([]);
    setCanConfirm(false);

    const physicalIds = placements
      .filter((p) => p.spatialClass === 'PHYSICAL')
      .map((p) => p.id);
    setSelectedPlacementIds(physicalIds);
  }

  function handleClearSelection() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setPreviewToken(null);
    setProposedLabels(null);
    setConflicts([]);
    setCanConfirm(false);

    setSelectedPlacementIds([]);
  }

  async function handleGeneratePreview(e: FormEvent) {
    e.preventDefault();
    if (selectedPlacementIds.length === 0) {
      setErrorMessage('Please select at least one physical space to label.');
      return;
    }

    setPreviewLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const result = await previewBatchLabels(api, floorId, revision.id, {
      placementIds: selectedPlacementIds,
      prefix,
      startNumber,
      width,
      ordering,
      concurrencyVersion: revision.concurrencyVersion,
    });

    setPreviewLoading(false);

    if (result.ok) {
      setPreviewToken(result.previewToken);
      setPreviewConcurrencyVersion(result.concurrencyVersion);
      setProposedLabels(result.proposedLabels);
      setConflicts(result.conflicts);
      setCanConfirm(result.canConfirm && result.conflicts.length === 0);
    } else {
      setErrorMessage(result.error);
      if (result.conflicts) {
        setConflicts(result.conflicts);
      }
      setCanConfirm(false);
    }
  }

  async function handleConfirmBatch() {
    if (!previewToken || !proposedLabels || proposedLabels.length === 0) {
      return;
    }

    setConfirming(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const clientCommandId = crypto.randomUUID();
    const assignments = proposedLabels.map((p) => ({
      placementId: p.placementId,
      label: p.proposedLabel,
    }));

    const result = await confirmBatchLabels(api, floorId, revision.id, {
      previewToken,
      concurrencyVersion: previewConcurrencyVersion,
      assignments,
      clientCommandId,
    });

    setConfirming(false);

    if (result.ok) {
      setSuccessMessage(`Successfully applied batch labels to ${result.updatedCount} spaces.`);
      setCanConfirm(false);
      onLabelsApplied();
    } else {
      setErrorMessage(result.error);
    }
  }

  const selectedSet = new Set(selectedPlacementIds);
  const eligiblePhysicalPlacements = placements.filter((p) => p.spatialClass === 'PHYSICAL');

  return (
    <div
      className="batch-label-panel"
      role="region"
      aria-label="Batch Label Spaces"
      data-testid="batch-label-panel"
    >
      <div className="panel-header">
        <div>
          <h3>Batch Label Physical Spaces</h3>
          <p className="panel-subtitle">
            Generate deterministic sequential labels for published spaces, review conflicts, and apply transactionally.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
          data-testid="close-batch-labels-btn"
        >
          Close
        </button>
      </div>

      {!isPlanner && (
        <p role="alert" className="error-alert">
          Only Workplace Planners are authorized to preview and apply batch labels.
        </p>
      )}

      {errorMessage && (
        <div role="alert" className="error-alert" data-testid="batch-label-error">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div role="status" className="success-banner" data-testid="batch-label-success">
          {successMessage}
        </div>
      )}

      <form onSubmit={(e) => void handleGeneratePreview(e)} className="batch-label-form">
        <fieldset className="config-fieldset">
          <legend>Sequence Configuration</legend>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="batch-label-prefix">Prefix</label>
              <input
                id="batch-label-prefix"
                data-testid="batch-label-prefix"
                type="text"
                value={prefix}
                onChange={(e) => {
                  setPrefix(e.target.value);
                  setPreviewToken(null);
                  setProposedLabels(null);
                }}
                placeholder="e.g. WS- or DESK-"
              />
            </div>

            <div className="form-group">
              <label htmlFor="batch-label-start-number">Start Number</label>
              <input
                id="batch-label-start-number"
                data-testid="batch-label-start-number"
                type="number"
                min={0}
                value={startNumber}
                onChange={(e) => {
                  setStartNumber(Number(e.target.value));
                  setPreviewToken(null);
                  setProposedLabels(null);
                }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="batch-label-width">Width / Zero Padding</label>
              <input
                id="batch-label-width"
                data-testid="batch-label-width"
                type="number"
                min={1}
                max={10}
                value={width}
                onChange={(e) => {
                  setWidth(Number(e.target.value));
                  setPreviewToken(null);
                  setProposedLabels(null);
                }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="batch-label-ordering">Ordering Strategy</label>
              <select
                id="batch-label-ordering"
                data-testid="batch-label-ordering"
                value={ordering}
                onChange={(e) => {
                  setOrdering(e.target.value as OrderingStrategy);
                  setPreviewToken(null);
                  setProposedLabels(null);
                }}
              >
                <option value="ROW_MAJOR">Row-major (top to bottom, left to right)</option>
                <option value="COLUMN_MAJOR">Column-major (left to right, top to bottom)</option>
                <option value="SELECTION">Selection order (order selected)</option>
              </select>
            </div>
          </div>
        </fieldset>

        <section className="space-selection-section" aria-label="Space selection">
          <div className="selection-toolbar">
            <h4>Select Spaces to Label ({selectedPlacementIds.length} of {eligiblePhysicalPlacements.length} selected)</h4>
            <div className="selection-actions">
              <button
                type="button"
                className="link-button"
                onClick={handleSelectAllPhysical}
                data-testid="select-all-physical-btn"
              >
                Select all physical
              </button>
              <button
                type="button"
                className="link-button"
                onClick={handleClearSelection}
                data-testid="clear-selection-btn"
              >
                Clear
              </button>
            </div>
          </div>

          {placements.length === 0 ? (
            <p className="empty-hint">No placements exist on this floor plan revision.</p>
          ) : (
            <ul className="batch-spaces-list" aria-label="Eligible placements">
              {placements.map((p) => {
                const isSelected = selectedSet.has(p.id);
                const isPhysical = p.spatialClass === 'PHYSICAL';

                return (
                  <li
                    key={p.id}
                    className={`batch-space-item ${isSelected ? 'selected' : ''} ${!isPhysical ? 'ineligible' : ''}`}
                    data-testid={`batch-space-item-${p.id}`}
                  >
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleTogglePlacement(p.id)}
                        disabled={!isPlanner}
                        data-testid={`checkbox-placement-${p.id}`}
                      />
                      <span className="space-name">
                        <strong>{p.templateName}</strong> ({p.templateCode})
                      </span>
                      <span className={`spatial-class-tag spatial-${p.spatialClass.toLowerCase()}`}>
                        {p.spatialClass}
                      </span>
                      <span className="coordinates-tag">
                        ({p.positionX}, {p.positionY})
                      </span>
                      <span className="current-label-tag">
                        Current: <em>{p.label ?? 'None'}</em>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="form-actions">
            <button
              type="submit"
              disabled={selectedPlacementIds.length === 0 || previewLoading || !isPlanner}
              data-testid="preview-batch-labels-btn"
            >
              {previewLoading ? 'Generating proposal...' : 'Preview Labels'}
            </button>
          </div>
        </section>
      </form>

      {/* Conflicts Display */}
      {conflicts.length > 0 && (
        <div
          className="conflicts-panel"
          role="alert"
          aria-label="Label Conflicts"
          data-testid="batch-label-conflicts"
        >
          <h4>Conflicts Detected ({conflicts.length})</h4>
          <p className="conflict-help-text">
            All conflicts must be resolved before confirmation can proceed.
          </p>
          <ul className="conflicts-list">
            {conflicts.map((conflict, index) => (
              <li
                key={index}
                className={`conflict-item conflict-${conflict.type}`}
                data-testid={`conflict-item-${index}`}
              >
                <span className="conflict-type-badge">{conflict.type}</span>
                <span className="conflict-message">{conflict.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Proposed Labels Preview Table */}
      {proposedLabels && (
        <section
          className="preview-proposal-section"
          aria-label="Proposed label assignments"
          data-testid="batch-label-preview-section"
        >
          <div className="preview-header">
            <h4>Deterministic Label Proposal ({proposedLabels.length} spaces)</h4>
            <span className="concurrency-badge">Revision concurrency v{previewConcurrencyVersion}</span>
          </div>

          <table className="preview-table" data-testid="proposed-labels-table">
            <thead>
              <tr>
                <th>Placement ID</th>
                <th>Position (X, Y)</th>
                <th>Current Label</th>
                <th>Proposed Label</th>
              </tr>
            </thead>
            <tbody>
              {proposedLabels.map((item) => (
                <tr key={item.placementId} data-testid={`preview-row-${item.placementId}`}>
                  <td>
                    <code>{item.placementId.slice(0, 8)}...</code>
                  </td>
                  <td>
                    ({item.positionX}, {item.positionY})
                  </td>
                  <td>
                    {item.currentLabel ? (
                      <span className="current-label-text">{item.currentLabel}</span>
                    ) : (
                      <span className="no-label-text">—</span>
                    )}
                  </td>
                  <td>
                    <strong className="proposed-label-text">{item.proposedLabel}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="confirmation-actions">
            <button
              type="button"
              className="primary-button"
              disabled={!canConfirm || confirming || !isPlanner}
              onClick={() => void handleConfirmBatch()}
              data-testid="confirm-batch-labels-btn"
            >
              {confirming ? 'Applying labels in transaction...' : 'Confirm and Apply Labels'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              data-testid="cancel-batch-confirm-btn"
            >
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
