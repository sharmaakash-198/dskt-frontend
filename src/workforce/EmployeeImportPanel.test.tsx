import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeeImportPanel } from './EmployeeImportPanel';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    GET: (...args: unknown[]) => getMock(...args),
    POST: (...args: unknown[]) => postMock(...args),
  },
}));

const mockSummaryReady = {
  id: '33333333-3333-3333-3333-333333333333',
  originalFilename: 'synthetic_employees.xlsx',
  fileSha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
  status: 'READY' as const,
  totalRows: 3,
  validRows: 3,
  invalidRows: 0,
  createCount: 2,
  updateCount: 1,
  unchangedCount: 0,
  invalidCount: 0,
  createdAt: '2026-10-22T20:00:00.000Z',
  appliedAt: null,
};

const mockSummaryInvalid = {
  id: '44444444-4444-4444-4444-444444444444',
  originalFilename: 'invalid_employees.xlsx',
  fileSha256: 'b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef01',
  status: 'INVALID' as const,
  totalRows: 3,
  validRows: 1,
  invalidRows: 2,
  createCount: 1,
  updateCount: 0,
  unchangedCount: 0,
  invalidCount: 2,
  createdAt: '2026-10-22T20:00:00.000Z',
  appliedAt: null,
};

const mockRows = [
  {
    id: 'row-1',
    rowNumber: 2,
    action: 'CREATE' as const,
    isValid: true,
    employeeId: 'EMP-001',
    fullName: 'Alice Smith',
    email: 'alice@example.com',
    employmentStatus: 'ACTIVE',
    managerEmployeeId: null,
    teamCode: 'ENG',
    teamName: 'Engineering',
    departmentCode: 'TECH',
    departmentName: 'Technology',
    preferredSiteCode: 'LON',
    jobTitle: 'Software Engineer',
    active: true,
    errors: [],
  },
  {
    id: 'row-2',
    rowNumber: 3,
    action: 'INVALID' as const,
    isValid: false,
    employeeId: 'EMP-002',
    fullName: 'Bob Jones',
    email: 'bob@example.com',
    employmentStatus: 'ACTIVE',
    managerEmployeeId: 'EMP-001',
    teamCode: 'ENG',
    teamName: 'Engineering',
    departmentCode: 'TECH',
    departmentName: 'Technology',
    preferredSiteCode: 'LON',
    jobTitle: 'Senior Engineer',
    active: true,
    errors: [
      {
        columnName: 'Manager Employee ID',
        errorCode: 'CYCLIC_MANAGER_REFERENCE',
        message: "Manager relationship forms a cycle involving Employee ID 'EMP-002'.",
      },
    ],
  },
  {
    id: 'row-3',
    rowNumber: 4,
    action: 'INVALID' as const,
    isValid: false,
    employeeId: 'EMP-002',
    fullName: 'Carol Duplicate',
    email: 'carol@example.com',
    employmentStatus: 'ACTIVE',
    managerEmployeeId: null,
    teamCode: 'OPS',
    teamName: 'Operations',
    departmentCode: 'CORP',
    departmentName: 'Corporate',
    preferredSiteCode: 'LON',
    jobTitle: 'Operations Lead',
    active: true,
    errors: [
      {
        columnName: 'Employee ID',
        errorCode: 'DUPLICATE_EMPLOYEE_ID',
        message: "Duplicate Employee ID 'EMP-002' within the workbook.",
      },
    ],
  },
];

