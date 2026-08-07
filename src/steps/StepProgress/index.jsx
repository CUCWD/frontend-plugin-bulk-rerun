// Tracking → Current tab. Lists all active jobs from hookstate.
// JobProgress is always mounted (visibility toggled via display:none, not conditional
// render) so the simulation timer keeps running when a job card is collapsed.
// key={job.id + '-' + job.isDry} remounts JobProgress when a dry-run is promoted to real.
//
// useRunningBatches polls all users' in-progress batches from the server and merges
// any that aren't already tracked — recovering from page refresh / cross-device, and
// surfacing batches started by other users (shared tracking view).
import { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Button } from '@openedx/paragon';

import {
  useCreateBatch, useCancelBatch, useRollbackBatch, useRunningBatches,
} from '../../hooks';
import { buildBatchPayload } from '../../utils/batchPayload';
import { useBulkRerunState } from '../../state';
import EmptyState from './EmptyState';
import FilterBar from './FilterBar';
import JobCard from './JobCard';
import './index.scss';

const StepProgress = ({ onGoWizard, onSaveHistory }) => {
  const {
    activeJobs,
    addActiveJobs,
    removeActiveJob,
    markActiveJobDone,
    markActiveJobRollbackRequested,
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
  const rollbackBatch = useRollbackBatch();
  // Tracks job IDs currently being promoted from dry-run to real so we can
  // show a pending state on the card while the POST /batches/ is in flight.
  // Terminal state lives on the job itself (job.done, see markActiveJobDone)
  // so counts and the Dismiss button survive navigating away and back.
  const [executingIds, setExecutingIds] = useState(new Set());
  const [rollbackIds, setRollbackIds] = useState(new Set());

  // Merge server-side in-flight batches into local state on every poll result.
  // This handles page refresh, cross-tab/device access, AND batches started by
  // OTHER users while this page is open (the list endpoint returns all users'
  // batches). Deduped by batchId so re-fires are idempotent. Skipped while any
  // local POST /batches/ is still pending — that job's batchId is unknown, so
  // the just-created server row could otherwise be added a second time as a
  // "recovered" card.
  const { data: runningBatches } = useRunningBatches();

  useEffect(() => {
    if (!runningBatches) { return; }
    // Skip while any batch-creating POST is in flight — either a wizard
    // submission (isPending) or a dry-run promotion (executingIds). In both
    // windows the new server batch has no matching local batchId yet, so
    // merging would add it a second time as a duplicate card.
    if (activeJobs.some(j => j.isPending) || executingIds.size > 0) { return; }

    const existingBatchIds = new Set(activeJobs.map(j => j.batchId).filter(Boolean));
    const toRecover = runningBatches
      .filter(batch => !existingBatchIds.has(batch.id) && batch.config_json)
      .map(batch => ({
        id: `recovered-${batch.id}`,
        cfg: { ...batch.config_json, runId: batch.config_json.runId || batch.target_run },
        isDry: batch.is_dry_run,
        batchId: batch.id,
        isPending: false,
        createdAt: batch.created_at,
        createdBy: batch.created_by_username || '',
      }));
    if (toRecover.length > 0) { addActiveJobs(toRecover); }
  // addActiveJobs is a stable module-level writer; only data deps re-run this.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningBatches, activeJobs, executingIds]);

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

  const handleRollback = useCallback((job) => {
    setRollbackIds(prev => new Set([...prev, job.id]));
    markActiveJobRollbackRequested(job.id);
    rollbackBatch.mutate(job.batchId, {
      onError: () => {
        setRollbackIds((prev) => {
          const next = new Set(prev);
          next.delete(job.id);
          return next;
        });
      },
    });
  }, [markActiveJobRollbackRequested, rollbackBatch]);

  const visibleJobs = jobUserFilter
    ? activeJobs.filter(j => j.createdBy === jobUserFilter)
    : activeJobs;

  const uniqueUsers = [...new Set(activeJobs.map(j => j.createdBy))].sort();

  if (activeJobs.length === 0) {
    return <EmptyState onGoWizard={onGoWizard} />;
  }

  return (
    <div>
      <FilterBar
        activeCount={activeJobs.filter(j => !j.done).length}
        jobUserFilter={jobUserFilter}
        setJobUserFilter={setJobUserFilter}
        uniqueUsers={uniqueUsers}
      />

      {jobUserFilter && visibleJobs.length === 0 && (
        <div className="sp-no-match">
          {'No active runs for '}
          <strong>{jobUserFilter}</strong>
          .
          <Button variant="tertiary" size="sm" onClick={() => setJobUserFilter('')} style={{ marginLeft: 8 }}>Show all</Button>
        </div>
      )}

      {activeJobs.map(job => {
        if (jobUserFilter && job.createdBy !== jobUserFilter) { return null; }
        const isExpanded = jobsExpanded[String(job.id)] !== false;

        return (
          <JobCard
            key={job.id}
            job={job}
            isExpanded={isExpanded}
            onToggle={() => toggleJobExpanded(job.id)}
            isCompleted={!!job.done}
            isExecuting={executingIds.has(job.id)}
            cancelPending={cancelBatch.isPending}
            onCancel={() => cancelBatch.mutate(job.batchId)}
            rollbackPending={rollbackBatch.isPending}
            rollbackRequested={!!job.rollbackRequested || rollbackIds.has(job.id)}
            onRollback={() => handleRollback(job)}
            onDismiss={() => removeActiveJob(job.id)}
            onSaveHistory={onSaveHistory}
            onComplete={() => markActiveJobDone(job.id)}
            onNew={() => { softReset(); setBulkView('wizard'); }}
            onExecute={() => handleExecute(job)}
          />
        );
      })}
    </div>
  );
};

StepProgress.propTypes = {
  onGoWizard: PropTypes.func.isRequired,
  onSaveHistory: PropTypes.func.isRequired,
};

export default StepProgress;
