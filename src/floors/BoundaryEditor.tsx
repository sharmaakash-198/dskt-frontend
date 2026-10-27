import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { getSpaceAssignmentBreakdown, type Assignment } from '../assignments/api';
import { api } from '../api/client';
import {
  accessibleGeometrySummary,
  checkSpatialCollision,
  diagnoseOrthogonalPolygon,
  isPolygonInsideBoundary,
  polygonBounds,
  snapToEditingScale,
  transformVertices,
  type GeometryDiagnostic,
  type SpatialClass,
  type Vertex,
} from '../templates/geometry';
import {
  acquireFloorPlanLease,
  createPlacedElement,
  deletePlacedElement,
  getFloorPlanLease,
  getFloorPlanRevision,
  listPlacedElements,
  releaseFloorPlanLease,
  renewFloorPlanLease,
  takeoverFloorPlanLease,
  updateFloorPlanRevisionBoundary,
  updateFloorPlanRevisionScale,
  updatePlacedElement,
  validateFloorPlanDraft,
  publishFloorPlanRevision,
  type FloorPlanLease,
  type FloorPlanRevision,
  type PlacedElement,
  type PublicationValidationError,
  type PublicationValidationResult,
} from './floor-plan-api';
import {
  createInitialHistoryState,
  markServerConfirmed,
  pushCommand,
  redo,
  resetToServerDraft,
  undo,
  type HistoryState,
} from './editor-history';
import {
  listCategories,
  listTemplates,
  listRevisions,
  type ElementTemplate,
  type TemplateRevision,
} from '../templates/api';

const PERMITTED_EDITING_SCALES = [1, 2, 4, 8, 16, 32, 64, 128, 256];
const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

const DEFAULT_BOUNDARY: Vertex[] = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 150 },
  { x: 0, y: 150 },
];

export type AutosaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'validation_error'
  | 'conflict'
  | 'unavailable';

const VALIDATION_CATEGORY_LABELS: Record<string, string> = {
  BOUNDARY: 'Floor Boundary Issues',
  CONTAINMENT: 'Boundary Containment Issues',
  COLLISION: 'Placement Collision Issues',
  TEMPLATE: 'Template Reference Issues',
  LABEL: 'Label Validation Issues',
  LIFECYCLE: 'Lifecycle Precondition Issues',
  ASSIGNMENT: 'Assignment Reconciliation Issues',
};

export type BoundaryEditorProps = {
  floorId: string;
  revision: FloorPlanRevision;
  canMutate: boolean;
  isPlanner?: boolean;
  assignments?: Assignment[];
  initialPlacementIdentityId?: string | null;
  onOpenAssignSpace?: (placementId: string) => void;
  onOpenEndAssignment?: (assignment: Assignment) => void;
  onRevisionUpdated: (updated: FloorPlanRevision) => void;
  onError: (message: string | null) => void;
};

