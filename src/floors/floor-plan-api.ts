import type { Client } from 'openapi-fetch';
import type { paths } from '../api/schema';
import type { GeometryDiagnostic, Vertex } from '../templates/geometry';

export type { Vertex };

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
  createdAt: string;
  updatedAt: string;
};

const ERROR_COPY: Record<string, string> = {
  floor_plan_already_exists: 'A floor plan already exists for this floor.',
  floor_not_found: 'That floor was not found.',
  floor_archived: 'This floor is archived.',
  revision_not_found: 'That revision was not found.',
  revision_not_draft: 'Only draft revisions can be edited.',
  concurrency_conflict: 'This revision was modified by another session. Refresh and try again.',
  invalid_editing_scale: 'Editing scale must be a power of two (1 to 256).',
  invalid_geometry: 'The boundary is not a valid orthogonal polygon.',
  forbidden: 'You cannot manage floor plans or boundaries.',
  unauthorized: 'Your session is no longer valid.',
};

export function floorPlanErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return ERROR_COPY[data.error] ?? fallback;
  }
  return fallback;
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

export async function updateFloorPlanRevisionBoundary(
  client: Client<paths>,
  floorId: string,
  revisionId: string,
  body: {
    concurrencyVersion: number;
    editingScale?: number;
    vertices: Vertex[];
  },
): Promise<
  | { ok: true; revision: FloorPlanRevision }
  | { ok: false; error: string; diagnostics?: GeometryDiagnostic[] }
> {
  try {
    const { data, response } = await client.PUT(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/boundary',
      {
        params: { path: { floorId, revisionId } },
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
    return {
      ok: false,
      error: floorPlanErrorMessage(data, 'Could not save floor boundary.'),
      diagnostics,
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
  },
): Promise<{ ok: true; revision: FloorPlanRevision } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.PATCH(
      '/floors/{floorId}/floor-plan/revisions/{revisionId}/scale',
      {
        params: { path: { floorId, revisionId } },
        body,
      },
    );
    if (response.ok && data && 'id' in data) {
      return { ok: true, revision: data as FloorPlanRevision };
    }
    return { ok: false, error: floorPlanErrorMessage(data, 'Could not update editing scale.') };
  } catch {
    return { ok: false, error: 'Could not update editing scale.' };
  }
}
