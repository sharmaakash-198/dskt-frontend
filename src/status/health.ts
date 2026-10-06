import type { api } from '../api/client';

export type HealthReport = {
  process: 'live' | 'unreachable';
  database: 'ready' | 'not_ready' | 'unknown';
};

type HealthClient = Pick<typeof api, 'GET'>;

export async function loadHealthReport(client: HealthClient): Promise<HealthReport> {
  try {
    const live = await client.GET('/health/live');
    if (!live.response.ok || live.data?.status !== 'live') {
      return { process: 'unreachable', database: 'unknown' };
    }
  } catch {
    return { process: 'unreachable', database: 'unknown' };
  }

  try {
    const ready = await client.GET('/health/ready');
    if (ready.response.ok && ready.data?.status === 'ready') {
      return { process: 'live', database: 'ready' };
    }
    return { process: 'live', database: 'not_ready' };
  } catch {
    return { process: 'live', database: 'not_ready' };
  }
}
