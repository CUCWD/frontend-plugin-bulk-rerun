// Wizard step 2 — shared settings (Scheduling / Certs / Gating tabs) and a
// per-org accordion where each org has Courses and Team & Access sub-tabs.
// savedCfg re-hydrates all local state when the user navigates Back from StepReview.
// existsSet is serialised as an array in onNext(cfg) because Set is not hookstate-safe.
import {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import PropTypes from 'prop-types';
import {
  Button, Spinner, Form, Badge, DataTable,
} from '@openedx/paragon';

import { useValidateCourseKeys, useSearchEmails } from '../../hooks';
import {
  makeKey, validateRunId, detectConflict, isHardConflict, COURSE_ID_MAX_COMBINED, RUN_ID_RE,
} from '../../utils/courseKeys';
import EditableRunCell from './EditableRunCell';
import CertificatesTab from './CertificatesTab';
import GatingTab from './GatingTab';
import SchedulingTab from './SchedulingTab';
import TeamTab from './TeamTab';
import './index.scss';

// ── Hoisted lookup maps ───────────────────────────────────────────────────────
const CONFLICT_LABEL = {
  exists: 'Already exists',
  dup: 'Duplicate',
  self: 'Same as source',
  org: 'Unknown org',
};

const rosterMemberPropType = PropTypes.shape({
  email: PropTypes.string,
  studio: PropTypes.string,
  discussion: PropTypes.string,
});

const schedPropType = PropTypes.shape({
  start: PropTypes.string,
  end: PropTypes.string,
  enrollStart: PropTypes.string,
  enrollEnd: PropTypes.string,
  pacing: PropTypes.string,
});

const certsPropType = PropTypes.shape({
  mode: PropTypes.string,
  display: PropTypes.string,
  create: PropTypes.bool,
  studentGenCert: PropTypes.bool,
  certOnDashboard: PropTypes.bool,
});

const gatingPropType = PropTypes.shape({
  mode: PropTypes.string,
  templateId: PropTypes.string,
  minScore: PropTypes.string,
  minComplete: PropTypes.string,
});

const courseRowPropType = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  name: PropTypes.string,
  org: PropTypes.string.isRequired,
  orgName: PropTypes.string,
  num: PropTypes.string.isRequired,
  run: PropTypes.string,
  srcOrg: PropTypes.string.isRequired,
  srcNum: PropTypes.string.isRequired,
  srcRun: PropTypes.string.isRequired,
  isNewOrg: PropTypes.bool,
});

const programPropType = PropTypes.shape({
  name: PropTypes.string,
  icon: PropTypes.string,
  color: PropTypes.string,
  colorLt: PropTypes.string,
});

const newOrgPropType = PropTypes.shape({
  code: PropTypes.string,
  name: PropTypes.string,
});

const savedCfgPropType = PropTypes.shape({
  runId: PropTypes.string,
  sched: schedPropType,
  certs: certsPropType,
  orgRosters: PropTypes.objectOf(PropTypes.arrayOf(rosterMemberPropType)),
  removeOp: PropTypes.bool,
  gating: gatingPropType,
  rowRunOverrides: PropTypes.objectOf(PropTypes.string),
});

// Pure helper — returns display info for a team member's account status
function emailStatusInfo(trimmed, apiStatus) {
  if (!trimmed) { return { label: '—', cls: 'sc-email-status--muted', icon: null }; }
  if (!trimmed.includes('@')) { return { label: 'Invalid email', cls: 'sc-email-status--err', icon: '✗' }; }
  if (apiStatus === 'found') { return { label: 'Account found', cls: 'sc-email-status--ok', icon: '✓' }; }
  if (apiStatus === 'not_found') { return { label: 'No account found', cls: 'sc-email-status--err', icon: '✗' }; }
  if (apiStatus === 'unknown') { return { label: 'Lookup failed', cls: 'sc-email-status--warn', icon: '⚠' }; }
  if (apiStatus === 'checking') { return { label: null, cls: 'sc-email-status--muted', icon: null }; }
  return { label: 'Pending…', cls: 'sc-email-status--muted', icon: null };
}

// Conflict class helper for course-run DataTable cells
const conflictCls = (conflict) => {
  if (conflict === 'exists') { return ' sc-cell--exists'; }
  if (conflict) { return ' sc-cell--conflict'; }
  return '';
};