export function BoundaryEditor({
  floorId,
  revision,
  canMutate,
  isPlanner = false,
  assignments = [],
  initialPlacementIdentityId,
  onOpenAssignSpace,
  onOpenEndAssignment,
  onRevisionUpdated,
  onError,
}: BoundaryEditorProps) {
  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  const initialVertices = revision.boundary && revision.boundary.length >= 4 ? revision.boundary : DEFAULT_BOUNDARY;
  const lastSavedVerticesRef = useRef<string>(JSON.stringify(initialVertices));
  const [vertices, setVertices] = useState<Vertex[]>(initialVertices);
  const [editingScale, setEditingScale] = useState<number>(revision.editingScale);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number } | null>(null);

  const [draftX, setDraftX] = useState<string>('0');
  const [draftY, setDraftY] = useState<string>('0');
  const [saving, setSaving] = useState(false);
  const [serverDiagnostics, setServerDiagnostics] = useState<GeometryDiagnostic[]>([]);

  // Editor lease and autosave states
  const [activeLease, setActiveLease] = useState<FloorPlanLease | null>(null);
  const [leaseToken, setLeaseToken] = useState<string | null>(null);
  const [isLeaseHolder, setIsLeaseHolder] = useState<boolean>(false);
  const [isConflict, setIsConflict] = useState<boolean>(false);
  const [conflictOwner, setConflictOwner] = useState<{ displayName: string; email: string } | null>(null);
  const [leaseSecondsRemaining, setLeaseSecondsRemaining] = useState<number | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [takingOver, setTakingOver] = useState(false);

  // History (undo/redo) and concurrency conflict states
  const [historyState, setHistoryState] = useState<HistoryState>(() => createInitialHistoryState(revision));
  const [concurrencyConflict, setConcurrencyConflict] = useState<{ isStale: boolean; currentServerVersion?: number } | null>(null);
  const [recoveringConflict, setRecoveringConflict] = useState(false);

  // Publication preview validation state
  const [validationResult, setValidationResult] = useState<PublicationValidationResult | null>(null);
  const [validating, setValidating] = useState<boolean>(false);
  const [focusedValidationEntityId, setFocusedValidationEntityId] = useState<string | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [publicationSuccess, setPublicationSuccess] = useState<boolean>(false);

  // Keep ref for unmount cleanup
  const currentLeaseTokenRef = useRef<string | null>(null);
  useEffect(() => {
    currentLeaseTokenRef.current = leaseToken;
  }, [leaseToken]);

  // Lease acquisition, heartbeat renewal, and cleanup
  useEffect(() => {
    if (!canMutate || revision.lifecycleState !== 'DRAFT') {
      return;
    }
    let cancelled = false;

    async function initLease() {
      const acqRes = await acquireFloorPlanLease(api, floorId, revision.id, { durationSeconds: 60 });
      if (cancelled) return;
      if (acqRes.ok) {
        setActiveLease(acqRes.lease);
        setLeaseToken(acqRes.lease.token ?? null);
        setIsLeaseHolder(true);
        setIsConflict(false);
        setConflictOwner(null);
        const diffMs = new Date(acqRes.lease.expiresAt).getTime() - Date.now();
        setLeaseSecondsRemaining(Math.max(0, Math.floor(diffMs / 1000)));
      } else {
        if (acqRes.isConflict) {
          setIsConflict(true);
          setIsLeaseHolder(false);
          const stateRes = await getFloorPlanLease(api, floorId, revision.id);
          if (!cancelled && stateRes.ok && stateRes.state.lease) {
            setConflictOwner({
              displayName: stateRes.state.lease.owner.displayName,
              email: stateRes.state.lease.owner.email,
            });
          }
        }
      }
    }

    void initLease();

    return () => {
      cancelled = true;
      const tok = currentLeaseTokenRef.current;
      if (tok) {
        void releaseFloorPlanLease(api, floorId, revision.id, tok);
      }
    };
  }, [floorId, revision.id, revision.lifecycleState, canMutate]);

  // Periodic heartbeat to renew lease every 25 seconds if held
  useEffect(() => {
    if (!isLeaseHolder || !leaseToken) return;

    const interval = setInterval(async () => {
      const renewRes = await renewFloorPlanLease(api, floorId, revision.id, leaseToken, { durationSeconds: 60 });
      if (renewRes.ok) {
        setActiveLease(renewRes.lease);
      } else {
        setIsLeaseHolder(false);
        setIsConflict(true);
        setAutosaveStatus('conflict');
      }
    }, 25000);

    return () => clearInterval(interval);
  }, [floorId, revision.id, isLeaseHolder, leaseToken]);

  // Expiry countdown timer (updated every second)
  useEffect(() => {
    if (!activeLease) {
      return;
    }

    const calculateRemaining = () => {
      const diffMs = new Date(activeLease.expiresAt).getTime() - Date.now();
      return Math.max(0, Math.floor(diffMs / 1000));
    };

    const timer = setInterval(() => {
      const secs = calculateRemaining();
      setLeaseSecondsRemaining(secs);
      if (secs === 0) {
        setIsLeaseHolder(false);
        setIsConflict(true);
        setAutosaveStatus('conflict');
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeLease]);

  async function handleTakeover() {
    setTakingOver(true);
    onError(null);
    const result = await takeoverFloorPlanLease(api, floorId, revision.id, {
      reason: 'User requested session takeover',
      durationSeconds: 60,
    });
    setTakingOver(false);
    if (result.ok) {
      setActiveLease(result.lease);
      setLeaseToken(result.lease.token ?? null);
      setIsLeaseHolder(true);
      setIsConflict(false);
      setConflictOwner(null);
      setAutosaveStatus('saved');
    } else {
      onError(result.error);
    }
  }
  const [placements, setPlacements] = useState<PlacedElement[]>(revision.placements ?? []);
  const [placeableTemplates, setPlaceableTemplates] = useState<{
    template: ElementTemplate;
    revision: TemplateRevision;
    categoryCode: string;
  }[]>([]);
  const [dragTemplate, setDragTemplate] = useState<{
    template: ElementTemplate;
    revision: TemplateRevision;
  } | null>(null);
  const [previewPlacement, setPreviewPlacement] = useState<{
    vertices: Vertex[];
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    position: { x: number; y: number };
    isValid: boolean;
    reason: string;
  } | null>(null);

  // Form for manual/keyboard placement
  const [placeX, setPlaceX] = useState<string>('10');
  const [placeY, setPlaceY] = useState<string>('10');
  const [placeLabel, setPlaceLabel] = useState<string>('');
  const [selectedTemplateRevId, setSelectedTemplateRevId] = useState<string>('');
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [editX, setEditX] = useState<string>('0');
  const [editY, setEditY] = useState<string>('0');
  const [editRotation, setEditRotation] = useState<number>(0);
  const [editLabel, setEditLabel] = useState<string>('');
  const [transforming, setTransforming] = useState<boolean>(false);
  const [transformPreview, setTransformPreview] = useState<{
    vertices: Vertex[];
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    isValid: boolean;
    reason: string;
  } | null>(null);

  const [prevBoundary, setPrevBoundary] = useState(revision.boundary);
  if (revision.boundary !== prevBoundary) {
    setPrevBoundary(revision.boundary);
    if (revision.boundary && revision.boundary.length >= 4) {
      setVertices(revision.boundary);
    }
  }

  const [prevPropPlacements, setPrevPropPlacements] = useState(revision.placements);
  if (revision.placements !== prevPropPlacements) {
    setPrevPropPlacements(revision.placements);
    if (revision.placements) {
      setPlacements(revision.placements);
    }
  }

  useEffect(() => {
    if (revision.boundary && revision.boundary.length >= 4) {
      lastSavedVerticesRef.current = JSON.stringify(revision.boundary);
    }
  }, [revision.boundary]);

  const bounds = useMemo(() => polygonBounds(vertices), [vertices]);
  const summary = useMemo(() => accessibleGeometrySummary(vertices), [vertices]);
  const advisoryDiagnostics = useMemo(() => diagnoseOrthogonalPolygon(vertices), [vertices]);
  const allDiagnostics = [...serverDiagnostics, ...advisoryDiagnostics];

  useEffect(() => {
    if (revision.placements) {
      return;
    }
    let cancelled = false;
    void listPlacedElements(api, floorId, revision.id).then((res) => {
      if (!cancelled && res.ok) {
        setPlacements(res.placements);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [floorId, revision.id, revision.placements]);

  const [prevTargetId, setPrevTargetId] = useState<string | null | undefined>(initialPlacementIdentityId);
  const [hasAppliedInitial, setHasAppliedInitial] = useState(false);

  if (initialPlacementIdentityId !== prevTargetId) {
    setPrevTargetId(initialPlacementIdentityId);
    setHasAppliedInitial(false);
  }

  if (initialPlacementIdentityId && !hasAppliedInitial && placements.length > 0) {
    const target = placements.find(
      (p) => p.placementIdentityId === initialPlacementIdentityId || p.id === initialPlacementIdentityId,
    );
    if (target) {
      setHasAppliedInitial(true);
      setSelectedPlacementId(target.id);
      setEditX(String(target.positionX));
      setEditY(String(target.positionY));
      setEditRotation(target.rotationDegrees);
      setEditLabel(target.label ?? '');
    }
  }

  const isStaleTargetSpace = Boolean(
    initialPlacementIdentityId &&
      placements.length > 0 &&
      !placements.some(
        (p) => p.placementIdentityId === initialPlacementIdentityId || p.id === initialPlacementIdentityId,
      ),
  );

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      const catRes = await listCategories(api);
      if (cancelled || !catRes.ok) return;
      const list: {
        template: ElementTemplate;
        revision: TemplateRevision;
        categoryCode: string;
      }[] = [];
      for (const cat of catRes.categories) {
        if (cat.archivedAt) continue;
        const tmplRes = await listTemplates(api, cat.id);
        if (cancelled || !tmplRes.ok) continue;
        for (const tmpl of tmplRes.templates) {
          if (tmpl.archivedAt || !tmpl.placeable || !tmpl.currentRevisionId) continue;
          const revRes = await listRevisions(api, tmpl.id);
          if (cancelled || !revRes.ok) continue;
          const curRev = revRes.revisions.find(
            (r) =>
              r.isCurrent &&
              (r.spatialClass === 'PHYSICAL' || r.spatialClass === 'ZONE' || r.spatialClass === 'OBSTACLE'),
          );
          if (curRev) {
            list.push({ template: tmpl, revision: curRev, categoryCode: cat.code });
          }
        }
      }
      if (!cancelled) {
        setPlaceableTemplates(list);
        setSelectedTemplateRevId((current) => current || (list[0]?.revision.id ?? ''));
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleScaleChange(newScale: number) {
    setEditingScale(newScale);
    if (!canMutate || revision.lifecycleState !== 'DRAFT') return;

    setAutosaveStatus('saving');
    const clientCommandId = crypto.randomUUID();
    const result = await updateFloorPlanRevisionScale(api, floorId, revision.id, {
      concurrencyVersion: revision.concurrencyVersion,
      editingScale: newScale,
      leaseToken: leaseToken ?? undefined,
      clientCommandId,
    });
    if (result.ok) {
      onRevisionUpdated(result.revision);
      setHistoryState((h) => markServerConfirmed(h, result.revision));
      setConcurrencyConflict(null);
      setAutosaveStatus('saved');
    } else {
      if (result.isConcurrencyConflict) {
        setConcurrencyConflict({ isStale: true, currentServerVersion: result.currentConcurrencyVersion });
        setAutosaveStatus('conflict');
      } else if (result.isConflict) {
        setIsConflict(true);
        setIsLeaseHolder(false);
        setAutosaveStatus('conflict');
      } else {
        setAutosaveStatus('unavailable');
      }
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
    const nextVertices = [...vertices, { x, y }];
    setHistoryState((h) =>
      pushCommand(h, {
        type: 'SET_BOUNDARY',
        description: `Add vertex (${x}, ${y})`,
        previousVertices: vertices,
        nextVertices,
      }),
    );
    setVertices(nextVertices);
  }

  function handleRemoveVertex(index: number) {
    if (vertices.length <= 4) {
      onError('A polygon boundary requires at least 4 vertices.');
      return;
    }
    onError(null);
    setServerDiagnostics([]);
    const nextVertices = vertices.filter((_, i) => i !== index);
    setHistoryState((h) =>
      pushCommand(h, {
        type: 'SET_BOUNDARY',
        description: `Remove vertex #${index + 1}`,
        previousVertices: vertices,
        nextVertices,
      }),
    );
    setVertices(nextVertices);
  }

  async function handleSaveBoundary() {
    if (allDiagnostics.length > 0) {
      setAutosaveStatus('validation_error');
      onError('Cannot save invalid boundary geometry.');
      return;
    }

    setSaving(true);
    setAutosaveStatus('saving');
    onError(null);
    setServerDiagnostics([]);

    const clientCommandId = crypto.randomUUID();
    const result = await updateFloorPlanRevisionBoundary(api, floorId, revision.id, {
      concurrencyVersion: revision.concurrencyVersion,
      editingScale,
      vertices,
      leaseToken: leaseToken ?? undefined,
      clientCommandId,
    });
    setSaving(false);

    if (result.ok) {
      lastSavedVerticesRef.current = JSON.stringify(result.revision.boundary);
      onRevisionUpdated(result.revision);
      setVertices(result.revision.boundary);
      setHistoryState((h) => markServerConfirmed(h, result.revision));
      setConcurrencyConflict(null);
      setAutosaveStatus('saved');
    } else {
      if (result.isConcurrencyConflict) {
        setConcurrencyConflict({ isStale: true, currentServerVersion: result.currentConcurrencyVersion });
        setAutosaveStatus('conflict');
      } else if (result.isConflict) {
        setIsConflict(true);
        setIsLeaseHolder(false);
        setAutosaveStatus('conflict');
      } else if (result.diagnostics && result.diagnostics.length > 0) {
        setAutosaveStatus('validation_error');
        setServerDiagnostics(result.diagnostics);
      } else {
        setAutosaveStatus('unavailable');
      }
      onError(result.error);
    }
  }

  // Debounced autosave for boundary edits
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!canMutate || revision.lifecycleState !== 'DRAFT') {
      return;
    }

    if (JSON.stringify(vertices) === lastSavedVerticesRef.current) {
      return;
    }

    const hasDiagnostics = allDiagnostics.length > 0;

    if (hasDiagnostics) {
      const timer = setTimeout(() => {
        setAutosaveStatus('validation_error');
      }, 0);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setAutosaveStatus('saving');
    }, 0);

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(async () => {
      const clientCommandId = crypto.randomUUID();

      const res = await updateFloorPlanRevisionBoundary(api, floorId, revision.id, {
        concurrencyVersion: revision.concurrencyVersion,
        editingScale,
        vertices,
        leaseToken: leaseToken ?? undefined,
        clientCommandId,
      });

      if (res.ok) {
        lastSavedVerticesRef.current = JSON.stringify(res.revision.boundary);
        onRevisionUpdated(res.revision);
        setHistoryState((h) => markServerConfirmed(h, res.revision));
        setConcurrencyConflict(null);
        setAutosaveStatus('saved');
      } else {
        if (res.isConcurrencyConflict) {
          setConcurrencyConflict({ isStale: true, currentServerVersion: res.currentConcurrencyVersion });
          setAutosaveStatus('conflict');
        } else if (res.isConflict) {
          setIsConflict(true);
          setIsLeaseHolder(false);
          setAutosaveStatus('conflict');
        } else if (res.diagnostics && res.diagnostics.length > 0) {
          setAutosaveStatus('validation_error');
          setServerDiagnostics(res.diagnostics);
        } else {
          setAutosaveStatus('unavailable');
        }
        onError(res.error);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [vertices, editingScale, floorId, canMutate, revision.id, revision.lifecycleState, revision.concurrencyVersion, leaseToken, allDiagnostics.length, onError, onRevisionUpdated]);

  async function handleCommitPlacement(
    templateRevisionId: string,
    positionX: number,
    positionY: number,
    rotationDegrees = 0,
    label?: string | null,
  ) {
    onError(null);
    setAutosaveStatus('saving');
    const clientCommandId = crypto.randomUUID();
    const result = await createPlacedElement(api, floorId, revision.id, {
      templateRevisionId,
      positionX,
      positionY,
      rotationDegrees,
      label,
      leaseToken: leaseToken ?? undefined,
      clientCommandId,
    });
    if (result.ok) {
      const updated = [...placements, result.placement];
      setPlacements(updated);
      setHistoryState((h) =>
        pushCommand(h, {
          type: 'PLACE_ELEMENT',
          description: `Place ${result.placement.templateName}`,
          placement: result.placement,
        }),
      );
      const nextRev: FloorPlanRevision = {
        ...revision,
        concurrencyVersion: revision.concurrencyVersion + 1,
        placements: updated,
      };
      onRevisionUpdated(nextRev);
      setHistoryState((h) => markServerConfirmed(h, nextRev));
      setPreviewPlacement(null);
      setDragTemplate(null);
      setConcurrencyConflict(null);
      setAutosaveStatus('saved');
    } else {
      if (result.isConcurrencyConflict) {
        setConcurrencyConflict({ isStale: true, currentServerVersion: result.currentConcurrencyVersion });
        setAutosaveStatus('conflict');
      } else if (result.isConflict) {
        setIsConflict(true);
        setIsLeaseHolder(false);
        setAutosaveStatus('conflict');
      } else {
        setAutosaveStatus('unavailable');
      }
      onError(result.error);
    }
  }

  async function handleApplyTransform(e: FormEvent) {
    e.preventDefault();
    if (!selectedPlacement) return;
    const x = snapToEditingScale(Number(editX), editingScale);
    const y = snapToEditingScale(Number(editY), editingScale);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      onError('Coordinates must be integers in 10-cm world units.');
      return;
    }
    if (![0, 90, 180, 270].includes(editRotation)) {
      onError('Rotation must be a quarter turn (0, 90, 180, or 270 degrees).');
      return;
    }

    setTransforming(true);
    setAutosaveStatus('saving');
    onError(null);
    const clientCommandId = crypto.randomUUID();
    const result = await updatePlacedElement(api, floorId, revision.id, selectedPlacement.id, {
      positionX: x,
      positionY: y,
      rotationDegrees: editRotation,
      label: editLabel.trim() || null,
      concurrencyVersion: revision.concurrencyVersion,
      leaseToken: leaseToken ?? undefined,
      clientCommandId,
    });
    setTransforming(false);

    if (result.ok) {
      const updatedList = placements.map((p) => (p.id === result.placement.id ? result.placement : p));
      setPlacements(updatedList);
      setHistoryState((h) =>
        pushCommand(h, {
          type: 'TRANSFORM_PLACEMENT',
          description: `Transform ${selectedPlacement.templateName}`,
          placementId: selectedPlacement.id,
          previous: {
            positionX: selectedPlacement.positionX,
            positionY: selectedPlacement.positionY,
            rotationDegrees: selectedPlacement.rotationDegrees,
            label: selectedPlacement.label,
          },
          next: {
            positionX: x,
            positionY: y,
            rotationDegrees: editRotation,
            label: editLabel.trim() || null,
          },
        }),
      );
      const nextRev: FloorPlanRevision = {
        ...revision,
        concurrencyVersion: revision.concurrencyVersion + 1,
        placements: updatedList,
      };
      onRevisionUpdated(nextRev);
      setHistoryState((h) => markServerConfirmed(h, nextRev));
      setTransformPreview(null);
      setConcurrencyConflict(null);
      setAutosaveStatus('saved');
    } else {
      if (result.isConcurrencyConflict) {
        setConcurrencyConflict({ isStale: true, currentServerVersion: result.currentConcurrencyVersion });
        setAutosaveStatus('conflict');
      } else if (result.isConflict) {
        setIsConflict(true);
        setIsLeaseHolder(false);
        setAutosaveStatus('conflict');
      } else {
        setAutosaveStatus('unavailable');
      }
      onError(result.error);
    }
  }

  async function handleRemovePlacement(placementId: string) {
    setTransforming(true);
    setAutosaveStatus('saving');
    onError(null);
    const clientCommandId = crypto.randomUUID();
    const result = await deletePlacedElement(
      api,
      floorId,
      revision.id,
      placementId,
      revision.concurrencyVersion,
      leaseToken ?? undefined,
      clientCommandId,
    );
    setTransforming(false);

    if (result.ok) {
      const target = placements.find((p) => p.id === placementId);
      if (target) {
        setHistoryState((h) =>
          pushCommand(h, {
            type: 'DELETE_PLACEMENT',
            description: `Remove ${target.templateName}`,
            placement: target,
          }),
        );
      }
      const updatedList = placements.filter((p) => p.id !== placementId);
      setPlacements(updatedList);
      setSelectedPlacementId(null);
      setTransformPreview(null);
      const nextRev: FloorPlanRevision = {
        ...revision,
        concurrencyVersion: result.concurrencyVersion,
        placements: updatedList,
      };
      onRevisionUpdated(nextRev);
      setHistoryState((h) => markServerConfirmed(h, nextRev));
      setConcurrencyConflict(null);
      setAutosaveStatus('saved');
    } else {
      if (result.isConcurrencyConflict) {
        setConcurrencyConflict({ isStale: true, currentServerVersion: result.currentConcurrencyVersion });
        setAutosaveStatus('conflict');
      } else if (result.isConflict) {
        setIsConflict(true);
        setIsLeaseHolder(false);
        setAutosaveStatus('conflict');
      } else {
        setAutosaveStatus('unavailable');
      }
      onError(result.error);
    }
  }

  function handleUndo() {
    const { nextState, invertedCommand } = undo(historyState);
    if (!invertedCommand) return;
    setHistoryState(nextState);

    if (invertedCommand.type === 'SET_BOUNDARY') {
      setVertices(invertedCommand.nextVertices);
    } else if (invertedCommand.type === 'PLACE_ELEMENT') {
      const restored = invertedCommand.placement;
      setPlacements((prev) => [...prev.filter((p) => p.id !== restored.id), restored]);
      void createPlacedElement(api, floorId, revision.id, {
        templateRevisionId: restored.elementTemplateRevisionId,
        positionX: restored.positionX,
        positionY: restored.positionY,
        rotationDegrees: restored.rotationDegrees,
        label: restored.label,
        concurrencyVersion: revision.concurrencyVersion,
        leaseToken: leaseToken ?? undefined,
        clientCommandId: crypto.randomUUID(),
      }).then((res) => {
        if (res.ok) {
          onRevisionUpdated({
            ...revision,
            concurrencyVersion: revision.concurrencyVersion + 1,
            placements: [...placements.filter((p) => p.id !== restored.id), res.placement],
          });
          setAutosaveStatus('saved');
        } else if (res.isConcurrencyConflict) {
          setConcurrencyConflict({ isStale: true, currentServerVersion: res.currentConcurrencyVersion });
          setAutosaveStatus('conflict');
        }
      });
    } else if (invertedCommand.type === 'DELETE_PLACEMENT') {
      const removed = invertedCommand.placement;
      setPlacements((prev) => prev.filter((p) => p.id !== removed.id));
      if (selectedPlacementId === removed.id) setSelectedPlacementId(null);
      void deletePlacedElement(
        api,
        floorId,
        revision.id,
        removed.id,
        revision.concurrencyVersion,
        leaseToken ?? undefined,
        crypto.randomUUID(),
      ).then((res) => {
        if (res.ok) {
          onRevisionUpdated({
            ...revision,
            concurrencyVersion: res.concurrencyVersion,
            placements: placements.filter((p) => p.id !== removed.id),
          });
          setAutosaveStatus('saved');
        } else if (res.isConcurrencyConflict) {
          setConcurrencyConflict({ isStale: true, currentServerVersion: res.currentConcurrencyVersion });
          setAutosaveStatus('conflict');
        }
      });
    } else if (invertedCommand.type === 'TRANSFORM_PLACEMENT') {
      const { placementId, next: tNext } = invertedCommand;
      setPlacements((prev) =>
        prev.map((p) =>
          p.id === placementId
            ? {
                ...p,
                positionX: tNext.positionX,
                positionY: tNext.positionY,
                rotationDegrees: tNext.rotationDegrees,
                label: tNext.label,
              }
            : p,
        ),
      );
      void updatePlacedElement(api, floorId, revision.id, placementId, {
        positionX: tNext.positionX,
        positionY: tNext.positionY,
        rotationDegrees: tNext.rotationDegrees,
        label: tNext.label,
        concurrencyVersion: revision.concurrencyVersion,
        leaseToken: leaseToken ?? undefined,
        clientCommandId: crypto.randomUUID(),
      }).then((res) => {
        if (res.ok) {
          onRevisionUpdated({
            ...revision,
            concurrencyVersion: revision.concurrencyVersion + 1,
            placements: placements.map((p) => (p.id === res.placement.id ? res.placement : p)),
          });
          setAutosaveStatus('saved');
        } else if (res.isConcurrencyConflict) {
          setConcurrencyConflict({ isStale: true, currentServerVersion: res.currentConcurrencyVersion });
          setAutosaveStatus('conflict');
        }
      });
    }
  }

  function handleRedo() {
    const { nextState, command } = redo(historyState);
    if (!command) return;
    setHistoryState(nextState);

    if (command.type === 'SET_BOUNDARY') {
      setVertices(command.nextVertices);
    } else if (command.type === 'PLACE_ELEMENT') {
      const restored = command.placement;
      setPlacements((prev) => [...prev.filter((p) => p.id !== restored.id), restored]);
      void createPlacedElement(api, floorId, revision.id, {
        templateRevisionId: restored.elementTemplateRevisionId,
        positionX: restored.positionX,
        positionY: restored.positionY,
        rotationDegrees: restored.rotationDegrees,
        label: restored.label,
        concurrencyVersion: revision.concurrencyVersion,
        leaseToken: leaseToken ?? undefined,
        clientCommandId: crypto.randomUUID(),
      }).then((res) => {
        if (res.ok) {
          onRevisionUpdated({
            ...revision,
            concurrencyVersion: revision.concurrencyVersion + 1,
            placements: [...placements.filter((p) => p.id !== restored.id), res.placement],
          });
          setAutosaveStatus('saved');
        } else if (res.isConcurrencyConflict) {
          setConcurrencyConflict({ isStale: true, currentServerVersion: res.currentConcurrencyVersion });
          setAutosaveStatus('conflict');
        }
      });
    } else if (command.type === 'DELETE_PLACEMENT') {
      const removed = command.placement;
      setPlacements((prev) => prev.filter((p) => p.id !== removed.id));
      if (selectedPlacementId === removed.id) setSelectedPlacementId(null);
      void deletePlacedElement(
        api,
        floorId,
        revision.id,
        removed.id,
        revision.concurrencyVersion,
        leaseToken ?? undefined,
        crypto.randomUUID(),
      ).then((res) => {
        if (res.ok) {
          onRevisionUpdated({
            ...revision,
            concurrencyVersion: res.concurrencyVersion,
            placements: placements.filter((p) => p.id !== removed.id),
          });
          setAutosaveStatus('saved');
        } else if (res.isConcurrencyConflict) {
          setConcurrencyConflict({ isStale: true, currentServerVersion: res.currentConcurrencyVersion });
          setAutosaveStatus('conflict');
        }
      });
    } else if (command.type === 'TRANSFORM_PLACEMENT') {
      const { placementId, next: tNext } = command;
      setPlacements((prev) =>
        prev.map((p) =>
          p.id === placementId
            ? {
                ...p,
                positionX: tNext.positionX,
                positionY: tNext.positionY,
                rotationDegrees: tNext.rotationDegrees,
                label: tNext.label,
              }
            : p,
        ),
      );
      void updatePlacedElement(api, floorId, revision.id, placementId, {
        positionX: tNext.positionX,
        positionY: tNext.positionY,
        rotationDegrees: tNext.rotationDegrees,
        label: tNext.label,
        concurrencyVersion: revision.concurrencyVersion,
        leaseToken: leaseToken ?? undefined,
        clientCommandId: crypto.randomUUID(),
      }).then((res) => {
        if (res.ok) {
          onRevisionUpdated({
            ...revision,
            concurrencyVersion: revision.concurrencyVersion + 1,
            placements: placements.map((p) => (p.id === res.placement.id ? res.placement : p)),
          });
          setAutosaveStatus('saved');
        } else if (res.isConcurrencyConflict) {
          setConcurrencyConflict({ isStale: true, currentServerVersion: res.currentConcurrencyVersion });
          setAutosaveStatus('conflict');
        }
      });
    }
  }

  // Keyboard shortcut listener for Undo / Redo
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!canMutate || revision.lifecycleState !== 'DRAFT') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  async function handleReloadServerDraft() {
    setRecoveringConflict(true);
    onError(null);
    const res = await getFloorPlanRevision(api, floorId, revision.id);
    setRecoveringConflict(false);
    if (res.ok) {
      lastSavedVerticesRef.current = JSON.stringify(res.revision.boundary);
      onRevisionUpdated(res.revision);
      setVertices(res.revision.boundary);
      setPlacements(res.revision.placements ?? []);
      setHistoryState(resetToServerDraft(historyState, res.revision));
      setConcurrencyConflict(null);
      setAutosaveStatus('saved');
      setServerDiagnostics([]);
    } else {
      onError(res.error);
    }
  }

  async function handleReapplyUnsavedWork() {
    setRecoveringConflict(true);
    onError(null);
    const latestRes = await getFloorPlanRevision(api, floorId, revision.id);
    if (!latestRes.ok) {
      setRecoveringConflict(false);
      onError(latestRes.error);
      return;
    }

    const targetVersion = latestRes.revision.concurrencyVersion;
    const clientCommandId = crypto.randomUUID();
    const saveRes = await updateFloorPlanRevisionBoundary(api, floorId, revision.id, {
      concurrencyVersion: targetVersion,
      editingScale,
      vertices,
      leaseToken: leaseToken ?? undefined,
      clientCommandId,
    });
    setRecoveringConflict(false);
    if (saveRes.ok) {
      lastSavedVerticesRef.current = JSON.stringify(saveRes.revision.boundary);
      onRevisionUpdated(saveRes.revision);
      setVertices(saveRes.revision.boundary);
      setHistoryState(markServerConfirmed(historyState, saveRes.revision));
      setConcurrencyConflict(null);
      setAutosaveStatus('saved');
    } else {
      if (saveRes.isConcurrencyConflict) {
        setConcurrencyConflict({ isStale: true, currentServerVersion: saveRes.currentConcurrencyVersion });
        setAutosaveStatus('conflict');
      }
      onError(saveRes.error);
    }
  }

  function updatePreview(
    clientX: number,
    clientY: number,
    tmpl: { template: ElementTemplate; revision: TemplateRevision },
    container: HTMLElement,
  ) {
    const rect = container.getBoundingClientRect();
    const safeClientX = Number.isFinite(clientX) ? clientX : 0;
    const safeClientY = Number.isFinite(clientY) ? clientY : 0;
    const screenX = safeClientX - (rect?.left || 0) - pan.x;
    const screenY = safeClientY - (rect?.top || 0) - pan.y;
    const worldX = snapToEditingScale(Math.round(screenX / zoom), editingScale);
    const worldY = snapToEditingScale(Math.round(screenY / zoom), editingScale);

    const testVertices = transformVertices(tmpl.revision.vertices, { x: worldX, y: worldY }, 0);
    const isInside = isPolygonInsideBoundary(testVertices, vertices);
    const overlaps = checkSpatialCollision(
      { spatialClass: tmpl.revision.spatialClass as SpatialClass, vertices: testVertices },
      placements.map((p) => ({ spatialClass: p.spatialClass as SpatialClass, vertices: p.vertices })),
    );

    let reason = 'Valid position';
    if (!isInside) {
      reason = 'Outside boundary';
    } else if (overlaps) {
      reason = 'Overlaps existing space';
    }

    let minX = testVertices[0]!.x;
    let minY = testVertices[0]!.y;
    let maxX = testVertices[0]!.x;
    let maxY = testVertices[0]!.y;
    for (const v of testVertices) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }

    setPreviewPlacement({
      vertices: testVertices,
      bounds: { minX, minY, maxX, maxY },
      position: { x: worldX, y: worldY },
      isValid: isInside && !overlaps,
      reason,
    });
  }

  function handleManualPlace(e: FormEvent) {
    e.preventDefault();
    if (!selectedTemplateRevId) {
      onError('Select a template to place.');
      return;
    }
    const x = snapToEditingScale(Number(placeX), editingScale);
    const y = snapToEditingScale(Number(placeY), editingScale);
    void handleCommitPlacement(selectedTemplateRevId, x, y, 0, placeLabel.trim() || null);
  }

  const selectedPlacement = placements.find((p) => p.id === selectedPlacementId) ?? null;

  function handleSelectPlacement(id: string) {
    if (selectedPlacementId === id) {
      setSelectedPlacementId(null);
      setTransformPreview(null);
      return;
    }
    const found = placements.find((p) => p.id === id);
    setSelectedPlacementId(id);
    setTransformPreview(null);
    if (found) {
      setEditX(String(found.positionX));
      setEditY(String(found.positionY));
      setEditRotation(found.rotationDegrees);
      setEditLabel(found.label ?? '');
    }
  }

  function handlePreviewTransform(posX: number, posY: number, rot: number) {
    if (!selectedPlacement) return;
    const snappedX = snapToEditingScale(posX, editingScale);
    const snappedY = snapToEditingScale(posY, editingScale);
    const testVertices = transformVertices(selectedPlacement.localVertices, { x: snappedX, y: snappedY }, rot);
    const isInside = isPolygonInsideBoundary(testVertices, vertices);
    const otherPlacements = placements
      .filter((p) => p.id !== selectedPlacement.id)
      .map((p) => ({ spatialClass: p.spatialClass as SpatialClass, vertices: p.vertices }));
    const overlaps = checkSpatialCollision(
      { spatialClass: selectedPlacement.spatialClass as SpatialClass, vertices: testVertices },
      otherPlacements,
    );

    let reason = 'Valid position';
    if (!isInside) {
      reason = 'Outside boundary';
    } else if (overlaps) {
      reason = 'Overlaps existing space';
    }

    let minX = testVertices[0]!.x;
    let minY = testVertices[0]!.y;
    let maxX = testVertices[0]!.x;
    let maxY = testVertices[0]!.y;
    for (const v of testVertices) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }

    setTransformPreview({
      vertices: testVertices,
      bounds: { minX, minY, maxX, maxY },
      isValid: isInside && !overlaps,
      reason,
    });
  }

  const svgPoints = useMemo(() => {
    return vertices.map((v) => `${v.x},${v.y}`).join(' ');
  }, [vertices]);

  const sortedPlacements = useMemo(() => {
    const priority: Record<string, number> = { ZONE: 1, OBSTACLE: 2, PHYSICAL: 3 };
    return [...placements].sort((a, b) => {
      const diff = (priority[a.spatialClass] ?? 2) - (priority[b.spatialClass] ?? 2);
      if (diff !== 0) return diff;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  }, [placements]);

  async function handleValidatePublication() {
    setValidating(true);
    setValidationResult(null);
    setFocusedValidationEntityId(null);
    const res = await validateFloorPlanDraft(api, floorId, revision.id, {
      concurrencyVersion: revision.concurrencyVersion,
    });
    setValidating(false);
    if (res.ok) {
      setValidationResult(res.result);
    } else {
      if (res.isConcurrencyConflict) {
        setConcurrencyConflict({
          isStale: true,
          currentServerVersion: res.currentConcurrencyVersion ?? revision.concurrencyVersion + 1,
        });
      } else {
        onError(res.error);
      }
    }
  }

  async function handleConfirmPublish() {
    setPublishing(true);
    const clientCmdId = `pub-${revision.id}-${Date.now()}`;
    const res = await publishFloorPlanRevision(api, floorId, revision.id, {
      concurrencyVersion: revision.concurrencyVersion,
      leaseToken: currentLeaseTokenRef.current,
      clientCommandId: clientCmdId,
    });
    setPublishing(false);
    setShowPublishConfirm(false);
    if (res.ok) {
      setValidationResult(null);
      setPublicationSuccess(true);
      onRevisionUpdated(res.revision);
    } else {
      if (res.isConcurrencyConflict) {
        setConcurrencyConflict({
          isStale: true,
          currentServerVersion: res.currentConcurrencyVersion ?? revision.concurrencyVersion + 1,
        });
      } else if (res.validationErrors && res.validationErrors.length > 0) {
        setValidationResult({
          isValid: false,
          ready: false,
          floorId,
          revisionId: revision.id,
          concurrencyVersion: res.currentConcurrencyVersion ?? revision.concurrencyVersion,
          summary: res.error,
          errors: res.validationErrors,
          warnings: [],
        });
      } else {
        onError(res.error);
      }
    }
  }

  function handleFocusEntity(err: PublicationValidationError) {
    if (err.entityType === 'PLACEMENT') {
      handleSelectPlacement(err.entityId);
      setFocusedValidationEntityId(err.entityId);
    } else if (err.entityType === 'BOUNDARY') {
      setSelectedPlacementId(null);
      setFocusedValidationEntityId('boundary');
    }
  }

  const groupedErrors = useMemo(() => {
    if (!validationResult || validationResult.errors.length === 0) return {};
    const groups: Record<string, PublicationValidationError[]> = {};
    for (const err of validationResult.errors) {
      if (!groups[err.category]) {
        groups[err.category] = [];
      }
      groups[err.category]!.push(err);
    }
    return groups;
  }, [validationResult]);

  return (
    <div className="boundary-editor" role="region" aria-label="Floor Boundary Editor">
      {/* Read-only conflict banner when leased by another user */}
      {isConflict && conflictOwner && (
        <div className="alert-banner warning-banner" role="alert" data-testid="lease-conflict-banner">
          <div>
            <strong>⚠ Edit Session Locked:</strong> This floor plan is currently being edited by{' '}
            <strong>{conflictOwner.displayName}</strong> ({conflictOwner.email}). Your session is read-only.
          </div>
          {canMutate && (
            <button
              type="button"
              className="takeover-button"
              onClick={() => void handleTakeover()}
              disabled={takingOver}
              data-testid="takeover-lease-btn"
            >
              {takingOver ? 'Taking over...' : 'Take Over Session'}
            </button>
          )}
        </div>
      )}

      {/* Active lease info & countdown */}
      {isLeaseHolder && activeLease && (
        <div className="lease-status-banner" data-testid="lease-status-banner" aria-live="polite">
          <span>
            🔒 <strong>Edit Lease Active:</strong> Held by {activeLease.owner.displayName}
          </span>
          {leaseSecondsRemaining !== null && (
            <span className="lease-timer" data-testid="lease-timer">
              • Expiry in {leaseSecondsRemaining}s
            </span>
          )}
        </div>
      )}

      {/* Concurrency conflict recovery banner */}
      {concurrencyConflict && (
        <div
          role="alert"
          className="conflict-recovery-banner"
          data-testid="concurrency-conflict-banner"
        >
          <h4>⚠ Stale Concurrency Conflict: Server Draft Has Changed</h4>
          <p>
            Your changes were not saved because the floor plan revision has been updated on the server (version mismatch: server version is #{concurrencyConflict.currentServerVersion ?? (revision.concurrencyVersion + 1)}).
            Silent overwrite was prevented.
          </p>
          {historyState.unsavedCommands.length > 0 ? (
            <div style={{ marginBottom: '0.75rem' }} data-testid="unsaved-work-list">
              <strong>Unsaved Work:</strong>
              <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0 }}>
                {historyState.unsavedCommands.map((c, i) => (
                  <li key={i}>{c.description}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p style={{ fontStyle: 'italic', margin: '0 0 0.75rem 0' }} data-testid="unsaved-work-list">
              No additional unsaved operations queued.
            </p>
          )}
          <div className="conflict-actions">
            <button
              type="button"
              className="secondary-button"
              data-testid="reload-server-draft-button"
              onClick={() => void handleReloadServerDraft()}
              disabled={recoveringConflict}
            >
              {recoveringConflict ? 'Reloading...' : 'Reload Server Draft'}
            </button>
            <button
              type="button"
              className="primary-button"
              data-testid="reapply-unsaved-button"
              onClick={() => void handleReapplyUnsavedWork()}
              disabled={recoveringConflict || allDiagnostics.length > 0}
            >
              {recoveringConflict ? 'Saving...' : 'Reapply Unsaved Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Published Revision Banner */}
      {revision.lifecycleState === 'PUBLISHED' && (
        <div
          className="published-revision-banner"
          role="status"
          aria-label="Published Floor Plan"
          data-testid="published-revision-banner"
        >
          <div className="published-banner-header">
            <h4>✓ Official Published Floor Plan</h4>
            <span className="badge-published" data-testid="published-badge">
              Revision {revision.revisionNumber} (Published)
            </span>
          </div>
          <p>
            This floor plan revision is published and immutable. Geometry and placements are read-only.
          </p>
        </div>
      )}

      {/* Publication Success Banner */}
      {publicationSuccess && (
        <div
          className="publication-success-banner"
          role="status"
          aria-live="polite"
          data-testid="publication-success-banner"
        >
          <div className="success-header">
            <h4>✓ Floor Plan Published Successfully</h4>
            <button
              type="button"
              className="secondary-button"
              data-testid="dismiss-publication-success-btn"
              onClick={() => setPublicationSuccess(false)}
            >
              Dismiss
            </button>
          </div>
          <p>
            Revision {revision.revisionNumber} is now the official published floor plan.
          </p>
        </div>
      )}

      {/* Publication Ready Banner */}
      {validationResult && validationResult.ready && (
        <div
          className="publication-ready-banner"
          role="status"
          aria-live="polite"
          data-testid="publication-ready-banner"
        >
          <div className="ready-header">
            <h4>✓ Publication Ready</h4>
            <span className="badge-ready">Ready for Publication</span>
          </div>
          <p>{validationResult.summary}</p>
          <p className="ready-meta">
            Draft passes all publication checks at concurrency version {validationResult.concurrencyVersion}.
          </p>
          <div className="ready-actions">
            <button
              type="button"
              className="primary-button publish-button"
              data-testid="publish-floor-plan-button"
              onClick={() => setShowPublishConfirm(true)}
              disabled={publishing}
            >
              Publish Floor Plan
            </button>
            <button
              type="button"
              className="secondary-button"
              data-testid="dismiss-publication-ready-btn"
              onClick={() => setValidationResult(null)}
              disabled={publishing}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Publication Confirmation Modal */}
      {showPublishConfirm && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-publish-title"
          data-testid="publication-confirm-dialog"
        >
          <div className="modal-content publication-confirm-card">
            <h3 id="confirm-publish-title">Confirm Publication</h3>
            <p>
              Are you sure you want to publish <strong>Revision {revision.revisionNumber}</strong>?
            </p>
            <p className="confirm-warning">
              Once published, this revision becomes <strong>immutable</strong> and will serve as the official published floor plan for this floor. Any previously published revision will be archived.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                data-testid="cancel-publish-btn"
                onClick={() => setShowPublishConfirm(false)}
                disabled={publishing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                data-testid="confirm-publish-submit-btn"
                onClick={() => void handleConfirmPublish()}
                disabled={publishing}
              >
                {publishing ? 'Publishing...' : 'Confirm & Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publication Validation Blockers Panel */}
      {validationResult && !validationResult.ready && (
        <section
          className="publication-validation-panel"
          role="region"
          aria-label="Publication Validation Preview"
          data-testid="publication-validation-panel"
        >
          <div className="validation-panel-header">
            <h4>⚠ Publication Validation Blockers</h4>
            <span className="badge-error" data-testid="blocker-count-badge">
              {validationResult.errors.length} Blocker(s)
            </span>
            <button
              type="button"
              className="secondary-button"
              data-testid="close-validation-panel-btn"
              onClick={() => setValidationResult(null)}
            >
              Close
            </button>
          </div>
          <p className="validation-summary" data-testid="validation-summary">
            {validationResult.summary}
          </p>

          {Object.entries(groupedErrors).map(([category, catErrors]) => (
            <fieldset
              key={category}
              className="validation-category-group"
              data-testid={`category-group-${category.toLowerCase()}`}
            >
              <legend className="category-legend">
                <strong>{VALIDATION_CATEGORY_LABELS[category] || category}</strong> ({catErrors.length})
              </legend>
              <ul className="validation-error-list" role="list">
                {catErrors.map((err, idx) => (
                  <li
                    key={`${err.code}-${err.entityId}-${idx}`}
                    className={`validation-error-item ${focusedValidationEntityId === err.entityId ? 'focused-error-item' : ''}`}
                    data-testid="validation-error-item"
                  >
                    <div className="error-header">
                      <span className="error-code-badge" data-testid="error-code-badge">
                        {err.code}
                      </span>
                      <span className="error-entity-badge">{err.entityType}</span>
                    </div>
                    <p className="error-message">
                      <strong>Issue:</strong> {err.message}
                    </p>
                    <p className="error-corrective">
                      <strong>Action:</strong> {err.correctiveAction}
                    </p>
                    <div className="error-actions">
                      {err.entityType === 'PLACEMENT' && (
                        <button
                          type="button"
                          className="link-button focus-entity-button"
                          data-testid={`focus-placement-${err.entityId}`}
                          onClick={() => handleFocusEntity(err)}
                        >
                          Focus Placed Space
                        </button>
                      )}
                      {err.entityType === 'BOUNDARY' && (
                        <button
                          type="button"
                          className="link-button focus-entity-button"
                          data-testid="focus-boundary-button"
                          onClick={() => handleFocusEntity(err)}
                        >
                          Focus Floor Boundary
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
        </section>
      )}

      <div className="editor-toolbar">
        {/* Autosave badge */}
        {canMutate && revision.lifecycleState === 'DRAFT' && (
          <div className="toolbar-group autosave-group" aria-live="polite">
            <span className={`autosave-badge autosave-${autosaveStatus}`} data-testid="autosave-status">
              {autosaveStatus === 'saving' && 'Saving...'}
              {autosaveStatus === 'saved' && '✓ Saved'}
              {autosaveStatus === 'validation_error' && 'Validation Error'}
              {autosaveStatus === 'conflict' && '⚠ Conflict'}
              {autosaveStatus === 'unavailable' && '⚠ Offline / Unavailable'}
              {autosaveStatus === 'idle' && '✓ Ready'}
            </span>
          </div>
        )}

        {/* History (Undo / Redo) group */}
        {canMutate && revision.lifecycleState === 'DRAFT' && (
          <div className="toolbar-group history-group">
            <button
              type="button"
              className="secondary-button"
              data-testid="undo-button"
              onClick={handleUndo}
              disabled={historyState.undoStack.length === 0}
              title={
                historyState.undoStack.length > 0 && historyState.undoStack[historyState.undoStack.length - 1]
                  ? `Undo: ${historyState.undoStack[historyState.undoStack.length - 1]?.description} (Ctrl+Z)`
                  : 'Nothing to undo'
              }
              aria-label="Undo"
            >
              ↶ Undo
            </button>
            <button
              type="button"
              className="secondary-button"
              data-testid="redo-button"
              onClick={handleRedo}
              disabled={historyState.redoStack.length === 0}
              title={
                historyState.redoStack.length > 0 && historyState.redoStack[historyState.redoStack.length - 1]
                  ? `Redo: ${historyState.redoStack[historyState.redoStack.length - 1]?.description} (Ctrl+Y)`
                  : 'Nothing to redo'
              }
              aria-label="Redo"
            >
              ↷ Redo
            </button>
          </div>
        )}

        {canMutate && revision.lifecycleState === 'DRAFT' && (
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
        )}

        <div className="toolbar-group">
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

        {canMutate && revision.lifecycleState === 'DRAFT' && (
          <div className="toolbar-group publication-group">
            <button
              type="button"
              className="primary-button validate-draft-button"
              data-testid="validate-publication-button"
              onClick={() => void handleValidatePublication()}
              disabled={validating}
              aria-label="Validate Draft for Publication"
            >
              {validating ? 'Validating...' : 'Validate for Publication'}
            </button>
          </div>
        )}
      </div>

      {isStaleTargetSpace && (
        <div role="status" className="stale-location-state" data-testid="stale-location-state">
          <p>Assigned space is no longer present on the current published map.</p>
        </div>
      )}

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
        onMouseLeave={() => {
          setCursorCoords(null);
          if (dragTemplate) {
            setPreviewPlacement(null);
          }
        }}
        onDragOver={(e) => {
          if (!canMutate || revision.lifecycleState !== 'DRAFT') return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (dragTemplate) {
            updatePreview(e.clientX, e.clientY, dragTemplate, e.currentTarget);
          }
        }}
        onDragLeave={() => {
          setPreviewPlacement(null);
        }}
        onDrop={(e) => {
          if (!canMutate || revision.lifecycleState !== 'DRAFT') return;
          e.preventDefault();
          if (dragTemplate && previewPlacement) {
            if (!previewPlacement.isValid) {
              onError(`Cannot place space: ${previewPlacement.reason}.`);
              setPreviewPlacement(null);
              setDragTemplate(null);
              return;
            }
            void handleCommitPlacement(
              dragTemplate.revision.id,
              previewPlacement.position.x,
              previewPlacement.position.y,
              0,
            );
          }
        }}
        role="application"
        aria-label="Floor boundary canvas"
      >
        <svg
          className="boundary-svg"
          width="100%"
          height="400"
          style={{ background: '#f8fafc', overflow: 'hidden' }}
        >
          <defs>
            <pattern
              id="invalid-hatch"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="8" stroke="#ef4444" strokeWidth="2" />
            </pattern>
          </defs>

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* 1. Polygon boundary in world units */}
            <polygon
              className="floor-boundary"
              points={svgPoints}
              fill="rgba(59, 130, 246, 0.15)"
              stroke="#2563eb"
              strokeWidth={Math.max(1, 2 / zoom)}
            />

            {/* 2-4. Placed spaces in world units (Shared renderer) */}
            {/* Layer order: ZONE (bottom) -> OBSTACLE -> PHYSICAL (top) */}
            <g className="placed-spaces-group" aria-label="Placed spaces">
              {sortedPlacements.map((p) => {
                const pointsStr = p.vertices.map((v) => `${v.x},${v.y}`).join(' ');
                const isSelected = selectedPlacementId === p.id;
                const isZone = p.spatialClass === 'ZONE';
                return (
                  <g
                    key={p.id}
                    className={`placed-space ${isSelected ? 'selected' : ''} spatial-${p.spatialClass.toLowerCase()}`}
                    data-testid={`placed-space-${p.id}`}
                    data-spatial-class={p.spatialClass}
                    aria-label={`${p.templateName} (${p.spatialClass}) at (${p.positionX}, ${p.positionY})`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectPlacement(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectPlacement(p.id);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <polygon
                      points={pointsStr}
                      fill={p.fillColor || (isZone ? '#d1fae5' : '#93c5fd')}
                      fillOpacity={isZone ? 0.5 : 1}
                      stroke={isSelected ? '#2563eb' : (p.borderColor || (isZone ? '#059669' : '#1e3a8a'))}
                      strokeWidth={isSelected ? Math.max(2.5, 4 / zoom) : Math.max(1.5, 2 / zoom)}
                      strokeDasharray={isSelected ? '4 2' : (isZone ? '6 3' : undefined)}
                    />
                  </g>
                );
              })}
            </g>

            {/* 5. Selection affordance */}
            {selectedPlacement && (
              <polygon
                className="selection-affordance"
                data-testid="selection-affordance"
                points={selectedPlacement.vertices.map((v) => `${v.x},${v.y}`).join(' ')}
                fill="none"
                stroke="#2563eb"
                strokeWidth={Math.max(2.5, 4 / zoom)}
                strokeDasharray="4 2"
                pointerEvents="none"
              />
            )}

            {/* 6. Text labels rendered above polygons so never obscured */}
            <g className="labels-layer" data-testid="labels-layer" aria-label="Space labels" pointerEvents="none">
              {sortedPlacements.map((p) => {
                const isZone = p.spatialClass === 'ZONE';
                return (
                  <text
                    key={`label-${p.id}`}
                    x={p.positionX + Math.max(2, 4 / zoom)}
                    y={p.positionY + Math.max(10, 14 / zoom)}
                    fontSize={Math.max(9, 11 / zoom)}
                    fill={isZone ? '#065f46' : '#0f172a'}
                    fontWeight="600"
                  >
                    {p.label ? `${p.label} (${p.templateCode})` : p.templateName}
                  </text>
                );
              })}
            </g>

            {/* Responsive transform preview */}
            {transformPreview && (
              <g
                className={`transform-preview ${transformPreview.isValid ? 'valid' : 'invalid'}`}
                data-testid="transform-preview"
                aria-label={transformPreview.reason}
              >
                <polygon
                  points={transformPreview.vertices.map((v) => `${v.x},${v.y}`).join(' ')}
                  fill={transformPreview.isValid ? 'rgba(59, 130, 246, 0.25)' : 'url(#invalid-hatch)'}
                  stroke={transformPreview.isValid ? '#2563eb' : '#dc2626'}
                  strokeWidth={Math.max(2, 3 / zoom)}
                  strokeDasharray="4 2"
                />
                <text
                  x={transformPreview.bounds.minX + Math.max(2, 4 / zoom)}
                  y={transformPreview.bounds.minY + Math.max(12, 16 / zoom)}
                  fontSize={Math.max(10, 12 / zoom)}
                  fill={transformPreview.isValid ? '#1d4ed8' : '#b91c1c'}
                  fontWeight="700"
                >
                  {transformPreview.isValid ? '✓ Preview' : '⚠ Invalid'}
                </text>
              </g>
            )}

            {/* Snapped drag preview */}
            {previewPlacement && (
              <g
                className={`placement-preview ${previewPlacement.isValid ? 'valid' : 'invalid'}`}
                data-testid="placement-preview"
                aria-label={previewPlacement.reason}
              >
                <polygon
                  points={previewPlacement.vertices.map((v) => `${v.x},${v.y}`).join(' ')}
                  fill={previewPlacement.isValid ? 'rgba(34, 197, 94, 0.25)' : 'url(#invalid-hatch)'}
                  stroke={previewPlacement.isValid ? '#16a34a' : '#dc2626'}
                  strokeWidth={Math.max(2, 3 / zoom)}
                  strokeDasharray="4 2"
                />
                <text
                  x={previewPlacement.bounds.minX + Math.max(2, 4 / zoom)}
                  y={previewPlacement.bounds.minY + Math.max(12, 16 / zoom)}
                  fontSize={Math.max(10, 12 / zoom)}
                  fill={previewPlacement.isValid ? '#15803d' : '#b91c1c'}
                  fontWeight="700"
                >
                  {previewPlacement.isValid ? '✓ Valid' : '⚠ Invalid'}
                </text>
              </g>
            )}

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

      {previewPlacement && (
        <div
          className={`preview-feedback ${previewPlacement.isValid ? 'valid-badge' : 'invalid-badge'}`}
          role="status"
          aria-live="polite"
          data-testid="preview-status"
        >
          <strong>{previewPlacement.isValid ? '✓ Valid Position:' : '⚠ Invalid Position:'}</strong>{' '}
          {previewPlacement.reason} at ({previewPlacement.position.x}, {previewPlacement.position.y})
        </div>
      )}

      {/* Catalog palette for dragging/placing spaces */}
      {canMutate && revision.lifecycleState === 'DRAFT' && (
        <section className="catalog-palette-section" aria-label="Template Catalog Palette">
          <h3>Space & Zone Catalog</h3>
          <p>
            Drag an immutable Template Revision onto the floor boundary to place it, or use the quick place form.
          </p>

          {placeableTemplates.length === 0 ? (
            <p className="empty-catalog-message">
              No active templates available for placement yet. Activate a Template Revision in the Templates Catalog first.
            </p>
          ) : (
            <div className="template-palette-grid">
              {placeableTemplates.map(({ template, revision: tRev, categoryCode }) => {
                const tBounds = polygonBounds(tRev.vertices);
                return (
                  <div
                    key={tRev.id}
                    className="template-palette-card"
                    draggable={canMutate && revision.lifecycleState === 'DRAFT'}
                    onDragStart={(e) => {
                      setDragTemplate({ template, revision: tRev });
                      e.dataTransfer.setData('text/plain', tRev.id);
                    }}
                    onDragEnd={() => {
                      setDragTemplate(null);
                      setPreviewPlacement(null);
                    }}
                    data-testid={`template-card-${template.code}`}
                    aria-label={`Place ${template.name}`}
                  >
                    <div className="template-palette-header">
                      <strong>{template.name}</strong>
                      <span className="code-badge">{categoryCode} / {template.code}</span>
                      <span className={`spatial-badge spatial-badge-${tRev.spatialClass.toLowerCase()}`}>
                        {tRev.spatialClass}
                      </span>
                    </div>
                    <div className="template-meta-info">
                      <span
                        className="template-color-swatch"
                        style={{ background: tRev.fillColor, border: `1px solid ${tRev.borderColor}` }}
                      />
                      <span>
                        Revision {tRev.revisionNumber} • {tBounds.width} × {tBounds.height} world units ({tBounds.width * 10} × {tBounds.height * 10} cm)
                      </span>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setSelectedTemplateRevId(tRev.id);
                        void handleCommitPlacement(tRev.id, 10, 10, 0);
                      }}
                      aria-label={`Place ${template.name} at (10, 10)`}
                    >
                      Place at (10, 10)
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Accessible manual placement form */}
          {placeableTemplates.length > 0 && (
            <form onSubmit={handleManualPlace} className="quick-place-form" aria-label="Manual space placement">
              <label htmlFor="select-template">Template:</label>
              <select
                id="select-template"
                value={selectedTemplateRevId}
                onChange={(e) => setSelectedTemplateRevId(e.target.value)}
              >
                {placeableTemplates.map(({ template, revision: tRev }) => (
                  <option key={tRev.id} value={tRev.id}>
                    {template.name} ({template.code})
                  </option>
                ))}
              </select>

              <label htmlFor="place-x">X:</label>
              <input
                id="place-x"
                type="number"
                value={placeX}
                onChange={(e) => setPlaceX(e.target.value)}
                aria-label="X position"
              />

              <label htmlFor="place-y">Y:</label>
              <input
                id="place-y"
                type="number"
                value={placeY}
                onChange={(e) => setPlaceY(e.target.value)}
                aria-label="Y position"
              />

              <label htmlFor="place-label">Label:</label>
              <input
                id="place-label"
                type="text"
                placeholder="e.g. D-101"
                value={placeLabel}
                onChange={(e) => setPlaceLabel(e.target.value)}
                aria-label="Space label"
              />

              <button type="submit">Place space</button>
            </form>
          )}
        </section>
      )}

      {/* Selected Space Details & Transform Panel */}
      {selectedPlacement && (
        <section
          className="placement-details-panel"
          role="region"
          aria-label={`Details for ${selectedPlacement.label ?? selectedPlacement.templateName}`}
          data-testid="placement-details-panel"
        >
          <div className="panel-header">
            <h4>
              Space Details:{' '}
              {selectedPlacement.label
                ? `${selectedPlacement.label} (${selectedPlacement.templateCode})`
                : selectedPlacement.templateName}
            </h4>
            <button
              type="button"
              className="close-button"
              onClick={() => {
                setSelectedPlacementId(null);
                setTransformPreview(null);
              }}
              aria-label="Close details panel"
            >
              ✕ Close
            </button>
          </div>

          <div className="details-grid">
            <div className="detail-row">
              <span className="detail-label">Template Revision</span>
              <span className="detail-value">
                {selectedPlacement.templateName} ({selectedPlacement.templateCode}) • Revision {selectedPlacement.templateRevisionNumber}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Spatial Class</span>
              <span className="detail-value" data-testid="spatial-class-value">
                <span className={`spatial-class-badge badge-${selectedPlacement.spatialClass.toLowerCase()}`}>
                  {selectedPlacement.spatialClass}
                </span>{' '}
                {selectedPlacement.spatialClass === 'ZONE' &&
                  '• Semantic zone region (can overlap other zones and contain physical spaces/obstacles without collision)'}
                {selectedPlacement.spatialClass === 'OBSTACLE' &&
                  '• Structural obstacle (cannot overlap physical elements or other obstacles)'}
                {selectedPlacement.spatialClass === 'PHYSICAL' &&
                  '• Physical space (cannot overlap other physical elements or obstacles)'}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Coordinates</span>
              <span className="detail-value">
                ({selectedPlacement.positionX}, {selectedPlacement.positionY}) world units ({selectedPlacement.positionX * 10} × {selectedPlacement.positionY * 10} cm)
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Rotation</span>
              <span className="detail-value">{selectedPlacement.rotationDegrees}° (Quarter turn)</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Assignability</span>
              <span className="detail-value">
                {selectedPlacement.assignable ? 'Assignable (Workplace assignments permitted)' : 'Not Assignable'}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Validation State</span>
              <span className="detail-value validation-badge valid">✓ Valid (Within boundary, no collisions)</span>
            </div>
            {revision.lifecycleState === 'PUBLISHED' && selectedPlacement.assignable && (
              <>
                {(() => {
                  const breakdown = getSpaceAssignmentBreakdown(
                    safeAssignments,
                    selectedPlacement.placementIdentityId,
                  );
                  return (
                    <>
                      <div className="detail-row" data-testid="placement-assignment-status">
                        <span className="detail-label">Current Assignment</span>
                        <span className="detail-value">
                          {breakdown.current ? (
                            <>
                              <span className="status-badge current" data-testid="assignment-status-current" style={{ marginRight: '6px' }}>
                                Current
                              </span>
                              <strong>{breakdown.current.employeeName}</strong> ({breakdown.current.employeeCode})
                              <span className="period-badge" style={{ marginLeft: '8px' }}>
                                {new Date(breakdown.current.startedAt).toLocaleDateString()}
                                {breakdown.current.endedAt
                                  ? ` – ${new Date(breakdown.current.endedAt).toLocaleDateString()}`
                                  : ' – Ongoing'}
                              </span>
                            </>
                          ) : (
                            <span className="status-badge unassigned" data-testid="assignment-status-unassigned">
                              Vacant
                            </span>
                          )}
                        </span>
                      </div>
                      {breakdown.future.length > 0 && (
                        <div className="detail-row" data-testid="placement-future-assignments">
                          <span className="detail-label">Future Assignment</span>
                          <span className="detail-value">
                            <span className="status-badge future" data-testid="assignment-status-future" style={{ marginRight: '6px' }}>
                              Future
                            </span>
                            <strong>{breakdown.future[0]!.employeeName}</strong> ({breakdown.future[0]!.employeeCode})
                            <span className="period-badge" style={{ marginLeft: '8px' }}>
                              {new Date(breakdown.future[0]!.startedAt).toLocaleDateString()}
                              {breakdown.future[0]!.endedAt
                                ? ` – ${new Date(breakdown.future[0]!.endedAt).toLocaleDateString()}`
                                : ' – Ongoing'}
                            </span>
                          </span>
                        </div>
                      )}
                      {breakdown.ended.length > 0 && (
                        <div className="detail-row" data-testid="placement-ended-assignments">
                          <span className="detail-label">Past Assignments</span>
                          <span className="detail-value">
                            <span className="status-badge ended" data-testid="assignment-status-ended">
                              {breakdown.ended.length} Ended
                            </span>
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </div>

          {isPlanner && revision.lifecycleState === 'PUBLISHED' && selectedPlacement.assignable && (
            <div className="assign-space-action-section" style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              {(() => {
                const breakdown = getSpaceAssignmentBreakdown(
                  safeAssignments,
                  selectedPlacement.placementIdentityId,
                );
                const targetToEnd = breakdown.current || breakdown.future[0];
                return (
                  <>
                    {onOpenAssignSpace && (
                      <button
                        type="button"
                        className="primary-button assign-space-btn"
                        onClick={() => onOpenAssignSpace(selectedPlacement.id)}
                        data-testid="assign-space-btn"
                      >
                        Assign Employee to Space
                      </button>
                    )}
                    {onOpenEndAssignment && targetToEnd && (
                      <button
                        type="button"
                        className="secondary-button end-assignment-btn"
                        onClick={() => onOpenEndAssignment(targetToEnd)}
                        data-testid="end-assignment-btn"
                      >
                        End Assignment
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {canMutate && revision.lifecycleState === 'DRAFT' && (
            <div className="transform-actions-section">
              <h5>Transform Placed Space</h5>
              <p className="section-hint">Translate or quarter-turn this space. Resizing is forbidden.</p>

              <form onSubmit={handleApplyTransform} className="transform-form" aria-label="Transform space position">
                <div className="form-row">
                  <div className="form-group inline">
                    <label htmlFor="transform-x">X Coordinate</label>
                    <input
                      id="transform-x"
                      type="number"
                      step={editingScale}
                      value={editX}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditX(val);
                        handlePreviewTransform(Number(val), Number(editY), editRotation);
                      }}
                      aria-label="X Coordinate"
                    />
                  </div>
                  <div className="form-group inline">
                    <label htmlFor="transform-y">Y Coordinate</label>
                    <input
                      id="transform-y"
                      type="number"
                      step={editingScale}
                      value={editY}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditY(val);
                        handlePreviewTransform(Number(editX), Number(val), editRotation);
                      }}
                      aria-label="Y Coordinate"
                    />
                  </div>
                  <div className="form-group inline">
                    <label htmlFor="transform-label">Label</label>
                    <input
                      id="transform-label"
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      aria-label="Space label"
                    />
                  </div>
                </div>

                <div className="rotation-controls" role="group" aria-label="Quarter-turn rotation controls">
                  <span className="control-label">Quarter-Turn Rotation:</span>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      const newRot = (editRotation + 270) % 360;
                      setEditRotation(newRot);
                      handlePreviewTransform(Number(editX), Number(editY), newRot);
                    }}
                    aria-label="Rotate 90 degrees counter-clockwise"
                  >
                    ↺ 90° CCW
                  </button>
                  <span className="current-rotation-badge" aria-live="polite">{editRotation}°</span>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      const newRot = (editRotation + 90) % 360;
                      setEditRotation(newRot);
                      handlePreviewTransform(Number(editX), Number(editY), newRot);
                    }}
                    aria-label="Rotate 90 degrees clockwise"
                  >
                    ↻ 90° CW
                  </button>
                </div>

                {transformPreview && !transformPreview.isValid && (
                  <div className="preview-feedback invalid-badge" role="alert" aria-live="assertive">
                    <strong>⚠ Invalid Transform:</strong> {transformPreview.reason}
                  </div>
                )}

                <div className="transform-button-bar">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={transforming || (transformPreview !== null && !transformPreview.isValid)}
                  >
                    {transforming ? 'Saving changes...' : 'Save Transform'}
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void handleRemovePlacement(selectedPlacement.id)}
                    disabled={transforming}
                    aria-label={`Remove ${selectedPlacement.label ?? selectedPlacement.templateName} from Draft`}
                  >
                    Remove from Draft
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      )}

      {/* Accessible Placed Spaces summary */}
      {placements.length > 0 && (
        <section className="placed-spaces-list" aria-label="Placed Spaces">
          <h4>Placed Spaces ({placements.length})</h4>
          <ul className="placed-spaces-grid">
            {placements.map((p) => {
              const isSelected = selectedPlacementId === p.id;
              const assigned = safeAssignments.find((a) => a.placementIdentityId === p.placementIdentityId);
              return (
                <li
                  key={p.id}
                  className={`placed-space-item ${isSelected ? 'active' : ''}`}
                  data-testid={`placed-space-item-${p.id}`}
                >
                  <button
                    type="button"
                    className="link-button select-space-btn"
                    onClick={() => handleSelectPlacement(p.id)}
                    aria-pressed={isSelected}
                    aria-label={`Select ${p.label ?? p.templateName}`}
                  >
                    <strong>{p.label ?? p.templateName}</strong> ({p.templateCode}){assigned ? ` • Assigned: ${assigned.employeeName}` : ''} at ({p.positionX}, {p.positionY}) • Rotation {p.rotationDegrees}°
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
          <form onSubmit={handleAddVertex} className="add-vertex-form" aria-label="Add vertex">
            <div className="form-group inline">
              <label htmlFor="draft-x">X coordinate</label>
              <input
                id="draft-x"
                type="number"
                value={draftX}
                onChange={(e) => setDraftX(e.target.value)}
                step={editingScale}
                aria-label="New vertex X coordinate"
              />
            </div>
            <div className="form-group inline">
              <label htmlFor="draft-y">Y coordinate</label>
              <input
                id="draft-y"
                type="number"
                value={draftY}
                onChange={(e) => setDraftY(e.target.value)}
                step={editingScale}
                aria-label="New vertex Y coordinate"
              />
            </div>
            <button type="submit" className="secondary-button">
              Add Vertex
            </button>
          </form>

          <div className="vertex-editor-list" aria-label="Current vertices">
            <h4>Vertices ({vertices.length})</h4>
            <ol>
              {vertices.map((v, i) => (
                <li key={i}>
                  <span>({v.x}, {v.y})</span>
                  {vertices.length > 4 && (
                    <button
                      type="button"
                      className="link-button danger"
                      onClick={() => handleRemoveVertex(i)}
                      aria-label={`Remove vertex ${i} at (${v.x}, ${v.y})`}
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
            >
              {saving ? 'Saving boundary...' : 'Save Draft Boundary'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
