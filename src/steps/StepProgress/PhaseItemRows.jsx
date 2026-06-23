// Expandable item rows for one execution phase inside JobProgress.
// Each row can be toggled open to reveal a dark log panel with colour-coded lines
// (ok/info/warn/error) and a blue target-key strip for course items.
import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Spinner } from '@openedx/paragon';
import { makeKey } from '../../utils/courseKeys';

const TARGET_COLS = [
  { label: 'TARGET ORG', key: 'org' },
  { label: 'TARGET COURSE #', key: 'num' },
  { label: 'TARGET RUN', key: 'run' },
];

const LOG_CLS = {
  ok: 'pi-log-ok', info: 'pi-log-info', warn: 'pi-log-warn', error: 'pi-log-error', err: 'pi-log-error',
};

const LOG_PROP_TYPE = PropTypes.shape({
  lv: PropTypes.string,
  ts: PropTypes.string,
  msg: PropTypes.string,
});

const COURSE_ROW_PROP_TYPE = PropTypes.shape({
  org: PropTypes.string,
  orgName: PropTypes.string,
  name: PropTypes.string,
  num: PropTypes.string,
  run: PropTypes.string,
  srcOrg: PropTypes.string,
  srcNum: PropTypes.string,
  srcRun: PropTypes.string,
});

const PHASE_ITEM_PROP_TYPE = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  status: PropTypes.string.isRequired,
  elapsed: PropTypes.string,
  logs: PropTypes.arrayOf(LOG_PROP_TYPE).isRequired,
  r: COURSE_ROW_PROP_TYPE,
  name: PropTypes.string,
  code: PropTypes.string,
  org: PropTypes.string,
});

const STATUS_LABELS = {
  success: 'Complete',
  running: 'Running',
  failed: 'Failed',
  pending: 'Pending',
};

const PhaseItem = ({ item }) => {
  const [isOpen, setIsOpen] = useState(false);
  const autoOpenedRef = useRef(false);
  const [liveElapsed, setLiveElapsed] = useState('');
  const intervalRef = useRef(null);
  const baseTimeRef = useRef(null);

  // Auto-expand the log panel when a job starts running or fails so the user
  // sees live output without having to click. Once opened this way the row
  // stays expanded through completion; the user can still manually toggle it.
  useEffect(() => {
    if (!autoOpenedRef.current && (item.status === 'running' || item.status === 'failed')) {
      autoOpenedRef.current = true;
      setIsOpen(true);
    }
  }, [item.status]);

  // Sync the local base time whenever the server-reported elapsed snapshot
  // arrives (every ~2 s poll). This keeps the live counter accurate without
  // restarting the interval and causing a visual jump.
  useEffect(() => {
    if (item.status !== 'running') { return; }
    const serverSec = parseFloat(item.elapsed) || 0;
    if (serverSec > 0) {
      baseTimeRef.current = Date.now() - serverSec * 1000;
    }
  }, [item.elapsed, item.status]);

  // Start a 1-second tick while a job is running so elapsed time advances
  // smoothly between server polls (otherwise nothing moves for 2 s at a time).
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (item.status === 'running') {
      if (!baseTimeRef.current) { baseTimeRef.current = Date.now(); }
      intervalRef.current = setInterval(() => {
        setLiveElapsed(`${((Date.now() - baseTimeRef.current) / 1000).toFixed(0) }s`);
      }, 1000);
    } else {
      baseTimeRef.current = null;
      setLiveElapsed('');
    }
    return () => clearInterval(intervalRef.current);
  }, [item.status]);

  const displayElapsed = item.status === 'running'
    ? (liveElapsed || item.elapsed || '')
    : (item.elapsed || '');

  const label = item.r ? item.r.name : (item.name || item.code || item.org || '');
  const sublabel = item.r ? makeKey(item.r.org, item.r.num, item.r.run) : (item.code || '');
  const statusMod = ` pi-status--${item.status}`;
  let statusIcon = '○';
  if (item.status === 'running') {
    statusIcon = (
      <Spinner
        animation="border"
        size="sm"
        style={{ width: 12, height: 12, borderWidth: '0.15em' }}
      />
    );
  } else if (item.status === 'success') {
    statusIcon = '✓';
  } else if (item.status === 'failed') {
    statusIcon = '✗';
  }
  const statusLabel = STATUS_LABELS[item.status] || 'Pending';

  return (
    <div className="pi-item">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="pi-row" onClick={() => setIsOpen(o => !o)}>
        <div className="pi-label">{label}</div>
        {sublabel && <div className="pi-sublabel">{sublabel}</div>}
        <div className={`pi-status${statusMod}`}>
          {statusIcon}
          {' '}
          {statusLabel}
        </div>
        <div className="pi-elapsed">{displayElapsed}</div>
        <span className="pi-toggle">{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div className="pi-details">
          {item.r && (
            <div className="pi-target-strip">
              {TARGET_COLS.map(({ label: colLabel, key }) => (
                <div key={key} className="pi-target-col">
                  <div className="pi-target-col-label">{colLabel}</div>
                  <div className="pi-target-col-val">{item.r[key]}</div>
                </div>
              ))}
            </div>
          )}
          <div className={`pi-log-panel${item.r ? '' : ' pi-log-panel--solo'}`}>
            {item.logs.length === 0 && <div className="pi-log-waiting">Waiting to start...</div>}
            {item.logs.map(l => (
              <div key={`${l.ts}-${l.lv}-${l.msg}`} className={LOG_CLS[l.lv] || 'pi-log-info'}>
                [{l.ts}] {l.msg}
              </div>
            ))}
            {item.status === 'running' && <div className="pi-log-waiting">[...] Working...</div>}
          </div>
        </div>
      )}
    </div>
  );
};

PhaseItem.propTypes = {
  item: PHASE_ITEM_PROP_TYPE.isRequired,
};

const PhaseItemRows = ({ items }) => (
  <>
    {items.map(item => <PhaseItem key={item.id} item={item} />)}
  </>
);

PhaseItemRows.propTypes = {
  items: PropTypes.arrayOf(PHASE_ITEM_PROP_TYPE).isRequired,
};

export default PhaseItemRows;
