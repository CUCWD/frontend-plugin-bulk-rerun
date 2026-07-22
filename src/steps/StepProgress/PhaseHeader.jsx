// Numbered phase header used inside JobProgress to label each execution phase.
// Circle colour reflects phase state: grey=pending, blue=active, green=done.
// Skipped phases (Discovery disabled) show a warning Badge instead of a filled circle.
import PropTypes from 'prop-types';
import { Badge } from '@openedx/paragon';

const PhaseHeader = ({
  num, label, sub, done, active, skipped, accentColor,
}) => {
  let circleMod = '';
  if (done) {
    circleMod = '--done';
  } else if (active) {
    circleMod = '--active';
  }

  return (
    <div className="ph-root">
      <div
        className={`ph-circle${circleMod ? ` ph-circle${ circleMod}` : ''}`}
        style={done && accentColor ? { background: accentColor } : undefined}
      >
        {done ? '✓' : num}
      </div>
      <span className={`ph-label${skipped ? ' ph-label--skipped' : ''}`}>{label}</span>
      <span className={`ph-sub${skipped ? ' ph-sub--skipped' : ''}`}>{sub}</span>
      {skipped && (
        <Badge variant="warning" pill>
          Skipped - Discovery not enabled
        </Badge>
      )}
    </div>
  );
};

PhaseHeader.propTypes = {
  num: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  label: PropTypes.string.isRequired,
  sub: PropTypes.string.isRequired,
  done: PropTypes.bool.isRequired,
  active: PropTypes.bool.isRequired,
  skipped: PropTypes.bool,
  accentColor: PropTypes.string,
};

PhaseHeader.defaultProps = {
  skipped: false,
  accentColor: null,
};

export default PhaseHeader;
