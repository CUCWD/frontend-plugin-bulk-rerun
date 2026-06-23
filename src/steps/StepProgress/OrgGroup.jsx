// Draft org-group component for StepProgress using Paragon Collapsible and CourseRow.
// NOT currently imported — the active org-level grouping is inside JobProgress.jsx.
import React from 'react';
import PropTypes from 'prop-types';
import { Collapsible, Badge } from '@openedx/paragon';

import CourseRow from './CourseRow';

const STATUS_COUNTS = (jobs) => jobs.reduce((acc, j) => {
  acc[j.status] = (acc[j.status] || 0) + 1;
  return acc;
}, {});

const OrgGroup = ({ org, jobs }) => {
  const counts = STATUS_COUNTS(jobs);
  const done = (counts.succeeded || 0) + (counts.failed || 0) + (counts.skipped || 0);

  return (
    <Collapsible
      defaultOpen
      title={(
        <div className="d-flex align-items-center gap-2">
          <strong>{org}</strong>
          <Badge variant="primary">{done}/{jobs.length}</Badge>
          {counts.failed > 0 && <Badge variant="danger">{counts.failed} failed</Badge>}
        </div>
      )}
      className="mb-3"
    >
      {jobs.map(job => <CourseRow key={job.id} job={job} />)}
    </Collapsible>
  );
};

OrgGroup.propTypes = {
  org: PropTypes.string.isRequired,
  jobs: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    status: PropTypes.string.isRequired,
    target_course_key: PropTypes.string.isRequired,
  })).isRequired,
};

export default OrgGroup;
