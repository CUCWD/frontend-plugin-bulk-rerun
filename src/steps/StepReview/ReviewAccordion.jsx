import PropTypes from 'prop-types';
import { Button, Badge, DataTable } from '@openedx/paragon';
import { isHardConflict } from '../../utils/courseKeys';
import OrgRoleSummary from './OrgRoleSummary';

const ReviewAccordion = ({
  rows, orgs, conflicts, openOrgs, setOpenOrgs, reviewColumns, orgRosters,
}) => (
  <div className="sr-accordion">
    <div className="sr-accordion-header">
      <span className="sr-accordion-title">
        {`${rows.length} course run${rows.length !== 1 ? 's' : ''} across ${orgs.length} org${orgs.length !== 1 ? 's' : ''}`}
      </span>
      <div className="sr-accordion-btns">
        <Button
          variant="tertiary"
          size="sm"
          onClick={() => setOpenOrgs(Object.fromEntries(orgs.map(o => [o, true])))}
        >
          Expand all
        </Button>
        <Button
          variant="tertiary"
          size="sm"
          onClick={() => setOpenOrgs(Object.fromEntries(orgs.map(o => [o, false])))}
        >
          Collapse all
        </Button>
      </div>
    </div>

    {orgs.map(orgCode => {
      const orgRows = rows.map((r, i) => ({ ...r, i })).filter(r => r.org === orgCode);
      const orgErr = orgRows.some(r => isHardConflict(conflicts[r.i]));
      const isOpen = openOrgs[orgCode] !== false;
      const tableData = orgRows.map(r => ({ ...r, conflictType: conflicts[r.i] }));

      return (
        <div key={orgCode} className="sr-org-section">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setOpenOrgs(p => ({ ...p, [orgCode]: !isOpen }))}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                setOpenOrgs(p => ({ ...p, [orgCode]: !isOpen }));
              }
            }}
            className={`sr-org-header${orgErr ? ' sr-org-header--error' : ''}`}
          >
            <div className="sr-org-dot">{orgErr ? '✕' : '✓'}</div>
            <span className="sr-org-code">{orgRows[0]?.orgName} ({orgCode})</span>
            <span className="sr-org-meta">{`${orgRows.length} course${orgRows.length !== 1 ? 's' : ''}`}</span>
            {orgErr && <Badge variant="danger" pill>conflict</Badge>}
            <div className="sr-org-spacer" />
            <span className="sr-org-toggle">{isOpen ? '▲ collapse' : '▼ expand'}</span>
          </div>

          {isOpen && (
            <>
              <div className="sr-runs-table-wrap">
                <DataTable
                  columns={reviewColumns}
                  data={tableData}
                  itemCount={tableData.length}
                  initialTableOptions={{
                    // eslint-disable-next-line react/prop-types
                    getRowId: row => row.id,
                  }}
                >
                  <DataTable.Table isStriped={false} />
                </DataTable>
              </div>
              <OrgRoleSummary orgCode={orgCode} orgRosters={orgRosters} />
            </>
          )}
        </div>
      );
    })}
  </div>
);

ReviewAccordion.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    org: PropTypes.string.isRequired,
    orgName: PropTypes.string,
  })).isRequired,
  orgs: PropTypes.arrayOf(PropTypes.string).isRequired,
  conflicts: PropTypes.arrayOf(PropTypes.string).isRequired,
  openOrgs: PropTypes.objectOf(PropTypes.bool).isRequired,
  setOpenOrgs: PropTypes.func.isRequired,
  reviewColumns: PropTypes.arrayOf(PropTypes.shape({})).isRequired,
  orgRosters: PropTypes.objectOf(PropTypes.arrayOf(PropTypes.shape({}))).isRequired,
};

export default ReviewAccordion;
