import { useMemo } from 'react';
import { stripRunPrefix } from '../../utils/courseKeys';

/* eslint-disable react/prop-types */
const useCourseColumns = (showPrograms, programById) => useMemo(() => [
  ...(showPrograms ? [{
    Header: 'Program',
    accessor: 'progId',
    disableSortBy: true,
    Cell: ({ row }) => {
      const pp = programById[row.original.progId];
      return pp ? <span className="ss-program-badge">{pp.shortName}</span> : null;
    },
  }] : []),
  {
    Header: 'Org',
    accessor: 'org',
    disableSortBy: true,
    Cell: ({ row }) => (
      <span className="ss-org-badge">{row.original.org}</span>
    ),
  },
  {
    Header: 'Course name',
    accessor: 'name',
    disableSortBy: true,
    Cell: ({ row }) => (
      <span className={`ss-name${row.isSelected ? ' ss-name--sel' : ''}`}>
        {stripRunPrefix(row.original.name)}
      </span>
    ),
  },
  {
    Header: 'Course number',
    accessor: 'num',
    disableSortBy: true,
    Cell: ({ row }) => (
      <span className="ss-num">{row.original.num}</span>
    ),
  },
], [showPrograms, programById]);
/* eslint-enable react/prop-types */

export default useCourseColumns;
