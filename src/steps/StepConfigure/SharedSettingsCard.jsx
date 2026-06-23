import PropTypes from 'prop-types';
import { Badge } from '@openedx/paragon';
import SchedulingTab from './SchedulingTab';
import CertificatesTab from './CertificatesTab';
import GatingTab from './GatingTab';

const SharedSettingsCard = ({
  rowCount,
  tab,
  setTab,
  sched,
  setSched,
  runId,
  setRunId,
  schedErrs,
  schedOkUI,
  runIdV,
  certs,
  setCerts,
  gating,
  setGating,
}) => {
  const TABS = [
    { id: 'scheduling', label: 'Scheduling' },
    { id: 'certs', label: 'Certificates' },
    { id: 'gating', label: 'Lesson Gating', badge: gating.mode !== 'disabled' ? 'On' : null },
  ];

  return (
    <div className="sc-card">
      <div className="sc-card-header">
        <span className="sc-card-title">Shared settings</span>
        <span className="sc-card-subtitle">Applied to all {rowCount} course runs</span>
      </div>

      <div className="sc-tabs">
        {TABS.map(t => (
          <div
            key={t.id}
            role="tab"
            tabIndex={0}
            onClick={() => setTab(t.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setTab(t.id); } }}
            className={`sc-tab${tab === t.id ? ' sc-tab--active' : ''}`}
          >
            {t.label}
            {t.badge && (
              <Badge variant="warning" pill className="sc-badge-xs">{t.badge}</Badge>
            )}
          </div>
        ))}
      </div>

      <div className="sc-card-body">
        {tab === 'scheduling' && (
          <SchedulingTab
            sched={sched}
            setSched={setSched}
            runId={runId}
            setRunId={setRunId}
            schedErrs={schedErrs}
            schedOkUI={schedOkUI}
            runIdV={runIdV}
          />
        )}
        {tab === 'certs' && (
          <CertificatesTab certs={certs} setCerts={setCerts} />
        )}
        {tab === 'gating' && (
          <GatingTab gating={gating} setGating={setGating} />
        )}
      </div>
    </div>
  );
};

SharedSettingsCard.propTypes = {
  rowCount: PropTypes.number.isRequired,
  tab: PropTypes.string.isRequired,
  setTab: PropTypes.func.isRequired,
  sched: PropTypes.shape({
    start: PropTypes.string,
    end: PropTypes.string,
    enrollStart: PropTypes.string,
    enrollEnd: PropTypes.string,
    pacing: PropTypes.string,
  }).isRequired,
  setSched: PropTypes.func.isRequired,
  runId: PropTypes.string.isRequired,
  setRunId: PropTypes.func.isRequired,
  schedErrs: PropTypes.objectOf(PropTypes.string).isRequired,
  schedOkUI: PropTypes.bool.isRequired,
  runIdV: PropTypes.shape({ ok: PropTypes.bool }).isRequired,
  certs: PropTypes.shape({}).isRequired,
  setCerts: PropTypes.func.isRequired,
  gating: PropTypes.shape({ mode: PropTypes.string }).isRequired,
  setGating: PropTypes.func.isRequired,
};

export default SharedSettingsCard;
