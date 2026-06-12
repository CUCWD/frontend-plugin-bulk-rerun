// Wizard step 1 — choose source courses and destination organisations.
// handleNext cross-joins selected courses × selected orgs into a flat CourseRow[]
// that StepConfigure receives as its rows prop.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Spinner, DataTable } from '@openedx/paragon';

import { stripRunPrefix } from '../../utils/courseKeys';
import { useCourses, useOrgs, usePrograms } from '../../hooks';
import './index.scss';

// ─── Component ──────────────────────────────────────────────────────────────

const DEFAULT_RUN = String(new Date().getFullYear()) + '_' + String(new Date().getFullYear() + 1);

export default function StepSelect({ courseDiscoveryEnabled, onNext }) {
  const [courseSel,    setCourseSel]    = useState(new Set());
  const [destOrgSel,   setDestOrgSel]   = useState(new Set());
  const [courseQ,      setCourseQ]      = useState('');
  const [progFilter,   setProgFilter]   = useState('');
  const [srcOrgFilter, setSrcOrgFilter] = useState('');

  // Destination orgs from the LMS /api/organizations/v0/organizations/ endpoint
  const { data: orgItems = [], isLoading: orgsLoading, isError: orgsError } = useOrgs();
  const orgs = [...orgItems]
    .sort((a, b) => a.shortName.localeCompare(b.shortName))
    .map(o => ({ code: o.shortName, name: o.name || o.shortName }));

  // Active programs from course-discovery — only fetched when discovery is enabled
  const { data: livePrograms = [] } = usePrograms({ enabled: courseDiscoveryEnabled });

  // courseKey → program UUID, built from discovery program→courseRun edges
  const courseKeyToProgId = useMemo(
    () => Object.fromEntries(livePrograms.flatMap(p => p.courseRunKeys.map(k => [k, p.uuid]))),
    [livePrograms],
  );

  // Program lookup keyed by UUID, sourced entirely from course-discovery
  const programById = useMemo(
    () => Object.fromEntries(
      livePrograms.map(p => [p.uuid, { id: p.uuid, shortName: p.title }])
    ),
    [livePrograms],
  );

  const showPrograms = courseDiscoveryEnabled && livePrograms.length > 0;

  // Source courses from the Studio API
  const { data: liveCourses = [], isLoading: coursesLoading, isError: coursesError } =
    useCourses('');

  const courses = useMemo(() => liveCourses.map(c => ({
    id:       c.courseKey,
    name:     c.displayName,
    org:      c.org,
    orgName:  c.org,
    num:      c.number,
    run:      c.run,
    shortName: null,
    progId:   courseKeyToProgId[c.courseKey] ?? null,
    isDemo:   false,
  })), [liveCourses, courseKeyToProgId]);

  // shortName → display name lookup built from the LMS orgs API
  const orgNameByCode = Object.fromEntries(orgs.map(o => [o.code, o.name]));

  // Orgs that own source DEMO courses are excluded from the destination list
  const srcOrgCodes = new Set(courses.map(c => c.org));
  const destOrgs = orgs.filter(o => !srcOrgCodes.has(o.code));

  // Source org options derived from active course list
  const srcOrgOptions = [...new Map(
    courses.map(c => [c.org, { code: c.org, name: orgNameByCode[c.org] || c.org }])
  ).values()];

  // Program options scoped to current src-org filter
  const availableProgIds = new Set(
    courses.filter(c => !srcOrgFilter || c.org === srcOrgFilter).map(c => c.progId).filter(Boolean)
  );

  // Filtered course list — memoized so DataTable sees a stable reference and doesn't auto-reset selection
  const filtered = useMemo(() => {
    const q = courseQ.toLowerCase();
    return courses.filter(c => {
      if (srcOrgFilter && c.org !== srcOrgFilter) return false;
      if (progFilter   && c.progId !== progFilter)  return false;
      if (q && !stripRunPrefix(c.name).toLowerCase().includes(q)
             && !c.num.toLowerCase().includes(q))   return false;
      return true;
    });
  }, [courses, srcOrgFilter, progFilter, courseQ]);

  // Reset stale program filter when source org changes
  useEffect(() => {
    if (progFilter && !availableProgIds.has(progFilter)) setProgFilter('');
    setCourseSel(new Set());
    setDestOrgSel(new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcOrgFilter]);

  const courseCount  = courseSel.size;
  const destOrgCount = destOrgSel.size;
  const totalRuns = courseCount * Math.max(destOrgCount, 1);
  const canNext   = courseCount > 0 && destOrgCount > 0;

  // Incremented to programmatically reset DataTable selection (e.g. Clear button)
  const [clearKey, setClearKey] = useState(0);

  const handleSelectedRowsChanged = useCallback((selectedRowIds) => {
    const next = Object.keys(selectedRowIds);
    setCourseSel(prev => {
      if (prev.size === next.length && next.every(id => prev.has(id))) return prev;
      return new Set(next);
    });
  }, []);

  const columns = useMemo(() => [
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

  const toggleDestOrg = code => setDestOrgSel(prev => {
    const n = new Set(prev);
    if (n.has(code)) { n.delete(code); } else { n.add(code); }
    return n;
  });

  const clearAll = () => { setClearKey(k => k + 1); setCourseSel(new Set()); setDestOrgSel(new Set()); };

  const handleNext = () => {
    const selectedDestOrgs = destOrgs.filter(o => destOrgSel.has(o.code));
    const rows = courses.filter(c => courseSel.has(c.id)).flatMap(c =>
      selectedDestOrgs.map(o => ({
        id:       c.id + '-' + o.code,
        name:     stripRunPrefix(c.name),
        org:      o.code,
        orgName:  o.name,
        num:      c.num,
        run:      DEFAULT_RUN,
        srcOrg:   c.org,
        srcNum:   c.num,
        srcRun:   c.run,
        isNewOrg: false,
        fromDemo: !courseDiscoveryEnabled,
        progId:   c.progId,
      }))
    );
    onNext(rows, 'course', null, []);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Card>
      {/* Header */}
      <Card.Section>
        <div className="ss-header">
          <div>
            <div className="ss-header-title">Source courses</div>
            <div className="ss-header-sub">
              Select the DEMO source courses to generate new bulk course reruns from, then choose the destination organizations below.
            </div>
          </div>
          {canNext && (
            <span className="ss-header-count">
              {courseCount} course{courseCount !== 1 ? 's' : ''} x {destOrgCount} org{destOrgCount !== 1 ? 's' : ''} = <strong>{totalRuns}</strong> run{totalRuns !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </Card.Section>

      {/* Filters row */}
      <div className="ss-filters">
        {showPrograms && (
          <select
            value={progFilter}
            onChange={e => setProgFilter(e.target.value)}
            className="ss-filter-select"
          >
            <option value="">All programs</option>
            {Object.values(programById).map(p => (
              <option key={p.id} value={p.id}>{p.shortName}</option>
            ))}
          </select>
        )}

        <select
          value={srcOrgFilter}
          onChange={e => setSrcOrgFilter(e.target.value)}
          className="ss-filter-select ss-filter-select--wide"
        >
          <option value="">All orgs</option>
          {srcOrgOptions.map(o => (
            <option key={o.code} value={o.code}>{o.name} ({o.code})</option>
          ))}
        </select>

        <div className="ss-search-wrap">
          <input
            value={courseQ}
            onChange={e => setCourseQ(e.target.value)}
            placeholder="Filter by course name or number..."
            className="ss-search-input"
          />
          <span className="ss-search-icon">&#128269;</span>
        </div>

        {courseCount > 0 && (
          <Button variant="tertiary" size="sm" onClick={clearAll} className="ss-clear-btn">
            Clear ({courseCount})
          </Button>
        )}
      </div>

      {/* Selection banner */}
      {courseCount > 0 && (
        <div className="ss-banner">
          <span className="ss-banner-count">
            {courseCount} course{courseCount !== 1 ? 's' : ''} selected
          </span>
          <Button variant="tertiary" size="sm" onClick={clearAll} className="ss-clear-btn">
            Clear
          </Button>
        </div>
      )}

      {/* Course table */}
      {coursesLoading && (
        <div className="ss-loading">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading courses…
        </div>
      )}
      {coursesError && (
        <div className="ss-error">
          Failed to load courses. Please refresh and try again.
        </div>
      )}
      {!coursesLoading && !coursesError && (
        <>
          <div className="ss-course-table">
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div
              onClick={(e) => {
                const tr = e.target.closest('tr.pgn__data-table-row');
                if (!tr) return;
                if (e.target.type === 'checkbox' || e.target.closest('label')) return;
                const cb = tr.querySelector('input[type="checkbox"]');
                if (cb) cb.click();
              }}
            >
              <DataTable
                key={srcOrgFilter + '-' + clearKey}
                isSelectable
                columns={columns}
                data={filtered}
                itemCount={filtered.length}
                onSelectedRowsChanged={handleSelectedRowsChanged}
                initialTableOptions={{ getRowId: row => row.id, autoResetSelectedRows: false }}
              >
                <DataTable.Table isStriped={false} />
                <DataTable.EmptyTable content="No courses match your filters." />
              </DataTable>
            </div>
          </div>
          <div className="ss-table-footer">
            <span>
              {'Showing ' + filtered.length + ' course' + (filtered.length !== 1 ? 's' : '')}
              {filtered.length !== courses.length ? ' of ' + courses.length : ''}
            </span>
            <span>{courseCount} selected</span>
          </div>
        </>
      )}

      {/* Destination orgs */}
      {courseCount > 0 && (
        <div className="ss-dest">
          <div className="ss-dest-header">
            <div>
              <div className="ss-dest-title">Destination organizations</div>
              <div className="ss-dest-sub">Each selected course will be rerun for every checked organization.</div>
            </div>
            <div className="ss-dest-btns">
              <Button variant="outline-primary" size="sm" onClick={() => setDestOrgSel(new Set(destOrgs.map(o => o.code)))}>All</Button>
              {destOrgCount > 0 && (
                <Button variant="tertiary" size="sm" onClick={() => setDestOrgSel(new Set())} className="ss-clear-btn">Clear</Button>
              )}
            </div>
          </div>

          {orgsLoading && (
            <div className="ss-loading ss-loading--sm">
              <Spinner animation="border" size="sm" className="me-2" />
              Loading organizations…
            </div>
          )}
          {orgsError && (
            <div className="ss-error ss-error--sm">
              Failed to load organizations. Please refresh and try again.
            </div>
          )}
          {!orgsLoading && !orgsError && (
            <div className="ss-org-grid">
              {destOrgs.map(o => {
                const on = destOrgSel.has(o.code);
                return (
                  <div
                    key={o.code}
                    onClick={() => toggleDestOrg(o.code)}
                    className={`ss-org-item${on ? ' ss-org-item--selected' : ''}`}
                  >
                    <input type="checkbox" checked={on} readOnly />
                    <div className="ss-org-inner">
                      <div className="ss-org-item-name">{o.name}</div>
                      <div className="ss-org-item-code">{o.code}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bottom action bar */}
      <div className="ss-action-bar">
        {canNext
          ? (
            <strong className="ss-action-active">
              {courseCount} course{courseCount !== 1 ? 's' : ''} x {destOrgCount} org{destOrgCount !== 1 ? 's' : ''} = {totalRuns} run{totalRuns !== 1 ? 's' : ''} will be configured
            </strong>
          )
          : (
            <span className="ss-action-hint">
              {courseCount === 0
                ? 'Select source courses above to continue'
                : 'Select destination organizations above to continue'}
            </span>
          )}
        <Button variant="primary" disabled={!canNext} onClick={handleNext}>
          Configure
        </Button>
      </div>
    </Card>
  );
}
