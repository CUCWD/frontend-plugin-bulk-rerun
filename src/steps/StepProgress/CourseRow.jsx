// Draft course-row component for StepProgress that polls real job logs via useJobLogs.
// Uses Paragon Collapsible for expand/collapse. NOT currently imported —
// the active row rendering is handled by PhaseItemRows.jsx inside JobProgress.jsx.
import React, { useState } from 'react';
import { Collapsible, Badge, Spinner } from '@openedx/paragon';

import { useJobLogs } from '../../hooks';

const STATUS_BADGE = {
  pending:    { variant: 'light',   label: 'Pending' },
  running:    { variant: 'primary', label: 'Running' },
  succeeded:  { variant: 'success', label: 'Done' },
  failed:     { variant: 'danger',  label: 'Failed' },
  skipped:    { variant: 'warning', label: 'Skipped' },
};

const CourseRow = ({ job }) => {
  const [open, setOpen] = useState(false);
  const { data: logs } = useJobLogs(open ? job.id : null);
  const badge = STATUS_BADGE[job.status] || STATUS_BADGE.pending;

  return (
    <Collapsible
      title={(
        <div className="d-flex align-items-center justify-content-between w-100 pr-3">
          <span className="font-monospace small">{job.target_course_key}</span>
          <div className="d-flex align-items-center gap-2">
            {job.status === 'running' && <Spinner animation="border" size="sm" />}
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
        </div>
      )}
      open={open}
      onToggle={setOpen}
      className="mb-1"
    >
      <div className="bg-dark text-light p-3 rounded" style={{ fontFamily: 'monospace', fontSize: 12, maxHeight: 300, overflowY: 'auto' }}>
        {logs?.entries?.length
          ? logs.entries.map((e, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={i} className={e.level === 'ERROR' ? 'text-danger' : ''}>
              <span className="text-muted mr-2">{e.timestamp}</span>
              {e.message}
            </div>
          ))
          : <span className="text-muted">No log entries yet.</span>}
      </div>
    </Collapsible>
  );
};

export default CourseRow;
