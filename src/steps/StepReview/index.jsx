// Wizard step 3 — final pre-flight review before submission.
// Conflict detection runs client-side against the existsSet returned by the validate API.
// Mode toggle: 'preview' dispatches a dry-run job; 'execute' creates real course reruns.
// The Submit button is disabled while any conflict row is unresolved.
import { useState, useMemo } from 'react';
import { Button, Alert, Badge, DataTable, Spinner } from '@openedx/paragon';

import { useCreateBatch } from '../../hooks';
import { buildBatchPayload } from '../../utils/batchPayload';
import { makeKey, detectConflict, isHardConflict } from '../../utils/courseKeys';
import OrgRoleSummary from './OrgRoleSummary';
import './index.scss';

const CONFLICT_MSG_MAP = {
  exists: 'Key already exists in the platform',
  dup:    'Duplicate key within this batch',
  self:   'Target key is identical to source',
  org:    'Organization not found in platform',
};

const conflictCls = ct => (ct === 'exists' ? ' sr-cell--exists' : ct ? ' sr-cell--conflict' : '');

export default function StepReview({ cfg, onBack, onSubmit, onBatchReady, onBatchFailed }) {
  const {
    rows = [], runId = '', sched = {}, certs = {},
    orgRosters = {}, removeOp = true, gating = {},
    fromMode = 'course', prog = null, newOrgs = [],
    courseDiscoveryEnabled = true, existsSet,
  } = cfg || {};

  const existsSetSafe = existsSet instanceof Set ? existsSet : new Set(existsSet || []);

  const dryRunEnabled = process.env.ENABLE_BULK_RERUN_DRY_RUN === 'true' || process.env.ENABLE_BULK_RERUN_DRY_RUN === true;

  const createBatch = useCreateBatch();

  const [mode,        setMode]        = useState('execute');
  const [busy,        setBusy]        = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const conflicts = rows.map((r, i) => detectConflict(r, rows, i, existsSetSafe));
  const nHardConf = conflicts.filter(isHardConflict).length;
  const nExistsConf = conflicts.filter(ct => ct === 'exists').length;
  const canGo = nHardConf === 0 && !busy;

  const orgs = [...new Set(rows.map(r => r.org))].sort((a, b) => a.localeCompare(b));
  const [openOrgs, setOpenOrgs] = useState(() => Object.fromEntries(orgs.map(o => [o, true])));

  const CERT_DISP_MAP = {
    early_no_info:   'Immediately upon passing',
    early_with_info: 'Immediately with course info',
    end:             'After course end date',
  };
  const certDisplay = CERT_DISP_MAP[certs.display] || certs.display;

  const GATING_LBL_MAP = {
    disabled: 'Disabled', copy: 'Copy from source',
    template: 'Apply template', custom: 'Custom map',
  };
  const gatingLabel = GATING_LBL_MAP[gating.mode] || gating.mode;

  const rosterFilled = Object.values(orgRosters).flat().filter(r => r.email);

  const execOptions = [
    {
      v: 'execute', icon: '▶',
      title: 'Execute reruns',
      desc: 'Creates course runs, applies settings' + (courseDiscoveryEnabled ? ', syncs Discovery, links programs' : ''),
    },
    {
      v: 'preview', icon: '🔍',
      title: 'Preview plan (dry-run)',
      desc: 'Validates all steps without creating or modifying any data',
    },
  ];

  // Column definitions are stable — cell renderers only access row.original.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reviewColumns = useMemo(() => [
    {
      id: 'indicator',
      Header: '',
      accessor: 'conflictType',
      disableSortBy: true,
      Cell: ({ row }) => {
        const ct = row.original.conflictType;
        return (
          <div className={`sr-cell sr-cell--indicator${conflictCls(ct)}`}>
            {isHardConflict(ct)
              ? <span className="sr-conflict-icon">🚫</span>
              : ct === 'exists'
                ? <span className="sr-conflict-icon">⚠️</span>
                : <span className="sr-ok-check">✓</span>}
          </div>
        );
      },
    },
    {
      Header: 'Course Name',
      accessor: 'name',
      disableSortBy: true,
      Cell: ({ row }) => (
        <div className={`sr-cell sr-cell--src${conflictCls(row.original.conflictType)}`}>
          {row.original.name}
        </div>
      ),
    },
    {
      Header: 'Src Org',
      accessor: 'srcOrg',
      disableSortBy: true,
      Cell: ({ row }) => (
        <div className={`sr-cell sr-cell--src-mono${conflictCls(row.original.conflictType)}`}>
          {row.original.srcOrg}
        </div>
      ),
    },
    {
      Header: 'Src Course #',
      accessor: 'srcNum',
      disableSortBy: true,
      Cell: ({ row }) => (
        <div className={`sr-cell sr-cell--src-mono${conflictCls(row.original.conflictType)}`}>
          {row.original.srcNum}
        </div>
      ),
    },
    {
      Header: 'Src Run',
      accessor: 'srcRun',
      disableSortBy: true,
      Cell: ({ row }) => (
        <div className={`sr-cell sr-cell--src-mono${conflictCls(row.original.conflictType)}`}>
          {row.original.srcRun}
        </div>
      ),
    },
    {
      Header: 'Target Org',
      accessor: 'org',
      disableSortBy: true,
      Cell: ({ row }) => (
        <div className={`sr-cell sr-cell--tgt-mono${conflictCls(row.original.conflictType)}`}>
          {row.original.org}
        </div>
      ),
    },
    {
      Header: 'Target Course #',
      accessor: 'num',
      disableSortBy: true,
      Cell: ({ row }) => (
        <div className={`sr-cell sr-cell--tgt-mono${conflictCls(row.original.conflictType)}`}>
          {row.original.num}
        </div>
      ),
    },
    {
      Header: 'Target Run',
      accessor: 'run',
      disableSortBy: true,
      Cell: ({ row }) => (
        <div className={`sr-cell sr-cell--tgt-mono${conflictCls(row.original.conflictType)}`}>
          {row.original.run}
        </div>
      ),
    },
  ], []);

  return (
    <div>
      {nHardConf > 0
        ? (
          <Alert variant="danger" className="mb-3 py-2">
            <strong className="sr-alert-title">{nHardConf + ' conflict' + (nHardConf !== 1 ? 's' : '') + ' - submission blocked'}</strong>
            <ul className="sr-conflict-list">
              {rows.map((r, i) => (
                isHardConflict(conflicts[i])
                  ? (
                    <li key={r.id}>
                      <code>{makeKey(r.org, r.num, r.run)}</code>
                      {' - '}
                      {CONFLICT_MSG_MAP[conflicts[i]]}
                    </li>
                  )
                  : null
              ))}
            </ul>
          </Alert>
        )
        : (
            <Alert variant="success" className="mb-3 py-2">
              <strong className="sr-alert-title--sm">All course keys verified - no conflicts detected</strong>
              Every target key checked against the platform. Ready to submit.
            </Alert>
          )}

      {!courseDiscoveryEnabled && (
        <Alert variant="warning" className="mb-3 py-2">
          <strong className="sr-alert-title--sm">Course Discovery is not enabled - phases 2 and 3 will be skipped</strong>
          This job will only execute Phase 1 (course creation).
        </Alert>
      )}

      {/* Execution mode — entire panel hidden when ENABLE_DRY_RUN is false */}
      {dryRunEnabled && (
        <div className="sr-exec-panel">
          <div className="sr-exec-panel-header">Execution mode</div>
          <div className="sr-exec-options">
            {execOptions.map(m => (
              <label
                key={m.v}
                className={`sr-exec-option${mode === m.v ? ' sr-exec-option--active' : ''}`}
              >
                <input
                  type="radio"
                  name="execmode"
                  value={m.v}
                  checked={mode === m.v}
                  onChange={() => setMode(m.v)}
                />
                <div>
                  <div className="sr-exec-option-title">{m.icon + ' ' + m.title}</div>
                  <div className="sr-exec-option-desc">{m.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Settings summary */}
      <div className="sr-settings-grid">
        <div className="sr-settings-card">
          <div className="sr-settings-card-header">Scheduling &amp; certificates</div>
          <div className="sr-settings-body">
            {[
              ['Course dates',  sched.start + ' to ' + sched.end],
              ['Enrollment',    sched.enrollStart + ' to ' + sched.enrollEnd],
              ['Pacing',        sched.pacing === 'instructor' ? 'Instructor-paced' : 'Self-paced'],
              ['Target run',    runId],
              ['Course mode',   (certs.mode || '').toUpperCase()],
              ['Cert display',  certDisplay],
              ['Student certs', certs.studentGenCert ? 'Enabled' : 'Disabled'],
            ].map(([k, v]) => (
              <div key={k} className="sr-settings-row">
                <span className="sr-settings-key">{k}</span>
                <span className={`sr-settings-val${k === 'Target run' ? ' sr-settings-val--mono' : ''}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="sr-settings-card">
          <div className="sr-settings-card-header">Team, gating &amp; job</div>
          <div className="sr-settings-body">
            {[
              ['Selection',          fromMode === 'course' ? 'By Individual Course' : fromMode],
              ['Total runs',         String(rows.length)],
              ['Organizations',      orgs.join(', ') || '-'],
              ['Team members',       rosterFilled.length ? (rosterFilled.length + ' from CAR') : 'None'],
              ['Remove provisioner', removeOp ? 'Yes' : 'No'],
              ['Lesson gating',      gatingLabel],
              ['Key conflicts',      nHardConf > 0 ? (nHardConf + ' conflict' + (nHardConf !== 1 ? 's' : '')) : nExistsConf > 0 ? (nExistsConf + ' existing') : 'None'],
            ].map(([k, v]) => (
              <div key={k} className="sr-settings-row">
                <span className="sr-settings-key">{k}</span>
                <span className={`sr-settings-val${k === 'Key conflicts' ? (nHardConf > 0 ? ' sr-settings-val--danger' : nExistsConf > 0 ? ' sr-settings-val--warn' : ' sr-settings-val--ok') : ''}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Course runs accordion */}
      <div className="sr-accordion">
        <div className="sr-accordion-header">
          <span className="sr-accordion-title">
            {rows.length + ' course run' + (rows.length !== 1 ? 's' : '') + ' across ' + orgs.length + ' org' + (orgs.length !== 1 ? 's' : '')}
          </span>
          <div className="sr-accordion-btns">
            <Button variant="tertiary" size="sm" onClick={() => setOpenOrgs(Object.fromEntries(orgs.map(o => [o, true])))}>Expand all</Button>
            <Button variant="tertiary" size="sm" onClick={() => setOpenOrgs(Object.fromEntries(orgs.map(o => [o, false])))}>Collapse all</Button>
          </div>
        </div>

        {orgs.map(orgCode => {
          const orgRows    = rows.map((r, i) => ({ ...r, i })).filter(r => r.org === orgCode);
          const orgErr     = orgRows.some(r => isHardConflict(conflicts[r.i]));
          const isOpen     = openOrgs[orgCode] !== false;
          const tableData  = orgRows.map(r => ({ ...r, conflictType: conflicts[r.i] }));

          return (
            <div key={orgCode} className="sr-org-section">
              <div
                onClick={() => setOpenOrgs(p => ({ ...p, [orgCode]: !isOpen }))}
                className={`sr-org-header${orgErr ? ' sr-org-header--error' : ''}`}
              >
                <div className="sr-org-dot">{orgErr ? '✕' : '✓'}</div>
                <span className="sr-org-code">{orgRows[0]?.orgName} ({orgCode})</span>
                <span className="sr-org-meta">{orgRows.length + ' course' + (orgRows.length !== 1 ? 's' : '')}</span>
                {orgErr && (
                  <Badge variant="danger" pill>conflict</Badge>
                )}
                <div className="sr-org-spacer" />
                <span className="sr-org-toggle">{isOpen ? '▲ collapse' : '▼ expand'}</span>
              </div>

              {isOpen && (
                <>
                  <div className="sr-runs-table-wrap">
                    <DataTable
                      columns={reviewColumns}
                      data={tableData}
                      itemCount={tableData.length}
                      initialTableOptions={{ getRowId: row => row.id }}
                    >
                      <DataTable.Table isStriped={false} />
                    </DataTable>
                  </div>
                  <OrgRoleSummary orgCode={orgCode} orgRosters={orgRosters} />
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit error */}
      {submitError && (
        <Alert variant="danger" className="mb-3 py-2">
          <strong className="sr-alert-title--sm">Submission failed</strong>
          {submitError}
        </Alert>
      )}

      {/* Bottom action bar */}
      <div className="sr-action-bar">
        <Button variant="outline-primary" onClick={onBack} disabled={busy}>Back to configure</Button>
        <div className="sr-action-right">
          {nHardConf > 0 && (
            <Button variant="tertiary" onClick={onBack} className="sr-fix-btn">
              Fix conflicts first
            </Button>
          )}
          <Button
            variant={mode === 'preview' ? 'outline-primary' : 'primary'}
            disabled={!canGo}
            onClick={() => {
              setBusy(true);
              setSubmitError(null);
              const payload = buildBatchPayload(cfg, mode === 'preview');
              // Navigate to the tracking page immediately so the user sees
              // the progress view right away. onSubmit returns a tempId that
              // identifies this job in global state until the real batchId arrives.
              const tempId = onSubmit(mode);
              createBatch.mutateAsync(payload)
                .then(result => {
                  onBatchReady?.(tempId, result?.batch_id ?? null);
                })
                .catch(err => {
                  // Component may already be unmounted here (we navigated away).
                  // Remove the phantom job entry and surface the error in the console.
                  onBatchFailed?.(tempId);
                  const httpStatus = err?.response?.status;
                  const d = err?.response?.data;
                  let msg;
                  if (httpStatus >= 500) {
                    msg = `Server error (${httpStatus}) — check the CMS logs for details.`;
                  } else if (typeof d === 'string' && !d.trimStart().startsWith('<')) {
                    msg = d;
                  } else if (d?.detail) {
                    msg = d.detail;
                  } else if (d?.error) {
                    msg = d.keys?.length
                      ? `${d.error}: ${d.keys.join(', ')}`
                      : d.error;
                  } else if (d && typeof d === 'object') {
                    msg = JSON.stringify(d);
                  } else {
                    msg = err?.message || 'Could not reach /api/bulk-rerun/batches/ — check backend connectivity.';
                  }
                  // eslint-disable-next-line no-console
                  console.error('[BulkRerun] Batch creation failed after navigation:', msg);
                });
            }}
          >
            {busy
              ? (
                <>
                  <Spinner animation="border" size="sm" className="sr-spinner" />
                  {mode === 'preview' ? 'Running preview...' : 'Submitting...'}
                </>
              )
              : (mode === 'preview' ? '🔍 Preview plan' : '▶ Execute reruns')}
          </Button>
        </div>
      </div>
    </div>
  );
}
