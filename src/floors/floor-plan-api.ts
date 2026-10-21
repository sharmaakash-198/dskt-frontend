import type { Client } from 'openapi-fetch';
import type { paths } from '../api/schema';
import type { GeometryDiagnostic, Vertex } from '../templates/geometry';

export type { Vertex };

export type PlacedElement = {
  id: string;
  floorPlanRevisionId: string;
  placementIdentityId: string;
  elementTemplateRevisionId: string;
  templateId: string;
  templateCode: string;
  templateName: string;
  templateRevisionNumber: number;
  assignable: boolean;
  spatialClass: 'PHYSICAL' | 'ZONE' | 'OBSTACLE';
  borderColor: string;
  fillColor: string;
  positionX: number;
  positionY: number;
  rotationDegrees: number;
  label: string | null;
  vertices: Vertex[];
  localVertices: Vertex[];
  createdAt: string;
  updatedAt: string;
};

export type FloorPlan = {
  id: string;
  floorId: string;
  createdAt: string;
  updatedAt: string;
};

export type FloorPlanRevision = {
  id: string;
  floorPlanId: string;
  revisionNumber: number;
  lifecycleState: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  editingScale: number;
  concurrencyVersion: number;
  boundary: Vertex[];
  placements?: PlacedElement[];
  createdAt: string;
  updatedAt: string;
};

export type LeaseHolder = {
  id: string;
  displayName: string;
  email: string;
};

export type FloorPlanLease = {
  floorPlanRevisionId: string;
  token?: string;
  acquiredAt: string;
  expiresAt: string;
  renewedAt: string;
  releasedAt: string | null;
  isExpired: boolean;
  owner: LeaseHolder;
};

export type FloorPlanLeaseState = {
  hasActiveLease: boolean;
  isCurrentHolder: boolean;
  lease: FloorPlanLease | null;
};

const ERROR_COPY: Record<string, string> = {
  floor_plan_already_exists: 'A floor plan already exists for this floor.',
  floor_not_found: 'That floor was not found.',
  floor_archived: 'This floor is archived.',
  revision_not_found: 'That revision was not found.',
  revision_not_draft: 'Only draft revisions can be edited.',
  concurrency_conflict: 'This revision was modified by another session. Refresh and try again.',
  lease_conflict: 'This floor plan is currently being edited by another user in exclusive mode.',
  lease_invalid_token: 'Your edit session lease is invalid or was released.',
  lease_expired: 'Your edit session lease has expired. Reacquire or renew to continue.',
  command_id_payload_mismatch: 'Command retry payload mismatch detected.',
  invalid_editing_scale: 'Editing scale must be a power of two (1 to 256).',
  invalid_geometry: 'The boundary is not a valid orthogonal polygon.',
  outside_boundary: 'Placement must lie entirely within the floor boundary.',
  template_revision_not_current: 'Only current active template revisions can be placed.',
  template_revision_not_physical: 'Only physical template revisions can be placed.',
  placement_collision: 'Physical spaces cannot overlap existing physical spaces or obstacles.',
  invalid_rotation: 'Rotation must be a quarter turn (0, 90, 180, or 270 degrees).',
  invalid_coordinates: 'Coordinates must be integers in 10-cm world units.',
  duplicate_label: 'A space with this label already exists on this floor plan revision.',
  placement_not_found: 'That placed space was not found.',
  forbidden: 'You cannot manage floor plans or boundaries.',
  unauthorized: 'Your session is no longer valid.',
};

export function floorPlanErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return ERROR_COPY[data.error] ?? fallback;
  }
  return fallback;
}

export function extractConflictMeta(response: { status: number }, data: unknown) {
  const isConflict = response.status === 409;
  const errorCode =
    data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : undefined;
  const isConcurrencyConflict = errorCode === 'concurrency_conflict';
  const currentConcurrencyVersion =
    data &&
    typeof data === 'object' &&
    'currentConcurrencyVersion' in data &&
    typeof data.currentConcurrencyVersion === 'number'
      ? data.currentConcurrencyVersion
      : undefined;
  return { isConflict, isConcurrencyConflict, errorCode, currentConcurrencyVersion };
}

export async function createDraftFloorPlan(
  client: Client<paths>,
  floorId: string,
  options?: { editingScale?: number; idempotencyKey?: string },
): Promise<{ ok: true; floorPlan: FloorPlan; revision: FloorPlanRevision } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/floors/{floorId}/floor-plan', {
      params: { path: { floorId } },
      body: options ?? null,
    });
    if ((response.status === 200 || response.status === 201) && data && 'floorPlan' in data && 'revision' in data) {
      return { ok: true, floorPlan: data.floorPlan, revision: data.revision };
    }
    return { ok: false, error: floorPlanErrorMessage(data, 'Could not create the floor plan.') };
  } catch {
    return { ok: false, error: 'Could not create the floor plan.' };
  }
}

