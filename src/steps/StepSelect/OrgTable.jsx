// Draft destination-org table for StepSelect using Paragon DataTable and Badge.
// NOT currently imported — the active org selection grid is inline in StepSelect/index.jsx.
import React, {
  useMemo, useRef, useCallback,
} from 'react';
import { DataTable, Badge } from '@openedx/paragon';

const OrgTable = ({ orgs, selectedIds, onSelectionChange }) => {
  const getRowId = useCallback((row) => row.id, []);

  const changeRef = useRef(onSelectionChange);
  changeRef.current = onSelectionChange;
  const handleSelectedRowsChanged = useCallback((selectedRowIds) => {
    changeRef.current(Object.keys(selectedRowIds));
  }, []);

  const initialSelectedRowIds = useMemo(
    () => Object.fromEntries(selectedIds.map(id => [id, true])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Whole-row click delegates to the row's selection checkbox.
  const handleRowClick = useCallback((e) => {
    if (e.target.closest('.pgn__data-table__controlled-select')) return;
    const tr = e.target.closest('tbody tr');
    if (!tr) return;
    const checkbox = tr.querySelector('.pgn__data-table__controlled-select input[type="checkbox"]');
    if (checkbox) checkbox.click();
  }, []);

  return (
    <div className="brr-selectable-table" onClick={handleRowClick}>
      <DataTable
        isSelectable
        columns={[
          { Header: 'Organization', accessor: 'name' },
          { Header: 'Org code', accessor: 'id' },
          {
            Header: 'Programs',
            accessor: 'programs',
            Cell: ({ value }) => (
              <div className="d-flex flex-wrap gap-1">
                {(value || []).map(p => <Badge key={p} variant="light">{p}</Badge>)}
              </div>
            ),
          },
        ]}
        data={orgs}
        itemCount={orgs.length}
        initialTableOptions={{ getRowId }}
        initialState={{ selectedRowIds: initialSelectedRowIds }}
        onSelectedRowsChanged={handleSelectedRowsChanged}
      >
        <DataTable.Table />
        <DataTable.EmptyTable content="No organizations for this program." />
      </DataTable>
    </div>
  );
};

export default OrgTable;
