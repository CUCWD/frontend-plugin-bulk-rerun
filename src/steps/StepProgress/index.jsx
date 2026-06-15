// Tracking → Current tab. Lists all active jobs from hookstate.
// JobProgress is always mounted (visibility toggled via display:none, not conditional
// render) so the simulation timer keeps running when a job card is collapsed.
// key={job.id + '-' + job.isDry} remounts JobProgress when a dry-run is promoted to real.
//
// On mount, useRunningBatches fetches the caller's in-progress batches from the server
// and adds any that aren't already tracked (recovering from page refresh / cross-device).
import { useState, useCallback, useEffect, useRef } from 'react';
import { Button, Badge, Form } from '@openedx/paragon';

import { useCreateBatch, useCancelBatch, useRunningBatches } from '../../hooks';
import { buildBatchPayload } from '../../utils/batchPayload';
import { useBulkRerunState } from '../../state';
import JobProgress from '../../tracking/JobProgress';
import './index.scss';

const fmtDate = iso => { try { return new Date(iso).toLocaleString(); } catch (_e) { return iso || ''; } };

export default function StepProgress({ onGoWizard, onSaveHistory }) {
  const {
    activeJobs,
    addActiveJob,
    addActiveJobs,
    removeActiveJob,
    promoteJobToReal,
    jobsExpanded,
    toggleJobExpanded,
    jobUserFilter,
    setJobUserFilter,
    softReset,
    setBulkView,
  } = useBulkRerunState();

  const createBatch = useCreateBatch();
  const cancelBatch = useCancelBatch();
  // Tracks job IDs currently being promoted from dry-run to real so we can
  // show a pending state on the card while the POST /batches/ is in flight.
  const [executingIds, setExecutingIds] = useState(new Set());
  // Tracks which job IDs have reached a terminal state (succeeded/failed/partial).
  // Dismiss is disabled until a job's JobProgress fires onComplete.
  const [completedJobIds, setCompletedJobIds] = useState(new Set());

  // Restore in-flight batches from the server on first render.
  // This handles page refresh, cross-tab, and cross-device access.
  // hasRecoveredRef prevents double-adding if the query re-fires.
  const { data: runningBatches } = useRunningBatches();
  const hasRecoveredRef = useRef(false);

  useEffect(() => {
    if (!runningBatches || hasRecoveredRef.current) return;
    hasRecoveredRef.current = true;

    const existingBatchIds = new Set(activeJobs.map(j => j.batchId).filter(Boolean));
    const toRecover = runningBatches
      .filter(batch => !existingBatchIds.has(batch.id) && batch.config_json)
      .map(batch => ({
        id: `recovered-${batch.id}`,
        cfg: { ...batch.config_json, runId: batch.config_json.runId || batch.target_run },
        isDry:     batch.is_dry_run,
        batchId:   batch.id,
        isPending: false,
        createdAt: batch.created_at,
        createdBy: batch.created_by_username || '',
      }));
    if (toRecover.length > 0) addActiveJobs(toRecover);
  // activeJobs is intentionally read as a closure snapshot at first-recovery time.
  // hasRecoveredRef guards against re-running as activeJobs mutates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningBatches]);

  const handleExecute = useCallback((job) => {
    setExecutingIds(prev => new Set([...prev, job.id]));
    createBatch.mutateAsync(buildBatchPayload(job.cfg, false))
      .then(result => {
        promoteJobToReal(job.id, result?.batch_id ?? null);
        setExecutingIds(prev => { const n = new Set(prev); n.delete(job.id); return n; });
      })
      .catch(err => {
        setExecutingIds(prev => { const n = new Set(prev); n.delete(job.id); return n; });
        // eslint-disable-next-line no-console
        console.error('[BulkRerun] Execute real batch failed:', err?.response?.data || err?.message);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promoteJobToReal]);

  const visibleJobs = jobUserFilter
    ? activeJobs.filter(j => j.createdBy === jobUserFilter)
    : activeJobs;

  const uniqueUsers = [...new Set(activeJobs.map(j => j.createdBy))].sort();

  if (activeJobs.length === 0) {
    return (
      <div className="sp-empty">
        <div className="sp-empty-icon">📊</div>
        <div className="sp-empty-title">No active runs</div>
        <div className="sp-empty-sub">
          Start a bulk run from the wizard. Progress will appear here in real time.
        </div>
        <Button variant="primary" onClick={onGoWizard}>Go to Bulk Run Wizard</Button>
      </div>
    );
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="sp-filter-bar">
        <span className="sp-filter-count">
          {activeJobs.length + ' active run' + (activeJobs.length !== 1 ? 's' : '')}
        </span>
        <div className="sp-filter-right">
          <span className="sp-filter-label">Filter by user:</span>
          <Form.Control
            as="select"
            size="sm"
            value={jobUserFilter}
            onChange={e => setJobUserFilter(e.target.value)}
            className="sp-filter-select"
          >
            <option value="">{'All users (' + activeJobs.length + ')'}</option>
            {uniqueUsers.map(u => (
              <option key={u} value={u}>
                {u + ' (' + activeJobs.filter(j => j.createdBy === u).length + ')'}
              </option>
            ))}
          </Form.Control>
          {jobUserFilter && (
            <Button variant="tertiary" size="sm" onClick={() => setJobUserFilter('')}>Clear</Button>
          )}
        </div>
      </div>

      {jobUserFilter && visibleJobs.length === 0 && (
        <div className="sp-no-match">
          {'No active runs for '}
          <strong>{jobUserFilter}</strong>
          {'.'}
          <Button variant="tertiary" size="sm" onClick={() => setJobUserFilter('')} style={{ marginLeft: 8 }}>Show all</Button>
        </div>
      )}

      {activeJobs.map(job => {
        if (jobUserFilter && job.createdBy !== jobUserFilter) return null;
        const isExpanded = jobsExpanded[String(job.id)] !== false;

        return (
          <div key={job.id} className="sp-job-card">
            {/* Collapsible job header */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div
              className={`sp-job-header sp-job-header--${isExpanded ? 'expanded' : 'collapsed'}`}
              onClick={() => toggleJobExpanded(job.id)}
            >
              <span className="sp-job-id">{'BR-' + (job.batchId ? job.batchId : job.id.replace(/^recovered-/, '')).replace(/-/g, '').slice(0, 8).toUpperCase()}</span>
              {job.isDry && <Badge variant="warning" pill>DRY RUN</Badge>}
              <span className="sp-job-meta">
                <span className="sp-job-meta-date">{fmtDate(job.createdAt)}</span>
                <span className="sp-job-meta-sep">·</span>
                <span className="sp-job-meta-user">{job.createdBy}</span>
              </span>
              <div className="sp-job-spacer" />
              <Button
                variant="tertiary"
                size="sm"
                onClick={e => { e.stopPropagation(); toggleJobExpanded(job.id); }}
              >
                {isExpanded ? 'Collapse' : 'Expand'}
              </Button>
              {!completedJobIds.has(job.id) && job.batchId && (
                <Button
                  variant="tertiary"
                  size="sm"
                  className="sp-stop-btn"
                  disabled={cancelBatch.isPending}
                  onClick={e => {
                    e.stopPropagation();
                    // eslint-disable-next-line no-alert
                    if (!window.confirm('Stop this bulk rerun job? All pending and running courses will be marked as failed.')) return;
                    cancelBatch.mutate(job.batchId);
                  }}
                >
                  Stop
                </Button>
              )}
              <Button
                variant="tertiary"
                size="sm"
                className="sp-dismiss-btn"
                disabled={!completedJobIds.has(job.id)}
                onClick={e => { e.stopPropagation(); removeActiveJob(job.id); }}
              >
                Dismiss
              </Button>
            </div>

            {/*
              JobProgress is ALWAYS mounted so the simulation keeps running
              when the header is collapsed. Use display:none, NOT conditional render.
              key={job.id + "-" + job.isDry} triggers remount when dry->real.
            */}
            <div className="sp-job-body" style={{ display: isExpanded ? 'block' : 'none' }}>
              <JobProgress
                key={job.id + '-' + job.isDry}
                cfg={job.cfg}
                jobId={job.id}
                batchId={job.batchId ?? null}
                isPending={(job.isPending ?? false) || executingIds.has(job.id)}
                isDryRun={job.isDry}
                createdBy={job.createdBy}
                createdAt={job.createdAt}
                onSaveHistory={onSaveHistory}
                onComplete={() => setCompletedJobIds(prev => new Set([...prev, job.id]))}
                onNew={() => { softReset(); setBulkView('wizard'); }}
                onExecute={() => handleExecute(job)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
