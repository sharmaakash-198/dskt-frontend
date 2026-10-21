import { describe, expect, it } from 'vitest';
import type { Vertex } from '../templates/geometry.js';
import {
  applyCommandToDomain,
  createInitialHistoryState,
  invertCommand,
  markServerConfirmed,
  pushCommand,
  redo,
  resetToServerDraft,
  undo,
  type BoundaryCommand,
  type DeletePlacementCommand,
  type PlaceElementCommand,
  type TransformPlacementCommand,
} from './editor-history.js';
import type { FloorPlanRevision, PlacedElement } from './floor-plan-api.js';

const mockRevision: FloorPlanRevision = {
  id: 'rev-1',
  floorPlanId: 'fp-1',
  revisionNumber: 1,
  lifecycleState: 'DRAFT',
  editingScale: 1,
  concurrencyVersion: 0,
  boundary: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
  placements: [],
  createdAt: '2026-10-21T00:00:00Z',
  updatedAt: '2026-10-21T00:00:00Z',
};

const mockPlacement: PlacedElement = {
  id: 'pl-1',
  floorPlanRevisionId: 'rev-1',
  placementIdentityId: 'pi-1',
  elementTemplateRevisionId: 'tr-1',
  templateId: 'tmpl-1',
  templateCode: 'DSK',
  templateName: 'Desk Standard',
  templateRevisionNumber: 1,
  assignable: true,
  spatialClass: 'PHYSICAL',
  borderColor: '#000000',
  fillColor: '#ffffff',
  positionX: 10,
  positionY: 20,
  rotationDegrees: 0,
  label: 'Desk 1',
  vertices: [
    { x: 10, y: 20 },
    { x: 24, y: 20 },
    { x: 24, y: 28 },
    { x: 10, y: 28 },
  ],
  localVertices: [
    { x: 0, y: 0 },
    { x: 14, y: 0 },
    { x: 14, y: 8 },
    { x: 0, y: 8 },
  ],
  createdAt: '2026-10-21T00:00:00Z',
  updatedAt: '2026-10-21T00:00:00Z',
};

describe('editor-history: semantic commands and inversion', () => {
  it('inverts SET_BOUNDARY command cleanly and satisfies double inversion identity', () => {
    const cmd: BoundaryCommand = {
      type: 'SET_BOUNDARY',
      description: 'Add vertex (50, 0)',
      previousVertices: mockRevision.boundary,
      nextVertices: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    };

    const inverted = invertCommand(cmd) as BoundaryCommand;
    expect(inverted.type).toBe('SET_BOUNDARY');
    expect(inverted.previousVertices).toEqual(cmd.nextVertices);
    expect(inverted.nextVertices).toEqual(cmd.previousVertices);

    const doubleInverted = invertCommand(inverted) as BoundaryCommand;
    expect(doubleInverted.previousVertices).toEqual(cmd.previousVertices);
    expect(doubleInverted.nextVertices).toEqual(cmd.nextVertices);
  });

  it('inverts PLACE_ELEMENT to DELETE_PLACEMENT and back', () => {
    const placeCmd: PlaceElementCommand = {
      type: 'PLACE_ELEMENT',
      description: 'Place Desk Standard',
      placement: mockPlacement,
    };

    const inverted = invertCommand(placeCmd) as DeletePlacementCommand;
    expect(inverted.type).toBe('DELETE_PLACEMENT');
    expect(inverted.placement).toEqual(mockPlacement);

    const doubleInverted = invertCommand(inverted) as PlaceElementCommand;
    expect(doubleInverted.type).toBe('PLACE_ELEMENT');
    expect(doubleInverted.placement).toEqual(mockPlacement);
  });

  it('inverts TRANSFORM_PLACEMENT by swapping previous and next coordinates/rotation', () => {
    const transformCmd: TransformPlacementCommand = {
      type: 'TRANSFORM_PLACEMENT',
      description: 'Move and rotate Desk 1',
      placementId: 'pl-1',
      previous: { positionX: 10, positionY: 20, rotationDegrees: 0, label: 'Desk 1' },
      next: { positionX: 30, positionY: 40, rotationDegrees: 90, label: 'Desk 1-Renamed' },
    };

    const inverted = invertCommand(transformCmd) as TransformPlacementCommand;
    expect(inverted.type).toBe('TRANSFORM_PLACEMENT');
    expect(inverted.placementId).toBe('pl-1');
    expect(inverted.previous).toEqual(transformCmd.next);
    expect(inverted.next).toEqual(transformCmd.previous);

    const doubleInverted = invertCommand(inverted) as TransformPlacementCommand;
    expect(doubleInverted.previous).toEqual(transformCmd.previous);
    expect(doubleInverted.next).toEqual(transformCmd.next);
  });

  it('inverts DELETE_PLACEMENT to PLACE_ELEMENT', () => {
    const deleteCmd: DeletePlacementCommand = {
      type: 'DELETE_PLACEMENT',
      description: 'Delete Desk 1',
      placement: mockPlacement,
    };

    const inverted = invertCommand(deleteCmd) as PlaceElementCommand;
    expect(inverted.type).toBe('PLACE_ELEMENT');
    expect(inverted.placement).toEqual(mockPlacement);
  });
});

