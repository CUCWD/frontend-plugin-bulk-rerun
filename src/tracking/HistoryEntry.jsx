import { useState } from 'react';
import PropTypes from 'prop-types';
import { Button, Badge } from '@openedx/paragon';
import { buildExport } from '../utils/buildExport';
import { deletingJobId } from '../utils/rollbackState';
import HistoryOrgGroup from './HistoryOrgGroup';

const fmtDateShort = iso => {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (_e) { return iso || ''; }
};

const STATUS_LBL = {
  succeeded: 'Succeeded', partial: 'Partial', failed: 'Failed', running: 'Running',
};
const BADGE_V = {
  succeeded: 'success', partial: 'warning', failed: 'danger', running: 'primary',
};
const MODE_LABELS = {
  program: 'By Program', neworg: 'New Org', course: 'By Course', individual: 'Individual',
};

function orgGroups(entry) {
  const map = {};
  (entry.jobs || []).forEach(j => {
    if (!map[j.org]) { map[j.org] = { org: j.org, orgName: j.orgName || j.org, jobs: [] }; }
    map[j.org].jobs.push(j);
  });
  return Object.values(map).sort((a, b) => a.org.localeCompare(b.org)).map(g => ({
    ...g, jobs: g.jobs.slice().sort((a, b) => (a.targetKey || '').localeCompare(b.targetKey || '')),
  }));
}

// Rollback badge label per terminal rollback_status value.
const ROLLBACK_BADGE = {
  succeeded: { label: 'ROLLED BACK', variant: 'dark' },
  partial: { label: 'ROLLBACK PARTIAL', variant: 'warning' },
  failed: { label: 'ROLLBACK FAILED', variant: 'danger' },
};