export async function listFloorPlanRevisions(
  client: Client<paths>,
  floorId: string,
): Promise<{ ok: true; revisions: FloorPlanRevision[] } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.GET('/floors/{floorId}/floor-plan/revisions', {
      params: { path: { floorId } },
    });
    if (response.ok && data && 'revisions' in data) {
      return { ok: true, revisions: data.revisions };
    }
    return { ok: false, error: floorPlanErrorMessage(data, 'Revisions are unavailable.') };
  } catch {
    return { ok: false, error: 'Revisions are unavailable.' };
  }
}

export async function getFloorPlan(
  client: Client<paths>,
  floorId: string,
): Promise<{ ok: true; floorPlan: FloorPlan | null; activeRevision: FloorPlanRevision | null } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.GET('/floors/{floorId}/floor-plan', {
      params: { path: { floorId } },
    });
    if (response.ok && data) {
      return { ok: true, floorPlan: data.floorPlan, activeRevision: data.activeRevision };
    }
    return { ok: false, error: floorPlanErrorMessage(data, 'Floor plan details are unavailable.') };
  } catch {
    return { ok: false, error: 'Floor plan details are unavailable.' };
  }
}

export async function getFloorPlanLease(
  client: Client<paths>,
  floorId: string,
  revisionId: string,
): Promise<{ ok: true; state: FloorPlanLeaseState } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.GET(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/lease',
      {
        params: { path: { floorId, revisionId } },
      },
    );
    if (response.ok && data) {
      return { ok: true, state: data as FloorPlanLeaseState };
    }
    return { ok: false, error: floorPlanErrorMessage(data, 'Could not retrieve edit lease state.') };
  } catch {
    return { ok: false, error: 'Could not retrieve edit lease state.' };
  }
}

export async function acquireFloorPlanLease(
  client: Client<paths>,
  floorId: string,
  revisionId: string,
  options?: { durationSeconds?: number },
): Promise<{ ok: true; lease: FloorPlanLease } | { ok: false; error: string; isConflict?: boolean }> {
  try {
    const { data, response } = await client.POST(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/lease',
      {
        params: { path: { floorId, revisionId } },
        body: options?.durationSeconds ? { durationSeconds: options.durationSeconds } : null,
      },
    );
    if (response.status === 200 && data && 'owner' in data) {
      return { ok: true, lease: data as FloorPlanLease };
    }
    const isConflict = response.status === 409;
    return { ok: false, error: floorPlanErrorMessage(data, 'Could not acquire editor lease.'), isConflict };
  } catch {
    return { ok: false, error: 'Could not acquire editor lease.' };
  }
}

export async function renewFloorPlanLease(
  client: Client<paths>,
  floorId: string,
  revisionId: string,
  leaseToken: string,
  options?: { durationSeconds?: number },
): Promise<{ ok: true; lease: FloorPlanLease } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/lease/renew',
      {
        params: {
          path: { floorId, revisionId },
          header: { 'x-lease-token': leaseToken },
        },
        body: {
          leaseToken,
          durationSeconds: options?.durationSeconds,
        },
      },
    );
    if (response.status === 200 && data && 'owner' in data) {
      return { ok: true, lease: data as FloorPlanLease };
    }
    return { ok: false, error: floorPlanErrorMessage(data, 'Could not renew editor lease.') };
  } catch {
    return { ok: false, error: 'Could not renew editor lease.' };
  }
}

export async function releaseFloorPlanLease(
  client: Client<paths>,
  floorId: string,
  revisionId: string,
  leaseToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/lease/release',
      {
        params: {
          path: { floorId, revisionId },
          header: { 'x-lease-token': leaseToken },
        },
        body: { leaseToken },
      },
    );
    if (response.status === 200) {
      return { ok: true };
    }
    return { ok: false, error: floorPlanErrorMessage(data, 'Could not release editor lease.') };
  } catch {
    return { ok: false, error: 'Could not release editor lease.' };
  }
}

export async function takeoverFloorPlanLease(
  client: Client<paths>,
  floorId: string,
  revisionId: string,
  options?: { reason?: string; durationSeconds?: number },
): Promise<{ ok: true; lease: FloorPlanLease } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/lease/takeover',
      {
        params: { path: { floorId, revisionId } },
        body: options ? { reason: options.reason, durationSeconds: options.durationSeconds } : null,
      },
    );
    if (response.status === 200 && data && 'owner' in data) {
      return { ok: true, lease: data as FloorPlanLease };
    }
    return { ok: false, error: floorPlanErrorMessage(data, 'Could not take over editor lease.') };
  } catch {
    return { ok: false, error: 'Could not take over editor lease.' };
  }
}

