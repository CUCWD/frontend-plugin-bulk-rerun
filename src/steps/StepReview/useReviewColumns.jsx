/* eslint-disable react/prop-types, react/no-unstable-nested-components */
import { useMemo } from 'react';
import { isHardConflict } from '../../utils/courseKeys';

const conflictCls = (ct) => {
  if (ct === 'exists') { return ' sr-cell--exists'; }
  if (ct) { return ' sr-cell--conflict'; }
  return '';
};

const conflictIcon = (ct) => {
  if (isHardConflict(ct)) { return <span className="sr-conflict-icon">🚫</span>; }
  if (ct === 'exists') { return <span className="sr-conflict-icon">⚠️</span>; }
  return <span className="sr-ok-check">✓</span>;
};

// Column definitions are stable — cell renderers only access row.original,
// so the dep array is intentionally empty.
const useReviewColumns = () => useMemo(() => [
  {
    id: 'indicator',
    Header: '',
    accessor: 'conflictType',
    disableSortBy: true,
    Cell: ({ row }) => {
      const ct = row.original.conflictType;
      return (
        <div className={`sr-cell sr-cell--indicator${conflictCls(ct)}`}>
          {conflictIcon(ct)}
        </div>
      );
    },
  },
  {
    Header: 'Course Name',
    accessor: 'name',
    disableSortBy: true,
    Cell: ({ row }) => (
      <div className={`sr-cell sr-cell--src${conflictCls(row.original.conflictType)}`}>
        {row.original.name}
      </div>
    ),
  },
  {
    Header: 'Src Org',
    accessor: 'srcOrg',
    disableSortBy: true,
    Cell: ({ row }) => (
      <div className={`sr-cell sr-cell--src-mono${conflictCls(row.original.conflictType)}`}>
        {row.original.srcOrg}
      </div>
    ),
  },
  {
    Header: 'Src Course #',
    accessor: 'srcNum',
    disableSortBy: true,
    Cell: ({ row }) => (
      <div className={`sr-cell sr-cell--src-mono${conflictCls(row.original.conflictType)}`}>
        {row.original.srcNum}
      </div>
    ),
  },
  {
    Header: 'Src Run',
    accessor: 'srcRun',
    disableSortBy: true,
    Cell: ({ row }) => (
      <div className={`sr-cell sr-cell--src-mono${conflictCls(row.original.conflictType)}`}>
        {row.original.srcRun}
      </div>
    ),
  },
  {
    Header: 'Target Org',
    accessor: 'org',
    disableSortBy: true,
    Cell: ({ row }) => (
      <div className={`sr-cell sr-cell--tgt-mono${conflictCls(row.original.conflictType)}`}>
        {row.original.org}
      </div>
    ),
  },
  {
    Header: 'Target Course #',
    accessor: 'num',
    disableSortBy: true,
    Cell: ({ row }) => (
      <div className={`sr-cell sr-cell--tgt-mono${conflictCls(row.original.conflictType)}`}>
        {row.original.num}
      </div>
    ),
  },
  {
    Header: 'Target Run',
    accessor: 'run',
    disableSortBy: true,
    Cell: ({ row }) => (
      <div className={`sr-cell sr-cell--tgt-mono${conflictCls(row.original.conflictType)}`}>
        {row.original.run}
      </div>
    ),
  },
// eslint-disable-next-line react-hooks/exhaustive-deps
], []);
/* eslint-enable react/prop-types, react/no-unstable-nested-components */

export default useReviewColumns;
