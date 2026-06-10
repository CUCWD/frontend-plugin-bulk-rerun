// Numbered phase header used inside JobProgress to label each execution phase.
// Circle colour reflects phase state: grey=pending, blue=active, green=done.
// Skipped phases (Discovery disabled) show a warning Badge instead of a filled circle.
import { Badge } from '@openedx/paragon';

const SUCCESS = '#178253';
const BRAND   = '#006daa';
const G200    = '#e0e0e0';
const G500    = '#6c757d';
const G300    = '#c8c8c8';
const G900    = '#1f2937';
const WARNING = '#856404';
const WARNING_BG = '#fff8e6';
const WARNING_BDR = '#ffc107';

export default function PhaseHeader({ num, label, sub, done, active, skipped, accentColor }) {
  const bg = skipped ? G200
           : done    ? (accentColor || SUCCESS)
           : active  ? BRAND
           : G200;
  const col = (done || active) && !skipped ? '#fff' : G500;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: bg, color: col,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>
        {done ? '✓' : num}
      </div>
      <span style={{ fontWeight: 600, fontSize: 13, color: skipped ? G300 : G900 }}>{label}</span>
      <span style={{ fontSize: 12, color: skipped ? G300 : G500 }}>{sub}</span>
      {skipped && (
        <Badge variant="warning" pill style={{ fontSize: 11, lineHeight: 1.5 }}>
          Skipped - Discovery not enabled
        </Badge>
      )}
    </div>
  );
}
