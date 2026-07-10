import PropTypes from 'prop-types';
import { Button, Form } from '@openedx/paragon';

// activeCount counts only jobs whose batch has not reached a terminal state
// (job.done unset) — completed cards stay on screen until dismissed but no
// longer count as "active". The user dropdown lists plain names; per-user
// counts were dropped deliberately.
const FilterBar = ({
  activeCount, jobUserFilter, setJobUserFilter, uniqueUsers,
}) => (
  <div className="sp-filter-bar">
    <span className="sp-filter-count">
      {`${activeCount} active run${activeCount !== 1 ? 's' : ''}`}
    </span>
    <div className="sp-filter-right">
      <span className="sp-filter-label">Filter by user:</span>
      <Form.Control
        as="select"
        size="sm"
        value={jobUserFilter}
        onChange={e => setJobUserFilter(e.target.value)}
        className="sp-filter-select"
      >
        <option value="">All users</option>
        {uniqueUsers.map(u => (
          <option key={u} value={u}>{u}</option>
        ))}
      </Form.Control>
      {jobUserFilter && (
        <Button variant="tertiary" size="sm" onClick={() => setJobUserFilter('')}>Clear</Button>
      )}
    </div>
  </div>
);

FilterBar.propTypes = {
  activeCount: PropTypes.number.isRequired,
  jobUserFilter: PropTypes.string.isRequired,
  setJobUserFilter: PropTypes.func.isRequired,
  uniqueUsers: PropTypes.arrayOf(PropTypes.string).isRequired,
};

export default FilterBar;
