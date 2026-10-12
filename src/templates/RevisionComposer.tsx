import { useMemo, useRef, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import {
  createRevision,
  type ElementTemplate,
  type GeometryDiagnostic,
  type SpatialClass,
  type TemplateRevision,
} from './api';
import {
  accessibleGeometrySummary,
  diagnoseOrthogonalPolygon,
  snapToEditingScale,
  type Vertex,
} from './geometry';

const DEFAULT_RECT: Vertex[] = [
  { x: 0, y: 0 },
  { x: 12, y: 0 },
  { x: 12, y: 8 },
  { x: 0, y: 8 },
];

export type RevisionComposerProps = {
  template: ElementTemplate;
  canMutate: boolean;
  onCreated: (revision: TemplateRevision) => void;
  onError: (message: string | null) => void;
};

export function RevisionComposer({
  template,
  canMutate,
  onCreated,
  onError,
}: RevisionComposerProps) {
  const [spatialClass, setSpatialClass] = useState<SpatialClass>('PHYSICAL');
  const [assignable, setAssignable] = useState(true);
  const [borderColor, setBorderColor] = useState('#334455');
  const [fillColor, setFillColor] = useState('#CCDDEE');
  const [editingScale, setEditingScale] = useState(1);
  const [vertices, setVertices] = useState<Vertex[]>(DEFAULT_RECT);
  const [draftX, setDraftX] = useState('0');
  const [draftY, setDraftY] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [serverDiagnostics, setServerDiagnostics] = useState<GeometryDiagnostic[]>([]);
  const [focusedVertex, setFocusedVertex] = useState<number | null>(null);
  const vertexRefs = useRef<Array<HTMLLIElement | null>>([]);

  const summary = useMemo(() => accessibleGeometrySummary(vertices), [vertices]);
  const advisory = useMemo(() => diagnoseOrthogonalPolygon(vertices), [vertices]);
  const boundsLabel = useMemo(() => {
    if (vertices.length === 0) return '0 × 0';
    const xs = vertices.map((v) => v.x);
    const ys = vertices.map((v) => v.y);
    return `${Math.max(...xs) - Math.min(...xs)} × ${Math.max(...ys) - Math.min(...ys)}`;
  }, [vertices]);

  const ready = advisory.length === 0 && vertices.length >= 4;

  function focusDiagnostic(item: GeometryDiagnostic) {
    const index = item.vertexIndex ?? item.edgeIndex;
    if (index === undefined) {
      return;
    }
    setFocusedVertex(index);
    const node = vertexRefs.current[index];
    node?.focus();
    if (typeof node?.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' });
    }
  }

  function addVertex() {
    const x = snapToEditingScale(Number(draftX), editingScale);
    const y = snapToEditingScale(Number(draftY), editingScale);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      onError('Enter integer world coordinates.');
      return;
    }
    onError(null);
    setServerDiagnostics([]);
    setVertices((current) => [...current, { x, y }]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    onError(null);
    setServerDiagnostics([]);
    const result = await createRevision(api, template.id, {
      spatialClass,
      assignable: spatialClass === 'PHYSICAL' ? assignable : false,
      borderColor,
      fillColor,
      vertices,
    });
    setSubmitting(false);
    if (result.ok) {
      onCreated(result.revision);
      setVertices(DEFAULT_RECT);
      setFocusedVertex(null);
    } else {
      onError(result.error);
      setServerDiagnostics(result.diagnostics);
      if (result.diagnostics[0]) {
        focusDiagnostic(result.diagnostics[0]);
      }
    }
  }

  if (!canMutate) {
    return null;
  }

  const listedDiagnostics = serverDiagnostics.length > 0 ? serverDiagnostics : advisory;

  return (
    <section className="sites-panel" aria-label={`Compose revision for ${template.code}`}>
      <h4>New revision · {template.code}</h4>
      <p>
        World units are 10 cm. Editing scale snaps coordinates; zoom is not used for geometry.
        Advisory checks guide editing; the server remains authoritative.
      </p>
      <p aria-live="polite">Dimensions: {boundsLabel} world units</p>
      <p aria-live="polite">{summary}</p>
      {ready ? (
        <p role="status">Geometry looks ready for submission (subject to server validation).</p>
      ) : (
        <p role="status">Geometry needs attention before it can be submitted.</p>
      )}

      {listedDiagnostics.length > 0 && (
        <section aria-label="Geometry diagnostics">
          <h5>Geometry issues</h5>
          <ul className="site-list">
            {listedDiagnostics.map((item, index) => (
              <li key={`${item.code}-${index}`}>
                <button type="button" onClick={() => focusDiagnostic(item)}>
                  {item.message}
                  {item.vertexIndex !== undefined ? ` (vertex ${item.vertexIndex + 1})` : ''}
                  {item.edgeIndex !== undefined ? ` (edge ${item.edgeIndex + 1})` : ''}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form className="sign-in-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="form-group">
          <label htmlFor={`spatial-${template.id}`}>Spatial class</label>
          <select
            id={`spatial-${template.id}`}
            value={spatialClass}
            onChange={(event) => {
              const next = event.target.value as SpatialClass;
              setSpatialClass(next);
              if (next !== 'PHYSICAL') {
                setAssignable(false);
              }
            }}
          >
            <option value="PHYSICAL">PHYSICAL</option>
            <option value="ZONE">ZONE</option>
            <option value="OBSTACLE">OBSTACLE</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor={`assignable-${template.id}`}>
            <input
              id={`assignable-${template.id}`}
              type="checkbox"
              checked={assignable}
              disabled={spatialClass !== 'PHYSICAL'}
              onChange={(event) => setAssignable(event.target.checked)}
            />{' '}
            Assignable (PHYSICAL only)
          </label>
        </div>
        <div className="form-group">
          <label htmlFor={`border-${template.id}`}>Border color</label>
          <input
            id={`border-${template.id}`}
            required
            pattern="#[0-9A-Fa-f]{6}"
            value={borderColor}
            onChange={(event) => setBorderColor(event.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor={`fill-${template.id}`}>Fill color</label>
          <input
            id={`fill-${template.id}`}
            required
            pattern="#[0-9A-Fa-f]{6}"
            value={fillColor}
            onChange={(event) => setFillColor(event.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor={`scale-${template.id}`}>Editing scale</label>
          <select
            id={`scale-${template.id}`}
            value={editingScale}
            onChange={(event) => setEditingScale(Number(event.target.value))}
          >
            {[1, 2, 4, 8, 16].map((scale) => (
              <option key={scale} value={scale}>
                {scale}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="form-group">
          <legend>Add vertex (world units)</legend>
          <label htmlFor={`vx-${template.id}`}>X</label>
          <input
            id={`vx-${template.id}`}
            value={draftX}
            onChange={(event) => setDraftX(event.target.value)}
          />
          <label htmlFor={`vy-${template.id}`}>Y</label>
          <input
            id={`vy-${template.id}`}
            value={draftY}
            onChange={(event) => setDraftY(event.target.value)}
          />
          <button type="button" onClick={() => addVertex()}>
            Add snapped vertex
          </button>
        </fieldset>

        <ol aria-label="Geometry vertices">
          {vertices.map((vertex, index) => (
            <li
              key={`${vertex.x},${vertex.y},${index}`}
              id={`vertex-${template.id}-${index}`}
              tabIndex={-1}
              ref={(node) => {
                vertexRefs.current[index] = node;
              }}
              aria-current={focusedVertex === index ? 'true' : undefined}
              style={
                focusedVertex === index
                  ? { outline: '2px solid currentColor', fontWeight: 700 }
                  : undefined
              }
            >
              Vertex {index + 1}: ({vertex.x}, {vertex.y})
              <button
                type="button"
                onClick={() => {
                  setServerDiagnostics([]);
                  setVertices((current) => current.filter((_, itemIndex) => itemIndex !== index));
                }}
              >
                Remove vertex {index + 1}
              </button>
            </li>
          ))}
        </ol>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating revision...' : 'Create immutable revision'}
        </button>
      </form>
    </section>
  );
}
