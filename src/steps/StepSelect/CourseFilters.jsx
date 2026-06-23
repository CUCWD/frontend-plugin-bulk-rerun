import PropTypes from 'prop-types';
import { Button } from '@openedx/paragon';

const CourseFilters = ({
  showPrograms,
  programById,
  progFilter,
  srcOrgOptions,
  srcOrgFilter,
  courseQ,
  courseCount,
  onProgFilter,
  onSrcOrgFilter,
  onCourseQ,
  onClear,
}) => (
  <div className="ss-filters">
    {showPrograms && (
      <select
        value={progFilter}
        onChange={e => onProgFilter(e.target.value)}
        className="ss-filter-select"
      >
        <option value="">All programs</option>
        {Object.values(programById).map(p => (
          <option key={p.id} value={p.id}>{p.shortName}</option>
        ))}
      </select>
    )}

    <select
      value={srcOrgFilter}
      onChange={e => onSrcOrgFilter(e.target.value)}
      className="ss-filter-select ss-filter-select--wide"
    >
      <option value="">All orgs</option>
      {srcOrgOptions.map(o => (
        <option key={o.code} value={o.code}>{o.name} ({o.code})</option>
      ))}
    </select>

    <div className="ss-search-wrap">
      <input
        value={courseQ}
        onChange={e => onCourseQ(e.target.value)}
        placeholder="Filter by course name or number..."
        className="ss-search-input"
      />
      <span className="ss-search-icon">&#128269;</span>
    </div>

    {courseCount > 0 && (
      <Button variant="tertiary" size="sm" onClick={onClear} className="ss-clear-btn">
        Clear ({courseCount})
      </Button>
    )}
  </div>
);

CourseFilters.propTypes = {
  showPrograms: PropTypes.bool.isRequired,
  programById: PropTypes.objectOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    shortName: PropTypes.string.isRequired,
  })).isRequired,
  progFilter: PropTypes.string.isRequired,
  srcOrgOptions: PropTypes.arrayOf(PropTypes.shape({
    code: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  })).isRequired,
  srcOrgFilter: PropTypes.string.isRequired,
  courseQ: PropTypes.string.isRequired,
  courseCount: PropTypes.number.isRequired,
  onProgFilter: PropTypes.func.isRequired,
  onSrcOrgFilter: PropTypes.func.isRequired,
  onCourseQ: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
};

export default CourseFilters;
