// Draft extraction of the Certificates tab from StepConfigure.
// Pulls certificate settings from hookstate directly. NOT currently imported —
// the active implementation is inline in StepConfigure/index.jsx.
import React from 'react';
import { Form, CheckboxControl } from '@openedx/paragon';

import { useBulkRerunState } from '../../state';

const CertificatesTab = () => {
  const { certs, setCerts } = useBulkRerunState();

  return (
    <div>
      <div className="row">
        <div className="col-md-6 mb-3">
          <Form.Group>
            <Form.Label>Certificate mode</Form.Label>
            <Form.Control
              as="select"
              value={certs.mode}
              onChange={e => setCerts({ mode: e.target.value })}
            >
              <option value="honor">Honor</option>
              <option value="verified">Verified</option>
              <option value="audit">Audit</option>
            </Form.Control>
          </Form.Group>
        </div>
        <div className="col-md-6 mb-3">
          <Form.Group>
            <Form.Label>Certificate display behavior</Form.Label>
            <Form.Control
              as="select"
              value={certs.display}
              onChange={e => setCerts({ display: e.target.value })}
            >
              <option value="early_no_info">Early — no info</option>
              <option value="early_with_info">Early — with info</option>
              <option value="end_with_date">End of course</option>
            </Form.Control>
          </Form.Group>
        </div>
      </div>
      <div className="mb-2">
        <CheckboxControl
          checked={certs.create}
          onChange={e => setCerts({ create: e.target.checked })}
          label="Create certificate configuration"
        />
      </div>
      <div className="mb-2">
        <CheckboxControl
          checked={certs.studentGenCert}
          onChange={e => setCerts({ studentGenCert: e.target.checked })}
          label="Enable student-generated certificates"
        />
      </div>
      <div>
        <CheckboxControl
          checked={certs.certOnDashboard}
          onChange={e => setCerts({ certOnDashboard: e.target.checked })}
          label="Show certificate on learner dashboard"
        />
      </div>
    </div>
  );
};

export default CertificatesTab;
