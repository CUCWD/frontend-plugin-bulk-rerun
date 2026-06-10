// Draft phase-section component for StepProgress using Paragon ProgressBar and Badge.
// NOT currently imported — the active phase rendering is split across
// PhaseHeader.jsx and PhaseItemRows.jsx, both used by JobProgress.jsx.
import React from 'react';
import { Badge, ProgressBar } from '@openedx/paragon';

const PHASE_LABELS = {
  course_creation:  'Course creation',
  certificate:      'Certificates',
  team_access:      'Team access',
  discovery_sync:   'Discovery sync',
  gating:           'Gating',
  org_registration: 'Org registration',
};

const PhaseSection = ({ phase, jobs }) => {
  const total = jobs.length;
  const done = jobs.filter(j => ['succeeded', 'failed', 'skipped'].includes(j.status)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mb-4">
      <div className="d-flex align-items-center justify-content-between mb-1">
        <strong className="small">{PHASE_LABELS[phase] || phase}</strong>
        <Badge variant="light">{done}/{total}</Badge>
      </div>
      <ProgressBar now={pct} label={`${pct}%`} variant={pct === 100 ? 'success' : 'primary'} />
    </div>
  );
};

export default PhaseSection;
