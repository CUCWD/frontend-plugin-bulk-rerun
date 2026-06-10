// Draft new-org form for StepSelect using Paragon Form and Add/Delete icon buttons.
// NOT currently imported — new-org creation is not active in the DEMO build.
import React from 'react';
import {
  Form, Button, Icon, IconButton,
} from '@openedx/paragon';
import { Add, Delete } from '@openedx/paragon/icons';

const NewOrgForm = ({ entries, onChange }) => {
  const add = () => onChange([...entries, { code: '', name: '' }]);

  const remove = (i) => onChange(entries.filter((_, idx) => idx !== i));

  const update = (i, field, value) => {
    const next = entries.map((e, idx) => (idx === i ? { ...e, [field]: value } : e));
    onChange(next);
  };

  return (
    <div>
      {entries.map((entry, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="d-flex gap-3 align-items-end mb-3">
          <Form.Group className="flex-grow-1 mb-0">
            <Form.Label>Org code</Form.Label>
            <Form.Control
              value={entry.code}
              onChange={e => update(i, 'code', e.target.value)}
              placeholder="e.g. ACME"
            />
          </Form.Group>
          <Form.Group className="flex-grow-1 mb-0">
            <Form.Label>Display name</Form.Label>
            <Form.Control
              value={entry.name}
              onChange={e => update(i, 'name', e.target.value)}
              placeholder="e.g. Acme University"
            />
          </Form.Group>
          <IconButton
            src={Delete}
            iconAs={Icon}
            onClick={() => remove(i)}
            variant="tertiary"
          />
        </div>
      ))}
      <Button variant="outline-primary" size="sm" iconBefore={Add} onClick={add}>
        Add organization
      </Button>
    </div>
  );
};

export default NewOrgForm;
