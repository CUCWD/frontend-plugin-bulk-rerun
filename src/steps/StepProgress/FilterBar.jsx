import PropTypes from 'prop-types';
import { Button, Form } from '@openedx/paragon';

const FilterBar = ({
  activeJobs, jobUserFilter, setJobUserFilter, uniqueUsers,
}) => (
  <div className="sp-filter-bar">
    <span className="sp-filter-count">
      {`${activeJobs.length} active run${activeJobs.length !== 1 ? 's' : ''}`}
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
        <option value="">{`All users (${activeJobs.length})`}</option>
        {uniqueUsers.map(u => (
          <option key={u} value={u}>
            {`${u} (${activeJobs.filter(j => j.createdBy === u).length})`}
          </option>
        ))}
      </Form.Control>
      {jobUserFilter && (
        <Button variant="tertiary" size="sm" onClick={() => setJobUserFilter('')}>Clear</Button>
      )}
    </div>
  </div>
);

FilterBar.propTypes = {
  activeJobs: PropTypes.arrayOf(PropTypes.shape({ createdBy: PropTypes.string })).isRequired,
  jobUserFilter: PropTypes.string.isRequired,
  setJobUserFilter: PropTypes.func.isRequired,
  uniqueUsers: PropTypes.arrayOf(PropTypes.string).isRequired,
};

export default FilterBar;
