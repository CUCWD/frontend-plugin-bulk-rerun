// A single per-course rollback status chip. Given a state string from
// jobRollbackState (or null), renders the matching pill; null renders nothing.
import PropTypes from 'prop-types';
import { Spinner } from '@openedx/paragon';
import { ROLLBACK_CHIP } from '../utils/rollbackState';

const RollbackChip = ({ state }) => {
  if (!state) { return null; }
  const cfg = ROLLBACK_CHIP[state];
  if (!cfg) { return null; }

  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontWeight: cfg.ghost ? 500 : 700,
    borderRadius: 4,
    padding: cfg.ghost ? 0 : '3px 8px',
    whiteSpace: 'nowrap',
    color: cfg.fg,
    background: cfg.bg,
    border: cfg.border === 'transparent' ? 'none' : `1px ${cfg.border === '#d0d5dd' ? 'dashed' : 'solid'} ${cfg.border}`,
  };

  return (
    <span className={`jp-rb-chip jp-rb-chip--${state}`} style={style}>
      {cfg.spinner && (
        <Spinner animation="border" size="sm" style={{ width: 10, height: 10, borderWidth: '0.15em' }} />
      )}
      {cfg.label}
    </span>
  );
};

RollbackChip.propTypes = {
  state: PropTypes.oneOf(['deleted', 'deleting', 'queued', 'failed', 'nothing']),
};

RollbackChip.defaultProps = {
  state: null,
};

export default RollbackChip;
