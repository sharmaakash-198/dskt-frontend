import type { Client } from 'openapi-fetch';
import type { paths } from '../api/schema';

export type Floor = {
  id: string;
  buildingId: string;
  code: string;
  name: string;
};

const ERROR_COPY: Record<string, string> = {
  floor_code_taken: 'That floor code is already in use in this building.',
  floor_archived: 'This floor is already archived.',
  floor_not_found: 'That floor was not found.',
  building_not_found: 'That building was not found.',
  building_archived: 'This building is archived and cannot accept floors.',
  invalid_floor_code: 'Use a floor code of letters, numbers, and hyphens.',
  invalid_floor_name: 'Enter a floor name.',
  forbidden: 'You cannot change floors.',
  unauthorized: 'Your session is no longer valid.',
};

export function floorErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return ERROR_COPY[data.error] ?? fallback;
  }
  return fallback;
}

function isFloor(data: unknown): data is Floor {
  return Boolean(data && typeof data === 'object' && 'code' in data && 'buildingId' in data);
}

export async function listFloors(
  client: Client<paths>,
  buildingId: string,
): Promise<{ ok: true; floors: Floor[] } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.GET('/buildings/{buildingId}/floors', {
      params: { path: { buildingId } },
    });
    if (response.ok && data && 'floors' in data) {
      return { ok: true, floors: data.floors };
    }
    return { ok: false, error: floorErrorMessage(data, 'Floors are unavailable.') };
  } catch {
    return { ok: false, error: 'Floors are unavailable.' };
  }
}

export async function createFloor(
  client: Client<paths>,
  buildingId: string,
  body: { code: string; name: string },
): Promise<{ ok: true; floor: Floor } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/buildings/{buildingId}/floors', {
      params: { path: { buildingId } },
      body,
    });
    if (response.ok && isFloor(data)) {
      return { ok: true, floor: data };
    }
    return { ok: false, error: floorErrorMessage(data, 'Could not create that floor.') };
  } catch {
    return { ok: false, error: 'Could not create that floor.' };
  }
}

export async function updateFloor(
  client: Client<paths>,
  floorId: string,
  body: { name: string },
): Promise<{ ok: true; floor: Floor } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.PATCH('/floors/{floorId}', {
      params: { path: { floorId } },
      body,
    });
    if (response.ok && isFloor(data)) {
      return { ok: true, floor: data };
    }
    return { ok: false, error: floorErrorMessage(data, 'Could not update that floor.') };
  } catch {
    return { ok: false, error: 'Could not update that floor.' };
  }
}

export async function archiveFloor(
  client: Client<paths>,
  floorId: string,
): Promise<{ ok: true; floor: Floor } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/floors/{floorId}/archive', {
      params: { path: { floorId } },
    });
    if (response.ok && isFloor(data)) {
      return { ok: true, floor: data };
    }
    return { ok: false, error: floorErrorMessage(data, 'Could not archive that floor.') };
  } catch {
    return { ok: false, error: 'Could not archive that floor.' };
  }
}