export async function getFloorPlanRevision(
  client: Client<paths>,
  floorId: string,
  revisionId: string,
): Promise<{ ok: true; revision: FloorPlanRevision } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.GET(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}',
      {
        params: { path: { floorId, revisionId } },
      },
    );
    if (response.ok && data && 'revision' in data) {
      return { ok: true, revision: data.revision as FloorPlanRevision };
    }
    return { ok: false, error: floorPlanErrorMessage(data, 'Could not load floor plan revision.') };
  } catch {
    return { ok: false, error: 'Could not load floor plan revision.' };
  }
}

export async function updateFloorPlanRevisionBoundary(
  client: Client<paths>,
  floorId: string,
  revisionId: string,
  body: {
    concurrencyVersion: number;
    editingScale?: number;
    vertices: Vertex[];
    leaseToken?: string;
    clientCommandId?: string;
  },
): Promise<
  | { ok: true; revision: FloorPlanRevision }
  | {
      ok: false;
      error: string;
      errorCode?: string;
      diagnostics?: GeometryDiagnostic[];
      isConflict?: boolean;
      isConcurrencyConflict?: boolean;
      currentConcurrencyVersion?: number;
    }
> {
  try {
    const headers: Record<string, string> = {};
    if (body.leaseToken) headers['x-lease-token'] = body.leaseToken;
    if (body.clientCommandId) headers['x-client-command-id'] = body.clientCommandId;

    const { data, response } = await client.PUT(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/boundary',
      {
        params: {
          path: { floorId, revisionId },
          header: Object.keys(headers).length > 0 ? (headers as never) : undefined,
        },
        body,
      },
    );
    if (response.ok && data && 'id' in data) {
      return { ok: true, revision: data as FloorPlanRevision };
    }
    const diagnostics =
      data && typeof data === 'object' && 'diagnostics' in data
        ? (data.diagnostics as GeometryDiagnostic[])
        : undefined;
    const conflict = extractConflictMeta(response, data);
    return {
      ok: false,
      error: floorPlanErrorMessage(data, 'Could not save floor boundary.'),
      diagnostics,
      ...conflict,
    };
  } catch {
    return { ok: false, error: 'Could not save floor boundary.' };
  }
}

export async function updateFloorPlanRevisionScale(
  client: Client<paths>,
  floorId: string,
  revisionId: string,
  body: {
    concurrencyVersion: number;
    editingScale: number;
    leaseToken?: string;
    clientCommandId?: string;
  },
): Promise<
  | { ok: true; revision: FloorPlanRevision }
  | {
      ok: false;
      error: string;
      errorCode?: string;
      isConflict?: boolean;
      isConcurrencyConflict?: boolean;
      currentConcurrencyVersion?: number;
    }
> {
  try {
    const headers: Record<string, string> = {};
    if (body.leaseToken) headers['x-lease-token'] = body.leaseToken;
    if (body.clientCommandId) headers['x-client-command-id'] = body.clientCommandId;

    const { data, response } = await client.PATCH(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/scale',
      {
        params: {
          path: { floorId, revisionId },
          header: Object.keys(headers).length > 0 ? (headers as never) : undefined,
        },
        body,
      },
    );
    if (response.ok && data && 'id' in data) {
      return { ok: true, revision: data as FloorPlanRevision };
    }
    const conflict = extractConflictMeta(response, data);
    return { ok: false, error: floorPlanErrorMessage(data, 'Could not update editing scale.'), ...conflict };
  } catch {
    return { ok: false, error: 'Could not update editing scale.' };
  }
}

export async function createPlacedElement(
  client: Client<paths>,
  floorId: string,
  revisionId: string,
  body: {
    templateRevisionId: string;
    positionX: number;
    positionY: number;
    rotationDegrees?: number;
    label?: string | null;
    concurrencyVersion?: number;
    leaseToken?: string;
    clientCommandId?: string;
  },
): Promise<
  | { ok: true; placement: PlacedElement }
  | {
      ok: false;
      error: string;
      errorCode?: string;
      isConflict?: boolean;
      isConcurrencyConflict?: boolean;
      currentConcurrencyVersion?: number;
    }
