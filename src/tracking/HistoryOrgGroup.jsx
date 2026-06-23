import PropTypes from 'prop-types';

const HistoryOrgGroup = ({ group, isOrgOpen, onToggle }) => {
  const gSucceeded = group.jobs.filter(j => j.status === 'success').length;
  const gFailed = group.jobs.length - gSucceeded;

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
          <span className="hv-org-chevron">{isOrgOpen ? '▲' : '▼'}</span>
        </div>
      </div>

      {isOrgOpen && (
        <div className="hv-courses">
          {group.jobs.map(j => (
            <div key={j.targetKey || j.srcKey} className={`hv-course${j.status !== 'success' ? ' hv-course--fail' : ''}`}>
              <span className={`hv-course-icon${j.status !== 'success' ? ' hv-course-icon--fail' : ''}`}>
                {j.status === 'success' ? '✓' : '✗'}
              </span>
              <div className="hv-course-info">
                <div className="hv-course-name">{j.name || j.targetKey}</div>
                <div className="hv-course-key">{`${j.srcKey} -> ${j.targetKey}`}</div>
              </div>
              <span className="hv-course-elapsed">{j.elapsed || '-'}</span>
            </div>
          ))}
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
    })).isRequired,
  }).isRequired,
  isOrgOpen: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
};

export default HistoryOrgGroup;