describe('EmployeeImportPanel', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders permission denied message when user cannot import', () => {
    render(<EmployeeImportPanel canImport={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only Workplace Planners can upload and preview employee workbooks.',
    );
  });

  it('renders upload form with file input and disclaimer initially', () => {
    render(<EmployeeImportPanel canImport={true} />);
    expect(screen.getByText('Employee Directory Import')).toBeInTheDocument();
    expect(screen.getByLabelText(/Select Excel Workbook/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No Employee, Department, or Team domain records are altered/i),
    ).toBeInTheDocument();
    const uploadBtn = screen.getByRole('button', { name: /Upload & Preview/i });
    expect(uploadBtn).toBeDisabled();
  });

  it('handles accessible error filtering, row navigation, and denies confirmation for invalid workbooks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSummaryInvalid),
    });
    vi.stubGlobal('fetch', fetchMock);

    getMock.mockResolvedValue({
      data: {
        importId: mockSummaryInvalid.id,
        totalRows: 3,
        rows: mockRows,
      },
      response: { ok: true, status: 200 },
    });

    render(<EmployeeImportPanel canImport={true} />);

    // Select file and upload
    const file = new File(['fake-xlsx'], 'invalid_employees.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileInput = screen.getByLabelText(/Select Excel Workbook/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /Upload & Preview/i }));

    // Wait for summary to render
    await waitFor(() => {
      expect(screen.getByText('Invalid Rows Detected')).toBeInTheDocument();
    });

    // Verify blocking error alert callout
    const alerts = screen.getAllByRole('alert');
    expect(alerts[0]).toHaveTextContent(
      /2 invalid row\(s\) prevent import confirmation/i,
    );

    // Verify row navigation toolbar renders with status
    await waitFor(() => {
      const navToolbar = screen.getByLabelText('Row navigation');
      expect(navToolbar).toHaveTextContent(/Row 2:.*Alice Smith/);
    });

    const nextRowBtn = screen.getByRole('button', { name: 'Next row' });
    fireEvent.click(nextRowBtn);

    // Verify navigated to row 3 (invalid)
    const navToolbar = screen.getByLabelText('Row navigation');
    expect(navToolbar).toHaveTextContent(/Row 3:.*Bob Jones/);
    expect(navToolbar).toHaveTextContent(/1 error\(s\)/);

    // Test "Next invalid row" button
    const nextInvalidBtn = screen.getByRole('button', { name: 'Next invalid row' });
    fireEvent.click(nextInvalidBtn);
    expect(navToolbar).toHaveTextContent(/Row 4:.*Carol Duplicate/);

    // Verify filter tabs make invalid rows discoverable
    const invalidTab = screen.getByRole('tab', { name: /Invalid \(2\)/i });
    expect(invalidTab).toBeInTheDocument();
    fireEvent.click(invalidTab);

    // Verify confirmation is denied
    expect(screen.getByText(/An import with blocking errors cannot be confirmed/i)).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: 'Confirm Import' });
    expect(confirmBtn).toBeDisabled();
    expect(confirmBtn).toHaveAttribute('aria-disabled', 'true');
  });

  it('allows confirmation when all rows are valid and import is ready', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSummaryReady),
    });
    vi.stubGlobal('fetch', fetchMock);

    getMock.mockResolvedValue({
      data: {
        importId: mockSummaryReady.id,
        totalRows: 1,
        rows: [mockRows[0]!],
      },
      response: { ok: true, status: 200 },
    });

    postMock.mockResolvedValue({
      data: {
        ...mockSummaryReady,
        status: 'APPLIED',
        appliedAt: '2026-10-22T20:05:00.000Z',
      },
      response: { ok: true, status: 200 },
    });

    render(<EmployeeImportPanel canImport={true} />);

    const file = new File(['fake-xlsx'], 'synthetic_employees.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileInput = screen.getByLabelText(/Select Excel Workbook/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /Upload & Preview/i }));

    await waitFor(() => {
      expect(screen.getByText('Ready for Review')).toBeInTheDocument();
    });

    expect(screen.getByText(/All rows are valid. You can now confirm this import/i)).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: 'Confirm Import' });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText(/Import confirmed successfully/i)).toBeInTheDocument();
      expect(screen.getByText('Applied')).toBeInTheDocument();
      expect(screen.getByText(/Import applied: All proposed employee changes have been applied/i)).toBeInTheDocument();
    });

    expect(postMock).toHaveBeenCalledWith(
      '/employee-imports/{importId}/confirm',
      expect.objectContaining({
        params: { path: { importId: mockSummaryReady.id } },
        body: { expectedFileSha256: mockSummaryReady.fileSha256 },
      }),
    );

    const appliedBtn = screen.getByRole('button', { name: 'Import Applied' });
    expect(appliedBtn).toBeDisabled();
  });

  it('displays error alert when confirmation is rejected (e.g. stale preview)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSummaryReady),
    });
    vi.stubGlobal('fetch', fetchMock);

    getMock.mockResolvedValue({
      data: {
        importId: mockSummaryReady.id,
        totalRows: 1,
        rows: [mockRows[0]!],
      },
      response: { ok: true, status: 200 },
    });

    postMock.mockResolvedValue({
      data: {
        error: 'stale_preview',
        message: 'Preview has changed or is stale. Please generate a fresh preview before confirming.',
      },
      response: { ok: false, status: 400 },
    });

    render(<EmployeeImportPanel canImport={true} />);

    const file = new File(['fake-xlsx'], 'synthetic_employees.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileInput = screen.getByLabelText(/Select Excel Workbook/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /Upload & Preview/i }));

    await waitFor(() => {
      expect(screen.getByText('Ready for Review')).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: 'Confirm Import' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Preview has changed or is stale. Please generate a fresh preview before confirming.',
      );
    });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('displays error alert when upload is rejected', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({
          error: 'macro_not_permitted',
          message: 'Macro-enabled workbooks (.xlsm or containing macros) are rejected.',
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<EmployeeImportPanel canImport={true} />);

    const file = new File(['fake-macro-content'], 'dangerous.xlsm', {
      type: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    });
    const fileInput = screen.getByLabelText(/Select Excel Workbook/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /Upload & Preview/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Macro-enabled workbooks (.xlsm or containing macros) are rejected.',
      );
    });
  });
});
