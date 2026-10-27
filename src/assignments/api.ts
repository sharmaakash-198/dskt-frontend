import type { Client } from 'openapi-fetch';
import type { paths } from '../api/schema';

export type AssignmentStatus = 'CURRENT' | 'FUTURE' | 'ENDED';

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
  buildingId?: string;
  buildingName: string;
  siteId?: string;
  siteName: string;
  startedAt: string;
  endedAt: string | null;
  status?: AssignmentStatus;
  isAccessible?: boolean;
  assignedByUserId?: string;
  endedByUserId?: string | null;
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

export type EndAssignmentParams = {
  assignmentId: string;
  endedAt?: string;
  clientCommandId?: string;
};

export type QueryAssignmentsParams = {
  employeeId?: string;
  placementIdentityId?: string;
  floorId?: string;
  status?: AssignmentStatus | 'ALL';
};

export type QueryAssignmentHistoryParams = {
  employeeId?: string;
  placementIdentityId?: string;
  floorId?: string;
  limit?: number;
  offset?: number;
};

export type PaginatedAssignmentHistory = {
  total: number;
  limit: number;
  offset: number;
  items: Assignment[];
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
  assignment_already_ended: 'This assignment has already ended and cannot be modified.',
  assignment_not_found: 'Assignment not found.',
  forbidden: 'You do not have permission to perform this assignment action.',
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

export function classifyAssignmentState(
  assignment: Pick<Assignment, 'startedAt' | 'endedAt'>,
  now: Date = new Date(),
): AssignmentStatus {
  const start = new Date(assignment.startedAt).getTime();
  const end = assignment.endedAt ? new Date(assignment.endedAt).getTime() : null;
  const nowMs = now.getTime();

  if (start > nowMs) {
    return 'FUTURE';
  }
  if (end !== null && end <= nowMs) {
    return 'ENDED';
  }
  return 'CURRENT';
}

export type SpaceAssignmentBreakdown = {
  current?: Assignment;
  future: Assignment[];
  ended: Assignment[];
  state: 'CURRENT' | 'FUTURE' | 'ENDED' | 'UNASSIGNED';
};

export function getSpaceAssignmentBreakdown(
  assignments: Assignment[],
  placementIdentityId: string,
  now: Date = new Date(),
): SpaceAssignmentBreakdown {
  const relevant = assignments.filter((a) => a.placementIdentityId === placementIdentityId);
  let current: Assignment | undefined;
  const future: Assignment[] = [];
  const ended: Assignment[] = [];

  for (const a of relevant) {
    const s = a.status || classifyAssignmentState(a, now);
    if (s === 'CURRENT' && !current) {
      current = a;
    } else if (s === 'FUTURE') {
      future.push(a);
    } else if (s === 'ENDED') {
      ended.push(a);
    }
  }

  let state: 'CURRENT' | 'FUTURE' | 'ENDED' | 'UNASSIGNED' = 'UNASSIGNED';
  if (current) {
    state = 'CURRENT';
  } else if (future.length > 0) {
    state = 'FUTURE';
  } else if (ended.length > 0) {
    state = 'ENDED';
  }

  return { current, future, ended, state };
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

export async function endAssignment(
  client: Client<paths>,
  params: EndAssignmentParams,
): Promise<
  | { ok: true; assignment: Assignment }
  | { ok: false; error: string; errorCode?: string; statusCode: number }
> {
  try {
    const { data, response } = await client.POST('/assignments/{id}/end', {
      params: {
        path: { id: params.assignmentId },
      },
      body: {
        endedAt: params.endedAt,
        clientCommandId: params.clientCommandId,
      },
    });

    if (response.ok && data) {
      return { ok: true, assignment: data as Assignment };
    }

    const errorCode = (data as { error?: string } | undefined)?.error;
    return {
      ok: false,
      error: extractErrorMessage(data, 'Could not end assignment.'),
      errorCode,
      statusCode: response.status,
    };
  } catch {
    return {
      ok: false,
      error: 'Could not end assignment due to network or server error.',
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
          status: params?.status,
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

export async function getAssignmentHistory(
  client: Client<paths>,
  params?: QueryAssignmentHistoryParams,
): Promise<
  | { ok: true; history: PaginatedAssignmentHistory }
  | { ok: false; error: string; statusCode: number }
> {
  try {
    const { data, response } = await client.GET('/assignments/history', {
      params: {
        query: {
          employeeId: params?.employeeId,
          placementIdentityId: params?.placementIdentityId,
          floorId: params?.floorId,
          limit: params?.limit,
          offset: params?.offset,
        },
      },
    });

    if (response.ok && data) {
      return { ok: true, history: data as PaginatedAssignmentHistory };
    }

    return {
      ok: false,
      error: extractErrorMessage(data, 'Could not retrieve assignment history.'),
      statusCode: response.status,
    };
  } catch {
    return {
      ok: false,
      error: 'Could not retrieve assignment history due to network or server error.',
      statusCode: 500,
    };
  }
}
