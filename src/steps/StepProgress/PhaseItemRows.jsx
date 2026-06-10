// Expandable item rows for one execution phase inside JobProgress.
// Each row can be toggled open to reveal a dark log panel with colour-coded lines
// (ok/info/warn/error) and a blue target-key strip for course items.
import { useState } from 'react';
import { Spinner } from '@openedx/paragon';
import { makeKey } from '../../utils/courseKeys';

const SUCCESS  = '#178253';
const BRAND    = '#006daa';
const BRAND_XLT = '#eef6fb';
const G50  = '#f8f9fa';
const G500 = '#6c757d';
const G900 = '#1f2937';
const BORDER = '#dee2e6';
const DANGER = '#c32d3a';
const MONO = '"SFMono-Regular","Courier New",monospace';
const FONT = '"Open Sans",system-ui,sans-serif';

const SC_MAP = { success: SUCCESS, running: BRAND, pending: G500, failed: DANGER };
const SL_MAP = { success: 'Complete', running: 'Running', pending: 'Pending', failed: 'Failed' };
const LOG_COLORS = { ok: '#4ec994', info: '#79b8ff', warn: '#f0ad4e', error: '#ff7b72', err: '#ff7b72' };

// cols shown in expanded blue strip for course items
const TARGET_COLS = [
  { label: 'TARGET ORG',      key: 'org' },
  { label: 'TARGET COURSE #', key: 'num' },
  { label: 'TARGET RUN',      key: 'run' },
];

function PhaseItem({ item }) {
  const [isOpen, setIsOpen] = useState(false);
  const sc = SC_MAP[item.status] || G500;
  const label = item.r ? item.r.name : (item.name || item.code || item.org || '');
  const sublabel = item.r ? makeKey(item.r.org, item.r.num, item.r.run) : (item.code || '');
  const statusLabel = SL_MAP[item.status] || '';

  return (
    <div style={{ borderBottom: '1px solid ' + BORDER }}>
      <div
        onClick={() => setIsOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 0', cursor: 'pointer',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = G50; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <div style={{
          flex: 1, fontSize: 13, fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </div>
        {sublabel && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: G500, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {sublabel}
          </div>
        )}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 13, fontWeight: 500, color: sc,
          minWidth: 86, justifyContent: 'flex-end', flexShrink: 0,
        }}>
          {item.status === 'running' ? <Spinner animation="border" size="sm" style={{ width: 12, height: 12, borderWidth: '0.15em', color: BRAND }} />
            : item.status === 'success' ? '✓'
            : item.status === 'failed'  ? '✗'
            : '○'}
          {' '}{statusLabel}
        </div>
        <div style={{ fontSize: 12, color: G500, minWidth: 42, textAlign: 'right', flexShrink: 0 }}>
          {item.elapsed}
        </div>
        <span style={{ fontSize: 11, color: G500, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div style={{ marginBottom: 8 }}>
          {item.r && (
            <div style={{
              display: 'flex', gap: 0, fontSize: 11, fontFamily: MONO,
              borderRadius: '4px 4px 0 0', overflow: 'hidden',
              border: '1px solid ' + BORDER, borderBottom: 'none',
            }}>
              {TARGET_COLS.map(({ label: colLabel, key }) => (
                <div key={key} style={{ flex: 1, padding: '5px 10px', background: BRAND_XLT, borderRight: '1px solid ' + BORDER }}>
                  <div style={{
                    fontSize: 10, color: BRAND, opacity: .7, marginBottom: 1,
                    textTransform: 'uppercase', letterSpacing: '.04em',
                    fontFamily: FONT, fontWeight: 600,
                  }}>
                    {colLabel}
                  </div>
                  <div style={{ color: BRAND, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.r[key]}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{
            background: '#1e2129',
            borderRadius: item.r ? '0 0 4px 4px' : 4,
            padding: '10px 14px', fontFamily: MONO, fontSize: 11, lineHeight: 1.8,
            maxHeight: 160, overflowY: 'auto',
            border: item.r ? '1px solid ' + BORDER : 'none',
            borderTop: 'none',
          }}>
            {item.logs.length === 0 && <div style={{ color: '#6e7681' }}>Waiting to start...</div>}
            {item.logs.map((l, x) => (
              <div key={x} style={{ color: LOG_COLORS[l.lv] || '#c9d1d9' }}>
                [{l.ts}] {l.msg}
              </div>
            ))}
            {item.status === 'running' && <div style={{ color: '#6e7681' }}>[...] Working...</div>}
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
