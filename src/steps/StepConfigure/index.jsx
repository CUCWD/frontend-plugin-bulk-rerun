// Wizard step 2 — shared settings (Scheduling / Certs / Gating tabs) and a
// per-org accordion where each org has Courses and Team & Access sub-tabs.
// savedCfg re-hydrates all local state when the user navigates Back from StepReview.
// existsSet is serialised as an array in onNext(cfg) because Set is not hookstate-safe.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button, Alert, Spinner, Form, Badge, DataTable } from '@openedx/paragon';

import { useValidateCourseKeys, useSearchEmails } from '../../hooks';
import { makeKey, validateRunId, detectConflict, COURSE_ID_MAX_COMBINED, RUN_ID_RE } from '../../utils/courseKeys';
import EditableRunCell from './EditableRunCell';
import './index.scss';

// ── Hoisted lookup maps ───────────────────────────────────────────────────────
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

// Pure helper — returns display info for a team member's account status
function emailStatusInfo(trimmed, apiStatus) {
  if (!trimmed)                  return { label: '—',                cls: 'sc-email-status--muted', icon: null };
  if (!trimmed.includes('@'))    return { label: 'Invalid email',    cls: 'sc-email-status--err',   icon: '✗' };
  if (apiStatus === 'found')     return { label: 'Account found',    cls: 'sc-email-status--ok',    icon: '✓' };
  if (apiStatus === 'not_found') return { label: 'No account found', cls: 'sc-email-status--err',   icon: '✗' };
  if (apiStatus === 'unknown')   return { label: 'Lookup failed',    cls: 'sc-email-status--warn',  icon: '⚠' };
  if (apiStatus === 'checking')  return { label: null,               cls: 'sc-email-status--muted', icon: null };
  return { label: 'Pending…', cls: 'sc-email-status--muted', icon: null };
}

// Conflict class helper for course-run DataTable cells
const conflictCls = conflict => (conflict === 'exists' ? ' sc-cell--exists' : conflict ? ' sc-cell--conflict' : '');

// Isolated email input — manages local state so typing never triggers a parent
// re-render. Commits to orgRosters (and starts verification) 2 s after the user
// stops typing, or immediately on blur so tabbing away also works.
function TeamEmailCell({
  value: externalValue, orgCode, rowIndex, apiStatus, onUpdate,
}) {
  const [localValue, setLocalValue] = useState(externalValue);
  const timerRef = useRef(null);

  // Sync if external value changes (e.g. savedCfg re-hydration or row reset)
  useEffect(() => { setLocalValue(externalValue); }, [externalValue]);

  // Cancel pending timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleChange = e => {
    const v = e.target.value;
    setLocalValue(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onUpdate(orgCode, rowIndex, 'email', v), 1000);
  };

  const handleBlur = () => {
    clearTimeout(timerRef.current);
    onUpdate(orgCode, rowIndex, 'email', localValue);
  };

  const trimmed = localValue.trim();
  const isInvalid = apiStatus === 'not_found' || (!trimmed.includes('@') && trimmed.length > 0);

  return (
    <Form.Control
      size="sm"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder="instructor@example.org"
      className="sc-email-input"
      isInvalid={isInvalid}
    />
  );
}

// Inline label helper — Form.Label with optional hint text
function Lbl({ children, hint }) {
  return (
    <Form.Label className="sc-lbl">
      {children}
      {hint && <span className="sc-lbl-hint">{hint}</span>}
    </Form.Label>
  );
}

