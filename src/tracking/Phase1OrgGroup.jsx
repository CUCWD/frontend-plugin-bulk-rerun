import PropTypes from 'prop-types';
import { Spinner } from '@openedx/paragon';
import PhaseItemRows from '../steps/StepProgress/PhaseItemRows';

const Phase1OrgGroup = ({
  orgCode, orgCourseItems, isOrgOpen, onToggle,
}) => {
  const orgDone = orgCourseItems.filter(it => it.status === 'success').length;
  const orgRunning = orgCourseItems.filter(it => it.status === 'running').length;
  const allDone = orgDone === orgCourseItems.length;
  const orgName = orgCourseItems[0]?.r?.orgName || orgCode;
  let stateMod = '';
  if (allDone) { stateMod = '--done'; } else if (orgRunning > 0) { stateMod = '--running'; }

  return (
    <div className="jp-org-item">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { onToggle(); }
        }}
        className={`jp-org-header${stateMod ? ` jp-org-header${stateMod}` : ''}`}
      >
        <div className={`jp-org-dot${stateMod ? ` jp-org-dot${stateMod}` : ''}`}>
          {allDone && '✓'}
          {!allDone && orgRunning > 0 && (
            <Spinner
              animation="border"
              size="sm"
              style={{
                width: 10, height: 10, borderWidth: '0.15em', color: '#fff',
              }}
            />
          )}
          {!allDone && orgRunning === 0 && 'o'}
        </div>
        <span className={`jp-org-name${stateMod ? ` jp-org-name${stateMod}` : ''}`}>
          {orgName !== orgCode ? `${orgName} (${orgCode})` : orgCode}
        </span>
        <span className="jp-org-meta">
          {`${orgDone}/${orgCourseItems.length} complete${orgRunning > 0 ? ` - ${orgRunning} running` : ''}`}
        </span>
        <div className="jp-org-spacer" />
        <span className="jp-org-toggle">{isOrgOpen ? '▲' : '▼'}</span>
      </div>
      {isOrgOpen && (
        <div className="jp-org-rows">
          <PhaseItemRows items={orgCourseItems} />
        </div>
      )}
    </div>
  );
};

Phase1OrgGroup.propTypes = {
  orgCode: PropTypes.string.isRequired,
  orgCourseItems: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    status: PropTypes.string,
    r: PropTypes.shape({ orgName: PropTypes.string }),
  })).isRequired,
  isOrgOpen: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
};

export default Phase1OrgGroup;
