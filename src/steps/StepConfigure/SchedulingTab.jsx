// Draft extraction of the Scheduling tab from StepConfigure.
// Validates dates with validateRunId and drives form state via hookstate.
// NOT currently imported — the active scheduling UI is inline in StepConfigure/index.jsx.
import React from 'react';
import { Form, Alert } from '@openedx/paragon';

import { useBulkRerunState } from '../../state';
import { validateRunId } from '../../utils/courseKeys';
import { validateSched } from '../../utils/scheduling';

const DATE_FIELDS = [
  { key: 'start',       label: 'Course start date' },
  { key: 'end',         label: 'Course end date' },
  { key: 'enrollStart', label: 'Enrollment start date' },
  { key: 'enrollEnd',   label: 'Enrollment end date' },
];

const SchedulingTab = () => {
  const { sched, setSched, runId, setRunId } = useBulkRerunState();
  const errs = validateSched(sched);
  const runIdV = validateRunId(runId);

  return (
    <div>
      <div className="row mb-3">
        {DATE_FIELDS.map(({ key, label }) => (
          <div key={key} className="col-md-6 mb-3">
            <Form.Group>
              <Form.Label>{label}</Form.Label>
              <Form.Control
                type="date"
                value={sched[key] || ''}
                isInvalid={!!errs[key]}
                onChange={e => setSched({ [key]: e.target.value })}
              />
              {errs[key] && <Form.Control.Feedback type="invalid">{errs[key]}</Form.Control.Feedback>}
            </Form.Group>
          </div>
        ))}
        <div className="col-md-6 mb-3">
          <Form.Group>
            <Form.Label>Course pacing</Form.Label>
            <Form.Control
              as="select"
              value={sched.pacing}
              onChange={e => setSched({ pacing: e.target.value })}
            >
              <option value="instructor">Instructor-paced</option>
              <option value="self">Self-paced</option>
            </Form.Control>
          </Form.Group>
        </div>
        <div className="col-md-6 mb-3">
          <Form.Group>
            <Form.Label>Target run identifier</Form.Label>
            <Form.Control
              className="font-monospace"
              value={runId}
              isInvalid={runId.length > 0 && !runIdV.ok}
              placeholder="e.g. 2026_2027"
              onChange={e => setRunId(e.target.value)}
            />
            {runId.length > 0 && !runIdV.ok && (
              <Form.Control.Feedback type="invalid">{runIdV.msg}</Form.Control.Feedback>
            )}
            {runId.length > 0 && runIdV.ok && (
              <small className="text-muted">{runIdV.msg}</small>
            )}
          </Form.Group>
        </div>
      </div>
      {Object.keys(errs).length > 0 && (
        <Alert variant="warning">Fix date errors before proceeding.</Alert>
      )}
    </div>
  );
};

export default SchedulingTab;
