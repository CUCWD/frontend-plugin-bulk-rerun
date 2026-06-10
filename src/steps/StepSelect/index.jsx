// Wizard step 1 — choose source DEMO courses and destination organisations.
// handleNext cross-joins selected courses × selected orgs into a flat CourseRow[]
// that StepConfigure receives as its rows prop.
// All course and org data is static (DEMO environment fixtures; no API call required).
import { useState, useEffect } from 'react';
import { Card, Button } from '@openedx/paragon';

import { courseRunPrefix, stripRunPrefix } from '../../utils/courseKeys';

// ─── Static data ────────────────────────────────────────────────────────────

const PROGRAMS = [
  {
    id: 'faa', code: 'FAA-ACS-AM',
    name: 'FAA General - Airman Certification Standard - Aviation Mechanic',
    shortName: 'FAA Aviation Mechanic', icon: 'plane',
    color: '#006daa', colorLt: '#deeef8',
    demoOrg: 'CA', demoOrgName: 'Choose Aerospace', demoRun: 'DEMO',
    courses: [
      { num: 'FAA-ACS-AM-IA-ACE', name: 'Fundamentals of AC Electricity' },
      { num: 'FAA-ACS-AM-IA-DCE', name: 'Fundamentals of DC Electricity' },
      { num: 'FAA-ACS-AM-IB-ACD', name: 'Aircraft Cleaning & Corrosion Control' },
      { num: 'FAA-ACS-AM-IC-WAB', name: 'Weight & Balance' },
      { num: 'FAA-ACS-AM-ID-FLF', name: 'Fluid Lines & Fittings' },
      { num: 'FAA-ACS-AM-IE-MHP', name: 'Materials & Hardware Processes' },
      { num: 'FAA-ACS-AM-IF-GOS', name: 'Ground Operation & Servicing' },
      { num: 'FAA-ACS-AM-IG-CCC', name: 'Cleaning and Corrosion Control' },
      { num: 'FAA-ACS-AM-IH-MAT', name: 'Mathematics' },
      { num: 'FAA-ACS-AM-II-MIR', name: 'Maintenance and Inspections Regulations' },
      { num: 'FAA-ACS-AM-IJ-PFA', name: 'Physics for Aviation' },
      { num: 'FAA-ACS-AM-IK-HTM', name: 'Hand Tools and Measuring Devices' },
    ],
  },
  {
    id: 'ev-st', code: 'EV-ST',
    name: 'Electric Vehicle Service Technician',
    shortName: 'EV Service Technician', icon: 'bolt',
    color: '#178253', colorLt: '#d4edda',
    demoOrg: 'SKILREDI', demoOrgName: 'SkilRedi', demoRun: 'DEMO',
    courses: [
      { num: 'EV-ST-IEV',  name: 'Introduction to Electric Vehicles (EVs)' },
      { num: 'EV-ST-SIS',  name: 'BEV Service & Installation: Safety and Standards' },
      { num: 'EV-ST-EMF',  name: 'Electric Motor Fundamentals and Operations' },
      { num: 'EV-ST-ESB',  name: 'Energy Storage and Battery Management Systems (BMS)' },
      { num: 'EV-ST-EVS',  name: 'BEV Software: Data Acquisition, Cybersecurity & Controls' },
      { num: 'EV-ST-EMDM', name: 'Introduction to BEV Diagnostics and Maintenance' },
    ],
  },
  {
    id: 'ev-mt', code: 'EV-MT',
    name: 'Electric Vehicle Manufacturing Technician',
    shortName: 'EV Manufacturing Technician', icon: 'wrench',
    color: '#856404', colorLt: '#fff8e6',
    demoOrg: 'SKILREDI', demoOrgName: 'SkilRedi', demoRun: 'DEMO',
    courses: [
      { num: 'EV-MT-IEV', name: 'Introduction to Electric Vehicles (EVs)' },
      { num: 'EV-MT-SFT', name: 'Electric Vehicle (EV) Manufacturing Safety' },
      { num: 'EV-MT-QLT', name: 'Quality in Electric Vehicle (EV) Manufacturing' },
      { num: 'EV-MT-MFG', name: 'EV Manufacturing Processes and Production' },
      { num: 'EV-MT-MMM', name: 'Maintenance Methods in EV Manufacturing' },
    ],
  },
];

const PROG_BY_ID = Object.fromEntries(PROGRAMS.map(p => [p.id, p]));

