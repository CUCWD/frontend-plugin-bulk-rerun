// Wizard step 2 — shared settings (Scheduling / Certs / Gating tabs) and a
// per-org accordion where each org has Courses and Team & Access sub-tabs.
// savedCfg re-hydrates all local state when the user navigates Back from StepReview.
// existsSet is serialised as an array in onNext(cfg) because Set is not hookstate-safe.
import {
  useState, useEffect, useRef, useCallback,
} from 'react';
import PropTypes from 'prop-types';
import { Button, Spinner } from '@openedx/paragon';

import { useValidateCourseKeys, useSearchEmails } from '../../hooks';
import {
  makeKey, validateRunId, detectConflict, isHardConflict, COURSE_ID_MAX_COMBINED, RUN_ID_RE,
} from '../../utils/courseKeys';
import SharedSettingsCard from './SharedSettingsCard';
import OrgAccordion from './OrgAccordion';
import useCourseRunColumns from './useCourseRunColumns';
import useTeamColumns from './useTeamColumns';
import './index.scss';

// ── PropTypes ─────────────────────────────────────────────────────────────────

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

  // ── Scheduling validation ──────────────────────────────────────────────────
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

  // ── Debounced course-key validation ───────────────────────────────────────
  const sig = effectiveRows.map(r => `${r.org }|${ r.num }|${ r.run}`).join(',');

  useEffect(() => {
    setValidated(false);
    setChecking(false);
    clearTimeout(timerRef.current);
    cancelRef.current = false;

    timerRef.current = setTimeout(async () => {
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

  // ── Debounced email account validation ────────────────────────────────────
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

  // ── Hooks for column definitions ───────────────────────────────────────────
  const { courseRunColumns, renderCourseRunSubRow } = useCourseRunColumns(
    updateRunOverride,
    removeRow,
    checkingRef,
    validatedRef,
  );
  const teamColumns = useTeamColumns(updateOrgRoster, removeOrgMember);

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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>

      <SharedSettingsCard
        rowCount={rows.length}
        tab={tab}
        setTab={setTab}
        sched={sched}
        setSched={setSched}
        runId={runId}
        setRunId={setRunId}
        schedErrs={schedErrs}
        schedOkUI={schedOkUI}
        runIdV={runIdV}
        certs={certs}
        setCerts={setCerts}
        gating={gating}
        setGating={setGating}
      />

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

        <div>
          {orgGroups.map(({
            orgCode, orgName, orgRows, orgErr,
          }) => (
            <OrgAccordion
              key={orgCode}
              orgCode={orgCode}
              orgName={orgName}
              orgRows={orgRows}
              orgErr={orgErr}
              isOpen={expandedOrg[orgCode] !== false}
              onToggle={() => setExpandedOrg(p => ({ ...p, [orgCode]: p[orgCode] === false }))}
              activeOrgTab={orgActiveTab[orgCode] || 'courses'}
              onTabChange={tabId => setOrgActiveTab(p => ({ ...p, [orgCode]: tabId }))}
              courseRunColumns={courseRunColumns}
              renderCourseRunSubRow={renderCourseRunSubRow}
              conflicts={conflicts}
              courseIdTooLong={courseIdTooLong}
              orgRoster={getOrgRoster(orgCode)}
              teamColumns={teamColumns}
              emailStatus={emailStatus}
              addOrgMember={addOrgMember}
              removeOp={removeOp}
              setRemoveOp={setRemoveOp}
              runId={runId}
            />
          ))}
        </div>

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
