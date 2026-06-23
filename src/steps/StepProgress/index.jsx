// Tracking → Current tab. Lists all active jobs from hookstate.
// JobProgress is always mounted (visibility toggled via display:none, not conditional
// render) so the simulation timer keeps running when a job card is collapsed.
// key={job.id + '-' + job.isDry} remounts JobProgress when a dry-run is promoted to real.
//
// On mount, useRunningBatches fetches the caller's in-progress batches from the server
// and adds any that aren't already tracked (recovering from page refresh / cross-device).
import {
  useState, useCallback, useEffect, useRef,
} from 'react';
import PropTypes from 'prop-types';
import { Button } from '@openedx/paragon';

import { useCreateBatch, useCancelBatch, useRunningBatches } from '../../hooks';
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
    if (!runningBatches || hasRecoveredRef.current) { return; }
    hasRecoveredRef.current = true;

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
    return <EmptyState onGoWizard={onGoWizard} />;
  }

  return (
    <div>
      <FilterBar
        activeJobs={activeJobs}
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
            isCompleted={completedJobIds.has(job.id)}
            isExecuting={executingIds.has(job.id)}
            cancelPending={cancelBatch.isPending}
            onCancel={() => cancelBatch.mutate(job.batchId)}
            onDismiss={() => removeActiveJob(job.id)}
            onSaveHistory={onSaveHistory}
            onComplete={() => setCompletedJobIds(prev => new Set([...prev, job.id]))}
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
