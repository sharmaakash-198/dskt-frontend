import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import {
  accessibleGeometrySummary,
  diagnoseOrthogonalPolygon,
  polygonBounds,
  snapToEditingScale,
  type GeometryDiagnostic,
  type Vertex,
} from '../templates/geometry';
import {
  updateFloorPlanRevisionBoundary,
  updateFloorPlanRevisionScale,
  type FloorPlanRevision,
} from './floor-plan-api';

const PERMITTED_EDITING_SCALES = [1, 2, 4, 8, 16, 32, 64, 128, 256];
const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

const DEFAULT_BOUNDARY: Vertex[] = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 150 },
  { x: 0, y: 150 },
];

export type BoundaryEditorProps = {
  floorId: string;
  revision: FloorPlanRevision;
  canMutate: boolean;
  onRevisionUpdated: (updated: FloorPlanRevision) => void;
  onError: (message: string | null) => void;
};

export function BoundaryEditor({
  floorId,
  revision,
  canMutate,
  onRevisionUpdated,
  onError,
}: BoundaryEditorProps) {
  const initialVertices = revision.boundary && revision.boundary.length >= 4 ? revision.boundary : DEFAULT_BOUNDARY;
  const [vertices, setVertices] = useState<Vertex[]>(initialVertices);
  const [editingScale, setEditingScale] = useState<number>(revision.editingScale);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number } | null>(null);

  const [draftX, setDraftX] = useState<string>('0');
  const [draftY, setDraftY] = useState<string>('0');
  const [saving, setSaving] = useState(false);
  const [serverDiagnostics, setServerDiagnostics] = useState<GeometryDiagnostic[]>([]);

  const bounds = useMemo(() => polygonBounds(vertices), [vertices]);
  const summary = useMemo(() => accessibleGeometrySummary(vertices), [vertices]);
  const advisoryDiagnostics = useMemo(() => diagnoseOrthogonalPolygon(vertices), [vertices]);
  const allDiagnostics = [...serverDiagnostics, ...advisoryDiagnostics];

  async function handleScaleChange(newScale: number) {
    setEditingScale(newScale);
    if (!canMutate || revision.lifecycleState !== 'DRAFT') return;

    const result = await updateFloorPlanRevisionScale(api, floorId, revision.id, {
      concurrencyVersion: revision.concurrencyVersion,
      editingScale: newScale,
    });
    if (result.ok) {
      onRevisionUpdated(result.revision);
    } else {
      onError(result.error);
    }
  }

  function handleAddVertex(event: FormEvent) {
    event.preventDefault();
    const x = snapToEditingScale(Number(draftX), editingScale);
    const y = snapToEditingScale(Number(draftY), editingScale);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      onError('Coordinates must be integers in 10-cm world units.');
      return;
    }
    onError(null);
    setServerDiagnostics([]);
    setVertices((current) => [...current, { x, y }]);
  }

  function handleRemoveVertex(index: number) {
    if (vertices.length <= 4) {
      onError('A polygon boundary requires at least 4 vertices.');
      return;
    }
    onError(null);
    setServerDiagnostics([]);
    setVertices((current) => current.filter((_, i) => i !== index));
  }

  async function handleSaveBoundary() {
    setSaving(true);
    onError(null);
    setServerDiagnostics([]);

    const result = await updateFloorPlanRevisionBoundary(api, floorId, revision.id, {
      concurrencyVersion: revision.concurrencyVersion,
      editingScale,
      vertices,
    });
    setSaving(false);

    if (result.ok) {
      onRevisionUpdated(result.revision);
      setVertices(result.revision.boundary);
    } else {
      onError(result.error);
      if (result.diagnostics) {
        setServerDiagnostics(result.diagnostics);
      }
    }
  }

  const svgPoints = useMemo(() => {
    return vertices.map((v) => `${v.x},${v.y}`).join(' ');
  }, [vertices]);

  return (
    <div className="boundary-editor" role="region" aria-label="Floor Boundary Editor">
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <label htmlFor="boundary-editing-scale">Editing Scale</label>
          <select
            id="boundary-editing-scale"
            value={editingScale}
            onChange={(e) => void handleScaleChange(Number(e.target.value))}
            disabled={!canMutate || revision.lifecycleState !== 'DRAFT'}
          >
            {PERMITTED_EDITING_SCALES.map((scale) => (
              <option key={scale} value={scale}>
                {scale}x ({scale * 10} cm grid)
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-group" aria-label="Viewport zoom and pan controls">
          <label htmlFor="boundary-zoom">Zoom</label>
          <select
            id="boundary-zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setPan({ x: 40, y: 40 })}
            aria-label="Reset pan"
          >
            Reset Pan
          </button>
        </div>

        <div className="dimension-display" aria-live="polite">
          <strong>Dimensions:</strong> {bounds.width} × {bounds.height} world units ({bounds.width * 10} cm × {bounds.height * 10} cm)
        </div>

        {cursorCoords && (
          <div className="coordinate-feedback" aria-live="polite">
            <strong>Cursor:</strong> ({cursorCoords.x}, {cursorCoords.y}) world units
          </div>
        )}
      </div>

      <div
        className="canvas-viewport"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const screenX = e.clientX - rect.left - pan.x;
          const screenY = e.clientY - rect.top - pan.y;
          const worldX = Math.round(screenX / zoom);
          const worldY = Math.round(screenY / zoom);
          setCursorCoords({
            x: snapToEditingScale(worldX, editingScale),
            y: snapToEditingScale(worldY, editingScale),
          });
        }}
        onMouseLeave={() => setCursorCoords(null)}
        role="application"
        aria-label="Floor boundary canvas"
      >
        <svg
          className="boundary-svg"
          width="100%"
          height="400"
          style={{ background: '#f8fafc', overflow: 'hidden' }}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Polygon boundary in world units */}
            <polygon
              points={svgPoints}
              fill="rgba(59, 130, 246, 0.15)"
              stroke="#2563eb"
              strokeWidth={Math.max(1, 2 / zoom)}
            />
            {/* Vertex markers in world units */}
            {vertices.map((v, i) => (
              <g key={i} transform={`translate(${v.x}, ${v.y})`}>
                <circle r={Math.max(3, 5 / zoom)} fill="#1d4ed8" />
                <text
                  x={8 / zoom}
                  y={4 / zoom}
                  fontSize={Math.max(10, 12 / zoom)}
                  fill="#0f172a"
                  fontWeight="600"
                >
                  V{i} ({v.x}, {v.y})
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      <div className="geometry-accessibility">
        <h4>Accessible Boundary Summary</h4>
        <p className="accessible-summary" aria-live="polite">
          {summary}
        </p>
      </div>

      {allDiagnostics.length > 0 && (
        <div className="diagnostics-panel" role="alert" aria-label="Orthogonality guidance">
          <h4>Orthogonality Guidance</h4>
          <ul>
            {allDiagnostics.map((diag, index) => (
              <li key={index} className="diagnostic-item">
                <strong>{diag.code}:</strong> {diag.message}
                {diag.vertexIndex !== undefined && ` (vertex ${diag.vertexIndex})`}
                {diag.edgeIndex !== undefined && ` (edge ${diag.edgeIndex})`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canMutate && revision.lifecycleState === 'DRAFT' && (
        <div className="boundary-actions">
          <form onSubmit={handleAddVertex} className="add-vertex-form">
            <div className="form-group inline">
              <label htmlFor="vertex-x">X</label>
              <input
                id="vertex-x"
                type="number"
                value={draftX}
                onChange={(e) => setDraftX(e.target.value)}
              />
            </div>
            <div className="form-group inline">
              <label htmlFor="vertex-y">Y</label>
              <input
                id="vertex-y"
                type="number"
                value={draftY}
                onChange={(e) => setDraftY(e.target.value)}
              />
            </div>
            <button type="submit" className="secondary-button">
              Add Vertex (snapped {editingScale}x)
            </button>
          </form>

          <div className="vertex-editor-list">
            <h4>Ordered Vertices ({vertices.length})</h4>
            <ol>
              {vertices.map((v, i) => (
                <li key={i}>
                  <span>({v.x}, {v.y})</span>
                  {vertices.length > 4 && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => handleRemoveVertex(i)}
                      aria-label={`Remove vertex ${i}`}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </div>

          <div className="save-bar">
            <button
              type="button"
              onClick={() => void handleSaveBoundary()}
              disabled={saving || allDiagnostics.length > 0}
              className="primary-button"
            >
              {saving ? 'Saving boundary...' : 'Save Draft Boundary'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
