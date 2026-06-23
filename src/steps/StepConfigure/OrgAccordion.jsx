import PropTypes from 'prop-types';
import { Badge, DataTable } from '@openedx/paragon';
import TeamTab from './TeamTab';

const OrgAccordion = ({
  orgCode,
  orgName,
  orgRows,
  orgErr,
  isOpen,
  onToggle,
  activeOrgTab,
  onTabChange,
  courseRunColumns,
  renderCourseRunSubRow,
  conflicts,
  courseIdTooLong,
  orgRoster,
  teamColumns,
  emailStatus,
  addOrgMember,
  removeOp,
  setRemoveOp,
  runId,
}) => {
  const filledMembers = orgRoster.filter(r => r.email).length;
  const coursesLabel = `Courses (${orgRows.length})`;
  const teamLabel = `Team & Access${filledMembers > 0 ? ` (${filledMembers})` : ''}`;
  const orgConflictsKey = `${runId}:${orgCode}:${orgRows.map(
    r => (conflicts[r.idx] || '') + (courseIdTooLong[r.idx] ? '!' : ''),
  ).join(',')}`;
  const orgInitialExpanded = Object.fromEntries(
    orgRows.flatMap(r => (conflicts[r.idx] ? [[r.id, true]] : [])),
  );

  return (
    <div className="sc-org-group">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { onToggle(); } }}
        className={`sc-org-header${orgErr ? ' sc-org-header--err' : ''}`}
      >
        <span className="sc-org-code">{orgName} ({orgCode})</span>
        <span className="sc-org-meta">{`${orgRows.length} course${orgRows.length !== 1 ? 's' : ''}`}</span>
        {orgErr && <Badge variant="danger" pill className="sc-badge-sm">conflict</Badge>}
        {filledMembers > 0 && (
          <Badge variant="info" pill className="sc-badge-sm">
            {`${filledMembers} member${filledMembers !== 1 ? 's' : ''}`}
          </Badge>
        )}
        <div className="sc-org-spacer" />
        <span className="sc-org-toggle-text">{isOpen ? '▲ collapse' : '▼ expand'}</span>
      </div>

      {isOpen && (
        <>
          <div className="sc-org-tabs">
            {[{ id: 'courses', label: coursesLabel }, { id: 'team', label: teamLabel }].map(t => (
              <div
                key={t.id}
                role="tab"
                tabIndex={0}
                onClick={e => { e.stopPropagation(); onTabChange(t.id); }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    onTabChange(t.id);
                  }
                }}
                className={`sc-org-tab${activeOrgTab === t.id ? ' sc-org-tab--active' : ''}`}
              >
                {t.label}
              </div>
            ))}
          </div>

          {activeOrgTab === 'courses' && (
            <div className="bulk-rerun-course-table">
              <DataTable
                key={orgConflictsKey}
                isExpandable
                renderRowSubComponent={renderCourseRunSubRow}
                columns={courseRunColumns}
                data={orgRows.map(r => ({
                  ...r,
                  conflict: conflicts[r.idx],
                  lenErr: courseIdTooLong[r.idx],
                }))}
                itemCount={orgRows.length}
                initialState={{ expanded: orgInitialExpanded }}
                initialTableOptions={{
                  // eslint-disable-next-line react/prop-types
                  getRowId: row => row.id,
                  autoResetSelectedRows: false,
                  autoResetExpanded: false,
                }}
              >
                <DataTable.Table isStriped={false} />
                <DataTable.EmptyTable content="No courses." />
              </DataTable>
            </div>
          )}

          {activeOrgTab === 'team' && (
            <TeamTab
              orgCode={orgCode}
              orgName={orgName}
              orgRoster={orgRoster}
              emailStatus={emailStatus}
              teamColumns={teamColumns}
              addOrgMember={addOrgMember}
              removeOp={removeOp}
              setRemoveOp={setRemoveOp}
              filledMembers={filledMembers}
            />
          )}
        </>
      )}
    </div>
  );
};

OrgAccordion.propTypes = {
  orgCode: PropTypes.string.isRequired,
  orgName: PropTypes.string,
  orgRows: PropTypes.arrayOf(PropTypes.shape({
    idx: PropTypes.number.isRequired,
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  })).isRequired,
  orgErr: PropTypes.bool.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  activeOrgTab: PropTypes.string.isRequired,
  onTabChange: PropTypes.func.isRequired,
  courseRunColumns: PropTypes.arrayOf(PropTypes.shape({})).isRequired,
  renderCourseRunSubRow: PropTypes.func.isRequired,
  conflicts: PropTypes.arrayOf(PropTypes.string).isRequired,
  courseIdTooLong: PropTypes.arrayOf(PropTypes.bool).isRequired,
  orgRoster: PropTypes.arrayOf(PropTypes.shape({ email: PropTypes.string })).isRequired,
  teamColumns: PropTypes.arrayOf(PropTypes.shape({})).isRequired,
  emailStatus: PropTypes.objectOf(PropTypes.string).isRequired,
  addOrgMember: PropTypes.func.isRequired,
  removeOp: PropTypes.bool.isRequired,
  setRemoveOp: PropTypes.func.isRequired,
  runId: PropTypes.string.isRequired,
};
OrgAccordion.defaultProps = { orgName: undefined };

export default OrgAccordion;
