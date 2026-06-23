import PropTypes from 'prop-types';
import { Spinner, DataTable } from '@openedx/paragon';

const CourseTable = ({
  loading,
  error,
  columns,
  filtered,
  courses,
  courseCount,
  srcOrgFilter,
  clearKey,
  onSelectedRowsChanged,
}) => {
  if (loading) {
    return (
      <div className="ss-loading">
        <Spinner animation="border" size="sm" className="me-2" />
        Loading courses…
      </div>
    );
  }
  if (error) {
    return (
      <div className="ss-error">
        Failed to load courses. Please refresh and try again.
      </div>
    );
  }
  return (
    <>
      <div className="ss-course-table">
        {/* eslint-disable-next-line
          jsx-a11y/click-events-have-key-events,
          jsx-a11y/no-static-element-interactions */}
        <div
          onClick={(e) => {
            const tr = e.target.closest('tr.pgn__data-table-row');
            if (!tr) { return; }
            if (e.target.type === 'checkbox' || e.target.closest('label')) { return; }
            const cb = tr.querySelector('input[type="checkbox"]');
            if (cb) { cb.click(); }
          }}
        >
          <DataTable
            key={`${srcOrgFilter}-${clearKey}`}
            isSelectable
            columns={columns}
            data={filtered}
            itemCount={filtered.length}
            onSelectedRowsChanged={onSelectedRowsChanged}
            initialTableOptions={{
              // eslint-disable-next-line react/prop-types
              getRowId: row => row.id,
              autoResetSelectedRows: false,
            }}
          >
            <DataTable.Table isStriped={false} />
            <DataTable.EmptyTable content="No courses match your filters." />
          </DataTable>
        </div>
      </div>
      <div className="ss-table-footer">
        <span>
          {`Showing ${filtered.length} course${filtered.length !== 1 ? 's' : ''}`}
          {filtered.length !== courses.length ? ` of ${courses.length}` : ''}
        </span>
        <span>{courseCount} selected</span>
      </div>
    </>
  );
};

CourseTable.propTypes = {
  loading: PropTypes.bool.isRequired,
  error: PropTypes.bool.isRequired,
  columns: PropTypes.arrayOf(PropTypes.shape({})).isRequired,
  filtered: PropTypes.arrayOf(PropTypes.shape({})).isRequired,
  courses: PropTypes.arrayOf(PropTypes.shape({})).isRequired,
  courseCount: PropTypes.number.isRequired,
  srcOrgFilter: PropTypes.string.isRequired,
  clearKey: PropTypes.number.isRequired,
  onSelectedRowsChanged: PropTypes.func.isRequired,
};

export default CourseTable;
