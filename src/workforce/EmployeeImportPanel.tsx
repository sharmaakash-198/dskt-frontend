import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import { api } from '../api/client';
import {
  uploadWorkbookPreview,
  listImportRows,
  confirmEmployeeImport,
  type EmployeeImportSummary,
  type EmployeeImportRow,
} from './api';

export type EmployeeImportPanelProps = {
  canImport?: boolean;
};

type FilterAction = 'ALL' | 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'INVALID';

export function EmployeeImportPanel({ canImport = true }: EmployeeImportPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<EmployeeImportSummary | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterAction>('ALL');
  const [rows, setRows] = useState<EmployeeImportRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsTotal, setRowsTotal] = useState(0);

  // Row navigation state
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  // Confirmation state
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState(false);

  // Load preview rows whenever summary or filter changes
  useEffect(() => {
    if (!summary) {
      return;
    }

    let cancelled = false;

    void listImportRows(api, summary.id, {
      action: activeFilter === 'ALL' ? undefined : activeFilter,
      limit: 100,
      offset: 0,
    }).then((result) => {
      if (cancelled) return;
      setLoadingRows(false);
      if (result.ok) {
        setRows(result.data.rows);
        setRowsTotal(result.data.totalRows);
        setSelectedRowIndex(result.data.rows.length > 0 ? 0 : null);
      } else {
        setErrorMessage(result.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [summary, activeFilter]);

  function changeFilter(filter: FilterAction) {
    setActiveFilter(filter);
    setLoadingRows(true);
    setSelectedRowIndex(null);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setErrorMessage(null);
    }
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage('Please select an Excel workbook (.xlsx) to upload.');
      return;
    }

    setUploading(true);
    setErrorMessage(null);
    setConfirmError(null);
    setConfirmSuccess(false);

    const result = await uploadWorkbookPreview(selectedFile);
    setUploading(false);

    if (result.ok) {
      setSummary(result.summary);
      setActiveFilter('ALL');
    } else {
      setErrorMessage(result.error);
    }
  }

  function handleReset() {
    setSummary(null);
    setSelectedFile(null);
    setErrorMessage(null);
    setActiveFilter('ALL');
    setRows([]);
    setSelectedRowIndex(null);
    setConfirmError(null);
    setConfirmSuccess(false);
  }

  function selectRow(index: number) {
    if (index >= 0 && index < rows.length) {
      setSelectedRowIndex(index);
      const el = rowRefs.current.get(index);
      if (el) {
        el.focus();
      }
    }
  }

  function handlePrevRow() {
    if (selectedRowIndex !== null && selectedRowIndex > 0) {
      selectRow(selectedRowIndex - 1);
    }
  }

  function handleNextRow() {
    if (selectedRowIndex !== null && selectedRowIndex < rows.length - 1) {
      selectRow(selectedRowIndex + 1);
    }
  }

  function handleNextInvalidRow() {
    const startIndex = selectedRowIndex !== null ? selectedRowIndex + 1 : 0;
    const nextIdx = rows.findIndex((r, idx) => idx >= startIndex && !r.isValid);
    if (nextIdx !== -1) {
      selectRow(nextIdx);
    } else {
      // Wrap around to start if any
      const wrapIdx = rows.findIndex((r) => !r.isValid);
      if (wrapIdx !== -1) {
        selectRow(wrapIdx);
      }
    }
  }

  async function handleConfirm() {
    if (!summary) return;
    if (summary.invalidCount > 0 || summary.status === 'INVALID') {
      setConfirmError('An import with blocking errors cannot be confirmed. Resolve all diagnostics before confirmation.');
      return;
    }

    setConfirming(true);
    setConfirmError(null);

    const result = await confirmEmployeeImport(api, summary.id, {
      expectedFileSha256: summary.fileSha256,
    });
    setConfirming(false);

    if (result.ok) {
      setSummary(result.summary);
      setConfirmSuccess(true);
    } else {
      setConfirmError(result.error);
    }
  }

  if (!canImport) {
    return (
      <section className="session-card" aria-label="Employee workbook import">
        <h2>Employee Directory Import</h2>
        <p className="error-alert" role="alert">
          Only Workplace Planners can upload and preview employee workbooks.
        </p>
      </section>
    );
  }

  const selectedRow = selectedRowIndex !== null ? rows[selectedRowIndex] : null;
  const hasInvalidRowsInView = rows.some((r) => !r.isValid);

  return (
    <section className="session-card" aria-label="Employee workbook import">
      <div className="section-header">
        <div>
          <h2>Employee Directory Import</h2>
          <p className="lede">
            Upload a bounded Excel workbook (.xlsx) to inspect normalized employee changes before
            domain data is altered.
          </p>
        </div>
        {summary && (
          <button type="button" className="secondary-button" onClick={handleReset}>
            Upload another workbook
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="error-alert" role="alert">
          {errorMessage}
        </div>
      )}

      {/* Upload Form (when no summary is active) */}
      {!summary && (
        <form onSubmit={handleUpload} className="import-upload-form">
          <div className="form-group">
            <label htmlFor="workbook-file">Select Excel Workbook (.xlsx)</label>
            <input
              id="workbook-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileChange}
              disabled={uploading}
              aria-describedby="file-help-text"
            />
            <p id="file-help-text" className="help-text">
              Maximum file size: 5 MB. Supported formats: .xlsx (macro workbooks are rejected).
              Required columns: <strong>Employee ID</strong>, <strong>Full Name</strong>,{' '}
              <strong>Employment Status</strong>.
            </p>
          </div>

          <div className="preview-disclaimer">
            <strong>Preview only:</strong> Uploading generates staging rows and summary counts. No
            Employee, Department, or Team domain records are altered before confirmation.
          </div>

          <button
            type="submit"
            className="primary-button"
            disabled={!selectedFile || uploading}
          >
            {uploading ? 'Analyzing workbook...' : 'Upload & Preview'}
          </button>
        </form>
      )}

      {/* Preview View (when summary is loaded) */}
      {summary && (
        <div className="import-preview-view">
          <div className="preview-metadata-card">
            <div className="metadata-row">
              <div>
                <span className="label">File:</span>
                <span className="value mono">{summary.originalFilename}</span>
              </div>
              <div>
                <span className="label">SHA-256:</span>
                <span className="value mono" title={summary.fileSha256}>
                  {summary.fileSha256.substring(0, 16)}...
                </span>
              </div>
              <div>
                <span className="label">Status:</span>
                <span
                  className={`badge ${
                    summary.status === 'APPLIED'
                      ? 'badge-applied badge-success'
                      : summary.status === 'READY'
                        ? 'badge-ready'
                        : summary.status === 'FAILED'
                          ? 'badge-failed'
                          : 'badge-invalid'
                  }`}
                >
                  {summary.status === 'APPLIED'
                    ? 'Applied'
                    : summary.status === 'READY'
                      ? 'Ready for Review'
                      : summary.status === 'FAILED'
                        ? 'Failed'
                        : 'Invalid Rows Detected'}
                </span>
              </div>
            </div>

            <div className="preview-notice-banner">
              <strong>Notice:</strong>{' '}
              {summary.status === 'APPLIED' || confirmSuccess
                ? 'Import applied: All proposed employee changes have been applied to the employee directory.'
                : 'This is a staging preview. Domain records remain untouched until confirmed.'}
            </div>
          </div>

          {/* Metric Summary Counters */}
          <div className="summary-metrics-grid" aria-label="Import summary counts">
            <div className="metric-card">
              <span className="metric-label">Total Rows</span>
              <span className="metric-value">{summary.totalRows}</span>
            </div>
            <div className="metric-card metric-create">
              <span className="metric-label">Proposed Creates</span>
              <span className="metric-value">{summary.createCount}</span>
            </div>
            <div className="metric-card metric-update">
              <span className="metric-label">Proposed Updates</span>
              <span className="metric-value">{summary.updateCount}</span>
            </div>
            <div className="metric-card metric-unchanged">
              <span className="metric-label">Unchanged</span>
              <span className="metric-value">{summary.unchangedCount}</span>
            </div>
            <div className="metric-card metric-invalid">
              <span className="metric-label">Invalid</span>
              <span className="metric-value">{summary.invalidCount}</span>
            </div>
          </div>

          {/* Diagnostics Callout if Invalid Rows Detected */}
          {summary.invalidCount > 0 && (
            <div className="validation-error-callout error-alert" role="alert">
              <div>
                <strong>Blocking errors detected:</strong> {summary.invalidCount} invalid row(s)
                prevent import confirmation. All blocking errors must be resolved before changes can
                be applied.
              </div>
              <button
                type="button"
                className="secondary-button mt-2"
                onClick={() => changeFilter('INVALID')}
              >
                Filter to invalid rows ({summary.invalidCount})
              </button>
            </div>
          )}

          {/* Filter Tabs */}
          <div className="filter-tabs" role="tablist" aria-label="Filter preview rows by action">
            <button
              type="button"
              role="tab"
              aria-selected={activeFilter === 'ALL'}
              className={`tab-btn ${activeFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => changeFilter('ALL')}
            >
              All ({summary.totalRows})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeFilter === 'CREATE'}
              className={`tab-btn ${activeFilter === 'CREATE' ? 'active' : ''}`}
              onClick={() => changeFilter('CREATE')}
            >
              Creates ({summary.createCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeFilter === 'UPDATE'}
              className={`tab-btn ${activeFilter === 'UPDATE' ? 'active' : ''}`}
              onClick={() => changeFilter('UPDATE')}
            >
              Updates ({summary.updateCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeFilter === 'UNCHANGED'}
              className={`tab-btn ${activeFilter === 'UNCHANGED' ? 'active' : ''}`}
              onClick={() => changeFilter('UNCHANGED')}
            >
              Unchanged ({summary.unchangedCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeFilter === 'INVALID'}
              className={`tab-btn ${activeFilter === 'INVALID' ? 'active' : ''}`}
              onClick={() => changeFilter('INVALID')}
            >
              Invalid ({summary.invalidCount})
            </button>
          </div>

          {/* Accessible Row Navigation Toolbar */}
          {rows.length > 0 && (
            <div className="row-navigation-toolbar" aria-label="Row navigation">
              <div className="navigation-status mono" aria-live="polite">
                {selectedRow ? (
                  <span>
                    Row {selectedRow.rowNumber}:{' '}
                    <strong>{selectedRow.fullName ?? selectedRow.employeeId ?? 'Row'}</strong> [
                    {selectedRow.action}]
                    {selectedRow.errors.length > 0 && ` — ${selectedRow.errors.length} error(s)`}
                  </span>
                ) : (
                  <span>No row selected</span>
                )}
              </div>
              <div className="nav-buttons-group">
                <button
                  type="button"
                  className="secondary-button btn-sm"
                  aria-label="Previous row"
                  disabled={selectedRowIndex === null || selectedRowIndex <= 0}
                  onClick={handlePrevRow}
                >
                  Previous row
                </button>
                <button
                  type="button"
                  className="secondary-button btn-sm"
                  aria-label="Next row"
                  disabled={selectedRowIndex === null || selectedRowIndex >= rows.length - 1}
                  onClick={handleNextRow}
                >
                  Next row
                </button>
                <button
                  type="button"
                  className="secondary-button btn-sm"
                  aria-label="Next invalid row"
                  disabled={!hasInvalidRowsInView}
                  onClick={handleNextInvalidRow}
                >
                  Next invalid row
                </button>
              </div>
            </div>
          )}

          {/* Rows Table */}
          {loadingRows ? (
            <p className="loading-state">Loading staging rows...</p>
          ) : rows.length === 0 ? (
            <p className="empty-state">No rows found matching the selected filter.</p>
          ) : (
            <div className="table-container" tabIndex={0} aria-label="Normalized staging rows">
              <table className="staging-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Action</th>
                    <th>Employee ID</th>
                    <th>Full Name</th>
                    <th>Status</th>
                    <th>Email</th>
                    <th>Job Title</th>
                    <th>Manager ID</th>
                    <th>Team</th>
                    <th>Dept</th>
                    <th>Site</th>
                    <th>Active</th>
                    <th>Diagnostics</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const isSelected = selectedRowIndex === index;
                    return (
                      <tr
                        key={row.id}
                        ref={(el) => {
                          if (el) rowRefs.current.set(index, el);
                          else rowRefs.current.delete(index);
                        }}
                        tabIndex={isSelected ? 0 : -1}
                        aria-current={isSelected ? 'true' : undefined}
                        onClick={() => selectRow(index)}
                        className={`row-${row.action.toLowerCase()} ${!row.isValid ? 'row-has-error' : ''} ${isSelected ? 'row-selected' : ''}`}
                      >
                        <td className="mono">{row.rowNumber}</td>
                        <td>
                          <span className={`action-tag action-${row.action.toLowerCase()}`}>
                            {row.action}
                          </span>
                        </td>
                        <td className="mono font-semibold">{row.employeeId ?? '—'}</td>
                        <td>{row.fullName ?? '—'}</td>
                        <td>{row.employmentStatus ?? '—'}</td>
                        <td>{row.email ?? '—'}</td>
                        <td>{row.jobTitle ?? '—'}</td>
                        <td className="mono">{row.managerEmployeeId ?? '—'}</td>
                        <td>{row.teamCode ?? '—'}</td>
                        <td>{row.departmentCode ?? '—'}</td>
                        <td className="mono">{row.preferredSiteCode ?? '—'}</td>
                        <td>{row.active ? 'Yes' : 'No'}</td>
                        <td>
                          {row.errors.length > 0 ? (
                            <ul className="row-errors-list">
                              {row.errors.map((err, idx) => (
                                <li key={idx} className="error-item">
                                  {err.columnName && <strong>[{err.columnName}] </strong>}
                                  <span>{err.message}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="valid-pill">Valid</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="table-footer-info">
            Showing {rows.length} of {rowsTotal} rows
          </p>

          {/* Confirmation Section & Denial */}
          <div className="confirmation-card mt-4 p-4 border rounded">
            <h3>Import Confirmation</h3>
            {summary.status === 'APPLIED' || confirmSuccess ? (
              <p className="confirmation-applied-note">
                Import has been applied. All proposed employee changes have been atomically committed.
              </p>
            ) : summary.invalidCount > 0 ? (
              <p className="confirmation-denied-note" role="alert">
                An import with blocking errors cannot be confirmed. Resolve all diagnostics before
                confirmation.
              </p>
            ) : (
              <p className="confirmation-ready-note">
                All rows are valid. You can now confirm this import to apply proposed changes atomically.
              </p>
            )}

            {confirmError && (
              <div className="error-alert mb-2" role="alert">
                {confirmError}
              </div>
            )}

            {(confirmSuccess || summary.status === 'APPLIED') && (
              <div className="success-alert mb-2" role="status">
                Import confirmed successfully. All proposed employee changes have been applied.
                {summary.appliedAt && (
                  <span className="applied-time d-block mt-1">
                    {' '}Applied at: {new Date(summary.appliedAt).toLocaleString()}
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              className="primary-button"
              disabled={summary.invalidCount > 0 || confirming || confirmSuccess || summary.status === 'APPLIED'}
              aria-disabled={summary.invalidCount > 0 || summary.status === 'APPLIED' || confirmSuccess}
              onClick={handleConfirm}
            >
              {confirming
                ? 'Confirming import...'
                : summary.status === 'APPLIED' || confirmSuccess
                  ? 'Import Applied'
                  : 'Confirm Import'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
