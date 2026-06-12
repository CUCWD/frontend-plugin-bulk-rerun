// Numbered phase header used inside JobProgress to label each execution phase.
// Circle colour reflects phase state: grey=pending, blue=active, green=done.
// Skipped phases (Discovery disabled) show a warning Badge instead of a filled circle.
import { Badge } from '@openedx/paragon';

export default function PhaseHeader({ num, label, sub, done, active, skipped, accentColor }) {
  const circleMod = done ? '--done' : active ? '--active' : '';

  return (
    <div className="ph-root">
      <div
        className={`ph-circle${circleMod ? ' ph-circle' + circleMod : ''}`}
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
}
