// Scheduling tab — course and enrollment date pickers, course pacing, and the
// shared target run identifier field with inline format validation indicator.
// Rendered inside StepConfigure when the 'scheduling' sub-tab is active.
// Props: sched, setSched, runId, setRunId, schedErrs, schedOkUI, runIdV
//        (state and derived values owned by StepConfigure).
import { Alert, Form } from '@openedx/paragon';
import './SchedulingTab.scss';

const DATE_FIELDS = [
  ['Course start date',   'start'],
  ['Course end date',     'end'],
  ['Enrollment start',    'enrollStart'],
  ['Enrollment end',      'enrollEnd'],
];

function Lbl({ children }) {
  return <Form.Label className="sc-lbl">{children}</Form.Label>;
}

const SchedulingTab = ({ sched, setSched, runId, setRunId, schedErrs, schedOkUI, runIdV }) => (
  <div>
    <div className="sc-grid-2">
      {DATE_FIELDS.map(([lbl, k]) => (
        <div key={k}>
          <Lbl>{lbl}</Lbl>
          <Form.Control
            type="date"
            value={sched[k]}
            isInvalid={!!schedErrs[k]}
            onChange={e => setSched(p => ({ ...p, [k]: e.target.value }))}
          />
          {schedErrs[k] && <div className="sc-field-err">{schedErrs[k]}</div>}
        </div>
      ))}
      <div>
        <Lbl>Course pacing</Lbl>
        <Form.Control as="select" value={sched.pacing} onChange={e => setSched(p => ({ ...p, pacing: e.target.value }))}>
          <option value="instructor">Instructor-paced</option>
          <option value="self">Self-paced</option>
        </Form.Control>
      </div>
      <div>
        <Lbl>Target run identifier</Lbl>
        <div className="sc-run-field">
          <Form.Control
            value={runId}
            className="font-monospace"
            isInvalid={!runIdV.ok && runId.length > 0}
            onChange={e => setRunId(e.target.value)}
            placeholder="e.g. 2026_2027"
            style={runId.length > 0 ? { paddingRight: 30 } : undefined}
          />
          {runId.length > 0 && (
            <span className={`sc-run-indicator sc-run-indicator--${runIdV.ok ? 'ok' : 'err'}`}>
              {runIdV.ok ? '✓' : '✗'}
            </span>
          )}
        </div>
        {runId.length > 0 && (
          <div className={`sc-run-msg sc-run-msg--${runIdV.ok ? 'ok' : 'err'}`}>
            {runIdV.msg}
          </div>
        )}
      </div>
    </div>
    {!schedOkUI && (
      <Alert variant="warning" className="mb-0 mt-2 py-2">
        <strong className="sc-alert-title">Fix scheduling dates before continuing</strong>
        The date configuration has issues that must be resolved.
      </Alert>
    )}
    {schedOkUI && runIdV.ok && (
      <Alert variant="info" className="mb-0 mt-2 py-2">
        <strong className="sc-alert-title">Run identifier applied to all course runs</strong>
        Changing this updates every row. Individual overrides available in the table below.
      </Alert>
    )}
  </div>
);

export default SchedulingTab;
