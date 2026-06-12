// Expandable item rows for one execution phase inside JobProgress.
// Each row can be toggled open to reveal a dark log panel with colour-coded lines
// (ok/info/warn/error) and a blue target-key strip for course items.
import { useState, useEffect, useRef } from 'react';
import { Spinner } from '@openedx/paragon';
import { makeKey } from '../../utils/courseKeys';

const TARGET_COLS = [
  { label: 'TARGET ORG',      key: 'org' },
  { label: 'TARGET COURSE #', key: 'num' },
  { label: 'TARGET RUN',      key: 'run' },
];

const LOG_CLS = { ok: 'pi-log-ok', info: 'pi-log-info', warn: 'pi-log-warn', error: 'pi-log-error', err: 'pi-log-error' };

function PhaseItem({ item }) {
  const [isOpen, setIsOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  // Auto-expand the log panel when a job starts running or fails so the user
  // sees live output without having to click. Once opened this way the row
  // stays expanded through completion; the user can still manually toggle it.
  useEffect(() => {
    if (!autoOpenedRef.current && (item.status === 'running' || item.status === 'failed')) {
      autoOpenedRef.current = true;
      setIsOpen(true);
    }
  }, [item.status]);
  const label      = item.r ? item.r.name : (item.name || item.code || item.org || '');
  const sublabel   = item.r ? makeKey(item.r.org, item.r.num, item.r.run) : (item.code || '');
  const statusMod  = ` pi-status--${item.status}`;

  return (
    <div className="pi-item">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="pi-row" onClick={() => setIsOpen(o => !o)}>
        <div className="pi-label">{label}</div>
        {sublabel && <div className="pi-sublabel">{sublabel}</div>}
        <div className={`pi-status${statusMod}`}>
          {item.status === 'running'
            ? <Spinner animation="border" size="sm" style={{ width: 12, height: 12, borderWidth: '0.15em' }} />
            : item.status === 'success' ? '✓'
            : item.status === 'failed'  ? '✗'
            : '○'}
          {' '}{item.status === 'success' ? 'Complete' : item.status === 'running' ? 'Running' : item.status === 'failed' ? 'Failed' : 'Pending'}
        </div>
        <div className="pi-elapsed">{item.elapsed}</div>
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
            {item.logs.map((l, x) => (
              <div key={x} className={LOG_CLS[l.lv] || 'pi-log-info'}>
                [{l.ts}] {l.msg}
              </div>
            ))}
            {item.status === 'running' && <div className="pi-log-waiting">[...] Working...</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PhaseItemRows({ items }) {
  return (
    <>
      {items.map(item => <PhaseItem key={item.id} item={item} />)}
    </>
  );
}
