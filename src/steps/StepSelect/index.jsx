// Wizard step 1 — choose source courses and destination organisations.
// handleNext cross-joins selected courses × selected orgs into a flat CourseRow[]
// that StepConfigure receives as its rows prop.
import { useState, useEffect } from 'react';
import { Card, Button, Spinner } from '@openedx/paragon';

import { stripRunPrefix } from '../../utils/courseKeys';
import { useCourses, useOrgs, usePrograms } from '../../hooks';

// ─── Design tokens ──────────────────────────────────────────────────────────
const BRAND     = '#006daa';
const BRAND_LT  = '#deeef8';
const BRAND_XLT = '#eef6fb';
const SUCCESS   = '#178253';
const G50       = '#f8f9fa';
const G100      = '#f0f0f0';
const G200      = '#e0e0e0';
const G500      = '#6c757d';
const G700      = '#454545';
const G900      = '#1f2937';
const BORDER    = '#dee2e6';
const WHITE     = '#fff';
const MONO      = '"SFMono-Regular","Courier New",monospace';

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
  const courseKeyToProgId = Object.fromEntries(
    livePrograms.flatMap(p => p.courseRunKeys.map(k => [k, p.uuid]))
  );

  // Program lookup keyed by UUID, sourced entirely from course-discovery
  const programById = Object.fromEntries(
    livePrograms.map(p => [p.uuid, { id: p.uuid, shortName: p.title, color: BRAND, colorLt: BRAND_LT }])
  );

  const showPrograms = courseDiscoveryEnabled && livePrograms.length > 0;

  // Source courses from the Studio API
  const { data: liveCourses = [], isLoading: coursesLoading, isError: coursesError } =
    useCourses('');

  const courses = liveCourses.map(c => ({
    id:       c.courseKey,
    name:     c.displayName,
    org:      c.org,
    orgName:  c.org,
    num:      c.number,
    run:      c.run,
    shortName: null,
    progId:   courseKeyToProgId[c.courseKey] ?? null,
    isDemo:   false,
  }));

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

  // Filtered course list
  const ql = courseQ.toLowerCase();
  const filtered = courses.filter(c => {
    if (srcOrgFilter && c.org !== srcOrgFilter) return false;
    if (progFilter   && c.progId !== progFilter)  return false;
    if (ql && !stripRunPrefix(c.name).toLowerCase().includes(ql)
           && !c.num.toLowerCase().includes(ql))   return false;
    return true;
  });

  // Reset stale program filter when source org changes
  useEffect(() => {
    if (progFilter && !availableProgIds.has(progFilter)) setProgFilter('');
    setCourseSel(new Set());
    setDestOrgSel(new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcOrgFilter]);

  const courseCount  = courseSel.size;
  const destOrgCount = destOrgSel.size;
  const allChk  = filtered.length > 0 && filtered.every(c => courseSel.has(c.id));
  const someChk = filtered.some(c => courseSel.has(c.id)) && !allChk;
  const totalRuns = courseCount * Math.max(destOrgCount, 1);
  const canNext   = courseCount > 0 && destOrgCount > 0;

  const toggleCourse = id => setCourseSel(prev => {
    const n = new Set(prev);
    if (n.has(id)) { n.delete(id); } else { n.add(id); }
    return n;
  });

  const toggleDestOrg = code => setDestOrgSel(prev => {
    const n = new Set(prev);
    if (n.has(code)) { n.delete(code); } else { n.add(code); }
    return n;
  });

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16, color: G900, marginBottom: 2 }}>Source courses</div>
            <div style={{ fontSize: 13, color: G500 }}>
              Select the DEMO source courses to generate new bulk course reruns from, then choose the destination organizations below.
            </div>
          </div>
          {canNext && (
            <span style={{ color: BRAND, fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', marginLeft: 16 }}>
              {courseCount} course{courseCount !== 1 ? 's' : ''} x {destOrgCount} org{destOrgCount !== 1 ? 's' : ''} = <strong>{totalRuns}</strong> run{totalRuns !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </Card.Section>

      {/* Filters row */}
      <div style={{
        padding: '12px 20px', display: 'flex', gap: 8, flexWrap: 'wrap',
        alignItems: 'center', borderTop: '1px solid ' + BORDER,
        borderBottom: '1px solid ' + BORDER, background: G50,
      }}>
        {/* Program dropdown — hidden when discovery is disabled or returns no programs */}
        {showPrograms && (
          <select
            value={progFilter}
            onChange={e => setProgFilter(e.target.value)}
            style={{ padding: '7px 10px', fontSize: 13, border: '1px solid ' + BORDER, borderRadius: 4, minWidth: 160 }}
          >
            <option value="">All programs</option>
            {Object.values(programById)
              .map(p => (
                <option key={p.id} value={p.id}>{p.shortName}</option>
              ))}
          </select>
        )}

        {/* Source org dropdown */}
        <select
          value={srcOrgFilter}
          onChange={e => setSrcOrgFilter(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid ' + BORDER, borderRadius: 4, minWidth: 180 }}
        >
          <option value="">All source orgs</option>
          {srcOrgOptions.map(o => (
            <option key={o.code} value={o.code}>{o.name} ({o.code})</option>
          ))}
        </select>

        {/* Text search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <input
            value={courseQ}
            onChange={e => setCourseQ(e.target.value)}
            placeholder="Filter by course name or number..."
            style={{
              padding: '7px 10px 7px 30px', fontSize: 13,
              border: '1px solid ' + BORDER, borderRadius: 4, width: '100%', outline: 'none',
            }}
          />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: G500, pointerEvents: 'none', fontSize: 12 }}>
            &#128269;
          </span>
        </div>

        <Button variant="outline-primary" size="sm" onClick={() => setCourseSel(new Set(filtered.map(c => c.id)))}>
          Select all
        </Button>
        {courseCount > 0 && (
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => { setCourseSel(new Set()); setDestOrgSel(new Set()); }}
            style={{ color: '#c32d3a' }}
          >
            Clear ({courseCount})
          </Button>
        )}
      </div>

      {/* Selection banner */}
      {courseCount > 0 && (
        <div style={{
          margin: '10px 20px 0',
          background: BRAND_LT, border: '1px solid #aad4ef',
          borderRadius: 4, padding: '7px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13,
        }}>
          <span style={{ fontWeight: 600, color: BRAND }}>
            {courseCount} course{courseCount !== 1 ? 's' : ''} selected
          </span>
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => { setCourseSel(new Set()); setDestOrgSel(new Set()); }}
            style={{ color: '#c32d3a' }}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Course table */}
      {coursesLoading && (
        <div style={{ padding: '2.5rem', textAlign: 'center', color: G500 }}>
          <Spinner animation="border" size="sm" style={{ marginRight: 8 }} />
          Loading courses…
        </div>
      )}
      {coursesError && (
        <div style={{ padding: '1rem 20px', color: '#c32d3a', fontSize: 13 }}>
          Failed to load courses. Please refresh and try again.
        </div>
      )}
      <div style={{ overflowX: 'auto', display: (coursesLoading || coursesError) ? 'none' : undefined }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid ' + BORDER, background: G50 }}>
              <th style={{ padding: '9px 14px', width: 40 }}>
                <input
                  type="checkbox"
                  checked={allChk}
                  ref={el => { if (el) el.indeterminate = someChk; }}
                  onChange={e => {
                    const ids = filtered.map(c => c.id);
                    setCourseSel(prev => {
                      const n = new Set(prev);
                      ids.forEach(id => (e.target.checked ? n.add(id) : n.delete(id)));
                      return n;
                    });
                  }}
                  style={{ width: 15, height: 15, accentColor: BRAND, cursor: 'pointer' }}
                />
              </th>
              {showPrograms && (
                <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: G700 }}>Program</th>
              )}
              <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: G700 }}>Org</th>
              <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: G700 }}>Course name</th>
              <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: G700, whiteSpace: 'nowrap' }}>Course number</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={showPrograms ? 5 : 4}
                  style={{ padding: '2.5rem', textAlign: 'center', color: G500 }}
                >
                  No courses match your filters.
                </td>
              </tr>
            )}
            {filtered.map(c => {
              const on = courseSel.has(c.id);
              const pp = programById[c.progId];
              return (
                <tr
                  key={c.id}
                  onClick={() => toggleCourse(c.id)}
                  style={{
                    borderBottom: '1px solid ' + BORDER,
                    background: on ? BRAND_XLT : WHITE,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = G50; }}
                  onMouseLeave={e => { e.currentTarget.style.background = on ? BRAND_XLT : WHITE; }}
                >
                  <td style={{ padding: '9px 14px' }}>
                    <input
                      type="checkbox"
                      checked={on}
                      readOnly
                      style={{ width: 15, height: 15, accentColor: BRAND, pointerEvents: 'none' }}
                    />
                  </td>
                  {showPrograms && (
                    <td style={{ padding: '9px 14px' }}>
                      {pp && (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px',
                          borderRadius: 12, background: pp.colorLt, color: pp.color,
                        }}>
                          {pp.shortName}
                        </span>
                      )}
                    </td>
                  )}
                  <td style={{ padding: '9px 14px', fontSize: 12 }}>
                    <span style={{ background: '#e8f5e9', color: SUCCESS, padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: MONO }}>
                      {c.org}
                    </span>
                  </td>
                  <td style={{ padding: '9px 14px', fontWeight: on ? 600 : 400 }}>
                    {stripRunPrefix(c.name)}
                  </td>
                  <td style={{ padding: '9px 14px', fontFamily: MONO, fontSize: 12 }}>{c.num}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table footer */}
      <div style={{
        padding: '7px 14px', borderTop: '1px solid ' + BORDER,
        fontSize: 12, color: G500, display: 'flex', justifyContent: 'space-between',
      }}>
        <span>
          {'Showing ' + filtered.length + ' courses'}
          {filtered.length !== courses.length ? ' of ' + courses.length : ''}
        </span>
        <span>{courseCount} selected</span>
      </div>

      {/* Destination orgs */}
      {courseCount > 0 && (
        <div style={{ borderTop: '2px solid ' + BORDER, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: G900, marginBottom: 2 }}>Destination organizations</div>
              <div style={{ fontSize: 12, color: G500 }}>Each selected course will be rerun for every checked organization.</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="outline-primary" size="sm" onClick={() => setDestOrgSel(new Set(destOrgs.map(o => o.code)))}>All</Button>
              {destOrgCount > 0 && (
                <Button variant="tertiary" size="sm" onClick={() => setDestOrgSel(new Set())} style={{ color: '#c32d3a' }}>Clear</Button>
              )}
            </div>
          </div>

          {orgsLoading && (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: G500, fontSize: 13 }}>
              <Spinner animation="border" size="sm" style={{ marginRight: 8 }} />
              Loading organizations…
            </div>
          )}
          {orgsError && (
            <div style={{ padding: '0.5rem 0', color: '#c32d3a', fontSize: 13 }}>
              Failed to load organizations. Please refresh and try again.
            </div>
          )}
          {!orgsLoading && !orgsError && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
              {destOrgs.map(o => {
                const on = destOrgSel.has(o.code);
                return (
                  <div
                    key={o.code}
                    onClick={() => toggleDestOrg(o.code)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px',
                      border: '1px solid ' + (on ? BRAND : BORDER),
                      borderRadius: 4, cursor: 'pointer',
                      background: on ? BRAND_XLT : WHITE,
                      transition: 'all .12s',
                    }}
                    onMouseEnter={e => { if (!on) e.currentTarget.style.background = G50; }}
                    onMouseLeave={e => { e.currentTarget.style.background = on ? BRAND_XLT : WHITE; }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      readOnly
                      style={{ width: 14, height: 14, accentColor: BRAND, pointerEvents: 'none', flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontWeight: on ? 600 : 400, fontSize: 13,
                        color: on ? BRAND : G900,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {o.name}
                      </div>
                      <div style={{ fontSize: 11, color: G500, fontFamily: MONO }}>{o.code}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bottom action bar */}
      <div style={{
        padding: '14px 20px', borderTop: '1px solid ' + BORDER,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: G50,
      }}>
        <span style={{ fontSize: 13 }}>
          {canNext
            ? (
              <strong style={{ color: BRAND }}>
                {courseCount} course{courseCount !== 1 ? 's' : ''} x {destOrgCount} org{destOrgCount !== 1 ? 's' : ''} = {totalRuns} run{totalRuns !== 1 ? 's' : ''} will be configured
              </strong>
            )
            : (
              <span style={{ color: G500 }}>
                {courseCount === 0
                  ? 'Select source courses above to continue'
                  : 'Select destination organizations above to continue'}
              </span>
            )}
        </span>
        <Button variant="primary" disabled={!canNext} onClick={handleNext}>
          Configure
        </Button>
      </div>
    </Card>
  );
}
