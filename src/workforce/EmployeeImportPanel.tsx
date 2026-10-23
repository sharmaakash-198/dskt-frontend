import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { api } from '../api/client';
import {
  uploadWorkbookPreview,
  listImportRows,
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
                  className={`badge ${summary.status === 'READY' ? 'badge-ready' : 'badge-invalid'}`}
                >
                  {summary.status === 'READY' ? 'Ready for Review' : 'Invalid Rows Detected'}
                </span>
              </div>
            </div>

            <div className="preview-notice-banner">
              <strong>Notice:</strong> This is a staging preview. Domain records remain untouched.
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
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`row-${row.action.toLowerCase()} ${!row.isValid ? 'row-has-error' : ''}`}
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
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="table-footer-info">
            Showing {rows.length} of {rowsTotal} rows
          </p>
        </div>
      )}
    </section>
  );
}
