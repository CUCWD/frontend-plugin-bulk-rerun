/* eslint-disable react/prop-types, react/no-unstable-nested-components */
import { useMemo, useCallback } from 'react';
import { Spinner, Badge } from '@openedx/paragon';
import EditableRunCell from './EditableRunCell';
import { COURSE_ID_MAX_COMBINED } from '../../utils/courseKeys';

const CONFLICT_LABEL = {
  exists: 'Already exists',
  dup: 'Duplicate',
  self: 'Same as source',
  org: 'Unknown org',
};

const conflictCls = (conflict) => {
  if (conflict === 'exists') { return ' sc-cell--exists'; }
  if (conflict) { return ' sc-cell--conflict'; }
  return '';
};

// checkingRef / validatedRef are refs (not state) so they are intentionally
// omitted from deps — reading .current never causes a stale closure problem and
// avoids remounting EditableRunCell mid-keystroke which would steal focus.
const useCourseRunColumns = (updateRunOverride, onRemoveRow, checkingRef, validatedRef) => {
  const courseRunColumns = useMemo(() => [
    {
      id: 'indicator',
      Header: '',
      accessor: 'conflict',
      disableSortBy: true,
      Cell: ({ row }) => {
        const { conflict, lenErr } = row.original;
        const indCls = lenErr && !conflict ? ' sc-cell--exists' : conflictCls(conflict);
        let indicator = null;
        if (checkingRef.current) {
          indicator = <Spinner animation="border" size="sm" className="sc-spinner-sm" />;
        } else if (conflict || lenErr) {
          let icon = '⚠️';
          if (conflict === 'exists') { icon = '🚫'; } else if (lenErr) { icon = '✗'; }
          indicator = <span className="sc-conflict-icon">{icon}</span>;
        } else if (validatedRef.current) {
          indicator = <span className="sc-ok-check">✓</span>;
        }
        return <div className={`sc-cell sc-cell--indicator${indCls}`}>{indicator}</div>;
      },
    },
    {
      Header: 'Course name',
      accessor: 'name',
      disableSortBy: true,
      Cell: ({ row }) => (
        <div className={`sc-cell sc-cell--src${conflictCls(row.original.conflict)}`}>
          {row.original.name}
        </div>
      ),
    },
    {
      Header: 'Src org',
      accessor: 'srcOrg',
      disableSortBy: true,
      Cell: ({ row }) => (
        <div className={`sc-cell sc-cell--src-mono${conflictCls(row.original.conflict)}`}>
          {row.original.srcOrg}
        </div>
      ),
    },
    {
      Header: 'Src course #',
      accessor: 'srcNum',
      disableSortBy: true,
      Cell: ({ row }) => (
        <div className={`sc-cell sc-cell--src-mono${conflictCls(row.original.conflict)}`}>
          {row.original.srcNum}
        </div>
      ),
    },
    {
      Header: 'Src run',
      accessor: 'srcRun',
      disableSortBy: true,
      Cell: ({ row }) => (
        <div className={`sc-cell sc-cell--src-mono${conflictCls(row.original.conflict)}`}>
          {row.original.srcRun}
        </div>
      ),
    },
    {
      Header: 'Target org',
      accessor: 'org',
      disableSortBy: true,
      Cell: ({ row }) => (
        <div className={`sc-cell sc-cell--tgt${conflictCls(row.original.conflict)}`}>
          {row.original.org}
        </div>
      ),
    },
    {
      Header: 'Target course #',
      accessor: 'num',
      disableSortBy: true,
      Cell: ({ row }) => (
        <div className={`sc-cell sc-cell--tgt${conflictCls(row.original.conflict)}`}>
          {row.original.num}
        </div>
      ),
    },
    {
      Header: 'Target run',
      accessor: 'run',
      disableSortBy: true,
      Cell: ({ row }) => (
        <div className={`sc-cell sc-cell--tgt-run${conflictCls(row.original.conflict)}`}>
          <EditableRunCell
            value={row.original.run}
            onChange={v => updateRunOverride(row.original.id, v)}
            hasError={!!row.original.conflict || !!row.original.lenErr}
          />
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [updateRunOverride]);

  const renderCourseRunSubRow = useCallback(({ row }) => {
    const { conflict, lenErr, idx } = row.original;
    if (!conflict && !lenErr) { return null; }
    const subRowCls = (conflict === 'exists' || lenErr) ? 'sc-sub-row--exists' : 'sc-sub-row--conflict';
    const combined = row.original.org.length + row.original.num.length + row.original.run.length;
    return (
      <div className={`sc-sub-row ${subRowCls}`}>
        {lenErr && (
          <Badge variant="danger" className="sc-badge-sm">
            {`ID too long: ${combined}/${COURSE_ID_MAX_COMBINED} chars (org+num+run)`}
          </Badge>
        )}
        {conflict && (
          <Badge variant={conflict === 'exists' ? 'danger' : 'warning'} className="sc-badge-sm">
            {CONFLICT_LABEL[conflict]}
          </Badge>
        )}
        {conflict === 'exists' && (
          <button type="button" onClick={() => onRemoveRow(idx)} className="sc-remove-btn">
            × Remove
          </button>
        )}
      </div>
    );
  }, [onRemoveRow]);

  return { courseRunColumns, renderCourseRunSubRow };
};
/* eslint-enable react/prop-types, react/no-unstable-nested-components */

export default useCourseRunColumns;