> {
  try {
    const headers: Record<string, string> = {};
    if (body.leaseToken) headers['x-lease-token'] = body.leaseToken;
    if (body.clientCommandId) headers['x-client-command-id'] = body.clientCommandId;

    const { data, response } = await client.POST(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/placements',
      {
        params: {
          path: { floorId, revisionId },
          header: Object.keys(headers).length > 0 ? (headers as never) : undefined,
        },
        body: {
          templateRevisionId: body.templateRevisionId,
          positionX: body.positionX,
          positionY: body.positionY,
          rotationDegrees: body.rotationDegrees ?? 0,
          label: body.label ?? null,
          concurrencyVersion: body.concurrencyVersion,
          leaseToken: body.leaseToken,
          clientCommandId: body.clientCommandId,
        },
      },
    );
    if (response.status === 201 && data && 'id' in data) {
      return { ok: true, placement: data as PlacedElement };
    }
    const conflict = extractConflictMeta(response, data);
    return { ok: false, error: floorPlanErrorMessage(data, 'Could not place element.'), ...conflict };
  } catch {
    return { ok: false, error: 'Could not place element.' };
  }
}

export async function listPlacedElements(
  client: Client<paths>,
  floorId: string,
  revisionId: string,
): Promise<{ ok: true; placements: PlacedElement[] } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.GET(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/placements',
      {
        params: { path: { floorId, revisionId } },
      },
    );
    if (response.ok && data && 'placements' in data) {
      return { ok: true, placements: data.placements as PlacedElement[] };
    }
    return { ok: false, error: floorPlanErrorMessage(data, 'Placements are unavailable.') };
  } catch {
    return { ok: false, error: 'Placements are unavailable.' };
  }
}

export async function updatePlacedElement(
  client: Client<paths>,
  floorId: string,
  revisionId: string,
  placementId: string,
  body: {
    concurrencyVersion?: number;
    positionX?: number;
    positionY?: number;
    rotationDegrees?: number;
    label?: string | null;
    leaseToken?: string;
    clientCommandId?: string;
  },
): Promise<
  | { ok: true; placement: PlacedElement }
  | {
      ok: false;
      error: string;
      errorCode?: string;
      isConflict?: boolean;
      isConcurrencyConflict?: boolean;
      currentConcurrencyVersion?: number;
    }
> {
  try {
    const headers: Record<string, string> = {};
    if (body.leaseToken) headers['x-lease-token'] = body.leaseToken;
    if (body.clientCommandId) headers['x-client-command-id'] = body.clientCommandId;

    const { data, response } = await client.PATCH(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/placements/{placementId}',
      {
        params: {
          path: { floorId, revisionId, placementId },
          header: Object.keys(headers).length > 0 ? (headers as never) : undefined,
        },
        body,
      },
    );
    if (response.ok && data && 'id' in data) {
      return { ok: true, placement: data as PlacedElement };
    }
    const conflict = extractConflictMeta(response, data);
    return { ok: false, error: floorPlanErrorMessage(data, 'Could not update placed space.'), ...conflict };
  } catch {
    return { ok: false, error: 'Could not update placed space.' };
  }
}

export async function deletePlacedElement(
  client: Client<paths>,
  floorId: string,
  revisionId: string,
  placementId: string,
  concurrencyVersion?: number,
  leaseToken?: string,
  clientCommandId?: string,
): Promise<
  | { ok: true; concurrencyVersion: number }
  | {
      ok: false;
      error: string;
      errorCode?: string;
      isConflict?: boolean;
      isConcurrencyConflict?: boolean;
      currentConcurrencyVersion?: number;
    }
> {
  try {
    const headers: Record<string, string> = {};
    if (leaseToken) headers['x-lease-token'] = leaseToken;
    if (clientCommandId) headers['x-client-command-id'] = clientCommandId;

    const query: Record<string, unknown> = {};
    if (concurrencyVersion !== undefined) query.concurrencyVersion = concurrencyVersion;
    if (leaseToken) query.leaseToken = leaseToken;
    if (clientCommandId) query.clientCommandId = clientCommandId;

    const { data, response } = await client.DELETE(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/placements/{placementId}',
      {
        params: {
          path: { floorId, revisionId, placementId },
          query: Object.keys(query).length > 0 ? (query as never) : undefined,
          header: Object.keys(headers).length > 0 ? (headers as never) : undefined,
        },
      },
    );
    if (response.ok && data && 'ok' in data) {
      return { ok: true, concurrencyVersion: data.concurrencyVersion };
    }
    const conflict = extractConflictMeta(response, data);
    return { ok: false, error: floorPlanErrorMessage(data, 'Could not remove placed space.'), ...conflict };
  } catch {
    return { ok: false, error: 'Could not remove placed space.' };
  }
}