describe('editor-history: redo branching and viewport exclusion', () => {
  it('discards redo stack when a new edit is performed after undo', () => {
    let state = createInitialHistoryState(mockRevision);

    const cmd1: BoundaryCommand = {
      type: 'SET_BOUNDARY',
      description: 'Step 1',
      previousVertices: mockRevision.boundary,
      nextVertices: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }],
    };
    const cmd2: PlaceElementCommand = {
      type: 'PLACE_ELEMENT',
      description: 'Step 2: Place Desk',
      placement: mockPlacement,
    };

    state = pushCommand(state, cmd1);
    state = pushCommand(state, cmd2);
    expect(state.undoStack).toHaveLength(2);
    expect(state.redoStack).toHaveLength(0);

    // Undo Step 2
    const undoRes = undo(state);
    state = undoRes.nextState;
    expect(state.undoStack).toHaveLength(1);
    expect(state.redoStack).toHaveLength(1);
    expect(state.redoStack[0]).toBe(cmd2);

    // Now execute a brand new command (Step 3)
    const cmd3: BoundaryCommand = {
      type: 'SET_BOUNDARY',
      description: 'Step 3: New boundary edit',
      previousVertices: cmd1.nextVertices,
      nextVertices: [{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 150 }, { x: 0, y: 150 }],
    };
    state = pushCommand(state, cmd3);

    // Redo stack must be empty - invalid redo branch discarded
    expect(state.undoStack).toHaveLength(2);
    expect(state.redoStack).toHaveLength(0);
    expect(state.undoStack[1]).toBe(cmd3);
  });

  it('ensures pan, zoom, and selection do not enter domain undo history', () => {
    const state = createInitialHistoryState(mockRevision);

    // Visual-only changes (pan, zoom, selection)
    const visualState = {
      pan: { x: 100, y: 200 },
      zoom: 2.5,
      selectedPlacementId: 'pl-1',
    };

    // None of these affect domain history state
    expect(state.undoStack).toHaveLength(0);
    expect(state.redoStack).toHaveLength(0);
    expect(state.unsavedCommands).toHaveLength(0);

    // Domain state remains pristine
    const domain = applyCommandToDomain(
      {
        type: 'SET_BOUNDARY',
        description: 'Edit',
        previousVertices: mockRevision.boundary,
        nextVertices: mockRevision.boundary,
      },
      { vertices: mockRevision.boundary, placements: [] },
    );
    expect(domain.vertices).toEqual(mockRevision.boundary);
    expect(domain.placements).toEqual([]);
    // Viewport remains independent
    expect(visualState.zoom).toBe(2.5);
  });
});

