import type { Client } from 'openapi-fetch';
import type { paths } from '../api/schema';

export type EmployeeImportSummary = {
  id: string;
  originalFilename: string;
  fileSha256: string;
  status: 'VALIDATING' | 'INVALID' | 'READY' | 'APPLYING' | 'APPLIED' | 'FAILED';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createCount: number;
  updateCount: number;
  unchangedCount: number;
  invalidCount: number;
  createdAt: string;
  appliedAt: string | null;
};

export type RowError = {
  columnName: string | null;
  errorCode: string;
  message: string;
};

export type EmployeeImportRow = {
  id: string;
  rowNumber: number;
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'INVALID';
  isValid: boolean;
  employeeId: string | null;
  fullName: string | null;
  email: string | null;
  employmentStatus: string | null;
  managerEmployeeId: string | null;
  teamCode: string | null;
  teamName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  preferredSiteCode: string | null;
  jobTitle: string | null;
  active: boolean | null;
  errors: RowError[];
};

export type EmployeeImportRowsResponse = {
  importId: string;
  totalRows: number;
  rows: EmployeeImportRow[];
};

const ERROR_COPY: Record<string, string> = {
  unsupported_file_format: 'Only bounded .xlsx workbooks are supported.',
  macro_not_permitted: 'Macro-enabled workbooks (.xlsm or containing macros) are rejected.',
  file_too_large: 'Workbook exceeds maximum limit of 5 MB.',
  missing_required_headers: 'Workbook must contain required columns: Employee ID, Full Name, and Employment Status.',
  invalid_workbook: 'Unable to parse workbook. The file may be corrupted.',
  empty_worksheet: 'Worksheet contains no data rows.',
  too_many_rows: 'Workbook exceeds maximum limit of 5,000 rows.',
  missing_file: 'Please choose an Excel workbook to upload.',
  forbidden: 'Only Workplace Planners can upload and preview employee workbooks.',
  unauthorized: 'Your session has expired. Please sign in again.',
  not_found: 'Employee import preview was not found.',
  cannot_confirm_invalid_import: 'An import with blocking errors cannot be confirmed.',
  import_not_ready: 'Import is not in a ready state for confirmation.',
  already_applied: 'Import has already been applied.',
  stale_preview: 'Preview has changed or is stale. Please generate a fresh preview before confirming.',
};

export function workforceErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    if ('message' in data && typeof data.message === 'string' && data.message.length > 0) {
      return data.message;
    }
    if ('error' in data && typeof data.error === 'string') {
      return ERROR_COPY[data.error] ?? fallback;
    }
  }
  return fallback;
}

export async function uploadWorkbookPreview(
  file: File,
  baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
): Promise<{ ok: true; summary: EmployeeImportSummary } | { ok: false; error: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file, file.name);

    const response = await fetch(`${baseUrl}/employee-imports/preview`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    const data = (await response.json().catch(() => null)) as unknown;
    if (response.ok && data && typeof data === 'object' && 'id' in data) {
      return { ok: true, summary: data as EmployeeImportSummary };
    }
    return { ok: false, error: workforceErrorMessage(data, 'Could not generate preview.') };
  } catch {
    return { ok: false, error: 'Could not upload workbook. Network or server error.' };
  }
}

export async function getEmployeeImport(
  client: Client<paths>,
  importId: string,
): Promise<{ ok: true; summary: EmployeeImportSummary } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.GET('/employee-imports/{importId}', {
      params: { path: { importId } },
    });
    if (response.ok && data) {
      return { ok: true, summary: data as EmployeeImportSummary };
    }
    return { ok: false, error: workforceErrorMessage(data, 'Could not retrieve import preview.') };
  } catch {
    return { ok: false, error: 'Could not retrieve import preview.' };
  }
}

export async function listImportRows(
  client: Client<paths>,
  importId: string,
  filter?: {
    action?: 'ALL' | 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'INVALID';
    limit?: number;
    offset?: number;
  },
): Promise<{ ok: true; data: EmployeeImportRowsResponse } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.GET('/employee-imports/{importId}/rows', {
      params: {
        path: { importId },
        query: {
          action: filter?.action,
          limit: filter?.limit,
          offset: filter?.offset,
        },
      },
    });
    if (response.ok && data) {
      return { ok: true, data: data as EmployeeImportRowsResponse };
    }
    return { ok: false, error: workforceErrorMessage(data, 'Could not list preview rows.') };
  } catch {
    return { ok: false, error: 'Could not list preview rows.' };
  }
}

export async function confirmEmployeeImport(
  client: Client<paths>,
  importId: string,
  options?: {
    idempotencyKey?: string;
    expectedFileSha256?: string;
  },
): Promise<{ ok: true; summary: EmployeeImportSummary } | { ok: false; error: string }> {
  try {
    const { data, response } = await client.POST('/employee-imports/{importId}/confirm', {
      params: { path: { importId } },
      body: {
        idempotencyKey: options?.idempotencyKey,
        expectedFileSha256: options?.expectedFileSha256,
      },
    });
    if (response.ok && data) {
      return { ok: true, summary: data as EmployeeImportSummary };
    }
    return { ok: false, error: workforceErrorMessage(data, 'Could not confirm import.') };
  } catch {
    return { ok: false, error: 'Could not confirm import. Network or server error.' };
  }
}
