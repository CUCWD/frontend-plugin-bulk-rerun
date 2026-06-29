import { useState } from 'react';
import PropTypes from 'prop-types';
import { Button, Badge } from '@openedx/paragon';
import { buildExport } from '../utils/buildExport';
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

const HistoryEntry = ({
  entry, isOpen, onToggle, expandedOrg, setExpandedOrg, onView, isLoadingDetail,
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

  return (
    <div className="hv-entry">
      <div className="hv-entry-row">
        <div className={`hv-entry-dot hv-entry-dot--${st}`} />

        <div className="hv-entry-info">
          <div className="hv-entry-top">
            <span className="hv-entry-id">{`BR-${jobId}`}</span>
            <Badge variant={BADGE_V[st] || 'light'} pill className="hv-entry-badge">{STATUS_LBL[st] || st}</Badge>
            {entry.isDryRun && <Badge variant="info" pill className="hv-entry-badge">DRY RUN</Badge>}
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
          <Button variant="success" size="sm" onClick={() => copy(buildExport(entry))}>
            {copied ? 'Copied!' : 'Export report'}
          </Button>
          <Button variant="outline-primary" size="sm" onClick={() => onView(entry)} disabled={isLoadingDetail}>
            {isLoadingDetail ? 'Loading…' : 'View details'}
          </Button>
          <Button variant="outline-primary" size="sm" onClick={onToggle} disabled={isLoadingDetail}>
            {isOpen ? 'Hide' : 'Summary'}
          </Button>
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
};

HistoryEntry.defaultProps = {
  isLoadingDetail: false,
};

export default HistoryEntry;
