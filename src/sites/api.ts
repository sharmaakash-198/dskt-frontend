import type { Client } from 'openapi-fetch';
import type { paths } from '../api/schema';

export type SiteAddress = {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
};

export type Site = {
  id: string;
  code: string;
  name: string;
  timeZone: string;
  address: SiteAddress;
};

export type SiteWrite = {
  name: string;
  timeZone: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

const ERROR_COPY: Record<string, string> = {
  site_code_taken: 'That site code is already in use.',
  site_has_active_buildings: 'Archive the buildings on this site before archiving the site.',
  site_archived: 'This site is already archived.',
  site_not_found: 'That site was not found.',
  invalid_site_code: 'Use a site code of letters, numbers, and hyphens.',
  invalid_site_name: 'Enter a site name.',
  invalid_time_zone: 'Enter a valid IANA time zone.',
  organization_missing: 'The organization is not ready for sites.',
  forbidden: 'You cannot change sites.',
  unauthorized: 'Your session is no longer valid.',
};

export function siteErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return ERROR_COPY[data.error] ?? fallback;
  }
  return fallback;
}

function isSite(data: unknown): data is Site {
  return Boolean(data && typeof data === 'object' && 'code' in data && 'timeZone' in data);
}

export async function listSites(
  client: Client<paths>,
): Promise<{ ok: true; sites: Site[] } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.GET('/sites');
    if (response.ok && data && 'sites' in data) {
      return { ok: true, sites: data.sites };
    }
    return { ok: false, error: siteErrorMessage(data, 'Sites are unavailable.') };
  } catch {
    return { ok: false, error: 'Sites are unavailable.' };
  }
}

export async function createSite(
  client: Client<paths>,
  body: SiteWrite & { code: string },
): Promise<{ ok: true; site: Site } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/sites', { body });
    if (response.ok && isSite(data)) {
      return { ok: true, site: data };
    }
    return { ok: false, error: siteErrorMessage(data, 'Could not create that site.') };
  } catch {
    return { ok: false, error: 'Could not create that site.' };
  }
}

export async function updateSite(
  client: Client<paths>,
  siteId: string,
  body: SiteWrite,
): Promise<{ ok: true; site: Site } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.PATCH('/sites/{siteId}', {
      params: { path: { siteId } },
      body,
    });
    if (response.ok && isSite(data)) {
      return { ok: true, site: data };
    }
    return { ok: false, error: siteErrorMessage(data, 'Could not update that site.') };
  } catch {
    return { ok: false, error: 'Could not update that site.' };
  }
}

export async function archiveSite(
  client: Client<paths>,
  siteId: string,
): Promise<{ ok: true; site: Site } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/sites/{siteId}/archive', {
      params: { path: { siteId } },
    });
    if (response.ok && isSite(data)) {
      return { ok: true, site: data };
    }
    return { ok: false, error: siteErrorMessage(data, 'Could not archive that site.') };
  } catch {
    return { ok: false, error: 'Could not archive that site.' };
  }
}
