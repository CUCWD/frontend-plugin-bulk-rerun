// Draft extraction of the Lesson Gating tab from StepConfigure.
// Pulls gating state from hookstate directly. NOT currently imported —
// the active implementation is inline in StepConfigure/index.jsx.
import React from 'react';
import { Form } from '@openedx/paragon';

import { useBulkRerunState } from '../../state';

const GatingTab = () => {
  const { gating, setGating } = useBulkRerunState();

  return (
    <div>
      <Form.Group className="mb-3">
        <Form.Label>Gating mode</Form.Label>
        <Form.Control
          as="select"
          value={gating.mode}
          onChange={e => setGating({ mode: e.target.value })}
        >
          <option value="disabled">Disabled</option>
          <option value="enabled">Enabled</option>
          <option value="template">From template</option>
        </Form.Control>
      </Form.Group>
      {gating.mode === 'template' && (
        <Form.Group>
          <Form.Label>Template course key</Form.Label>
          <Form.Control
            className="font-monospace"
            value={gating.templateId}
            onChange={e => setGating({ templateId: e.target.value })}
            placeholder="course-v1:ORG+COURSE+RUN"
          />
        </Form.Group>
      )}
    </div>
  );
};

export default GatingTab;
