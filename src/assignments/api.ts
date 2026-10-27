import type { Client } from 'openapi-fetch';
import type { paths } from '../api/schema';

export type Assignment = {
  id: string;
  placementIdentityId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeeEmail?: string | null;
  departmentName?: string | null;
  spaceLabel?: string | null;
  floorId: string;
  floorName: string;
  buildingName: string;
  siteName: string;
  startedAt: string;
  endedAt: string | null;
  assignedByUserId: string;
  clientCommandId?: string | null;
  createdAt: string;
};

export type CreateAssignmentParams = {
  employeeId: string;
  placementIdentityId: string;
  startedAt: string;
  endedAt?: string | null;
  clientCommandId?: string;
};

export type QueryAssignmentsParams = {
  employeeId?: string;
  placementIdentityId?: string;
  floorId?: string;
};

const ERROR_COPY: Record<string, string> = {
  space_already_assigned: 'This space is already assigned for an overlapping time period.',
  space_not_assignable: 'The selected space is not assignable.',
  invalid_assignment_period: 'Assignment end time must be later than start time.',
  employee_inactive: 'Cannot assign an inactive employee.',
  employee_not_found: 'Employee not found.',
  space_not_found: 'Space not found in published floor plan.',
  revision_not_published: 'The floor plan does not have an active published revision.',
  location_archived: 'Cannot assign spaces in an archived location.',
  command_id_payload_mismatch: 'A conflicting command with this ID was already processed.',
  forbidden: 'Only Workplace Planners may create assignments.',
  unauthorized: 'Authentication required. Please sign in.',
};

function extractErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const errorObj = data as { error?: string; message?: string };
    if (errorObj.error && typeof errorObj.error === 'string' && errorObj.error in ERROR_COPY) {
      return ERROR_COPY[errorObj.error]!;
    }
    if (errorObj.message) {
      return errorObj.message;
    }
  }
  return fallback;
}

export async function createAssignment(
  client: Client<paths>,
  params: CreateAssignmentParams,
): Promise<
  | { ok: true; assignment: Assignment }
  | { ok: false; error: string; errorCode?: string; statusCode: number }
> {
  try {
    const { data, response } = await client.POST('/assignments', {
      body: {
        employeeId: params.employeeId,
        placementIdentityId: params.placementIdentityId,
        startedAt: params.startedAt,
        endedAt: params.endedAt ?? null,
        clientCommandId: params.clientCommandId,
      },
    });

    if (response.ok && data) {
      return { ok: true, assignment: data as Assignment };
    }

    const errorCode = (data as { error?: string } | undefined)?.error;
    return {
      ok: false,
      error: extractErrorMessage(data, 'Could not create assignment.'),
      errorCode,
      statusCode: response.status,
    };
  } catch {
    return {
      ok: false,
      error: 'Could not create assignment due to network or server error.',
      statusCode: 500,
    };
  }
}

export async function listAssignments(
  client: Client<paths>,
  params?: QueryAssignmentsParams,
): Promise<
  | { ok: true; assignments: Assignment[] }
  | { ok: false; error: string; statusCode: number }
> {
  try {
    const { data, response } = await client.GET('/assignments', {
      params: {
        query: {
          employeeId: params?.employeeId,
          placementIdentityId: params?.placementIdentityId,
          floorId: params?.floorId,
        },
      },
    });

    if (response.ok) {
      const list = Array.isArray(data) ? data : [];
      return { ok: true, assignments: list as Assignment[] };
    }

    return {
      ok: false,
      error: extractErrorMessage(data, 'Could not retrieve assignments.'),
      statusCode: response.status,
    };
  } catch {
    return {
      ok: false,
      error: 'Could not retrieve assignments due to network or server error.',
      statusCode: 500,
    };
  }
}