// Toggle row — native checkbox role="switch" to avoid Paragon FormSwitch prop-type warnings
function Toggle({ id, checked, onChange, label, hint }) {
  return (
    <div className="sc-toggle">
      <div className="sc-toggle__text">
        <div className="sc-toggle__label">{label}</div>
        {hint && <span className="sc-toggle__hint">{hint}</span>}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="sc-toggle__switch"
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

  const timerRef      = useRef(null);
  const cancelRef     = useRef(false);
  const rowsRef       = useRef([]);
  // Refs that mirror checking/validated so the column Cell renderers can read
  // the current value without closing over stale state. This lets courseRunColumns
  // stay stable (no checking/validated in deps) so EditableRunCell is never remounted
  // mid-keystroke and focus is preserved.
  const checkingRef   = useRef(false);
  const validatedRef  = useRef(false);

  const validateMutation  = useValidateCourseKeys();
  const searchEmails      = useSearchEmails();
  const [emailStatus, setEmailStatus] = useState({});

  // ── Derived values ─────────────────────────────────────────────────────────
  const effectiveRows = rows.map(r => ({ ...r, run: rowRunOverrides[r.id] ?? runId }));
  rowsRef.current     = effectiveRows;
  checkingRef.current = checking;
  validatedRef.current = validated;

  const runMaxLen = rows.length > 0
    ? Math.min(...rows.map(r => 255 - 12 - r.org.length - r.srcNum.length))
    : 100;
  const runIdV = validateRunId(runId, runMaxLen);

  const conflicts = effectiveRows.map((r, i) => detectConflict(r, effectiveRows, i, existsSet));
  const nConf = conflicts.filter(Boolean).length;

  const courseIdTooLong = effectiveRows.map(
    r => r.org.length + r.num.length + r.run.length > COURSE_ID_MAX_COMBINED,
  );
  const nLenErr = courseIdTooLong.filter(Boolean).length;
  const hasAnyInvalidRunChars = effectiveRows.some(r => r.run.length > 0 && !RUN_ID_RE.test(r.run));

  const teamInvalid = Object.values(orgRosters).flat().filter(m => {
    if (!m.email) return true;
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
      // Wait until every effective run ID (global default + per-row overrides)
      // passes format validation before hitting the API — same logic as the
      // "Target run identifier" field guard added above.
      if (rowsRef.current.some(r => !validateRunId(r.run, runMaxLen).ok)) return;
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
    }, 1200);

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

  const updateOrgRoster = useCallback((org, i, k, v) => setOrgRosters(p => {
    const r = [...(p[org] || [newMember()])];
    r[i] = { ...r[i], [k]: v };
    return { ...p, [org]: r };
  }), [newMember]);

  const removeOrgMember = useCallback((org, i) => setOrgRosters(p => ({
    ...p, [org]: (p[org] || []).filter((_, j) => j !== i),
  })), []);

  const updateRunOverride = useCallback((rowId, val) => setRowRunOverrides(p => {
    if (!val) {
      const n = { ...p };
      delete n[rowId];
      return n;
    }
    return { ...p, [rowId]: val };
  }), []);

  const removeRow = i => setRows(p => p.filter((_, j) => j !== i));

  // ── Course-run DataTable columns ───────────────────────────────────────────
  const courseRunColumns = useMemo(() => [
    {
      id: 'indicator',
      Header: '',
      accessor: 'conflict',
      disableSortBy: true,
      Cell: ({ row }) => {
        const { conflict, lenErr } = row.original;
        const indCls = lenErr && !conflict ? ' sc-cell--exists' : conflictCls(conflict);
        return (
          <div className={`sc-cell sc-cell--indicator${indCls}`}>
            {checkingRef.current
              ? <Spinner animation="border" size="sm" className="sc-spinner-sm" />
              : (conflict || lenErr)
                ? <span className="sc-conflict-icon">{conflict === 'exists' ? '🚫' : lenErr ? '✗' : '⚠️'}</span>
                : validatedRef.current
                  ? <span className="sc-ok-check">✓</span>
                  : null}
          </div>
        );
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

  // Renders the full-width conflict detail that appears beneath each conflicted row.
  const renderCourseRunSubRow = useCallback(({ row }) => {
    const { conflict, lenErr, idx } = row.original;
    if (!conflict && !lenErr) return null;
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
          <button onClick={() => removeRow(idx)} className="sc-remove-btn">
            × Remove
          </button>
        )}
      </div>
    );
  }, [removeRow]);

  // ── Team-member DataTable columns ─────────────────────────────────────────
  // apiStatus is read from row.original (embedded in data), NOT from the emailStatus
  // closure — this keeps teamColumns stable so DataTable never remounts cells.
  const teamColumns = useMemo(() => [
    {
      Header: 'Email address',
      accessor: 'email',
      disableSortBy: true,
      Cell: ({ row }) => {
        const { email, orgCode: oc, apiStatus } = row.original;
        return (
          <div className={`sc-team-cell${apiStatus === 'not_found' ? ' sc-team-cell--err' : ''}`}>
            <TeamEmailCell
              value={email}
              orgCode={oc}
              rowIndex={row.index}
              apiStatus={apiStatus}
              onUpdate={updateOrgRoster}
            />
          </div>
        );
      },
    },
    {
      Header: 'Studio role',
      accessor: 'studio',
      disableSortBy: true,
      Cell: ({ row }) => {
        const { apiStatus } = row.original;
        return (
          <div className={`sc-team-cell${apiStatus === 'not_found' ? ' sc-team-cell--err' : ''}`}>
            <Form.Control
              as="select"
              size="sm"
              value={row.original.studio}
              onChange={e => updateOrgRoster(row.original.orgCode, row.index, 'studio', e.target.value)}
              className="sc-select-auto"
            >
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
              <option value="data_researcher">Data researcher</option>
            </Form.Control>
          </div>
        );
      },
    },
    {
      Header: 'Discussion role',
      accessor: 'discussion',
      disableSortBy: true,
      Cell: ({ row }) => {
        const { apiStatus } = row.original;
        return (
          <div className={`sc-team-cell${apiStatus === 'not_found' ? ' sc-team-cell--err' : ''}`}>
            <Form.Control
              as="select"
              size="sm"
              value={row.original.discussion}
              onChange={e => updateOrgRoster(row.original.orgCode, row.index, 'discussion', e.target.value)}
              className="sc-select-auto"
            >
              <option value="discussion_admin">Discussion admin</option>
              <option value="moderator">Moderator</option>
              <option value="none">None</option>
            </Form.Control>
          </div>
        );
      },
    },
    {
      id: 'accountStatus',
      Header: 'Account status',
      disableSortBy: true,
      Cell: ({ row }) => {
        const { email, apiStatus } = row.original;
        const trimmed = email.trim();
        const { label, cls, icon } = emailStatusInfo(trimmed, apiStatus);
        return (
          <div className={`sc-team-cell sc-team-cell--nowrap${apiStatus === 'not_found' ? ' sc-team-cell--err' : ''}`}>
            {apiStatus === 'checking'
              ? <Spinner animation="border" size="sm" className="sc-spinner-sm" />
              : (
                <span className={`sc-email-status ${cls}`}>
                  {icon && <span className="sc-email-status__icon">{icon}</span>}
                  {label}
                </span>
              )}
          </div>
        );
      },
    },
    {
      id: 'actions',
      Header: '',
      disableSortBy: true,
      Cell: ({ row }) => {
        const { apiStatus } = row.original;
        return (
          <div className={`sc-team-cell${apiStatus === 'not_found' ? ' sc-team-cell--err' : ''}`}>
            <button
              onClick={() => removeOrgMember(row.original.orgCode, row.index)}
              className="sc-team-remove"
            >
              ✕
            </button>
          </div>
        );
      },
    },
  ], [updateOrgRoster, removeOrgMember]);

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
  const canReview = nConf === 0 && nLenErr === 0 && !checking && validated && runIdV.ok && schedOkUI && teamInvalid === 0 && teamChecking === 0;

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
      <div className="sc-card">
        <div className="sc-card-header">
          <span className="sc-card-title">Shared settings</span>
          <span className="sc-card-subtitle">Applied to all {rows.length} course runs</span>
        </div>

        {/* Tab bar */}
        <div className="sc-tabs">
          {TABS.map(t => (
            <div
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`sc-tab${tab === t.id ? ' sc-tab--active' : ''}`}
            >
              {t.label}
              {t.badge && (
                <Badge variant="warning" pill className="sc-badge-xs">{t.badge}</Badge>
              )}
            </div>
          ))}
        </div>

        <div className="sc-card-body">

          {/* ── Scheduling tab ── */}
          {tab === 'scheduling' && (
            <div>
              <div className="sc-grid-2">
                {[['Course start date','start'],['Course end date','end'],['Enrollment start','enrollStart'],['Enrollment end','enrollEnd']].map(([lbl, k]) => (
                  <div key={k}>
                    <Lbl>{lbl}</Lbl>
                    <Form.Control
                      type="date"
                      value={sched[k]}
                      isInvalid={!!schedErrs[k]}
                      onChange={e => setSched(p => ({ ...p, [k]: e.target.value }))}
                    />
                    {schedErrs[k] && <div className="sc-field-err">{schedErrs[k]}</div>}
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
                  <div className="sc-run-field">
                    <Form.Control
                      value={runId}
                      className="font-monospace"
                      isInvalid={!runIdV.ok && runId.length > 0}
                      onChange={e => setRunId(e.target.value)}
                      placeholder="e.g. 2026_2027"
                      style={runId.length > 0 ? { paddingRight: 30 } : undefined}
                    />
                    {runId.length > 0 && (
                      <span className={`sc-run-indicator sc-run-indicator--${runIdV.ok ? 'ok' : 'err'}`}>
                        {runIdV.ok ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                  {runId.length > 0 && (
                    <div className={`sc-run-msg sc-run-msg--${runIdV.ok ? 'ok' : 'err'}`}>
                      {runIdV.msg}
                    </div>
                  )}
                </div>
              </div>
              {!schedOkUI && (
                <Alert variant="warning" className="mb-0 mt-2 py-2">
                  <strong className="sc-alert-title">Fix scheduling dates before continuing</strong>
                  The date configuration has issues that must be resolved.
                </Alert>
              )}
              {schedOkUI && runIdV.ok && (
                <Alert variant="info" className="mb-0 mt-2 py-2">
                  <strong className="sc-alert-title">Run identifier applied to all course runs</strong>
                  Changing this updates every row. Individual overrides available in the table below.
                </Alert>
              )}
            </div>
          )}

          {/* ── Certificates tab ── */}
          {tab === 'certs' && (
            <div>
              <Alert variant="info" className="mb-3 py-2">
                <strong className="sc-alert-title">Global certificate template</strong>
                A single branded certificate template is applied across all organizations.
              </Alert>
              <div className="sc-grid-2">
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
                <strong className="sc-alert-title">Lesson gating - subsection prerequisites</strong>
                Uses openedx.core.lib.gating API. Safe default is Disabled.
              </Alert>
              <div className="sc-gating-mode-wrap">
                <Lbl>Gating mode</Lbl>
                <div className="sc-gating-grid">
                  {GATING_MODES.map(m => (
                    <label key={m.v} className={`sc-gating-option${gating.mode === m.v ? ' sc-gating-option--active' : ''}`}>
                      <input
                        type="radio"
                        name="gmode"
                        value={m.v}
                        checked={gating.mode === m.v}
                        onChange={() => setGating(p => ({ ...p, mode: m.v }))}
                      />
                      <div>
                        <div className="sc-gating-option__title">{m.title}</div>
                        <div className="sc-gating-option__desc">{m.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {gating.mode === 'template' && (
                <div className="sc-gating-field">
                  <Lbl>Gating template ID</Lbl>
                  <Form.Control value={gating.templateId} className="font-monospace" onChange={e => setGating(p => ({ ...p, templateId: e.target.value }))} placeholder="template-uuid" />
                </div>
              )}
              {(gating.mode === 'template' || gating.mode === 'custom') && (
                <div className="sc-grid-2">
                  <div>
                    <Lbl hint="0-100">Min score %</Lbl>
                    <Form.Control value={gating.minScore} className="font-monospace" onChange={e => setGating(p => ({ ...p, minScore: e.target.value }))} />
                  </div>
                  <div>
                    <Lbl hint="0-100">Min completion %</Lbl>
                    <Form.Control value={gating.minComplete} className="font-monospace" onChange={e => setGating(p => ({ ...p, minComplete: e.target.value }))} />
                  </div>
                </div>
              )}
              {gating.mode === 'disabled' && (
                <div className="sc-gating-disabled">
                  No gating applied. All sections accessible immediately.
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Course runs card ── */}
      <div className="sc-card">
        <div className="sc-card-header">
          <div>
            <span className="sc-card-title">Course runs</span>
            <span className="sc-runs-sub">
              Grouped by target org - source = Demo template - Target Run only editable
            </span>
          </div>
          <div>
            {checking && (
              <span className="sc-runs-checking">
                <Spinner animation="border" size="sm" />
                {'Checking ' + rows.length + ' keys...'}
              </span>
            )}
            {!checking && validated && nConf === 0 && (
              <span className="sc-runs-ok">{'All ' + rows.length + ' keys available'}</span>
            )}
            {!checking && validated && nConf > 0 && (
              <span className="sc-runs-err">{nConf + ' conflict' + (nConf !== 1 ? 's' : '') + ' found in ' + rows.length + ' course rerun' + (rows.length !== 1 ? 's' : '') + ' scheduled'}</span>
            )}
          </div>
        </div>

        {/* Per-org groups */}
        <div>
          {orgGroups.map(({ orgCode, orgName, orgRows, orgErr }) => {
            const isOpen = expandedOrg[orgCode] !== false;
            const activeOrgTab = orgActiveTab[orgCode] || 'courses';
            const orgConflictsKey = runId + ':' + orgCode + ':' + orgRows.map(r => (conflicts[r.idx] || '') + (courseIdTooLong[r.idx] ? '!' : '')).join(',');
            const orgInitialExpanded = Object.fromEntries(
              orgRows.flatMap(r => (conflicts[r.idx] ? [[r.id, true]] : [])),
            );
            const orgRoster = getOrgRoster(orgCode);
            const filledMembers = orgRoster.filter(r => r.email).length;
            const coursesLabel = 'Courses (' + orgRows.length + ')';
            const teamLabel = 'Team & Access' + (filledMembers > 0 ? ' (' + filledMembers + ')' : '');

            return (
              <div key={orgCode} className="sc-org-group">
                {/* Org header */}
                <div
                  onClick={() => setExpandedOrg(p => ({ ...p, [orgCode]: !isOpen }))}
                  className={`sc-org-header${orgErr ? ' sc-org-header--err' : ''}`}
                >
                  <span className="sc-org-code">{orgName} ({orgCode})</span>
                  <span className="sc-org-meta">{orgRows.length + ' course' + (orgRows.length !== 1 ? 's' : '')}</span>
                  {orgErr && (
                    <Badge variant="danger" pill className="sc-badge-sm">conflict</Badge>
                  )}
                  {filledMembers > 0 && (
                    <Badge variant="info" pill className="sc-badge-sm">{filledMembers + ' member' + (filledMembers !== 1 ? 's' : '')}</Badge>
                  )}
                  <div className="sc-org-spacer" />
                  <span className="sc-org-toggle-text">{isOpen ? '▲ collapse' : '▼ expand'}</span>
                </div>

                {isOpen && (
                  <>
                    {/* Per-org tab bar */}
                    <div className="sc-org-tabs">
                      {[{ id: 'courses', label: coursesLabel }, { id: 'team', label: teamLabel }].map(t => (
                        <div
                          key={t.id}
                          onClick={e => { e.stopPropagation(); setOrgActiveTab(p => ({ ...p, [orgCode]: t.id })); }}
                          className={`sc-org-tab${activeOrgTab === t.id ? ' sc-org-tab--active' : ''}`}
                        >
                          {t.label}
                        </div>
                      ))}
                    </div>

                    {/* ── Courses tab ── */}
                    {activeOrgTab === 'courses' && (
                      <div className="bulk-rerun-course-table">
                        <DataTable
                          key={orgConflictsKey}
                          isExpandable
                          renderRowSubComponent={renderCourseRunSubRow}
                          columns={courseRunColumns}
                          data={orgRows.map(r => ({ ...r, conflict: conflicts[r.idx], lenErr: courseIdTooLong[r.idx] }))}
                          itemCount={orgRows.length}
                          initialState={{ expanded: orgInitialExpanded }}
                          initialTableOptions={{ getRowId: row => row.id, autoResetSelectedRows: false, autoResetExpanded: false }}
                        >
                          <DataTable.Table isStriped={false} />
                          <DataTable.EmptyTable content="No courses." />
                        </DataTable>
                      </div>
                    )}

                    {/* ── Team & Access tab ── */}
                    {activeOrgTab === 'team' && (
                      <div className="sc-team-content">
                        <Alert variant="info" className="mb-3 py-2">
                          <strong className="sc-alert-title">Course Assignment Roster (CAR)</strong>
                          {'Add instructors and admins for ' + (orgName || orgCode) + '. Each person will be granted course access roles across all courses for this organization.'}
                          <div className="sc-car-note">
                            <strong>Note:</strong>
                            {' Each email must belong to an existing, activated platform account — Studio roles cannot be assigned without one.'}
                          </div>
                        </Alert>
                        <div className="bulk-rerun-team-table">
                          <DataTable
                            columns={teamColumns}
                            data={orgRoster.map(m => ({ ...m, orgCode, apiStatus: emailStatus[m.email.trim()] }))}
                            itemCount={orgRoster.length}
                            initialTableOptions={{ autoResetSelectedRows: false }}
                          >
                            <DataTable.Table isStriped={false} />
                            <DataTable.EmptyTable content="No team members." />
                          </DataTable>
                        </div>

                        <div className="sc-team-footer">
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
                              <span className="sc-team-empty">
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
        <div className={`sc-table-footer${(nConf > 0 || nLenErr > 0) && validated ? ' sc-table-footer--err' : ''}`}>
          <span className="sc-table-footer-note">
            All {rows.length} target keys validated. Run ID defaults to shared identifier. Target Run is the only editable column.
          </span>
          {hasAnyInvalidRunChars && (
            <span className="sc-table-footer-conflict">Invalid characters - allowed: letters, digits, _ - ~ .</span>
          )}
          {validated && nLenErr > 0 && (
            <span className="sc-table-footer-conflict">{nLenErr + ' course ID' + (nLenErr !== 1 ? 's' : '') + ' exceed ' + COURSE_ID_MAX_COMBINED + '-char limit'}</span>
          )}
          {validated && nConf > 0 && (
            <span className="sc-table-footer-conflict">{nConf + ' conflict' + (nConf !== 1 ? 's' : '') + ' must be resolved'}</span>
          )}
        </div>
      </div>

      {/* ── Bottom action bar ── */}
      <div className="sc-action-bar">
        <Button variant="outline-primary" onClick={onBack}>Back</Button>
        <div className="sc-action-bar-right">
          {validated && nLenErr > 0 && (
            <span className="sc-conflict-msg">{nLenErr + ' course ID' + (nLenErr !== 1 ? 's' : '') + ' exceed ' + COURSE_ID_MAX_COMBINED + ' chars'}</span>
          )}
          {validated && nConf > 0 && (
            <>
              <span className="sc-conflict-msg">{'Resolve ' + nConf + ' conflict' + (nConf !== 1 ? 's' : '') + ' first'}</span>
              <Button
                variant="danger"
                onClick={() => setRows(p => p.filter((_, i) => !conflicts[i]).sort((a, b) => a.org.localeCompare(b.org)))}
              >
                Remove all conflicts
              </Button>
            </>
          )}
          {teamChecking > 0 && (
            <span className="sc-checking-msg">
              <Spinner animation="border" size="sm" className="sc-spinner-sm" />
              {'Validating ' + teamChecking + ' team account' + (teamChecking !== 1 ? 's' : '') + '…'}
            </span>
          )}
          {teamInvalid > 0 && (
            <span className="sc-conflict-msg">
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
