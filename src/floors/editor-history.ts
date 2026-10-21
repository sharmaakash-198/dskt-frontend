/**
 * Semantic Command and History model for Floor Plan editor.
 *
 * Implements Ticket 17:
 * - Semantic geometry commands (SET_BOUNDARY, PLACE_ELEMENT, TRANSFORM_PLACEMENT, DELETE_PLACEMENT).
 * - Exact command inversion for undo.
 * - Discarding redo branches when new edits are made.
 * - Viewport/visual-only exclusion: pan, zoom, selection never enter domain undo history.
 * - Unsaved work tracking and conflict recovery state.
 * - Server confirmation baseline and recovery without corrupting history.
 */
import type { Vertex } from '../templates/geometry.js';
import type { FloorPlanRevision, PlacedElement } from './floor-plan-api.js';

export type BoundaryCommand = {
  type: 'SET_BOUNDARY';
  description: string;
  previousVertices: Vertex[];
  nextVertices: Vertex[];
};

export type PlaceElementCommand = {
  type: 'PLACE_ELEMENT';
  description: string;
  placement: PlacedElement;
};

export type TransformPlacementCommand = {
  type: 'TRANSFORM_PLACEMENT';
  description: string;
  placementId: string;
  previous: {
    positionX: number;
    positionY: number;
    rotationDegrees: number;
    label: string | null;
  };
  next: {
    positionX: number;
    positionY: number;
    rotationDegrees: number;
    label: string | null;
  };
};

export type DeletePlacementCommand = {
  type: 'DELETE_PLACEMENT';
  description: string;
  placement: PlacedElement;
};

export type SemanticCommand =
  | BoundaryCommand
  | PlaceElementCommand
  | TransformPlacementCommand
  | DeletePlacementCommand;

/**
 * Inverts a semantic command to produce its exact undo counterpart.
 */
export function invertCommand(command: SemanticCommand): SemanticCommand {
  switch (command.type) {
    case 'SET_BOUNDARY':
      return {
        type: 'SET_BOUNDARY',
        description: `Undo ${command.description}`,
        previousVertices: command.nextVertices,
        nextVertices: command.previousVertices,
      };
    case 'PLACE_ELEMENT':
      return {
        type: 'DELETE_PLACEMENT',
        description: `Undo ${command.description}`,
        placement: command.placement,
      };
    case 'DELETE_PLACEMENT':
      return {
        type: 'PLACE_ELEMENT',
        description: `Undo ${command.description}`,
        placement: command.placement,
      };
    case 'TRANSFORM_PLACEMENT':
      return {
        type: 'TRANSFORM_PLACEMENT',
        description: `Undo ${command.description}`,
        placementId: command.placementId,
        previous: { ...command.next },
        next: { ...command.previous },
      };
  }
}

export interface HistoryState {
  undoStack: SemanticCommand[];
  redoStack: SemanticCommand[];
  serverConfirmedRevision: FloorPlanRevision | null;
  unsavedCommands: SemanticCommand[];
}

export function createInitialHistoryState(initialRevision: FloorPlanRevision): HistoryState {
  return {
    undoStack: [],
    redoStack: [],
    serverConfirmedRevision: initialRevision,
    unsavedCommands: [],
  };
}

/**
 * Pushes a new semantic command to undo stack.
 * In accordance with Acceptance Criteria 3, new edits after undo discard the invalid redo branch.
 */
export function pushCommand(state: HistoryState, command: SemanticCommand): HistoryState {
  return {
    ...state,
    undoStack: [...state.undoStack, command],
    redoStack: [], // discard invalid redo branch
    unsavedCommands: [...state.unsavedCommands, command],
  };
}

/**
 * Pops the last command from undoStack, inverts it, and pushes the original command to redoStack.
 */
export function undo(state: HistoryState): { nextState: HistoryState; invertedCommand: SemanticCommand | null } {
  if (state.undoStack.length === 0) {
    return { nextState: state, invertedCommand: null };
  }
  const cmd = state.undoStack[state.undoStack.length - 1];
  if (!cmd) {
    return { nextState: state, invertedCommand: null };
  }
  const newUndoStack = state.undoStack.slice(0, -1);
  const inverted = invertCommand(cmd);

  return {
    nextState: {
      ...state,
      undoStack: newUndoStack,
      redoStack: [...state.redoStack, cmd],
      unsavedCommands: [...state.unsavedCommands, inverted],
    },
    invertedCommand: inverted,
  };
}

/**
 * Pops the last command from redoStack, pushes it to undoStack, and returns the command to reapply.
 */
export function redo(state: HistoryState): { nextState: HistoryState; command: SemanticCommand | null } {
  if (state.redoStack.length === 0) {
    return { nextState: state, command: null };
  }
  const cmd = state.redoStack[state.redoStack.length - 1];
  if (!cmd) {
    return { nextState: state, command: null };
  }
  const newRedoStack = state.redoStack.slice(0, -1);

  return {
    nextState: {
      ...state,
      undoStack: [...state.undoStack, cmd],
      redoStack: newRedoStack,
      unsavedCommands: [...state.unsavedCommands, cmd],
    },
    command: cmd,
  };
}

/**
 * Marks server confirmation: updates confirmed revision baseline and clears unsaved commands.
 */
export function markServerConfirmed(
  state: HistoryState,
  confirmedRevision: FloorPlanRevision,
): HistoryState {
  return {
    ...state,
    serverConfirmedRevision: confirmedRevision,
    unsavedCommands: [],
  };
}

/**
 * Resets local history boundary to the server-confirmed draft after conflict recovery.
 */
export function resetToServerDraft(
  _state: HistoryState,
  serverDraft: FloorPlanRevision,
): HistoryState {
  return {
    undoStack: [],
    redoStack: [],
    serverConfirmedRevision: serverDraft,
    unsavedCommands: [],
  };
}

/**
 * Applies a semantic command to domain state (vertices & placements).
 * Visual viewport parameters (zoom, pan, selection) are untouched.
 */
export function applyCommandToDomain(
  command: SemanticCommand,
  current: { vertices: Vertex[]; placements: PlacedElement[] },
): { vertices: Vertex[]; placements: PlacedElement[] } {
  switch (command.type) {
    case 'SET_BOUNDARY':
      return {
        ...current,
        vertices: [...command.nextVertices],
      };
    case 'PLACE_ELEMENT':
      return {
        ...current,
        placements: [
          ...current.placements.filter((p) => p.id !== command.placement.id),
          command.placement,
        ],
      };
    case 'TRANSFORM_PLACEMENT':
      return {
        ...current,
        placements: current.placements.map((p) => {
          if (p.id !== command.placementId) return p;
          return {
            ...p,
            positionX: command.next.positionX,
            positionY: command.next.positionY,
            rotationDegrees: command.next.rotationDegrees,
            label: command.next.label,
          };
        }),
      };
    case 'DELETE_PLACEMENT':
      return {
        ...current,
        placements: current.placements.filter((p) => p.id !== command.placement.id),
      };
  }
}
