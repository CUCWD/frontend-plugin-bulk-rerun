// Wizard step 1 — choose source courses and destination organisations.
// handleNext cross-joins selected courses × selected orgs into a flat CourseRow[]
// that StepConfigure receives as its rows prop.
import {
  useState, useEffect, useCallback, useMemo,
} from 'react';
import PropTypes from 'prop-types';
import { Card, Button } from '@openedx/paragon';

import { stripRunPrefix } from '../../utils/courseKeys';
import { useCourses, useOrgs, usePrograms } from '../../hooks';
import DestOrgPicker from './DestOrgPicker';
import CourseFilters from './CourseFilters';
import CourseTable from './CourseTable';
import useCourseColumns from './useCourseColumns';
import './index.scss';

// ─── Component ──────────────────────────────────────────────────────────────

const DEFAULT_RUN = `${String(new Date().getFullYear()) }_${ String(new Date().getFullYear() + 1)}`;

const StepSelect = ({ courseDiscoveryEnabled, onNext }) => {
  const [courseSel, setCourseSel] = useState(new Set());
  const [destOrgSel, setDestOrgSel] = useState(new Set());
  const [courseQ, setCourseQ] = useState('');
  const [progFilter, setProgFilter] = useState('');
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
      livePrograms.map(p => [p.uuid, { id: p.uuid, shortName: p.title }]),
    ),
    [livePrograms],
  );

  const showPrograms = courseDiscoveryEnabled && livePrograms.length > 0;

  // Source courses from the Studio API
  const { data: liveCourses = [], isLoading: coursesLoading, isError: coursesError } = useCourses('');

  const courses = useMemo(() => liveCourses.map(c => ({
    id: c.courseKey,
    name: c.displayName,
    org: c.org,
    orgName: c.org,
    num: c.number,
    run: c.run,
    shortName: null,
    progId: courseKeyToProgId[c.courseKey] ?? null,
    isDemo: false,
  })), [liveCourses, courseKeyToProgId]);

  // shortName → display name lookup built from the LMS orgs API
  const orgNameByCode = Object.fromEntries(orgs.map(o => [o.code, o.name]));

  // Orgs that own source DEMO courses are excluded from the destination list
  const srcOrgCodes = new Set(courses.map(c => c.org));
  const destOrgs = orgs.filter(o => !srcOrgCodes.has(o.code));

  // Source org options derived from active course list
  const srcOrgOptions = [...new Map(
    courses.map(c => [c.org, { code: c.org, name: orgNameByCode[c.org] || c.org }]),
  ).values()];

  // Program options scoped to current src-org filter
  const availableProgIds = new Set(
    courses.filter(c => !srcOrgFilter || c.org === srcOrgFilter).map(c => c.progId).filter(Boolean),
  );

  // Filtered course list — memoized so DataTable sees a stable reference and doesn't auto-reset selection
  const filtered = useMemo(() => {
    const q = courseQ.toLowerCase();
    return courses.filter(c => {
      if (srcOrgFilter && c.org !== srcOrgFilter) { return false; }
      if (progFilter && c.progId !== progFilter) { return false; }
      if (q && !stripRunPrefix(c.name).toLowerCase().includes(q)
             && !c.num.toLowerCase().includes(q)) { return false; }
      return true;
    });
  }, [courses, srcOrgFilter, progFilter, courseQ]);

  // Reset stale program filter when source org changes
  useEffect(() => {
    if (progFilter && !availableProgIds.has(progFilter)) { setProgFilter(''); }
    setCourseSel(new Set());
    setDestOrgSel(new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcOrgFilter]);

  const courseCount = courseSel.size;
  const destOrgCount = destOrgSel.size;
  const totalRuns = courseCount * Math.max(destOrgCount, 1);
  const canNext = courseCount > 0 && destOrgCount > 0;

  // Incremented to programmatically reset DataTable selection (e.g. Clear button)
  const [clearKey, setClearKey] = useState(0);

  const handleSelectedRowsChanged = useCallback((selectedRowIds) => {
    const next = Object.keys(selectedRowIds);
    setCourseSel(prev => {
      if (prev.size === next.length && next.every(id => prev.has(id))) { return prev; }
      return new Set(next);
    });
  }, []);

  const columns = useCourseColumns(showPrograms, programById);

  const toggleDestOrg = code => setDestOrgSel(prev => {
    const n = new Set(prev);
    if (n.has(code)) { n.delete(code); } else { n.add(code); }
    return n;
  });

  const clearAll = () => { setClearKey(k => k + 1); setCourseSel(new Set()); setDestOrgSel(new Set()); };

  const handleNext = () => {
    const selectedDestOrgs = destOrgs.filter(o => destOrgSel.has(o.code));
    const rows = courses.filter(c => courseSel.has(c.id)).flatMap(c => selectedDestOrgs.map(o => ({
      id: `${c.id }-${ o.code}`,
      name: stripRunPrefix(c.name),
      org: o.code,
      orgName: o.name,
      num: c.num,
      run: DEFAULT_RUN,
      srcOrg: c.org,
      srcNum: c.num,
      srcRun: c.run,
      isNewOrg: false,
      fromDemo: !courseDiscoveryEnabled,
      progId: c.progId,
    })));
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
              Select the DEMO source courses to generate new bulk course reruns from,
              {' '}then choose the destination organizations below.
            </div>
          </div>
          {canNext && (
            <span className="ss-header-count">
              {courseCount} course{courseCount !== 1 ? 's' : ''} x {destOrgCount} org{destOrgCount !== 1 ? 's' : ''} = <strong>{totalRuns}</strong> run{totalRuns !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </Card.Section>

      <CourseFilters
        showPrograms={showPrograms}
        programById={programById}
        progFilter={progFilter}
        srcOrgOptions={srcOrgOptions}
        srcOrgFilter={srcOrgFilter}
        courseQ={courseQ}
        courseCount={courseCount}
        onProgFilter={setProgFilter}
        onSrcOrgFilter={setSrcOrgFilter}
        onCourseQ={setCourseQ}
        onClear={clearAll}
      />

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

      <CourseTable
        loading={coursesLoading}
        error={coursesError}
        columns={columns}
        filtered={filtered}
        courses={courses}
        courseCount={courseCount}
        srcOrgFilter={srcOrgFilter}
        clearKey={clearKey}
        onSelectedRowsChanged={handleSelectedRowsChanged}
      />

      {/* Destination orgs */}
      {courseCount > 0 && (
        <DestOrgPicker
          orgs={destOrgs}
          selectedCodes={destOrgSel}
          onToggle={toggleDestOrg}
          onSelectAll={() => setDestOrgSel(new Set(destOrgs.map(o => o.code)))}
          onClearAll={() => setDestOrgSel(new Set())}
          isLoading={orgsLoading}
          isError={orgsError}
        />
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
};

StepSelect.propTypes = {
  courseDiscoveryEnabled: PropTypes.bool.isRequired,
  onNext: PropTypes.func.isRequired,
};

export default StepSelect;
