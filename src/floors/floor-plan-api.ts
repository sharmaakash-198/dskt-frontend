import type { Client } from 'openapi-fetch';
import type { paths } from '../api/schema';

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
  createdAt: string;
  updatedAt: string;
};

const ERROR_COPY: Record<string, string> = {
  floor_plan_already_exists: 'A floor plan already exists for this floor.',
  floor_not_found: 'That floor was not found.',
  floor_archived: 'This floor is archived.',
  invalid_editing_scale: 'Editing scale must be a power of two (1 to 256).',
  forbidden: 'You cannot manage floor plans.',
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
