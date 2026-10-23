import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeeImportPanel } from './EmployeeImportPanel';

const getMock = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    GET: (...args: unknown[]) => getMock(...args),
  },
}));

const mockSummary = {
  id: '33333333-3333-3333-3333-333333333333',
  originalFilename: 'synthetic_employees.xlsx',
  fileSha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
  status: 'READY' as const,
  totalRows: 4,
  validRows: 4,
  invalidRows: 0,
  createCount: 2,
  updateCount: 1,
  unchangedCount: 1,
  invalidCount: 0,
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
    action: 'UPDATE' as const,
    isValid: true,
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
    errors: [],
  },
  {
    id: 'row-3',
    rowNumber: 4,
    action: 'UNCHANGED' as const,
    isValid: true,
    employeeId: 'EMP-003',
    fullName: 'Carol Danvers',
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
    errors: [],
  },
];

describe('EmployeeImportPanel', () => {
  beforeEach(() => {
    getMock.mockReset();
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

  it('handles file selection, upload, and displays summary and preview table', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSummary),
    });
    vi.stubGlobal('fetch', fetchMock);

    getMock.mockResolvedValue({
      data: {
        importId: mockSummary.id,
        totalRows: 3,
        rows: mockRows,
      },
      response: { ok: true, status: 200 },
    });

    render(<EmployeeImportPanel canImport={true} />);

    // Select synthetic file
    const file = new File(['fake-xlsx-content'], 'synthetic_employees.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileInput = screen.getByLabelText(/Select Excel Workbook/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Submit form
    const uploadBtn = screen.getByRole('button', { name: /Upload & Preview/i });
    expect(uploadBtn).not.toBeDisabled();
    fireEvent.click(uploadBtn);

    // Wait for summary to render
    await waitFor(() => {
      expect(screen.getByText('synthetic_employees.xlsx')).toBeInTheDocument();
    });

    // Verify summary metrics
    expect(screen.getByText('Ready for Review')).toBeInTheDocument();
    expect(screen.getByText('Proposed Creates')).toBeInTheDocument();
    expect(screen.getByText('Proposed Updates')).toBeInTheDocument();
    expect(
      screen.getByText(/This is a staging preview. Domain records remain untouched./i),
    ).toBeInTheDocument();


    // Verify table rendered with rows
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
      expect(screen.getByText('Carol Danvers')).toBeInTheDocument();
    });

    // Test filter tabs
    const createsTab = screen.getByRole('tab', { name: /Creates/i });
    expect(createsTab).toBeInTheDocument();
    fireEvent.click(createsTab);

    // Reset workflow
    const resetBtn = screen.getByRole('button', { name: /Upload another workbook/i });
    fireEvent.click(resetBtn);

    expect(screen.getByLabelText(/Select Excel Workbook/i)).toBeInTheDocument();
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