// Destination organizations — sorted alphabetically by name
const ORGS = [
  { id: 'o1',  code: 'AeroTech',   name: 'AeroTech Aviation',          programs: ['faa'] },
  { id: 'o2',  code: 'SkyLine',    name: 'SkyLine Flight Academy',      programs: ['faa'] },
  { id: 'o3',  code: 'ApexAir',    name: 'Apex Air Training',           programs: ['faa'] },
  { id: 'o4',  code: 'BlueSky',    name: 'Blue Sky Institute',          programs: ['faa'] },
  { id: 'o5',  code: 'ClearPath',  name: 'ClearPath Aeronautics',       programs: ['faa'] },
  { id: 'o6',  code: 'EagleWing',  name: 'Eagle Wing Aviation',         programs: ['faa'] },
  { id: 'o7',  code: 'VoltTech',   name: 'VoltTech Institute',          programs: ['ev-st'] },
  { id: 'o8',  code: 'AmperePro',  name: 'AmperePro Training Center',   programs: ['ev-st'] },
  { id: 'o9',  code: 'ChargeUp',   name: 'ChargeUp Academy',            programs: ['ev-st'] },
  { id: 'o10', code: 'GridPower',  name: 'GridPower Technical School',  programs: ['ev-st'] },
  { id: 'o11', code: 'AutoMotive', name: 'AutoMotive Technical',        programs: ['ev-mt'] },
  { id: 'o12', code: 'ElectraFab', name: 'ElectraFab Institute',        programs: ['ev-mt'] },
  { id: 'o13', code: 'PowerCell',  name: 'PowerCell Training',          programs: ['ev-mt'] },
  { id: 'o14', code: 'MetroCC',    name: 'Metro Community College',     programs: ['ev-st', 'ev-mt'] },
  { id: 'o15', code: 'StateVoc',   name: 'State Vocational Institute',  programs: ['faa', 'ev-st'] },
].sort((a, b) => a.name.localeCompare(b.name));

// Demo source courses derived from PROGRAMS
const DEMO_COURSES = PROGRAMS.flatMap(prog =>
  prog.courses.map(fc => ({
    id: 'demo-' + prog.id + '-' + fc.num,
    name: courseRunPrefix(prog.demoRun) + fc.name,
    org: prog.demoOrg,
    orgName: prog.demoOrgName,
    num: fc.num,
    run: prog.demoRun,
    shortName: prog.shortName,
    progId: prog.id,
    isDemo: true,
  }))
);

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

  // Source org options derived from demo courses
  const srcOrgOptions = [...new Set(DEMO_COURSES.map(c => c.org))].map(code => {
    if (code === 'CA')       return { code, name: 'Choose Aerospace' };
    if (code === 'SKILREDI') return { code, name: 'SkilRedi' };
    return { code, name: code };
  });

  // Program options scoped to current src-org filter
  const availableProgIds = new Set(
    DEMO_COURSES.filter(c => !srcOrgFilter || c.org === srcOrgFilter).map(c => c.progId)
  );

  // Filtered course list
  const ql = courseQ.toLowerCase();
  const filtered = DEMO_COURSES.filter(c => {
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
    const destOrgs = ORGS.filter(o => destOrgSel.has(o.code));
    const rows = DEMO_COURSES.filter(c => courseSel.has(c.id)).flatMap(c =>
      destOrgs.map(o => ({
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
        fromDemo: true,
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
        {/* Program dropdown — hidden when courseDiscoveryEnabled=false */}
        {courseDiscoveryEnabled && (
          <select
            value={progFilter}
            onChange={e => setProgFilter(e.target.value)}
            style={{ padding: '7px 10px', fontSize: 13, border: '1px solid ' + BORDER, borderRadius: 4, minWidth: 160 }}
          >
            <option value="">All programs</option>
            {PROGRAMS.filter(p => availableProgIds.has(p.id)).map(p => (
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
      <div style={{ overflowX: 'auto' }}>
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
              {courseDiscoveryEnabled && (
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
                  colSpan={courseDiscoveryEnabled ? 5 : 4}
                  style={{ padding: '2.5rem', textAlign: 'center', color: G500 }}
                >
                  No DEMO courses match your filters.
                </td>
              </tr>
            )}
            {filtered.map(c => {
              const on = courseSel.has(c.id);
              const pp = PROG_BY_ID[c.progId];
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
                  {courseDiscoveryEnabled && (
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
          {'Showing ' + filtered.length + ' DEMO courses'}
          {filtered.length !== DEMO_COURSES.length ? ' of ' + DEMO_COURSES.length : ''}
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
              <Button variant="outline-primary" size="sm" onClick={() => setDestOrgSel(new Set(ORGS.map(o => o.code)))}>All</Button>
              {destOrgCount > 0 && (
                <Button variant="tertiary" size="sm" onClick={() => setDestOrgSel(new Set())} style={{ color: '#c32d3a' }}>Clear</Button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
            {ORGS.map(o => {
              const on = destOrgSel.has(o.code);
              const orgProg = o.programs && o.programs.length > 0 ? PROG_BY_ID[o.programs[0]] : null;
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
                    <div style={{ fontSize: 11, color: G500, fontFamily: MONO }}>
                      {o.code}
                      {orgProg && ' ' + orgProg.shortName.split(' ')[0]}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {destOrgCount === 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#856404', fontWeight: 500 }}>
              Select at least one destination organization to continue.
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
