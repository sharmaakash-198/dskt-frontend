import type { Client } from 'openapi-fetch';
import type { paths } from '../api/schema';

export type Building = {
  id: string;
  siteId: string;
  code: string;
  name: string;
};

const ERROR_COPY: Record<string, string> = {
  building_code_taken: 'That building code is already in use on this site.',
  building_has_active_floors: 'Archive the floors in this building before archiving the building.',
  building_archived: 'This building is already archived.',
  building_not_found: 'That building was not found.',
  site_not_found: 'That site was not found.',
  site_archived: 'This site is archived and cannot accept buildings.',
  invalid_building_code: 'Use a building code of letters, numbers, and hyphens.',
  invalid_building_name: 'Enter a building name.',
  forbidden: 'You cannot change buildings.',
  unauthorized: 'Your session is no longer valid.',
};

export function buildingErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return ERROR_COPY[data.error] ?? fallback;
  }
  return fallback;
}

function isBuilding(data: unknown): data is Building {
  return Boolean(data && typeof data === 'object' && 'code' in data && 'siteId' in data);
}

export async function listBuildings(
  client: Client<paths>,
  siteId: string,
): Promise<{ ok: true; buildings: Building[] } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.GET('/sites/{siteId}/buildings', {
      params: { path: { siteId } },
    });
    if (response.ok && data && 'buildings' in data) {
      return { ok: true, buildings: data.buildings };
    }
    return { ok: false, error: buildingErrorMessage(data, 'Buildings are unavailable.') };
  } catch {
    return { ok: false, error: 'Buildings are unavailable.' };
  }
}

export async function createBuilding(
  client: Client<paths>,
  siteId: string,
  body: { code: string; name: string },
): Promise<{ ok: true; building: Building } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/sites/{siteId}/buildings', {
      params: { path: { siteId } },
      body,
    });
    if (response.ok && isBuilding(data)) {
      return { ok: true, building: data };
    }
    return { ok: false, error: buildingErrorMessage(data, 'Could not create that building.') };
  } catch {
    return { ok: false, error: 'Could not create that building.' };
  }
}

export async function updateBuilding(
  client: Client<paths>,
  buildingId: string,
  body: { name: string },
): Promise<{ ok: true; building: Building } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.PATCH('/buildings/{buildingId}', {
      params: { path: { buildingId } },
      body,
    });
    if (response.ok && isBuilding(data)) {
      return { ok: true, building: data };
    }
    return { ok: false, error: buildingErrorMessage(data, 'Could not update that building.') };
  } catch {
    return { ok: false, error: 'Could not update that building.' };
  }
}

export async function archiveBuilding(
  client: Client<paths>,
  buildingId: string,
): Promise<{ ok: true; building: Building } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/buildings/{buildingId}/archive', {
      params: { path: { buildingId } },
    });
    if (response.ok && isBuilding(data)) {
      return { ok: true, building: data };
    }
    return { ok: false, error: buildingErrorMessage(data, 'Could not archive that building.') };
  } catch {
    return { ok: false, error: 'Could not archive that building.' };
  }
}
