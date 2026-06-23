import PropTypes from 'prop-types';
import { Alert } from '@openedx/paragon';
import { makeKey, isHardConflict } from '../../utils/courseKeys';

const CONFLICT_MSG_MAP = {
  exists: 'Key already exists in the platform',
  dup: 'Duplicate key within this batch',
  self: 'Target key is identical to source',
  org: 'Organization not found in platform',
};

const ConflictAlerts = ({
  nHardConf, rows, conflicts, courseDiscoveryEnabled,
}) => (
  <>
    {nHardConf > 0 ? (
      <Alert variant="danger" className="mb-3 py-2">
        <strong className="sr-alert-title">{`${nHardConf} conflict${nHardConf !== 1 ? 's' : ''} - submission blocked`}</strong>
        <ul className="sr-conflict-list">
          {rows.map((r, i) => (
            isHardConflict(conflicts[i]) ? (
              <li key={r.id}>
                <code>{makeKey(r.org, r.num, r.run)}</code>
                {' - '}
                {CONFLICT_MSG_MAP[conflicts[i]]}
              </li>
            ) : null
          ))}
        </ul>
      </Alert>
    ) : (
      <Alert variant="success" className="mb-3 py-2">
        <strong className="sr-alert-title--sm">All course keys verified - no conflicts detected</strong>
        Every target key checked against the platform. Ready to submit.
      </Alert>
    )}

    {!courseDiscoveryEnabled && (
      <Alert variant="warning" className="mb-3 py-2">
        <strong className="sr-alert-title--sm">Course Discovery is not enabled - phases 2 and 3 will be skipped</strong>
        This job will only execute Phase 1 (course creation).
      </Alert>
    )}
  </>
);

ConflictAlerts.propTypes = {
  nHardConf: PropTypes.number.isRequired,
  rows: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    org: PropTypes.string.isRequired,
    num: PropTypes.string.isRequired,
    run: PropTypes.string.isRequired,
  })).isRequired,
  conflicts: PropTypes.arrayOf(PropTypes.string).isRequired,
  courseDiscoveryEnabled: PropTypes.bool.isRequired,
};

export default ConflictAlerts;
