// Wizard step 2 — shared settings (Scheduling / Certs / Gating tabs) and a
// per-org accordion where each org has Courses and Team & Access sub-tabs.
// savedCfg re-hydrates all local state when the user navigates Back from StepReview.
// existsSet is serialised as an array in onNext(cfg) because Set is not hookstate-safe.
import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Alert, Spinner, Form, Badge } from '@openedx/paragon';

import { useValidateCourseKeys, useSearchEmails } from '../../hooks';
import { makeKey, validateRunId, detectConflict } from '../../utils/courseKeys';
import EditableRunCell from './EditableRunCell';

// ── Design tokens ────────────────────────────────────────────────────────────
const BRAND     = '#006daa';
const BRAND_LT  = '#deeef8';
const BRAND_XLT = '#eef6fb';
const SUCCESS   = '#178253';
const SUCCESS_BG = '#d4edda';
const DANGER    = '#c32d3a';
const DANGER_BG = '#fdf0f1';
const DANGER_BDR = '#f1aeb5';
const WARNING   = '#856404';
const WARNING_BG = '#fff8e6';
const WARNING_BDR = '#ffc107';
const G50       = '#f8f9fa';
const G100      = '#f0f0f0';
const G200      = '#e0e0e0';
const G300      = '#c8c8c8';
const G500      = '#6c757d';
const G700      = '#454545';
const G900      = '#1f2937';
const BORDER    = '#dee2e6';
const WHITE     = '#fff';
const MONO      = '"SFMono-Regular","Courier New",monospace';

// Hoisted lookup maps — avoids object-literal subscript inside JSX
const CONFLICT_LABEL = {
  exists: 'Already exists',
  dup:    'Duplicate',
  self:   'Same as source',
  org:    'Unknown org',
};

const CERT_DISPLAY_OPTS = [
  { value: 'early_no_info', label: 'Immediately upon passing (early_no_info)' },
  { value: 'early_with_info', label: 'Immediately with course info' },
  { value: 'end', label: 'After course end date' },
];
const GATING_MODES = [
  { v: 'disabled', title: 'Disabled',       desc: 'No gating - all content immediately accessible' },
  { v: 'copy',     title: 'Copy from source', desc: 'Replicate source course gating rules' },
  { v: 'template', title: 'Apply template',  desc: 'Use a predefined gating template by ID' },
  { v: 'custom',   title: 'Custom map',      desc: 'Define prerequisite blocks with min score/completion' },
];

// Inline label helper — Form.Label with optional hint text
function Lbl({ children, hint }) {
  return (
    <Form.Label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: G700, marginBottom: 4 }}>
      {children}
      {hint && <span style={{ fontWeight: 400, color: G500, marginLeft: 5, fontSize: 12 }}>{hint}</span>}
    </Form.Label>
  );
}

