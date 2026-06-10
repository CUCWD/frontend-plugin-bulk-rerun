// Draft course-table component for StepSelect using Paragon DataTable.
// NOT currently imported — the active course selection grid is inline in StepSelect/index.jsx.
import {
  useState, useMemo, useRef, useCallback,
} from 'react';
import {
  DataTable, Badge, Form, Button,
} from '@openedx/paragon';

const CourseTable = ({ courses, selectedIds, onSelectionChange }) => {
  const [query, setQuery] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const tableRef = useRef(null);

  // Unique org list for the organization filter dropdown.
  const orgs = useMemo(
    () => Array.from(new Set(courses.map(c => c.org).filter(Boolean))).sort(),
    [courses],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses.filter((c) => {
      if (orgFilter && c.org !== orgFilter) return false;
      if (!q) return true;
      return c.name?.toLowerCase().includes(q)
        || c.org?.toLowerCase().includes(q)
        || c.num?.toLowerCase().includes(q)
        || c.run?.toLowerCase().includes(q);
    });
  }, [courses, query, orgFilter]);

  // Stable row id so selection survives filtering and is keyed by course key.
  const getRowId = useCallback((row) => row.id, []);

  // Keep the latest onSelectionChange in a ref so the callback identity stays
  // stable — prevents Paragon's selection effect from re-firing every render.
  const changeRef = useRef(onSelectionChange);
  changeRef.current = onSelectionChange;
  const handleSelectedRowsChanged = useCallback((selectedRowIds) => {
    changeRef.current(Object.keys(selectedRowIds));
  }, []);

  // Seed initial selection (read once on mount).
  const initialSelectedRowIds = useMemo(
    () => Object.fromEntries(selectedIds.map(id => [id, true])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Make the whole row clickable: delegate body-row clicks to that row's
  // selection checkbox (Paragon's own toggle path). Clicks on the checkbox
  // itself are ignored here so they don't double-toggle.
  const handleRowClick = useCallback((e) => {
    if (e.target.closest('.pgn__data-table__controlled-select')) return;
    const tr = e.target.closest('tbody tr');
    if (!tr) return;
    const checkbox = tr.querySelector('.pgn__data-table__controlled-select input[type="checkbox"]');
    if (checkbox) checkbox.click();
  }, []);

  // Select every currently visible (filtered) row by clicking each unchecked
  // row checkbox — drives Paragon's own selection state.
  const handleSelectVisible = useCallback(() => {
    const root = tableRef.current;
    if (!root) return;
    root.querySelectorAll('tbody .pgn__data-table__controlled-select input[type="checkbox"]')
      .forEach((cb) => { if (!cb.checked) cb.click(); });
  }, []);

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <div className="flex-grow-1 position-relative" style={{ minWidth: 220 }}>
          <Form.Control
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, org, number, or run…"
          />
          {query && (
            <button
              type="button"
              className="btn btn-link btn-sm position-absolute"
              style={{ right: 8, top: '50%', transform: 'translateY(-50%)', padding: 0 }}
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <Form.Control
          as="select"
          value={orgFilter}
          onChange={e => setOrgFilter(e.target.value)}
          style={{ width: 'auto', minWidth: 180 }}
          aria-label="Filter by organization"
        >
          <option value="">All organizations</option>
          {orgs.map(o => <option key={o} value={o}>{o}</option>)}
        </Form.Control>

        <Button
          variant="outline-primary"
          onClick={handleSelectVisible}
          disabled={filtered.length === 0}
        >
          Select visible
        </Button>

        <span className="small text-muted text-nowrap ml-auto">
          {filtered.length} of {courses.length}
          {selectedIds.length > 0 && (
            <Badge variant="primary" className="ml-2">{selectedIds.length} selected</Badge>
          )}
        </span>
      </div>

      <div className="brr-selectable-table" ref={tableRef} onClick={handleRowClick}>
        <DataTable
          isSelectable
          columns={[
            { Header: 'Course name', accessor: 'name' },
            { Header: 'Course organization', accessor: 'org' },
            { Header: 'Course number', accessor: 'num' },
            {
              Header: 'Course run',
              accessor: 'run',
              Cell: ({ value }) => <Badge variant="light">{value}</Badge>,
            },
          ]}
          data={filtered}
          itemCount={filtered.length}
          initialTableOptions={{ getRowId }}
          initialState={{ selectedRowIds: initialSelectedRowIds }}
          onSelectedRowsChanged={handleSelectedRowsChanged}
        >
          <DataTable.Table />
          <DataTable.EmptyTable content="No matching courses." />
        </DataTable>
      </div>
    </div>
  );
};

export default CourseTable;
