// Team & Access tab — per-org Course Assignment Roster (CAR) panel rendered
// inside each org accordion group. Shows a DataTable of team members with email,
// Studio role, discussion role, and account-status columns, plus an Add button
// and the Remove provisioner toggle.
// Rendered inside StepConfigure when the 'team' org sub-tab is active.
// Props: orgCode, orgName, orgRoster, emailStatus, teamColumns, addOrgMember,
//        removeOp, setRemoveOp, filledMembers.
import PropTypes from 'prop-types';
import { Alert, Button, DataTable } from '@openedx/paragon';
import './TeamTab.scss';

const dataTableColumnPropType = PropTypes.shape({
  Header: PropTypes.oneOfType([PropTypes.string, PropTypes.func, PropTypes.node]),
  accessor: PropTypes.string,
  id: PropTypes.string,
  Cell: PropTypes.func,
  disableSortBy: PropTypes.bool,
});

const Toggle = ({
  id, checked, onChange, label, hint,
}) => (
  <div className="sc-toggle">
    <div className="sc-toggle__text">
      <div className="sc-toggle__label">{label}</div>
      {hint && <span className="sc-toggle__hint">{hint}</span>}
    </div>
    <input
      id={id}
      type="checkbox"
      role="switch"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="sc-toggle__switch"
    />
  </div>
);

const TeamTab = ({
  orgCode, orgName,
  orgRoster, emailStatus,
  teamColumns,
  addOrgMember,
  removeOp, setRemoveOp,
  filledMembers,
}) => (
  <div className="sc-team-content">
    <Alert variant="info" className="mb-3 py-2">
      <strong className="sc-alert-title">Course Assignment Roster (CAR)</strong>
      {`Add instructors and admins for ${ orgName || orgCode }. Each person will be granted course access roles across all courses for this organization.`}
      <div className="sc-car-note">
        <strong>Note:</strong>
        {' Each email must belong to an existing, activated platform account — Studio roles cannot be assigned without one.'}
      </div>
    </Alert>
    <div className="bulk-rerun-team-table">
      <DataTable
        columns={teamColumns}
        data={orgRoster.map(m => ({ ...m, orgCode, apiStatus: emailStatus[m.email.trim().toLowerCase()] }))}
        itemCount={orgRoster.length}
        initialTableOptions={{ autoResetSelectedRows: false }}
      >
        <DataTable.Table isStriped={false} />
        <DataTable.EmptyTable content="No team members." />
      </DataTable>
    </div>
    <div className="sc-team-footer">
      <Button variant="outline-primary" size="sm" onClick={() => addOrgMember(orgCode)}>+ Add team member</Button>
      {filledMembers > 0
        ? (
          <Toggle
            id={`rp-${ orgCode}`}
            checked={removeOp}
            onChange={e => setRemoveOp(e.target.checked)}
            label="Remove provisioner after provisioning"
            hint="Unenrolls the provisioner account once all steps complete"
          />
        )
        : (
          <span className="sc-team-empty">
            No team members added - provisioner account will be retained.
          </span>
        )}
    </div>
  </div>
);

Toggle.propTypes = {
  id: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  hint: PropTypes.string,
};
Toggle.defaultProps = { hint: null };

TeamTab.propTypes = {
  orgCode: PropTypes.string.isRequired,
  orgName: PropTypes.string,
  orgRoster: PropTypes.arrayOf(PropTypes.shape({ email: PropTypes.string })).isRequired,
  emailStatus: PropTypes.objectOf(PropTypes.string).isRequired,
  teamColumns: PropTypes.arrayOf(dataTableColumnPropType).isRequired,
  addOrgMember: PropTypes.func.isRequired,
  removeOp: PropTypes.bool.isRequired,
  setRemoveOp: PropTypes.func.isRequired,
  filledMembers: PropTypes.number.isRequired,
};
TeamTab.defaultProps = { orgName: null };

export default TeamTab;
