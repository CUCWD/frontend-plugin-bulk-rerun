// Certificates tab — course mode, certificate display behaviour, and three
// toggle settings (create, student-generated, dashboard visibility).
// Rendered inside StepConfigure when the 'certs' sub-tab is active.
// Props: certs, setCerts (local state owned by StepConfigure).
import PropTypes from 'prop-types';
import { Alert, Form } from '@openedx/paragon';
import './CertificatesTab.scss';

const CERT_DISPLAY_OPTS = [
  { value: 'early_no_info', label: 'Immediately upon passing (early_no_info)' },
  { value: 'early_with_info', label: 'Immediately with course info' },
  { value: 'end', label: 'After course end date' },
];

const Lbl = ({ children, hint }) => (
  <Form.Label className="sc-lbl">
    {children}
    {hint && <span className="sc-lbl-hint">{hint}</span>}
  </Form.Label>
);

const Toggle = ({
  id, checked, onChange, label, hint,
}) => (
  <div className="sc-toggle">
    <div className="sc-toggle__text">
      <div className="sc-toggle__label">{label}</div>
      {hint && <span className="sc-toggle__hint">{hint}</span>}
    </div>
    <input
      id={id}
      type="checkbox"
      role="switch"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="sc-toggle__switch"
    />
  </div>
);

const CertificatesTab = ({ certs, setCerts }) => (
  <div>
    <Alert variant="info" className="mb-3 py-2">
      <strong className="sc-alert-title">Global certificate template</strong>
      A single branded certificate template is applied across all organizations.
    </Alert>
    <div className="sc-grid-2">
      <div>
        <Lbl hint="Type of certificate issued">Course mode</Lbl>
        <Form.Control as="select" value={certs.mode} onChange={e => setCerts(p => ({ ...p, mode: e.target.value }))}>
          <option value="honor">Honor</option>
          <option value="verified">Verified</option>
        </Form.Control>
      </div>
      <div>
        <Lbl hint="When certificate is available">Certificate display behavior</Lbl>
        <Form.Control as="select" value={certs.display} onChange={e => setCerts(p => ({ ...p, display: e.target.value }))}>
          {CERT_DISPLAY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Form.Control>
      </div>
    </div>
    <Toggle id="cc" checked={certs.create} onChange={e => setCerts(p => ({ ...p, create: e.target.checked }))} label="Create and activate certificate" hint="Creates the honor certificate and marks it active in Studio" />
    <Toggle id="sg" checked={certs.studentGenCert} onChange={e => setCerts(p => ({ ...p, studentGenCert: e.target.checked }))} label="Enable student-generated certificates" hint="Students can generate certificates from the Instructor tab" />
    <Toggle id="db" checked={certs.certOnDashboard} onChange={e => setCerts(p => ({ ...p, certOnDashboard: e.target.checked }))} label="Display certificate on learner dashboard" hint="Certificate link visible immediately upon earning" />
  </div>
);

Lbl.propTypes = {
  children: PropTypes.node.isRequired,
  hint: PropTypes.string,
};
Lbl.defaultProps = { hint: null };

Toggle.propTypes = {
  id: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  hint: PropTypes.string,
};
Toggle.defaultProps = { hint: null };

CertificatesTab.propTypes = {
  certs: PropTypes.shape({
    mode: PropTypes.string,
    display: PropTypes.string,
    create: PropTypes.bool,
    studentGenCert: PropTypes.bool,
    certOnDashboard: PropTypes.bool,
  }).isRequired,
  setCerts: PropTypes.func.isRequired,
};

export default CertificatesTab;
