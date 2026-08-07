import PropTypes from 'prop-types';
import { Button, Badge } from '@openedx/paragon';
import JobProgress from '../../tracking/JobProgress';

const fmtDate = iso => { try { return new Date(iso).toLocaleString(); } catch (_e) { return iso || ''; } };

const JobCard = ({
  job,
  isExpanded,
  onToggle,
  isCompleted,
  isExecuting,
  cancelPending,
  onCancel,
  rollbackPending,
  rollbackRequested,
  onRollback,
  onDismiss,
  onSaveHistory,
  onComplete,
  onNew,
  onExecute,
}) => {
  const jobIdentifier = (job.batchId ? job.batchId : job.id.replace(/^recovered-/, ''))
    .replace(/-/g, '')
    .slice(0, 8)
    .toUpperCase();

  return (
    <div className="sp-job-card">
      {/* Collapsible job header */}
      <div
        role="button"
        tabIndex={0}
        className={`sp-job-header sp-job-header--${isExpanded ? 'expanded' : 'collapsed'}`}
        onClick={onToggle}
        onKeyDown={e => {
          if (e.target !== e.currentTarget) { return; }
          if (e.key === 'Enter' || e.key === ' ') { onToggle(); }
        }}
      >
        <span className="sp-job-id">{`BR-${jobIdentifier}`}</span>
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
          onClick={e => { e.stopPropagation(); onToggle(); }}
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </Button>
        {!isCompleted && job.batchId && (
          <Button
            variant="tertiary"
            size="sm"
            className="sp-stop-btn"
            disabled={cancelPending}
            onClick={e => {
              e.stopPropagation();
              // eslint-disable-next-line no-alert
              if (!window.confirm(
                'Stop this bulk rerun job?\n\n'
                + 'All pending and running courses will be marked as failed, and '
                + 'every course this batch has already created will be PERMANENTLY '
                + 'DELETED so the batch can be resubmitted from scratch.',
              )) { return; }
              onCancel();
            }}
          >
            Stop
          </Button>
        )}
        {isCompleted && !job.isDry && job.batchId && (
          <Button
            variant="outline-danger"
            size="sm"
            disabled={rollbackPending || rollbackRequested}
            onClick={e => {
              e.stopPropagation();
              // eslint-disable-next-line no-alert
              if (!window.confirm(
                'Roll back this bulk run?\n\n'
                + 'Courses created by this batch will be PERMANENTLY DELETED, '
                + 'including any content added since. Courses that existed before '
                + 'the batch are never touched.\n\nThis cannot be undone.',
              )) { return; }
              onRollback();
            }}
          >
            Rollback
          </Button>
        )}
        <Button
          variant="tertiary"
          size="sm"
          className="sp-dismiss-btn"
          disabled={!isCompleted}
          onClick={e => { e.stopPropagation(); onDismiss(); }}
        >
          Dismiss
        </Button>
      </div>

      {/*
        JobProgress is ALWAYS mounted so the simulation keeps running when the
        header is collapsed. Use display:none — NOT conditional render.
        key={job.id + "-" + job.isDry} triggers remount when dry-run → real.
      */}
      <div className="sp-job-body" style={{ display: isExpanded ? 'block' : 'none' }}>
        <JobProgress
          key={`${job.id}-${job.isDry}`}
          cfg={job.cfg}
          jobId={job.id}
          batchId={job.batchId ?? null}
          isPending={(job.isPending ?? false) || isExecuting}
          isDryRun={job.isDry}
          createdBy={job.createdBy}
          createdAt={job.createdAt}
          rollbackRequested={rollbackRequested}
          onSaveHistory={onSaveHistory}
          onComplete={onComplete}
          onNew={onNew}
          onExecute={onExecute}
        />
      </div>
    </div>
  );
};

JobCard.propTypes = {
  job: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    batchId: PropTypes.string,
    isDry: PropTypes.bool,
    isPending: PropTypes.bool,
    cfg: PropTypes.shape({}),
    createdAt: PropTypes.string,
    createdBy: PropTypes.string,
  }).isRequired,
  isExpanded: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  isCompleted: PropTypes.bool.isRequired,
  isExecuting: PropTypes.bool.isRequired,
  cancelPending: PropTypes.bool.isRequired,
  onCancel: PropTypes.func.isRequired,
  rollbackPending: PropTypes.bool.isRequired,
  rollbackRequested: PropTypes.bool.isRequired,
  onRollback: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
  onSaveHistory: PropTypes.func.isRequired,
  onComplete: PropTypes.func.isRequired,
  onNew: PropTypes.func.isRequired,
  onExecute: PropTypes.func.isRequired,
};

export default JobCard;