// Isolated email input — manages local state so typing never triggers a parent
// re-render. Commits to orgRosters (and starts verification) 2 s after the user
// stops typing, or immediately on blur so tabbing away also works.
const TeamEmailCell = ({
  value: externalValue, orgCode, rowIndex, apiStatus, onUpdate,
}) => {
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
};

TeamEmailCell.propTypes = {
  value: PropTypes.string.isRequired,
  orgCode: PropTypes.string.isRequired,
  rowIndex: PropTypes.number.isRequired,
  apiStatus: PropTypes.string,
  onUpdate: PropTypes.func.isRequired,
};
TeamEmailCell.defaultProps = { apiStatus: undefined };

// ── Main Component ───────────────────────────────────────────────────────────

const StepConfigure = ({
  rows: initRows,
  fromMode,
  prog,
  newOrgs,
  courseDiscoveryEnabled,
  savedCfg,
  onBack,
  onNext,
}) => {
  const yr = new Date().getFullYear();

  // ── Local state (all initialised from savedCfg when provided) ──────────────
  const [tab, setTab] = useState('scheduling');
  const [runId, setRunId] = useState(savedCfg?.runId || (`${String(yr) }_${ String(yr + 1)}`));
  const [sched, setSched] = useState(savedCfg?.sched || {
    start: `${String(yr) }-08-01`,
    end: `${String(yr + 1) }-07-31`,
    enrollStart: `${String(yr) }-08-01`,
    enrollEnd: `${String(yr + 1) }-07-31`,
    pacing: 'instructor',
  });
  const [certs, setCerts] = useState(savedCfg?.certs || {
    mode: 'honor',
    display: 'early_no_info',
    create: true,
    studentGenCert: true,
    certOnDashboard: true,
  });
  const [orgRosters, setOrgRosters] = useState(savedCfg?.orgRosters || {});
  const [removeOp, setRemoveOp] = useState(savedCfg?.removeOp ?? true);
  const [gating, setGating] = useState(savedCfg?.gating || {
    mode: 'copy', templateId: '', minScore: '80', minComplete: '100',
  });
  const [rows, setRows] = useState(initRows);
  const [rowRunOverrides, setRowRunOverrides] = useState(savedCfg?.rowRunOverrides || {});
  const [orgActiveTab, setOrgActiveTab] = useState({});
  const [expandedOrg, setExpandedOrg] = useState({});
  const [checking, setChecking] = useState(false);
  const [validated, setValidated] = useState(false);
  const [existsSet, setExistsSet] = useState(new Set());

  const timerRef = useRef(null);
  const cancelRef = useRef(false);
  const rowsRef = useRef([]);
  // Refs that mirror checking/validated so the column Cell renderers can read
  // the current value without closing over stale state. This lets courseRunColumns
  // stay stable (no checking/validated in deps) so EditableRunCell is never remounted
  // mid-keystroke and focus is preserved.
  const checkingRef = useRef(false);
  const validatedRef = useRef(false);

  const validateMutation = useValidateCourseKeys();
  const searchEmails = useSearchEmails();
  const [emailStatus, setEmailStatus] = useState({});

  // ── Derived values ─────────────────────────────────────────────────────────
  const effectiveRows = rows.map(r => ({ ...r, run: rowRunOverrides[r.id] ?? runId }));
  rowsRef.current = effectiveRows;
  checkingRef.current = checking;
  validatedRef.current = validated;

  const runMaxLen = rows.length > 0
    ? Math.min(...rows.map(r => 255 - 12 - r.org.length - r.srcNum.length))
    : 100;
  const runIdV = validateRunId(runId, runMaxLen);

  const conflicts = effectiveRows.map((r, i) => detectConflict(r, effectiveRows, i, existsSet));
  const nConf = conflicts.filter(Boolean).length;
  const nHardConf = conflicts.filter(isHardConflict).length;
  const nExistsConf = conflicts.filter(ct => ct === 'exists').length;

  const courseIdTooLong = effectiveRows.map(
    r => r.org.length + r.num.length + r.run.length > COURSE_ID_MAX_COMBINED,
  );
  const nLenErr = courseIdTooLong.filter(Boolean).length;
  const hasAnyInvalidRunChars = effectiveRows.some(r => r.run.length > 0 && !RUN_ID_RE.test(r.run));

  const teamInvalid = Object.values(orgRosters).flat().filter(m => {
    if (!m.email) { return true; }
    if (!m.email.includes('@')) { return true; }
    const s = emailStatus[m.email.trim()];
    return s === 'not_found';
  }).length;

  // Emails that have a valid format but haven't resolved yet (checking or no result)
  const teamChecking = Object.values(orgRosters).flat().filter(m => {
    if (!m.email || !m.email.includes('@')) { return false; }
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
      return {
        orgCode, orgName: orgRows[0]?.orgName, orgRows, orgErr: orgRows.some(r => isHardConflict(conflicts[r.idx])),
      };
    });

  // ── Scheduling validation — HOISTED above return() ─────────────────────────
  const schedErrs = {};
  if (!sched.start) { schedErrs.start = 'Required'; }
  if (!sched.end) { schedErrs.end = 'Required'; }
  if (!sched.enrollStart) { schedErrs.enrollStart = 'Required'; }
  if (!sched.enrollEnd) { schedErrs.enrollEnd = 'Required'; }
  if (sched.start && sched.end && sched.start >= sched.end) { schedErrs.end = 'Must be after course start date'; }
  if (sched.enrollStart && sched.enrollEnd && sched.enrollStart >= sched.enrollEnd) { schedErrs.enrollEnd = 'Must be after enrollment start'; }
  if (sched.start && sched.enrollStart && sched.enrollStart > sched.start) { schedErrs.enrollStart = 'Enrollment must open on or before course start'; }
  if (sched.end && sched.enrollEnd && sched.enrollEnd > sched.end) { schedErrs.enrollEnd = 'Enrollment must close on or before course end'; }
  const schedOkUI = Object.keys(schedErrs).length === 0;

  // ── Debounced validation ───────────────────────────────────────────────────
  const sig = effectiveRows.map(r => `${r.org }|${ r.num }|${ r.run}`).join(',');

  useEffect(() => {
    setValidated(false);
    setChecking(false);
    clearTimeout(timerRef.current);
    cancelRef.current = false;

    timerRef.current = setTimeout(async () => {
      // Wait until every effective run ID (global default + per-row overrides)
      // passes format validation before hitting the API — same logic as the
      // "Target run identifier" field guard added above.
      if (rowsRef.current.some(r => !validateRunId(r.run, runMaxLen).ok)) { return; }
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
    Object.values(orgRosters).flat().map(m => m.email.trim()).filter(Boolean)
      .sort(),
  );
  useEffect(() => {
    const emails = [...new Set(
      Object.values(orgRosters).flat()
        .map(m => m.email.trim())
        .filter(e => e && e.includes('@')),
    )];
    if (emails.length === 0) { return undefined; }

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

  const getOrgRoster = org => ((orgRosters[org] && orgRosters[org].length > 0) ? orgRosters[org] : [newMember()]);

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
  /* eslint-disable react/no-unstable-nested-components, react/prop-types */
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
        return (
          <div className={`sc-cell sc-cell--indicator${indCls}`}>
            {indicator}
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
  /* eslint-enable react/no-unstable-nested-components, react/prop-types */

  // Renders the full-width conflict detail that appears beneath each conflicted row.
  /* eslint-disable react/prop-types */
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
          <button type="button" onClick={() => removeRow(idx)} className="sc-remove-btn">
            × Remove
          </button>
        )}
      </div>
    );
  }, [removeRow]);
  /* eslint-enable react/prop-types */

  // ── Team-member DataTable columns ─────────────────────────────────────────
  // apiStatus is read from row.original (embedded in data), NOT from the emailStatus
  // closure — this keeps teamColumns stable so DataTable never remounts cells.
  /* eslint-disable react/no-unstable-nested-components, react/prop-types */
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
              type="button"
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
  /* eslint-enable react/no-unstable-nested-components, react/prop-types */

  const handleNext = () => {
    onNext({
      rows: effectiveRows,
      runId,
      sched,
      certs,
      orgRosters,
      removeOp,
      gating,
      rowRunOverrides,
      fromMode,
      prog,
      newOrgs,
      courseDiscoveryEnabled,
      existsSet: [...existsSet],
    });
  };

  // ── canReview ──────────────────────────────────────────────────────────────
  const canReview = nConf === 0
    && nLenErr === 0
    && !checking
    && validated
    && runIdV.ok
    && schedOkUI
    && teamInvalid === 0
    && teamChecking === 0;

  // ── Tab definitions ────────────────────────────────────────────────────────
  const TABS = [
    { id: 'scheduling', label: 'Scheduling' },
    { id: 'certs', label: 'Certificates' },
    { id: 'gating', label: 'Lesson Gating', badge: gating.mode !== 'disabled' ? 'On' : null },
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
              role="tab"
              tabIndex={0}
              onClick={() => setTab(t.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setTab(t.id); } }}
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
            <SchedulingTab
              sched={sched}
              setSched={setSched}
              runId={runId}
              setRunId={setRunId}
              schedErrs={schedErrs}
              schedOkUI={schedOkUI}
              runIdV={runIdV}
            />
          )}

          {/* ── Certificates tab ── */}
          {tab === 'certs' && (
            <CertificatesTab certs={certs} setCerts={setCerts} />
          )}

          {/* ── Lesson Gating tab ── */}
          {tab === 'gating' && (
            <GatingTab gating={gating} setGating={setGating} />
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
                {`Checking ${ rows.length } keys...`}
              </span>
            )}
            {!checking && validated && nConf === 0 && (
              <span className="sc-runs-ok">{`All ${ rows.length } keys available`}</span>
            )}
            {!checking && validated && nHardConf === 0 && nExistsConf > 0 && (
              <span className="sc-runs-err">{`${nExistsConf } existing course${ nExistsConf !== 1 ? 's' : '' } already exist`}</span>
            )}
            {!checking && validated && nHardConf > 0 && (
              <span className="sc-runs-err">{`${nHardConf } conflict${ nHardConf !== 1 ? 's' : '' } found in ${ rows.length } course rerun${ rows.length !== 1 ? 's' : '' } scheduled`}</span>
            )}
          </div>
        </div>

        {/* Per-org groups */}
        <div>
          {orgGroups.map(({
            orgCode, orgName, orgRows, orgErr,
          }) => {
            const isOpen = expandedOrg[orgCode] !== false;
            const activeOrgTab = orgActiveTab[orgCode] || 'courses';
            const orgConflictsKey = `${runId }:${ orgCode }:${ orgRows.map(
              r => (conflicts[r.idx] || '') + (courseIdTooLong[r.idx] ? '!' : ''),
            ).join(',')}`;
            const orgInitialExpanded = Object.fromEntries(
              orgRows.flatMap(r => (conflicts[r.idx] ? [[r.id, true]] : [])),
            );
            const orgRoster = getOrgRoster(orgCode);
            const filledMembers = orgRoster.filter(r => r.email).length;
            const coursesLabel = `Courses (${ orgRows.length })`;
            const teamLabel = `Team & Access${ filledMembers > 0 ? ` (${ filledMembers })` : ''}`;

            return (
              <div key={orgCode} className="sc-org-group">
                {/* Org header */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedOrg(p => ({ ...p, [orgCode]: !isOpen }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setExpandedOrg(p => ({ ...p, [orgCode]: !isOpen }));
                    }
                  }}
                  className={`sc-org-header${orgErr ? ' sc-org-header--err' : ''}`}
                >
                  <span className="sc-org-code">{orgName} ({orgCode})</span>
                  <span className="sc-org-meta">{`${orgRows.length } course${ orgRows.length !== 1 ? 's' : ''}`}</span>
                  {orgErr && (
                    <Badge variant="danger" pill className="sc-badge-sm">conflict</Badge>
                  )}
                  {filledMembers > 0 && (
                    <Badge variant="info" pill className="sc-badge-sm">{`${filledMembers } member${ filledMembers !== 1 ? 's' : ''}`}</Badge>
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
                          role="tab"
                          tabIndex={0}
                          onClick={e => { e.stopPropagation(); setOrgActiveTab(p => ({ ...p, [orgCode]: t.id })); }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation();
                              setOrgActiveTab(p => ({ ...p, [orgCode]: t.id }));
                            }
                          }}
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
                          data={orgRows.map(r => ({
                            ...r,
                            conflict: conflicts[r.idx],
                            lenErr: courseIdTooLong[r.idx],
                          }))}
                          itemCount={orgRows.length}
                          initialState={{ expanded: orgInitialExpanded }}
                          initialTableOptions={{
                            // eslint-disable-next-line react/prop-types
                            getRowId: row => row.id,
                            autoResetSelectedRows: false,
                            autoResetExpanded: false,
                          }}
                        >
                          <DataTable.Table isStriped={false} />
                          <DataTable.EmptyTable content="No courses." />
                        </DataTable>
                      </div>
                    )}

                    {/* ── Team & Access tab ── */}
                    {activeOrgTab === 'team' && (
                      <TeamTab
                        orgCode={orgCode}
                        orgName={orgName}
                        orgRoster={orgRoster}
                        emailStatus={emailStatus}
                        teamColumns={teamColumns}
                        addOrgMember={addOrgMember}
                        removeOp={removeOp}
                        setRemoveOp={setRemoveOp}
                        filledMembers={filledMembers}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Table footer */}
        <div className={`sc-table-footer${(nHardConf > 0 || nLenErr > 0) && validated ? ' sc-table-footer--err' : ''}`}>
          <span className="sc-table-footer-note">
            All {rows.length} target keys validated. Run ID defaults to shared identifier. Target Run is the
            only editable column.
          </span>
          {hasAnyInvalidRunChars && (
            <span className="sc-table-footer-conflict">Invalid characters - allowed: letters, digits, _ - ~ .</span>
          )}
          {validated && nLenErr > 0 && (
            <span className="sc-table-footer-conflict">{`${nLenErr } course ID${ nLenErr !== 1 ? 's' : '' } exceed ${ COURSE_ID_MAX_COMBINED }-char limit`}</span>
          )}
          {validated && nExistsConf > 0 && nHardConf === 0 && (
            <span className="sc-table-footer-conflict">{`${nExistsConf } existing course${ nExistsConf !== 1 ? 's' : '' } already exist`}</span>
          )}
          {validated && nHardConf > 0 && (
            <span className="sc-table-footer-conflict">{`${nHardConf } conflict${ nHardConf !== 1 ? 's' : '' } must be resolved`}</span>
          )}
        </div>
      </div>

      {/* ── Bottom action bar ── */}
      <div className="sc-action-bar">
        <Button variant="outline-primary" onClick={onBack}>Back</Button>
        <div className="sc-action-bar-right">
          {validated && nLenErr > 0 && (
            <span className="sc-conflict-msg">{`${nLenErr } course ID${ nLenErr !== 1 ? 's' : '' } exceed ${ COURSE_ID_MAX_COMBINED } chars`}</span>
          )}
          {validated && nConf > 0 && (
            <>
              <span className="sc-conflict-msg">{`Resolve ${ nConf } conflict${ nConf !== 1 ? 's' : '' } first`}</span>
              <Button
                variant="danger"
                onClick={() => setRows(
                  p => p.filter((_, i) => !conflicts[i]).sort((a, b) => a.org.localeCompare(b.org)),
                )}
              >
                Remove all conflicts
              </Button>
            </>
          )}
          {teamChecking > 0 && (
            <span className="sc-checking-msg">
              <Spinner animation="border" size="sm" className="sc-spinner-sm" />
              {`Validating ${ teamChecking } team account${ teamChecking !== 1 ? 's' : '' }…`}
            </span>
          )}
          {teamInvalid > 0 && (
            <span className="sc-conflict-msg">
              {`${teamInvalid } team member${ teamInvalid !== 1 ? ' accounts' : ' account' } not found on platform`}
            </span>
          )}
          <Button variant="primary" disabled={rows.length === 0 || !canReview} onClick={handleNext}>
            Review
          </Button>
        </div>
      </div>
    </div>
  );
};

StepConfigure.propTypes = {
  rows: PropTypes.arrayOf(courseRowPropType).isRequired,
  fromMode: PropTypes.string.isRequired,
  prog: programPropType,
  newOrgs: PropTypes.arrayOf(newOrgPropType),
  courseDiscoveryEnabled: PropTypes.bool.isRequired,
  savedCfg: savedCfgPropType,
  onBack: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
};
StepConfigure.defaultProps = {
  prog: null,
  newOrgs: [],
  savedCfg: null,
};

export default StepConfigure;
