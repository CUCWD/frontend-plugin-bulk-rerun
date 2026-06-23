// Gating tab — lesson gating mode selector (Copy from source / Custom map /
// Disabled) and, when Custom map is active, min score and min completion inputs.
// Rendered inside StepConfigure when the 'gating' sub-tab is active.
// Props: gating, setGating (local state owned by StepConfigure).
import PropTypes from 'prop-types';
import { Alert, Form } from '@openedx/paragon';
import './GatingTab.scss';

const GATING_MODES = [
  { v: 'copy', title: 'Copy from source', desc: 'Replicate source course gating rules' },
  { v: 'custom', title: 'Custom map', desc: 'Define prerequisite blocks with min score/completion' },
  { v: 'disabled', title: 'Disabled', desc: 'No gating - all content immediately accessible' },
];

const Lbl = ({ children, hint }) => (
  <Form.Label className="sc-lbl">
    {children}
    {hint && <span className="sc-lbl-hint">{hint}</span>}
  </Form.Label>
);

Lbl.propTypes = {
  children: PropTypes.node.isRequired,
  hint: PropTypes.string,
};
Lbl.defaultProps = { hint: null };

const GatingTab = ({ gating, setGating }) => (
  <div>
    <Alert variant="info" className="mb-3 py-2">
      <strong className="sc-alert-title">Lesson gating - subsection prerequisites</strong>
      Uses openedx.core.lib.gating API. Safe default is Copy from source.
    </Alert>
    <div className="sc-gating-mode-wrap">
      <Lbl>Gating mode</Lbl>
      <div className="sc-gating-grid">
        {GATING_MODES.map(m => (
          <label
            key={m.v}
            htmlFor={`gmode-${m.v}`}
            aria-label={m.title}
            className={`sc-gating-option${gating.mode === m.v ? ' sc-gating-option--active' : ''}`}
          >
            <input
              id={`gmode-${m.v}`}
              type="radio"
              name="gmode"
              value={m.v}
              checked={gating.mode === m.v}
              onChange={() => setGating(p => ({ ...p, mode: m.v }))}
            />
            <div>
              <div className="sc-gating-option__title">{m.title}</div>
              <div className="sc-gating-option__desc">{m.desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
    {gating.mode === 'custom' && (
      <div className="sc-grid-2">
        <div>
          <Lbl hint="0-100">Min score %</Lbl>
          <Form.Control
            value={gating.minScore}
            className="font-monospace"
            onChange={e => setGating(p => ({ ...p, minScore: e.target.value }))}
          />
        </div>
        <div>
          <Lbl hint="0-100">Min completion %</Lbl>
          <Form.Control
            value={gating.minComplete}
            className="font-monospace"
            onChange={e => setGating(p => ({ ...p, minComplete: e.target.value }))}
          />
        </div>
      </div>
    )}
    {gating.mode === 'disabled' && (
      <div className="sc-gating-disabled">
        No gating applied. All sections accessible immediately.
      </div>
    )}
  </div>
);

GatingTab.propTypes = {
  gating: PropTypes.shape({
    mode: PropTypes.string,
    minScore: PropTypes.string,
    minComplete: PropTypes.string,
  }).isRequired,
  setGating: PropTypes.func.isRequired,
};

export default GatingTab;