const HistoryEntry = ({
  entry, isOpen, onToggle, expandedOrg, setExpandedOrg, onView, isLoadingDetail, getEnriched,
  onRollback, isRollbackPending,
}) => {
  const [copied, setCopied] = useState(false);

  const copy = (text) => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2500); };
    const execFallback = () => {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); } catch (_e) { /* no-op */ }
      document.body.removeChild(el);
      done();
    };
    const writePromise = navigator.clipboard?.writeText(text);
    if (writePromise) { writePromise.then(done).catch(execFallback); } else { execFallback(); }
  };

  const { status: st } = entry;
  const jobs = entry.jobs || [];
  const succeeded = jobs.filter(j => j.status === 'success').length;
  const failed = jobs.length - succeeded;
  const totalCourses = (entry.cfg?.rows || []).length;
  const groups = orgGroups(entry);
  const jobId = (entry.batchId || entry.id.replace(/^recovered-/, '')).replace(/-/g, '').slice(0, 8).toUpperCase();

  // Rollback state. Eligible = the batch actually created courses (flagged
  // server-side) and no rollback has been requested yet. Batches from before
  // rollback support have createdCourses 0 and simply never show the button.
  const rollbackStatus = entry.rollbackStatus || 'none';
  const rollbackInFlight = rollbackStatus === 'pending' || rollbackStatus === 'running';
  // Which course is being deleted right now (sequential, position order); null
  // unless a rollback is actively running. entry.jobs is in position order.
  const deletingId = deletingJobId(jobs, rollbackStatus);
  const rollbackBadge = ROLLBACK_BADGE[rollbackStatus];
  const canRollback = rollbackStatus === 'none'
    && !entry.isDryRun
    && (entry.createdCourses || 0) > 0
    && !!entry.batchId;

  const confirmRollback = () => {
    const n = entry.createdCourses;
    // eslint-disable-next-line no-alert
    if (!window.confirm(
      `Roll back this bulk run?\n\nThe ${n} course${n !== 1 ? 's' : ''} created by this batch `
      + 'will be PERMANENTLY DELETED, including any content added since. '
      + 'Courses that existed before the batch are never touched.\n\nThis cannot be undone.',
    )) { return; }
    onRollback(entry);
  };

  return (
    <div className="hv-entry">
      <div className="hv-entry-row">
        <div className={`hv-entry-dot hv-entry-dot--${st}`} />

        <div className="hv-entry-info">
          <div className="hv-entry-top">
            <span className="hv-entry-id">{`BR-${jobId}`}</span>
            <Badge variant={BADGE_V[st] || 'light'} pill className="hv-entry-badge">{STATUS_LBL[st] || st}</Badge>
            {entry.isDryRun && <Badge variant="info" pill className="hv-entry-badge">DRY RUN</Badge>}
            {rollbackBadge && (
              <Badge variant={rollbackBadge.variant} pill className="hv-entry-badge">{rollbackBadge.label}</Badge>
            )}
            {rollbackInFlight && <Badge variant="primary" pill className="hv-entry-badge">ROLLING BACK…</Badge>}
            <span className="hv-entry-mode">
              {(MODE_LABELS[entry.mode] || entry.mode) + (entry.progName ? `  -  ${entry.progName}` : '')}
            </span>
          </div>
          <div className="hv-entry-meta">
            <span>{fmtDateShort(entry.createdAt)}</span>
            <span>{entry.createdBy}</span>
            <span>{`Run: ${entry.targetRun}`}</span>
            <span>{`${entry.orgs?.length || 0} org${entry.orgs?.length !== 1 ? 's' : ''}`}</span>
            {jobs.length > 0 ? (
              <>
                <span className={succeeded > 0 ? 'hv-entry-ok--has' : 'hv-entry-ok'}>{`${succeeded} ok`}</span>
                {failed > 0 && <span className="hv-entry-fail">{`${failed} failed`}</span>}
              </>
            ) : (
              totalCourses > 0 && <span>{`${totalCourses} courses`}</span>
            )}
          </div>
        </div>

        <div className="hv-entry-actions">
          {/* Fresh list entries are lightweight summaries (jobs: []) — fetch the
              full batch detail (jobs + logs) before building the export, so the
              report includes logs even when the entry was never viewed/expanded.
              getEnriched caches, so repeat exports don't re-fetch. */}
          <Button
            variant="success"
            size="sm"
            disabled={isLoadingDetail}
            onClick={async () => copy(buildExport(await getEnriched(entry)))}
          >
            {copied ? 'Copied!' : 'Export report'}
          </Button>
          <Button variant="outline-primary" size="sm" onClick={() => onView(entry)} disabled={isLoadingDetail}>
            {isLoadingDetail ? 'Loading…' : 'View details'}
          </Button>
          <Button variant="outline-primary" size="sm" onClick={onToggle} disabled={isLoadingDetail}>
            {isOpen ? 'Hide' : 'Summary'}
          </Button>
          {canRollback && (
            <Button
              variant="outline-danger"
              size="sm"
              disabled={isRollbackPending}
              onClick={confirmRollback}
            >
              Rollback
            </Button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="hv-summary">
          {groups.map(g => {
            const gKey = `${entry.id}-${g.org}`;
            return (
              <HistoryOrgGroup
                key={g.org}
                group={g}
                isOrgOpen={expandedOrg[gKey] !== false}
                onToggle={() => setExpandedOrg(p => ({ ...p, [gKey]: p[gKey] === false }))}
                rollbackStatus={rollbackStatus}
                deletingId={deletingId}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

HistoryEntry.propTypes = {
  entry: PropTypes.shape({
    id: PropTypes.string.isRequired,
    batchId: PropTypes.string,
    createdAt: PropTypes.string,
    createdBy: PropTypes.string,
    status: PropTypes.string,
    isDryRun: PropTypes.bool,
    mode: PropTypes.string,
    progName: PropTypes.string,
    targetRun: PropTypes.string,
    orgs: PropTypes.arrayOf(PropTypes.string),
    jobs: PropTypes.arrayOf(PropTypes.shape({})),
    rollbackStatus: PropTypes.string,
    createdCourses: PropTypes.number,
    cfg: PropTypes.shape({
      rows: PropTypes.arrayOf(PropTypes.shape({})),
    }),
  }).isRequired,
  isOpen: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  expandedOrg: PropTypes.objectOf(PropTypes.bool).isRequired,
  setExpandedOrg: PropTypes.func.isRequired,
  onView: PropTypes.func.isRequired,
  isLoadingDetail: PropTypes.bool,
  getEnriched: PropTypes.func.isRequired,
  onRollback: PropTypes.func.isRequired,
  isRollbackPending: PropTypes.bool,
};

HistoryEntry.defaultProps = {
  isLoadingDetail: false,
  isRollbackPending: false,
};

export default HistoryEntry;
