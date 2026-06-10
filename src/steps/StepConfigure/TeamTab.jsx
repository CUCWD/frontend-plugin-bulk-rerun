// Draft extraction of the Team & Access tab from StepConfigure.
// Uses Paragon Add/Delete icon buttons for roster management.
// NOT currently imported — the active team UI is inline in StepConfigure/index.jsx.
import React from 'react';
import {
  Form, Button, Icon, IconButton, CheckboxControl,
} from '@openedx/paragon';
import { Add, Delete } from '@openedx/paragon/icons';

import { useBulkRerunState } from '../../state';

const STUDIO_ROLES = ['staff', 'instructor', 'beta_testers', 'data_researcher', 'finance_admin', 'sales_admin'];
const DISCUSSION_ROLES = ['', 'Moderator', 'Community TA', 'Administrator'];

const TeamTab = () => {
  const { teamMembers, setTeamMembers, removeProvisioner, setRemoveProvisioner } = useBulkRerunState();

  const add = () => setTeamMembers([...teamMembers, { email: '', studioRole: 'staff', discussionRole: '' }]);
  const remove = i => setTeamMembers(teamMembers.filter((_, idx) => idx !== i));
  const update = (i, field, value) => setTeamMembers(
    teamMembers.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)),
  );

  return (
    <div>
      <div className="mb-4">
        <CheckboxControl
          checked={removeProvisioner}
          onChange={e => setRemoveProvisioner(e.target.checked)}
          label="Remove provisioner account after course creation"
        />
      </div>
      <p className="small text-muted mb-3">Add team members who will receive staff access on all created courses.</p>
      {teamMembers.map((m, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="d-flex gap-3 align-items-end mb-3">
          <Form.Group className="flex-grow-1 mb-0">
            <Form.Label>Email</Form.Label>
            <Form.Control
              type="email"
              value={m.email}
              onChange={e => update(i, 'email', e.target.value)}
              placeholder="user@example.com"
            />
          </Form.Group>
          <Form.Group className="mb-0" style={{ minWidth: 140 }}>
            <Form.Label>Studio role</Form.Label>
            <Form.Control
              as="select"
              value={m.studioRole}
              onChange={e => update(i, 'studioRole', e.target.value)}
            >
              {STUDIO_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </Form.Control>
          </Form.Group>
          <Form.Group className="mb-0" style={{ minWidth: 140 }}>
            <Form.Label>Discussion role</Form.Label>
            <Form.Control
              as="select"
              value={m.discussionRole}
              onChange={e => update(i, 'discussionRole', e.target.value)}
            >
              {DISCUSSION_ROLES.map(r => <option key={r} value={r}>{r || '(none)'}</option>)}
            </Form.Control>
          </Form.Group>
          <IconButton src={Delete} iconAs={Icon} onClick={() => remove(i)} variant="tertiary" />
        </div>
      ))}
      <Button variant="outline-primary" size="sm" iconBefore={Add} onClick={add}>
        Add team member
      </Button>
    </div>
  );
};

export default TeamTab;
