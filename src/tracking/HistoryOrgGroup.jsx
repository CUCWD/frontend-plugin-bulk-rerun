import PropTypes from 'prop-types';
import RollbackChip from './RollbackChip';
import { jobRollbackState } from '../utils/rollbackState';

const HistoryOrgGroup = ({
  group, isOrgOpen, onToggle, rollbackStatus, deletingId,
}) => {
  const gSucceeded = group.jobs.filter(j => j.status === 'success').length;
  const gFailed = group.jobs.length - gSucceeded;

  // Rollback tally for this org (created courses removed / created), shown
  // only once a rollback has been requested for the batch.
  const rbActive = rollbackStatus && rollbackStatus !== 'none';
  const created = group.jobs.filter(j => j.courseCreated);
  const removed = created.filter(j => j.rolledBack).length;

  return (
    <div className="hv-org">
      <div className={`hv-org-header${gFailed > 0 ? ' hv-org-header--fail' : ''}`}>
        <div
          role="button"
          tabIndex={0}
          className="hv-org-header-inner"
          onClick={onToggle}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { onToggle(); }
          }}
        >
          <span className="hv-org-name">{group.orgName}</span>
          <span className="hv-org-code">{group.org}</span>
          <span className={`hv-org-count${gFailed > 0 ? ' hv-org-count--fail' : ''}`}>
            {`${gSucceeded}/${group.jobs.length} succeeded`}
          </span>
          {rbActive && created.length > 0 && (
            <span className="hv-org-rb">{`${removed}/${created.length} removed`}</span>
          )}
          <span className="hv-org-chevron">{isOrgOpen ? '▲' : '▼'}</span>
        </div>
      </div>

      {isOrgOpen && (
        <div className="hv-courses">
          {group.jobs.map(j => {
            const rbState = jobRollbackState(j, rollbackStatus, deletingId);
            const isDeleted = rbState === 'deleted';
            return (
              <div key={j.targetKey || j.srcKey} className={`hv-course${j.status !== 'success' ? ' hv-course--fail' : ''}${isDeleted ? ' hv-course--deleted' : ''}`}>
                <span className={`hv-course-icon${j.status !== 'success' ? ' hv-course-icon--fail' : ''}`}>
                  {j.status === 'success' ? '✓' : '✗'}
                </span>
                <div className="hv-course-info">
                  <div className="hv-course-name">{j.name || j.targetKey}</div>
                  <div className="hv-course-key">
                    {`${j.srcKey} -> `}
                    <span style={isDeleted ? { textDecoration: 'line-through' } : undefined}>{j.targetKey}</span>
                  </div>
                </div>
                {rbState && <RollbackChip state={rbState} />}
                <span className="hv-course-elapsed">{j.elapsed || '-'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

HistoryOrgGroup.propTypes = {
  group: PropTypes.shape({
    org: PropTypes.string.isRequired,
    orgName: PropTypes.string.isRequired,
    jobs: PropTypes.arrayOf(PropTypes.shape({
      targetKey: PropTypes.string,
      srcKey: PropTypes.string,
      name: PropTypes.string,
      status: PropTypes.string,
      elapsed: PropTypes.string,
      courseCreated: PropTypes.bool,
      rolledBack: PropTypes.bool,
    })).isRequired,
  }).isRequired,
  isOrgOpen: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  rollbackStatus: PropTypes.string,
  deletingId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

HistoryOrgGroup.defaultProps = {
  rollbackStatus: 'none',
  deletingId: null,
};

export default HistoryOrgGroup;