// Toggle row — native checkbox role="switch" to avoid Paragon FormSwitch prop-type warnings
function Toggle({ id, checked, onChange, label, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid ' + G200 }}>
      <div style={{ paddingRight: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: G900 }}>{label}</div>
        {hint && <span style={{ display: 'block', fontSize: 12, color: G500, marginTop: 2 }}>{hint}</span>}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        style={{ width: 36, height: 20, accentColor: BRAND, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
      />
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function StepConfigure({
  rows: initRows,
  fromMode,
  prog,
  newOrgs = [],
  courseDiscoveryEnabled,
  savedCfg = null,
  onBack,
  onNext,
}) {
  const yr = new Date().getFullYear();

  // ── Local state (all initialised from savedCfg when provided) ──────────────
  const [tab,         setTab]         = useState('scheduling');
  const [runId,       setRunId]       = useState(savedCfg?.runId || (String(yr) + '_' + String(yr + 1)));
  const [sched,       setSched]       = useState(savedCfg?.sched || {
    start:       String(yr) + '-08-01',
    end:         String(yr + 1) + '-07-31',
    enrollStart: String(yr) + '-08-01',
    enrollEnd:   String(yr + 1) + '-07-31',
    pacing:      'instructor',
  });
  const [certs, setCerts] = useState(savedCfg?.certs || {
    mode: 'honor', display: 'early_no_info',
    create: true, studentGenCert: true, certOnDashboard: true,
  });
  const [orgRosters,      setOrgRosters]      = useState(savedCfg?.orgRosters || {});
  const [removeOp,        setRemoveOp]        = useState(savedCfg?.removeOp ?? true);
  const [gating,          setGating]          = useState(savedCfg?.gating || { mode: 'disabled', templateId: '', minScore: '80', minComplete: '100' });
  const [rows,            setRows]            = useState(initRows);
  const [rowRunOverrides, setRowRunOverrides] = useState(savedCfg?.rowRunOverrides || {});
  const [orgActiveTab,    setOrgActiveTab]    = useState({});
  const [expandedOrg,     setExpandedOrg]     = useState({});
  const [checking,        setChecking]        = useState(false);
  const [validated,       setValidated]       = useState(false);
  const [existsSet,       setExistsSet]       = useState(new Set());

  const timerRef   = useRef(null);
  const cancelRef  = useRef(false);
  const rowsRef    = useRef([]);

  const validateMutation  = useValidateCourseKeys();
  const searchEmails      = useSearchEmails();
  const [emailStatus, setEmailStatus] = useState({});

  // ── Derived values ─────────────────────────────────────────────────────────
  const effectiveRows = rows.map(r => ({ ...r, run: rowRunOverrides[r.id] ?? runId }));
  rowsRef.current = effectiveRows;

  const runMaxLen = rows.length > 0
    ? Math.min(...rows.map(r => 255 - 12 - r.org.length - r.srcNum.length))
    : 100;
  const runIdV = validateRunId(runId, runMaxLen);

  const conflicts = effectiveRows.map((r, i) => detectConflict(r, effectiveRows, i, existsSet));
  const nConf = conflicts.filter(Boolean).length;

  const teamInvalid = Object.values(orgRosters).flat().filter(m => {
    if (!m.email) return false;
    if (!m.email.includes('@')) return true;
    const s = emailStatus[m.email.trim()];
    return s === 'not_found';
  }).length;

  // Emails that have a valid format but haven't resolved yet (checking or no result)
  const teamChecking = Object.values(orgRosters).flat().filter(m => {
    if (!m.email || !m.email.includes('@')) return false;
    const s = emailStatus[m.email.trim()];
    return s === 'checking' || s === undefined;
  }).length;

  const orgGroups = [...new Set(effectiveRows.map(r => r.org))]
    .sort((a, b) => a.localeCompare(b))
    .map(orgCode => {
      const orgRows = effectiveRows
        .map((r, i) => ({ ...r, idx: i }))
        .filter(r => r.org === orgCode)
        .sort((a, b) => a.srcNum.localeCompare(b.srcNum));
      return { orgCode, orgName: orgRows[0]?.orgName, orgRows, orgErr: orgRows.some(r => !!conflicts[r.idx]) };
    });

  // ── Scheduling validation — HOISTED above return() ─────────────────────────
  const schedErrs = {};
  if (!sched.start)       schedErrs.start = 'Required';
  if (!sched.end)         schedErrs.end = 'Required';
  if (!sched.enrollStart) schedErrs.enrollStart = 'Required';
  if (!sched.enrollEnd)   schedErrs.enrollEnd = 'Required';
  if (sched.start && sched.end && sched.start >= sched.end)
    schedErrs.end = 'Must be after course start date';
  if (sched.enrollStart && sched.enrollEnd && sched.enrollStart >= sched.enrollEnd)
    schedErrs.enrollEnd = 'Must be after enrollment start';
  if (sched.start && sched.enrollStart && sched.enrollStart > sched.start)
    schedErrs.enrollStart = 'Enrollment must open on or before course start';
  if (sched.end && sched.enrollEnd && sched.enrollEnd > sched.end)
    schedErrs.enrollEnd = 'Enrollment must close on or before course end';
  const schedOkUI = Object.keys(schedErrs).length === 0;

  // ── Debounced validation ───────────────────────────────────────────────────
  const sig = effectiveRows.map(r => r.org + '|' + r.num + '|' + r.run).join(',');

  useEffect(() => {
    setValidated(false);
    setChecking(false);
    clearTimeout(timerRef.current);
    cancelRef.current = false;

    timerRef.current = setTimeout(async () => {
      setChecking(true);
      try {
        const targetKeys = rowsRef.current.map(r => makeKey(r.org, r.num, r.run));
        const existing = await validateMutation.mutateAsync(targetKeys);
        if (!cancelRef.current) {
          setExistsSet(new Set(existing));
          setChecking(false);
          setValidated(true);
        }
      } catch (_e) {
        if (!cancelRef.current) {
          setChecking(false);
          setValidated(true);
        }
      }
    }, 600);

    return () => {
      cancelRef.current = true;
      clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // ── Email account validation (debounced 800 ms) ────────────────────────────
  const emailSig = JSON.stringify(
    Object.values(orgRosters).flat().map(m => m.email.trim()).filter(Boolean).sort()
  );
  useEffect(() => {
    const emails = [...new Set(
      Object.values(orgRosters).flat()
        .map(m => m.email.trim())
        .filter(e => e && e.includes('@'))
    )];
    if (emails.length === 0) return undefined;

    setEmailStatus(prev => {
      const next = { ...prev };
      emails.forEach(e => { next[e] = 'checking'; });
      return next;
    });

    const timer = setTimeout(async () => {
      try {
        const found = await searchEmails.mutateAsync(emails);
        setEmailStatus(prev => {
          const next = { ...prev };
          emails.forEach(e => { next[e] = found.has(e) ? 'found' : 'not_found'; });
          return next;
        });
      } catch (_e) {
        setEmailStatus(prev => {
          const next = { ...prev };
          emails.forEach(e => { next[e] = 'unknown'; });
          return next;
        });
      }
    }, 800);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailSig]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const newMember = useCallback(() => ({ email: '', studio: 'admin', discussion: 'discussion_admin' }), []);

  const getOrgRoster = org => (orgRosters[org] && orgRosters[org].length > 0) ? orgRosters[org] : [newMember()];

  const addOrgMember = org => setOrgRosters(p => ({
    ...p, [org]: [...(p[org] || [newMember()]), newMember()],
  }));

  const updateOrgRoster = (org, i, k, v) => setOrgRosters(p => {
    const r = [...(p[org] || [newMember()])];
    r[i] = { ...r[i], [k]: v };
    return { ...p, [org]: r };
  });

  const removeOrgMember = (org, i) => setOrgRosters(p => ({
    ...p, [org]: (p[org] || []).filter((_, j) => j !== i),
  }));

  const updateRunOverride = (rowId, val) => setRowRunOverrides(p => {
    if (!val) {
      const n = { ...p };
      delete n[rowId];
      return n;
    }
    return { ...p, [rowId]: val };
  });

  const removeRow = i => setRows(p => p.filter((_, j) => j !== i));

  const handleNext = () => {
    onNext({
      rows:       effectiveRows,
      runId,      sched,    certs,
      orgRosters, removeOp, gating,
      rowRunOverrides,
      fromMode,   prog,     newOrgs,
      courseDiscoveryEnabled,
      existsSet:  [...existsSet],
    });
  };

  // ── canReview ──────────────────────────────────────────────────────────────
  const canReview = nConf === 0 && !checking && validated && runIdV.ok && schedOkUI && teamInvalid === 0 && teamChecking === 0;

  // ── Tab definitions ────────────────────────────────────────────────────────
  const TABS = [
    { id: 'scheduling', label: 'Scheduling' },
    { id: 'certs',      label: 'Certificates' },
    { id: 'gating',     label: 'Lesson Gating', badge: gating.mode !== 'disabled' ? 'On' : null },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>

      {/* ── Shared settings card ── */}
      <div style={{ border: '1px solid ' + BORDER, borderRadius: 4, marginBottom: 14, background: WHITE }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: G700 }}>Shared settings</span>
          <span style={{ fontSize: 12, color: G500 }}>Applied to all {rows.length} course runs</span>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid ' + BORDER, background: G50, padding: '0 20px' }}>
          {TABS.map(t => (
            <div
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '10px 16px', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', userSelect: 'none',
                borderBottom: '2px solid ' + (tab === t.id ? BRAND : 'transparent'),
                color: tab === t.id ? BRAND : G500,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'color .12s', whiteSpace: 'nowrap',
              }}
            >
              {t.label}
              {t.badge && (
                <Badge variant="warning" pill style={{ fontSize: 10, lineHeight: 1.5 }}>{t.badge}</Badge>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: '16px 20px' }}>

          {/* ── Scheduling tab ── */}
          {tab === 'scheduling' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', marginBottom: 14 }}>
                {[['Course start date','start'],['Course end date','end'],['Enrollment start','enrollStart'],['Enrollment end','enrollEnd']].map(([lbl, k]) => (
                  <div key={k}>
                    <Lbl>{lbl}</Lbl>
                    <Form.Control
                      type="date"
                      value={sched[k]}
                      isInvalid={!!schedErrs[k]}
                      onChange={e => setSched(p => ({ ...p, [k]: e.target.value }))}
                    />
                    {schedErrs[k] && <div style={{ fontSize: 11, color: DANGER, marginTop: 3, fontWeight: 500 }}>{schedErrs[k]}</div>}
                  </div>
                ))}
                <div>
                  <Lbl>Course pacing</Lbl>
                  <Form.Control as="select" value={sched.pacing} onChange={e => setSched(p => ({ ...p, pacing: e.target.value }))}>
                    <option value="instructor">Instructor-paced</option>
                    <option value="self">Self-paced</option>
                  </Form.Control>
                </div>
                <div>
                  <Lbl>Target run identifier</Lbl>
                  <div style={{ position: 'relative' }}>
                    <Form.Control
                      value={runId}
                      style={{ fontFamily: MONO }}
                      isInvalid={!runIdV.ok && runId.length > 0}
                      onChange={e => setRunId(e.target.value)}
                      placeholder="e.g. 2026_2027"
                    />
                    {runId.length > 0 && (
                      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: runIdV.ok ? SUCCESS : DANGER, pointerEvents: 'none' }}>
                        {runIdV.ok ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                  {runId.length > 0 && (
                    <div style={{ fontSize: 11, marginTop: 3, fontWeight: 500, color: runIdV.ok ? SUCCESS : DANGER }}>
                      {runIdV.msg}
                    </div>
                  )}
                </div>
              </div>
              {!schedOkUI && (
                <Alert variant="warning" className="mb-0 mt-2 py-2">
                  <strong style={{ display: 'block', marginBottom: 2 }}>Fix scheduling dates before continuing</strong>
                  The date configuration has issues that must be resolved.
                </Alert>
              )}
              {schedOkUI && runIdV.ok && (
                <Alert variant="info" className="mb-0 mt-2 py-2">
                  <strong style={{ display: 'block', marginBottom: 2 }}>Run identifier applied to all course runs</strong>
                  Changing this updates every row. Individual overrides available in the table below.
                </Alert>
              )}
            </div>
          )}

          {/* ── Certificates tab ── */}
          {tab === 'certs' && (
            <div>
              <Alert variant="info" className="mb-3 py-2">
                <strong style={{ display: 'block', marginBottom: 2 }}>Global certificate template</strong>
                A single branded certificate template is applied across all organizations.
              </Alert>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', marginBottom: 14 }}>
                <div>
                  <Lbl hint="Audit to Honor per workflow">Course mode</Lbl>
                  <Form.Control as="select" value={certs.mode} onChange={e => setCerts(p => ({ ...p, mode: e.target.value }))}>
                    <option value="honor">Honor</option>
                    <option value="audit">Audit</option>
                    <option value="verified">Verified</option>
                  </Form.Control>
                </div>
                <div>
                  <Lbl hint="Open edX display constant">Certificate display behavior</Lbl>
                  <Form.Control as="select" value={certs.display} onChange={e => setCerts(p => ({ ...p, display: e.target.value }))}>
                    {CERT_DISPLAY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Form.Control>
                </div>
              </div>
              <Toggle id="cc" checked={certs.create}         onChange={e => setCerts(p => ({ ...p, create: e.target.checked }))}         label="Create and activate certificate"          hint="Creates the honor certificate and marks it active in Studio" />
              <Toggle id="sg" checked={certs.studentGenCert}  onChange={e => setCerts(p => ({ ...p, studentGenCert: e.target.checked }))}  label="Enable student-generated certificates"    hint="Students can generate certificates from the Instructor tab" />
              <Toggle id="db" checked={certs.certOnDashboard} onChange={e => setCerts(p => ({ ...p, certOnDashboard: e.target.checked }))} label="Display certificate on learner dashboard" hint="Certificate link visible immediately upon earning" />
            </div>
          )}

          {/* ── Lesson Gating tab ── */}
          {tab === 'gating' && (
            <div>
              <Alert variant="info" className="mb-3 py-2">
                <strong style={{ display: 'block', marginBottom: 2 }}>Lesson gating - subsection prerequisites</strong>
                Uses openedx.core.lib.gating API. Safe default is Disabled.
              </Alert>
              <div style={{ marginBottom: 16 }}>
                <Lbl>Gating mode</Lbl>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {GATING_MODES.map(m => (
                    <label key={m.v} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '11px 13px',
                      border: '2px solid ' + (gating.mode === m.v ? BRAND : BORDER),
                      borderRadius: 4, cursor: 'pointer',
                      background: gating.mode === m.v ? BRAND_XLT : WHITE,
                      transition: 'border .12s',
                    }}>
                      <input
                        type="radio"
                        name="gmode"
                        value={m.v}
                        checked={gating.mode === m.v}
                        onChange={() => setGating(p => ({ ...p, mode: m.v }))}
                        style={{ marginTop: 2, accentColor: BRAND, flexShrink: 0 }}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: G900 }}>{m.title}</div>
                        <div style={{ fontSize: 12, color: G500, marginTop: 2 }}>{m.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {gating.mode === 'template' && (
                <div style={{ marginBottom: 12 }}>
                  <Lbl>Gating template ID</Lbl>
                  <Form.Control value={gating.templateId} style={{ fontFamily: MONO }} onChange={e => setGating(p => ({ ...p, templateId: e.target.value }))} placeholder="template-uuid" />
                </div>
              )}
              {(gating.mode === 'template' || gating.mode === 'custom') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
                  <div>
                    <Lbl hint="0-100">Min score %</Lbl>
                    <Form.Control value={gating.minScore} style={{ fontFamily: MONO }} onChange={e => setGating(p => ({ ...p, minScore: e.target.value }))} />
                  </div>
                  <div>
                    <Lbl hint="0-100">Min completion %</Lbl>
                    <Form.Control value={gating.minComplete} style={{ fontFamily: MONO }} onChange={e => setGating(p => ({ ...p, minComplete: e.target.value }))} />
                  </div>
                </div>
              )}
              {gating.mode === 'disabled' && (
                <div style={{ padding: '11px 13px', background: G50, borderRadius: 4, fontSize: 13, color: G500, border: '1px solid ' + BORDER }}>
                  No gating applied. All sections accessible immediately.
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Course runs card ── */}
      <div style={{ border: '1px solid ' + BORDER, borderRadius: 4, marginBottom: 14, background: WHITE }}>
        <div style={{
          padding: '12px 20px', borderBottom: '1px solid ' + BORDER,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: 14, color: G700 }}>Course runs</span>
            <span style={{ fontSize: 12, color: G500, marginLeft: 8 }}>
              Grouped by target org - source = Demo template - Target Run only editable
            </span>
          </div>
          <div style={{ fontSize: 12 }}>
            {checking && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: G500 }}>
                <Spinner animation="border" size="sm" />
                {'Checking ' + rows.length + ' keys...'}
              </span>
            )}
            {!checking && validated && nConf === 0 && (
              <span style={{ color: SUCCESS, fontWeight: 600 }}>{'All ' + rows.length + ' keys available'}</span>
            )}
            {!checking && validated && nConf > 0 && (
              <span style={{ color: DANGER, fontWeight: 600 }}>{nConf + ' of ' + rows.length + ' conflict' + (nConf !== 1 ? 's' : '')}</span>
            )}
          </div>
        </div>

        {/* Per-org groups */}
        <div>
          {orgGroups.map(({ orgCode, orgName, orgRows, orgErr }) => {
            const isOpen = expandedOrg[orgCode] !== false;
            const activeOrgTab = orgActiveTab[orgCode] || 'courses';
            const orgRoster = getOrgRoster(orgCode);
            const filledMembers = orgRoster.filter(r => r.email).length;
            const coursesLabel = 'Courses (' + orgRows.length + ')';
            const teamLabel = 'Team & Access' + (filledMembers > 0 ? ' (' + filledMembers + ')' : '');

            return (
              <div key={orgCode} style={{ borderBottom: '1px solid ' + BORDER }}>
                {/* Org header */}
                <div
                  onClick={() => setExpandedOrg(p => ({ ...p, [orgCode]: !isOpen }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', cursor: 'pointer',
                    background: orgErr ? '#fff5f5' : G50,
                    borderLeft: '4px solid ' + (orgErr ? DANGER : BRAND),
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '.85'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: orgErr ? DANGER : BRAND }}>{orgCode}</span>
                  <span style={{ fontSize: 12, color: G500 }}>{orgName + ' - ' + orgRows.length + ' course' + (orgRows.length !== 1 ? 's' : '')}</span>
                  {orgErr && (
                    <Badge variant="danger" pill style={{ fontSize: 11, lineHeight: 1.5 }}>conflict</Badge>
                  )}
                  {filledMembers > 0 && (
                    <Badge variant="info" pill style={{ fontSize: 11, lineHeight: 1.5 }}>{filledMembers + ' member' + (filledMembers !== 1 ? 's' : '')}</Badge>
                  )}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: G500 }}>{isOpen ? '▲ collapse' : '▼ expand'}</span>
                </div>

                {isOpen && (
                  <>
                    {/* Per-org tab bar */}
                    <div style={{ display: 'flex', borderBottom: '1px solid ' + BORDER, background: WHITE, padding: '0 4px' }}>
                      {[{ id: 'courses', label: coursesLabel }, { id: 'team', label: teamLabel }].map(t => {
                        const active = activeOrgTab === t.id;
                        return (
                          <div
                            key={t.id}
                            onClick={e => { e.stopPropagation(); setOrgActiveTab(p => ({ ...p, [orgCode]: t.id })); }}
                            style={{
                              padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                              borderBottom: '2px solid ' + (active ? BRAND : 'transparent'),
                              color: active ? BRAND : G500, userSelect: 'none', transition: 'color .1s',
                            }}
                          >
                            {t.label}
                          </div>
                        );
                      })}
                    </div>

                    {/* ── Courses tab ── */}
                    {activeOrgTab === 'courses' && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid ' + BORDER, background: WHITE }}>
                              <th style={{ padding: '7px 8px 7px 20px', width: 28 }} />
                              <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: SUCCESS, background: SUCCESS_BG, whiteSpace: 'nowrap', borderBottom: '2px solid ' + SUCCESS }}>Course Name</th>
                              <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: SUCCESS, background: SUCCESS_BG, whiteSpace: 'nowrap', borderBottom: '2px solid ' + SUCCESS }}>Src Org</th>
                              <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: SUCCESS, background: SUCCESS_BG, whiteSpace: 'nowrap', borderBottom: '2px solid ' + SUCCESS }}>Src Course #</th>
                              <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: SUCCESS, background: SUCCESS_BG, whiteSpace: 'nowrap', borderBottom: '2px solid ' + SUCCESS }}>Src Run</th>
                              <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: BRAND, background: BRAND_LT, whiteSpace: 'nowrap', borderBottom: '2px solid ' + BRAND }}>Target Org</th>
                              <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: BRAND, background: BRAND_LT, whiteSpace: 'nowrap', borderBottom: '2px solid ' + BRAND }}>Target Course #</th>
                              <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: BRAND, background: BRAND_LT, whiteSpace: 'nowrap', borderBottom: '2px solid ' + BRAND }}>Target Run</th>
                              <th style={{ padding: '7px 10px', width: 120 }} />
                            </tr>
                          </thead>
                          <tbody>
                            {orgRows.map(r => {
                              const ct = conflicts[r.idx];
                              const ctLabel = ct ? CONFLICT_LABEL[ct] : null;
                              return (
                                <tr key={r.id} style={{
                                  borderBottom: '1px solid ' + BORDER,
                                  background: ct === 'exists' ? '#fff5f5' : ct ? '#fffbf0' : WHITE,
                                  borderLeft: '3px solid ' + (ct === 'exists' ? DANGER : ct ? WARNING_BDR : 'transparent'),
                                }}>
                                  <td style={{ padding: '7px 8px 7px 18px' }}>
                                    {checking
                                      ? <Spinner animation="border" size="sm" />
                                      : ct
                                        ? <span style={{ cursor: 'help', fontSize: 13 }}>{ct === 'exists' ? '🚫' : '⚠️'}</span>
                                        : validated
                                          ? <span style={{ color: SUCCESS, fontSize: 12 }}>✓</span>
                                          : null}
                                  </td>
                                  <td style={{ padding: '5px 10px', color: G700, whiteSpace: 'nowrap', background: '#f4fbf6' }}>{r.name}</td>
                                  <td style={{ padding: '7px 10px', fontFamily: MONO, fontSize: 11, color: SUCCESS, whiteSpace: 'nowrap', background: '#f4fbf6' }}>{r.srcOrg}</td>
                                  <td style={{ padding: '7px 10px', fontFamily: MONO, fontSize: 11, color: SUCCESS, whiteSpace: 'nowrap', background: '#f4fbf6' }}>{r.srcNum}</td>
                                  <td style={{ padding: '7px 10px', fontFamily: MONO, fontSize: 11, color: SUCCESS, whiteSpace: 'nowrap', background: '#f4fbf6' }}>{r.srcRun}</td>
                                  {/* Target Org and Target Course # are READ-ONLY plain text cells */}
                                  <td style={{ padding: '7px 10px', background: BRAND_XLT, fontFamily: MONO, fontSize: 11, color: BRAND, whiteSpace: 'nowrap' }}>{r.org}</td>
                                  <td style={{ padding: '7px 10px', background: BRAND_XLT, fontFamily: MONO, fontSize: 11, color: BRAND, whiteSpace: 'nowrap' }}>{r.num}</td>
                                  {/* Target Run is the ONLY editable column */}
                                  <td style={{ padding: '5px 8px', background: BRAND_XLT }}>
                                    <EditableRunCell
                                      value={r.run}
                                      onChange={v => updateRunOverride(r.id, v)}
                                      hasError={!!ct}
                                    />
                                  </td>
                                  <td style={{ padding: '7px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>
                                    {ct && !checking && (
                                      <span style={{ color: ct === 'exists' ? DANGER : WARNING, fontWeight: 500 }}>{ctLabel}</span>
                                    )}
                                    {ct === 'exists' && !checking && (
                                      <button
                                        onClick={() => removeRow(r.idx)}
                                        style={{ color: DANGER, marginLeft: 8, padding: '2px 6px', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                                      >
                                        x Remove
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* ── Team & Access tab ── */}
                    {activeOrgTab === 'team' && (
                      <div style={{ padding: '16px 20px' }}>
                        <Alert variant="info" className="mb-3 py-2">
                          <strong style={{ display: 'block', marginBottom: 2 }}>Course Assignment Roster (CAR)</strong>
                          {'Add instructors and admins for ' + (orgName || orgCode) + '. Each person will be granted course access roles across all courses for this organization.'}
                          <div style={{ marginTop: 6, fontSize: 13, color: G700 }}>
                            <span style={{ fontWeight: 600 }}>Note:</span>
                            {' Each email must belong to an existing, activated platform account — Studio roles cannot be assigned without one.'}
                          </div>
                        </Alert>
                        <div style={{ overflowX: 'auto', marginBottom: 10 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ borderBottom: '2px solid ' + BORDER, background: G50 }}>
                                {['Email address', 'Studio role', 'Discussion role', 'Account status', ''].map(h => (
                                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: G700, whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {orgRoster.map((member, i) => {
                                const trimmed = member.email.trim();
                                const apiStatus = emailStatus[trimmed];
                                let statusLabel, statusColor, statusIcon;
                                if (!trimmed) {
                                  statusLabel = '—'; statusColor = G300; statusIcon = null;
                                } else if (!trimmed.includes('@')) {
                                  statusLabel = 'Invalid email'; statusColor = DANGER; statusIcon = '✗';
                                } else if (apiStatus === 'checking') {
                                  statusLabel = 'Checking…'; statusColor = G500; statusIcon = null;
                                } else if (apiStatus === 'found') {
                                  statusLabel = 'Account found'; statusColor = SUCCESS; statusIcon = '✓';
                                } else if (apiStatus === 'not_found') {
                                  statusLabel = 'No account found'; statusColor = DANGER; statusIcon = '✗';
                                } else if (apiStatus === 'unknown') {
                                  statusLabel = 'Lookup failed'; statusColor = WARNING; statusIcon = '⚠';
                                } else {
                                  statusLabel = 'Pending…'; statusColor = G300; statusIcon = null;
                                }
                                return (
                                  <tr key={i} style={{ borderBottom: '1px solid ' + BORDER, background: apiStatus === 'not_found' ? DANGER_BG : WHITE }}>
                                    <td style={{ padding: '6px 8px' }}>
                                      <Form.Control
                                        size="sm"
                                        value={member.email}
                                        onChange={e => updateOrgRoster(orgCode, i, 'email', e.target.value)}
                                        placeholder="instructor@example.org"
                                        style={{ minWidth: 220 }}
                                        isInvalid={apiStatus === 'not_found' || (!trimmed.includes('@') && trimmed.length > 0)}
                                      />
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                      <Form.Control as="select" size="sm" value={member.studio} onChange={e => updateOrgRoster(orgCode, i, 'studio', e.target.value)} style={{ width: 'auto' }}>
                                        <option value="admin">Admin</option>
                                        <option value="staff">Staff</option>
                                        <option value="data_researcher">Data researcher</option>
                                      </Form.Control>
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                      <Form.Control as="select" size="sm" value={member.discussion} onChange={e => updateOrgRoster(orgCode, i, 'discussion', e.target.value)} style={{ width: 'auto' }}>
                                        <option value="discussion_admin">Discussion admin</option>
                                        <option value="moderator">Moderator</option>
                                        <option value="none">None</option>
                                      </Form.Control>
                                    </td>
                                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                                      {apiStatus === 'checking'
                                        ? <Spinner animation="border" size="sm" style={{ width: 14, height: 14 }} />
                                        : (
                                          <span style={{ fontSize: 12, color: statusColor, fontWeight: 500 }}>
                                            {statusIcon && <span style={{ marginRight: 4 }}>{statusIcon}</span>}
                                            {statusLabel}
                                          </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                      <button onClick={() => removeOrgMember(orgCode, i)} style={{ color: DANGER, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>✕</button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                          <Button variant="outline-primary" size="sm" onClick={() => addOrgMember(orgCode)}>+ Add team member</Button>
                          {filledMembers > 0
                            ? (
                              <Toggle
                                id={'rp-' + orgCode}
                                checked={removeOp}
                                onChange={e => setRemoveOp(e.target.checked)}
                                label="Remove provisioner after provisioning"
                                hint="Unenrolls the provisioner account once all steps complete"
                              />
                            )
                            : (
                              <span style={{ fontSize: 12, color: G500, fontStyle: 'italic' }}>
                                No team members added - provisioner account will be retained.
                              </span>
                            )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Table footer */}
        <div style={{
          padding: '8px 14px', borderTop: '1px solid ' + BORDER,
          fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: nConf > 0 && validated ? DANGER_BG : WHITE,
        }}>
          <span style={{ color: G500 }}>
            All {rows.length} target keys validated. Run ID defaults to shared identifier. Target Run is the only editable column.
          </span>
          {validated && nConf > 0 && (
            <span style={{ color: DANGER, fontWeight: 600 }}>{nConf + ' conflict' + (nConf !== 1 ? 's' : '') + ' must be resolved'}</span>
          )}
        </div>
      </div>

      {/* ── Bottom action bar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button variant="outline-primary" onClick={onBack}>Back</Button>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {validated && nConf > 0 && (
            <>
              <span style={{ fontSize: 13, color: DANGER }}>{'Resolve ' + nConf + ' conflict' + (nConf !== 1 ? 's' : '') + ' first'}</span>
              <Button
                variant="danger"
                onClick={() => setRows(p => p.filter((_, i) => !conflicts[i]).sort((a, b) => a.org.localeCompare(b.org)))}
              >
                Remove all conflicts
              </Button>
            </>
          )}
          {teamChecking > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: G500 }}>
              <Spinner animation="border" size="sm" style={{ width: 14, height: 14 }} />
              {'Validating ' + teamChecking + ' team account' + (teamChecking !== 1 ? 's' : '') + '…'}
            </span>
          )}
          {teamInvalid > 0 && (
            <span style={{ fontSize: 13, color: DANGER }}>
              {teamInvalid + ' team member' + (teamInvalid !== 1 ? ' accounts' : ' account') + ' not found on platform'}
            </span>
          )}
          <Button variant="primary" disabled={!canReview} onClick={handleNext}>
            Review
          </Button>
        </div>
      </div>
    </div>
  );
}