describe('editor-history: multi-step undo and redo state application', () => {
  it('correctly updates domain vertices and placements through sequential undo and redo', () => {
    let domain: { vertices: Vertex[]; placements: PlacedElement[] } = {
      vertices: mockRevision.boundary,
      placements: [],
    };
    let state = createInitialHistoryState(mockRevision);

    // Step 1: change boundary
    const boundaryV2: Vertex[] = [
      { x: 0, y: 0 },
      { x: 150, y: 0 },
      { x: 150, y: 150 },
      { x: 0, y: 150 },
    ];
    const cmd1: BoundaryCommand = {
      type: 'SET_BOUNDARY',
      description: 'Expand boundary to 150x150',
      previousVertices: domain.vertices,
      nextVertices: boundaryV2,
    };
    domain = applyCommandToDomain(cmd1, domain);
    state = pushCommand(state, cmd1);

    // Step 2: place element
    const cmd2: PlaceElementCommand = {
      type: 'PLACE_ELEMENT',
      description: 'Place Desk 1',
      placement: mockPlacement,
    };
    domain = applyCommandToDomain(cmd2, domain);
    state = pushCommand(state, cmd2);

    // Step 3: rotate element
    const cmd3: TransformPlacementCommand = {
      type: 'TRANSFORM_PLACEMENT',
      description: 'Rotate Desk 1 by 90 degrees',
      placementId: mockPlacement.id,
      previous: { positionX: 10, positionY: 20, rotationDegrees: 0, label: 'Desk 1' },
      next: { positionX: 10, positionY: 20, rotationDegrees: 90, label: 'Desk 1' },
    };
    domain = applyCommandToDomain(cmd3, domain);
    state = pushCommand(state, cmd3);

    expect(domain.vertices).toEqual(boundaryV2);
    expect(domain.placements).toHaveLength(1);
    expect(domain.placements[0]?.rotationDegrees).toBe(90);

    // Undo Step 3 (rotate)
    const undo3 = undo(state);
    state = undo3.nextState;
    domain = applyCommandToDomain(undo3.invertedCommand!, domain);
    expect(domain.placements[0]?.rotationDegrees).toBe(0);

    // Undo Step 2 (place)
    const undo2 = undo(state);
    state = undo2.nextState;
    domain = applyCommandToDomain(undo2.invertedCommand!, domain);
    expect(domain.placements).toHaveLength(0);

    // Undo Step 1 (boundary)
    const undo1 = undo(state);
    state = undo1.nextState;
    domain = applyCommandToDomain(undo1.invertedCommand!, domain);
    expect(domain.vertices).toEqual(mockRevision.boundary);

    // Redo Step 1
    const redo1 = redo(state);
    state = redo1.nextState;
    domain = applyCommandToDomain(redo1.command!, domain);
    expect(domain.vertices).toEqual(boundaryV2);

    // Redo Step 2
    const redo2 = redo(state);
    state = redo2.nextState;
    domain = applyCommandToDomain(redo2.command!, domain);
    expect(domain.placements).toHaveLength(1);
    expect(domain.placements[0]?.rotationDegrees).toBe(0);

    // Redo Step 3
    const redo3 = redo(state);
    state = redo3.nextState;
    domain = applyCommandToDomain(redo3.command!, domain);
    expect(domain.placements[0]?.rotationDegrees).toBe(90);
    expect(state.undoStack).toHaveLength(3);
    expect(state.redoStack).toHaveLength(0);
  });
});

describe('editor-history: conflict recovery and server baseline confirmation', () => {
  it('tracks unsaved commands and clears them when server confirms save', () => {
    let state = createInitialHistoryState(mockRevision);
    const cmd: PlaceElementCommand = {
      type: 'PLACE_ELEMENT',
      description: 'Place Desk',
      placement: mockPlacement,
    };
    state = pushCommand(state, cmd);
    expect(state.unsavedCommands).toHaveLength(1);

    const savedRevision: FloorPlanRevision = {
      ...mockRevision,
      concurrencyVersion: 1,
      placements: [mockPlacement],
    };

    state = markServerConfirmed(state, savedRevision);
    expect(state.unsavedCommands).toHaveLength(0);
    expect(state.serverConfirmedRevision).toEqual(savedRevision);
  });

  it('restores server draft and resets local history boundary on conflict recovery', () => {
    let state = createInitialHistoryState(mockRevision);
    const cmd: BoundaryCommand = {
      type: 'SET_BOUNDARY',
      description: 'Local unconfirmed edit',
      previousVertices: mockRevision.boundary,
      nextVertices: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }, { x: 0, y: 80 }],
    };
    state = pushCommand(state, cmd);
    expect(state.undoStack).toHaveLength(1);
    expect(state.unsavedCommands).toHaveLength(1);

    // Server-confirmed revision returned from conflict reload
    const serverConfirmed: FloorPlanRevision = {
      ...mockRevision,
      concurrencyVersion: 2,
      boundary: [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 120 },
        { x: 0, y: 120 },
      ],
    };

    state = resetToServerDraft(state, serverConfirmed);
    expect(state.undoStack).toHaveLength(0);
    expect(state.redoStack).toHaveLength(0);
    expect(state.unsavedCommands).toHaveLength(0);
    expect(state.serverConfirmedRevision).toEqual(serverConfirmed);
  });
});
