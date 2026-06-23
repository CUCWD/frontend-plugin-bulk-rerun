import PropTypes from 'prop-types';

const CERT_DISP_MAP = {
  early_no_info: 'Immediately upon passing',
  early_with_info: 'Immediately with course info',
  end: 'After course end date',
};

const GATING_LBL_MAP = {
  disabled: 'Disabled',
  copy: 'Copy from source',
  template: 'Apply template',
  custom: 'Custom map',
};

const SettingsSummaryGrid = ({
  sched, runId, certs, fromMode, rowCount, orgs,
  orgRosters, removeOp, gating, nHardConf, nExistsConf,
}) => {
  const certDisplay = CERT_DISP_MAP[certs.display] || certs.display;
  const gatingLabel = GATING_LBL_MAP[gating.mode] || gating.mode;
  const gatingSummary = gating.mode === 'custom'
    ? `${gatingLabel} (${gating.minScore ?? '80'}% min score, ${gating.minComplete ?? '100'}% min completion)`
    : gatingLabel;
  const rosterFilled = Object.values(orgRosters).flat().filter(r => r.email);

  const keyConflictsLabel = () => {
    if (nHardConf > 0) { return `${nHardConf} conflict${nHardConf !== 1 ? 's' : ''}`; }
    if (nExistsConf > 0) { return `${nExistsConf} existing`; }
    return 'None';
  };

  const conflictValCls = (k) => {
    if (k !== 'Key conflicts') { return ''; }
    if (nHardConf > 0) { return ' sr-settings-val--danger'; }
    if (nExistsConf > 0) { return ' sr-settings-val--warn'; }
    return ' sr-settings-val--ok';
  };

  return (
    <div className="sr-settings-grid">
      <div className="sr-settings-card">
        <div className="sr-settings-card-header">Scheduling &amp; certificates</div>
        <div className="sr-settings-body">
          {[
            ['Course dates', `${sched.start} to ${sched.end}`],
            ['Enrollment', `${sched.enrollStart} to ${sched.enrollEnd}`],
            ['Pacing', sched.pacing === 'instructor' ? 'Instructor-paced' : 'Self-paced'],
            ['Target run', runId],
            ['Course mode', (certs.mode || '').toUpperCase()],
            ['Cert display', certDisplay],
            ['Student certs', certs.studentGenCert ? 'Enabled' : 'Disabled'],
          ].map(([k, v]) => (
            <div key={k} className="sr-settings-row">
              <span className="sr-settings-key">{k}</span>
              <span className={`sr-settings-val${k === 'Target run' ? ' sr-settings-val--mono' : ''}`}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="sr-settings-card">
        <div className="sr-settings-card-header">Team, gating &amp; job</div>
        <div className="sr-settings-body">
          {[
            ['Selection', fromMode === 'course' ? 'By Individual Course' : fromMode],
            ['Total runs', String(rowCount)],
            ['Organizations', orgs.join(', ') || '-'],
            ['Team members', rosterFilled.length ? `${rosterFilled.length} from CAR` : 'None'],
            ['Remove provisioner', removeOp ? 'Yes' : 'No'],
            ['Lesson gating', gatingSummary],
            ['Key conflicts', keyConflictsLabel()],
          ].map(([k, v]) => (
            <div key={k} className="sr-settings-row">
              <span className="sr-settings-key">{k}</span>
              <span className={`sr-settings-val${conflictValCls(k)}`}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

SettingsSummaryGrid.propTypes = {
  sched: PropTypes.shape({
    start: PropTypes.string,
    end: PropTypes.string,
    enrollStart: PropTypes.string,
    enrollEnd: PropTypes.string,
    pacing: PropTypes.string,
  }).isRequired,
  runId: PropTypes.string.isRequired,
  certs: PropTypes.shape({
    display: PropTypes.string,
    mode: PropTypes.string,
    studentGenCert: PropTypes.bool,
  }).isRequired,
  fromMode: PropTypes.string.isRequired,
  rowCount: PropTypes.number.isRequired,
  orgs: PropTypes.arrayOf(PropTypes.string).isRequired,
  orgRosters: PropTypes.objectOf(PropTypes.arrayOf(PropTypes.shape({ email: PropTypes.string }))).isRequired,
  removeOp: PropTypes.bool.isRequired,
  gating: PropTypes.shape({
    mode: PropTypes.string,
    minScore: PropTypes.string,
    minComplete: PropTypes.string,
  }).isRequired,
  nHardConf: PropTypes.number.isRequired,
  nExistsConf: PropTypes.number.isRequired,
};

export default SettingsSummaryGrid;
