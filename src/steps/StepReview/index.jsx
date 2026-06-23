// Wizard step 3 — final pre-flight review before submission.
// Conflict detection runs client-side against the existsSet returned by the validate API.
// Mode toggle: 'preview' dispatches a dry-run job; 'execute' creates real course reruns.
// The Submit button is disabled while any conflict row is unresolved.
import { useState } from 'react';
import { Button, Alert, Spinner } from '@openedx/paragon';
import PropTypes from 'prop-types';

import { useCreateBatch } from '../../hooks';
import { buildBatchPayload } from '../../utils/batchPayload';
import { detectConflict, isHardConflict } from '../../utils/courseKeys';
import ConflictAlerts from './ConflictAlerts';
import SettingsSummaryGrid from './SettingsSummaryGrid';
import ReviewAccordion from './ReviewAccordion';
import useReviewColumns from './useReviewColumns';
import './index.scss';

const StepReview = ({
  cfg, onBack, onSubmit, onBatchReady, onBatchFailed,
}) => {
  const {
    rows = [], runId = '', sched = {}, certs = {},
    orgRosters = {}, removeOp = true, gating = {},
    fromMode = 'course',
    courseDiscoveryEnabled = true, existsSet,
  } = cfg || {};

  const existsSetSafe = existsSet instanceof Set ? existsSet : new Set(existsSet || []);

  const dryRunEnabled = process.env.ENABLE_BULK_RERUN_DRY_RUN === 'true'
    || process.env.ENABLE_BULK_RERUN_DRY_RUN === true;

  const createBatch = useCreateBatch();

  const [mode, setMode] = useState('execute');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const conflicts = rows.map((r, i) => detectConflict(r, rows, i, existsSetSafe));
  const nHardConf = conflicts.filter(isHardConflict).length;
  const nExistsConf = conflicts.filter(ct => ct === 'exists').length;
  const canGo = nHardConf === 0 && !busy;

  const orgs = [...new Set(rows.map(r => r.org))].sort((a, b) => a.localeCompare(b));
  const [openOrgs, setOpenOrgs] = useState(() => Object.fromEntries(orgs.map(o => [o, true])));

  const reviewColumns = useReviewColumns();

  const execOptions = [
    {
      v: 'execute',
      icon: '▶',
      title: 'Execute reruns',
      desc: `Creates course runs, applies settings${courseDiscoveryEnabled ? ', syncs Discovery, links programs' : ''}`,
    },
    {
      v: 'preview',
      icon: '🔍',
      title: 'Preview plan (dry-run)',
      desc: 'Validates all steps without creating or modifying any data',
    },
  ];

  const handleSubmit = () => {
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
          msg = d.keys?.length ? `${d.error}: ${d.keys.join(', ')}` : d.error;
        } else if (d && typeof d === 'object') {
          msg = JSON.stringify(d);
        } else {
          msg = err?.message || 'Could not reach /api/bulk-rerun/batches/ — check backend connectivity.';
        }
        // eslint-disable-next-line no-console
        console.error('[BulkRerun] Batch creation failed after navigation:', msg);
      });
  };

  return (
    <div>
      <ConflictAlerts
        nHardConf={nHardConf}
        rows={rows}
        conflicts={conflicts}
        courseDiscoveryEnabled={courseDiscoveryEnabled}
      />

      {dryRunEnabled && (
        <div className="sr-exec-panel">
          <div className="sr-exec-panel-header">Execution mode</div>
          <div className="sr-exec-options">
            {execOptions.map(m => (
              <label
                key={m.v}
                htmlFor={`execmode-${m.v}`}
                aria-label={m.title}
                className={`sr-exec-option${mode === m.v ? ' sr-exec-option--active' : ''}`}
              >
                <input
                  id={`execmode-${m.v}`}
                  type="radio"
                  name="execmode"
                  value={m.v}
                  checked={mode === m.v}
                  onChange={() => setMode(m.v)}
                />
                <div>
                  <div className="sr-exec-option-title">{`${m.icon} ${m.title}`}</div>
                  <div className="sr-exec-option-desc">{m.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      <SettingsSummaryGrid
        sched={sched}
        runId={runId}
        certs={certs}
        fromMode={fromMode}
        rowCount={rows.length}
        orgs={orgs}
        orgRosters={orgRosters}
        removeOp={removeOp}
        gating={gating}
        nHardConf={nHardConf}
        nExistsConf={nExistsConf}
      />

      <ReviewAccordion
        rows={rows}
        orgs={orgs}
        conflicts={conflicts}
        openOrgs={openOrgs}
        setOpenOrgs={setOpenOrgs}
        reviewColumns={reviewColumns}
        orgRosters={orgRosters}
      />

      {submitError && (
        <Alert variant="danger" className="mb-3 py-2">
          <strong className="sr-alert-title--sm">Submission failed</strong>
          {submitError}
        </Alert>
      )}

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
            onClick={handleSubmit}
          >
            {busy && (
              <>
                <Spinner animation="border" size="sm" className="sr-spinner" />
                {mode === 'preview' ? 'Running preview...' : 'Submitting...'}
              </>
            )}
            {!busy && (mode === 'preview' ? '🔍 Preview plan' : '▶ Execute reruns')}
          </Button>
        </div>
      </div>
    </div>
  );
};

StepReview.propTypes = {
  cfg: PropTypes.shape({
    rows: PropTypes.arrayOf(PropTypes.shape({})),
    runId: PropTypes.string,
    sched: PropTypes.shape({}),
    certs: PropTypes.shape({}),
    orgRosters: PropTypes.shape({}),
    removeOp: PropTypes.bool,
    gating: PropTypes.shape({}),
    fromMode: PropTypes.string,
    prog: PropTypes.shape({}),
    newOrgs: PropTypes.arrayOf(PropTypes.shape({})),
    courseDiscoveryEnabled: PropTypes.bool,
    existsSet: PropTypes.instanceOf(Set),
  }),
  onBack: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onBatchReady: PropTypes.func,
  onBatchFailed: PropTypes.func,
};

StepReview.defaultProps = {
  cfg: null,
  onBatchReady: null,
  onBatchFailed: null,
};

export default StepReview;
