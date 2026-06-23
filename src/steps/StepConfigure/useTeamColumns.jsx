/* eslint-disable react/prop-types, react/no-unstable-nested-components */
import { useMemo } from 'react';
import { Spinner, Form } from '@openedx/paragon';
import TeamEmailCell from './TeamEmailCell';

function emailStatusInfo(trimmed, apiStatus) {
  if (!trimmed) { return { label: '—', cls: 'sc-email-status--muted', icon: null }; }
  if (!trimmed.includes('@')) { return { label: 'Invalid email', cls: 'sc-email-status--err', icon: '✗' }; }
  if (apiStatus === 'found') { return { label: 'Account found', cls: 'sc-email-status--ok', icon: '✓' }; }
  if (apiStatus === 'not_found') { return { label: 'No account found', cls: 'sc-email-status--err', icon: '✗' }; }
  if (apiStatus === 'unknown') { return { label: 'Lookup failed', cls: 'sc-email-status--warn', icon: '⚠' }; }
  if (apiStatus === 'checking') { return { label: null, cls: 'sc-email-status--muted', icon: null }; }
  return { label: 'Pending…', cls: 'sc-email-status--muted', icon: null };
}

// apiStatus is embedded in row.original (not read from the emailStatus closure) so
// teamColumns stays stable and DataTable never remounts cells between status changes.
const useTeamColumns = (updateOrgRoster, removeOrgMember) => useMemo(() => [
  {
    Header: 'Email address',
    accessor: 'email',
    disableSortBy: true,
    Cell: ({ row }) => {
      const { email, orgCode: oc, apiStatus } = row.original;
      return (
        <div className={`sc-team-cell${apiStatus === 'not_found' ? ' sc-team-cell--err' : ''}`}>
          <TeamEmailCell
            value={email}
            orgCode={oc}
            rowIndex={row.index}
            apiStatus={apiStatus}
            onUpdate={updateOrgRoster}
          />
        </div>
      );
    },
  },
  {
    Header: 'Studio role',
    accessor: 'studio',
    disableSortBy: true,
    Cell: ({ row }) => {
      const { apiStatus } = row.original;
      return (
        <div className={`sc-team-cell${apiStatus === 'not_found' ? ' sc-team-cell--err' : ''}`}>
          <Form.Control
            as="select"
            size="sm"
            value={row.original.studio}
            onChange={e => updateOrgRoster(row.original.orgCode, row.index, 'studio', e.target.value)}
            className="sc-select-auto"
          >
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
            <option value="data_researcher">Data researcher</option>
          </Form.Control>
        </div>
      );
    },
  },
  {
    Header: 'Discussion role',
    accessor: 'discussion',
    disableSortBy: true,
    Cell: ({ row }) => {
      const { apiStatus } = row.original;
      return (
        <div className={`sc-team-cell${apiStatus === 'not_found' ? ' sc-team-cell--err' : ''}`}>
          <Form.Control
            as="select"
            size="sm"
            value={row.original.discussion}
            onChange={e => updateOrgRoster(row.original.orgCode, row.index, 'discussion', e.target.value)}
            className="sc-select-auto"
          >
            <option value="discussion_admin">Discussion admin</option>
            <option value="moderator">Moderator</option>
            <option value="none">None</option>
          </Form.Control>
        </div>
      );
    },
  },
  {
    id: 'accountStatus',
    Header: 'Account status',
    disableSortBy: true,
    Cell: ({ row }) => {
      const { email, apiStatus } = row.original;
      const trimmed = email.trim();
      const { label, cls, icon } = emailStatusInfo(trimmed, apiStatus);
      return (
        <div className={`sc-team-cell sc-team-cell--nowrap${apiStatus === 'not_found' ? ' sc-team-cell--err' : ''}`}>
          {apiStatus === 'checking'
            ? <Spinner animation="border" size="sm" className="sc-spinner-sm" />
            : (
              <span className={`sc-email-status ${cls}`}>
                {icon && <span className="sc-email-status__icon">{icon}</span>}
                {label}
              </span>
            )}
        </div>
      );
    },
  },
  {
    id: 'actions',
    Header: '',
    disableSortBy: true,
    Cell: ({ row }) => {
      const { apiStatus } = row.original;
      return (
        <div className={`sc-team-cell${apiStatus === 'not_found' ? ' sc-team-cell--err' : ''}`}>
          <button
            type="button"
            onClick={() => removeOrgMember(row.original.orgCode, row.index)}
            className="sc-team-remove"
          >
            ✕
          </button>
        </div>
      );
    },
  },
], [updateOrgRoster, removeOrgMember]);
/* eslint-enable react/prop-types, react/no-unstable-nested-components */

export default useTeamColumns;
