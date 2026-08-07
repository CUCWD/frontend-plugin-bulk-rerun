// Core live-execution and historical-replay component for a single bulk rerun job.
//
// Three modes:
//   Real mode  (batchId provided, no historyEntry): useBatch polls GET /batches/:id/
//     every 2 s and drives all phase/item state. Simulation code is bypassed.
//   DEMO mode  (no batchId, no historyEntry): client-side simulation across four phases:
//     Phase 0 — org registration (new-org mode only)
//     Phase 1 — course creation, certificate setup, and team assignment
//     Phase 2 — Course Discovery metadata sync (skipped if courseDiscoveryEnabled=false)
//     Phase 3 — program linking
//   History mode (historyEntry provided): items are pre-populated from the stored entry;
//     neither polling nor simulation runs.
//
// Dry-run: all log messages are prefixed [DRY-RUN]; result is NOT saved to history.
//
// Expected API shape for useBatch (GET /api/bulk-rerun/batches/:id/):
//   {
//     id, status, phase,
//     jobs: [{ id, org, org_name, course_name, src_key, target_key,
//              status, elapsed, fail_reason, logs: [{ts, lv, msg}] }],
//     reg_items?:  [{ id, code, name, status, logs }],
//     disc_items?: [{ id, org, status, logs }],
//     prog_items?: [{ id, org, status, logs }]
//   }
//   status:  'pending' | 'running' | 'succeeded' | 'failed' | 'partial'
//   phase:   0-3 (active phase number) | 4 (complete)
//
import { useState, useEffect, useCallback } from 'react';
import {
  Button, Alert, Spinner, ProgressBar, Badge,
} from '@openedx/paragon';
import PropTypes from 'prop-types';
import { makeKey } from '../utils/courseKeys';
import { buildExport } from '../utils/buildExport';
import { deletingJobId } from '../utils/rollbackState';
import { useBatch } from '../hooks';
import PhaseHeader from '../steps/StepProgress/PhaseHeader';
import PhaseItemRows from '../steps/StepProgress/PhaseItemRows';
import useBatchSync from './useBatchSync';
import useJobSimulation from './useJobSimulation';
import Phase1OrgGroup from './Phase1OrgGroup';
import JobActionBar from './JobActionBar';
import './JobProgress.scss';

const histJobStatus = (s) => {
  if (s === 'success') { return 'success'; }
  if (s === 'failed') { return 'failed'; }
  return 'pending';
};

const histLogs = (j) => {
  if (j.logs?.length > 0) { return j.logs; }
  if (j.failReason) { return [{ lv: 'error', ts: '--', msg: j.failReason }]; }
  if (j.status === 'success') { return [{ lv: 'info', ts: '--', msg: 'Completed successfully.' }]; }
  return [{ lv: 'info', ts: '--', msg: 'No log data available.' }];
};

const courseRowPropType = PropTypes.shape({
  org: PropTypes.string,
  orgName: PropTypes.string,
  name: PropTypes.string,
  num: PropTypes.string,
  run: PropTypes.string,
  srcOrg: PropTypes.string,
  srcNum: PropTypes.string,
  srcRun: PropTypes.string,
});

const programPropType = PropTypes.shape({
  name: PropTypes.string,
  icon: PropTypes.string,
  color: PropTypes.string,
  colorLt: PropTypes.string,
});

const logPropType = PropTypes.shape({
  lv: PropTypes.string,
  ts: PropTypes.string,
  msg: PropTypes.string,
});

const historyJobPropType = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  org: PropTypes.string,
  orgName: PropTypes.string,
  name: PropTypes.string,
  srcKey: PropTypes.string,
  targetKey: PropTypes.string,
  status: PropTypes.string,
  elapsed: PropTypes.string,
  logs: PropTypes.arrayOf(logPropType),
  failReason: PropTypes.string,
});

const historyEntryPropType = PropTypes.shape({
  id: PropTypes.string,
  batchId: PropTypes.string,
  createdAt: PropTypes.string,
  createdBy: PropTypes.string,
  mode: PropTypes.string,
  progName: PropTypes.string,
  targetRun: PropTypes.string,
  isDryRun: PropTypes.bool,
  status: PropTypes.string,
  rollbackStatus: PropTypes.string,
  orgs: PropTypes.arrayOf(PropTypes.string),
  jobs: PropTypes.arrayOf(historyJobPropType),
});

const cfgPropType = PropTypes.shape({
  rows: PropTypes.arrayOf(courseRowPropType),
  prog: programPropType,
  newOrgs: PropTypes.arrayOf(PropTypes.shape({
    code: PropTypes.string,
    name: PropTypes.string,
  })),
  fromMode: PropTypes.string,
  courseDiscoveryEnabled: PropTypes.bool,
  runId: PropTypes.string,
});

// ── Main component ────────────────────────────────────────────────────────────
const JobProgress = ({
  cfg,
  jobId,
  batchId,
  isPending,
  isDryRun,
  createdBy,
  createdAt,
  rollbackRequested,
  historyEntry,
  onSaveHistory,
  onComplete,
  onNew,
  onExecute,
}) => {
  const {
    rows = [], prog = null, newOrgs = [],
    fromMode = 'course', courseDiscoveryEnabled = true,
  } = cfg || {};

  const isNewOrg = fromMode === 'neworg';

  const orgs = rows.length > 0
    ? [...new Set(rows.map(r => r.org))].sort((a, b) => a.localeCompare(b))
    : [...new Set((historyEntry?.jobs || []).map(j => j.org))].sort((a, b) => a.localeCompare(b));

  const [copied, setCopied] = useState(false);

  const initReg = useCallback(() => {
    if (historyEntry) { return []; }
    return isNewOrg
      ? newOrgs.map((o, i) => ({
        id: `r${i}`, code: o.code, name: o.name, status: 'pending', logs: [], elapsed: '', t0: 0,
      }))
      : [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initCourse = useCallback(() => {
    if (historyEntry) {
      return (historyEntry.jobs || []).map((j, i) => {
        const keyParts = (j.targetKey || '').replace(/^course-v1:/, '').split('+');
        const tOrg = keyParts[0] || j.org || '';
        const tNum = keyParts[1] || '';
        const tRun = keyParts[2] || '';
        const srcParts = (j.srcKey || '').replace(/^course-v1:/, '').split('+');
        return {
          id: i,
          r: {
            org: tOrg,
            orgName: j.orgName || tOrg,
            name: j.name,
            num: tNum,
            run: tRun,
            srcOrg: srcParts[0] || '',
            srcNum: srcParts[1] || '',
            srcRun: srcParts[2] || '',
          },
          status: histJobStatus(j.status),
          logs: histLogs(j),
          elapsed: j.elapsed || '',
          t0: 0,
          position: j.position ?? i,
          courseCreated: !!j.courseCreated,
          rolledBack: !!j.rolledBack,
        };
      });
    }
    return rows.map((r, i) => ({
      id: i, r, status: 'pending', logs: [], elapsed: '', t0: 0,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initDisc = useCallback(() => orgs.map((org, i) => ({
    id: `d${i}`,
    org,
    status: historyEntry && courseDiscoveryEnabled ? 'success' : 'pending',
    logs: historyEntry && courseDiscoveryEnabled ? [{ lv: 'info', ts: '--', msg: 'Discovery sync completed.' }] : [],
    elapsed: '',
    t0: 0,
  })), []); // eslint-disable-line react-hooks/exhaustive-deps

  const initProgItems = useCallback(() => orgs.map((org, i) => ({
    id: `p${i}`,
    org,
    status: historyEntry && courseDiscoveryEnabled ? 'success' : 'pending',
    logs: historyEntry && courseDiscoveryEnabled ? [{ lv: 'info', ts: '--', msg: 'Program linking completed.' }] : [],
    elapsed: '',
    t0: 0,
  })), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [regItems, setRegItems] = useState(initReg);
  const [courseItems, setCourseItems] = useState(initCourse);
  const [discItems, setDiscItems] = useState(initDisc);
  const [progItems, setProgItems] = useState(initProgItems);
  const initPhase = () => {
    if (historyEntry) { return 4; }
    if (isNewOrg) { return 0; }
    return 1;
  };
  const [phase, setPhase] = useState(initPhase);
  const [openCOrg, setOpenCOrg] = useState(() => Object.fromEntries(orgs.map(o => [o, true])));

  const isRealMode = !!batchId && !historyEntry;
  const isSimMode = !batchId && !historyEntry && !isPending;

  const { batchQuery } = useBatchSync({
    batchId,
    isRealMode,
    historyEntry,
    setCourseItems,
    setRegItems,
    setDiscItems,
    setProgItems,
    setPhase,
  });

  useJobSimulation({
    isSimMode,
    isHistoryMode: !!historyEntry,
    isNewOrg,
    courseDiscoveryEnabled,
    isDryRun,
    phase,
    regItems,
    courseItems,
    discItems,
    progItems,
    setRegItems,
    setCourseItems,
    setDiscItems,
    setProgItems,
    setPhase,
  });

  // ── Track B — live rollback progress ──────────────────────────────────────
  // The regular status poll does not provide rollback log updates quickly
  // enough, so while a rollback is in flight we poll the FULL batch detail
  // ourselves
  // (include_logs=true) and sync each job's rolled_back AND its log lines onto
  // courseItems — so both the chips and the rollback log tail stream live. The
  // rollback window is short, so the heavier payload is bounded. liveRollback
  // holds the latest detail so rollbackStatus is stable once polling stops.
  const [liveRollback, setLiveRollback] = useState(null);
  const fetchedRollbackStatus = liveRollback?.rollback_status
    || batchQuery.data?.rollback_status
    || historyEntry?.rollbackStatus
    || 'none';
  // The normal Current-tab query is usually still cached with
  // rollback_status="none" when the button is clicked. Treat that snapshot as
  // stale so the dedicated rollback poll starts immediately.
  const rollbackStatus = rollbackRequested && fetchedRollbackStatus === 'none'
    ? 'pending'
    : fetchedRollbackStatus;
  const rbInFlight = rollbackStatus === 'pending' || rollbackStatus === 'running';
  // 1 s interval (vs the 5 s default) so the rollback chips + log tail advance
  // step by step with the backend's ~0.75 s pacing; only runs while in flight.
  const rollbackPoll = useBatch(batchId, !!(batchId && rbInFlight), true, 1000);

  useEffect(() => {
    const detail = rollbackPoll.data;
    if (!detail || detail.id !== batchId || !Array.isArray(detail.jobs)) { return; }
    setLiveRollback(detail);
    const jobByKey = Object.fromEntries(detail.jobs.map(j => [j.target_course_key, j]));
    setCourseItems(prev => prev.map(item => {
      const targetKey = item.r ? makeKey(item.r.org, item.r.num, item.r.run) : null;
      const job = targetKey ? jobByKey[targetKey] : null;
      if (!job) { return item; }
      const logs = Array.isArray(job.logs) && job.logs.length > 0
        ? job.logs.map(l => ({
          lv: l.level,
          msg: l.message,
          ts: new Date(l.created_at).toLocaleTimeString('en-US', { hour12: false }),
        }))
        : item.logs;
      return {
        ...item, rolledBack: !!job.rolled_back, courseCreated: !!job.course_created, logs,
      };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollbackPoll.data]);

  // Give the Current tab immediate feedback while the rollback request is
  // being accepted. The next detail poll replaces this marker with the
  // backend's real rollback log lines.
  useEffect(() => {
    if (!rollbackRequested) { return; }
    setCourseItems(prev => prev.map(item => (
      item.logs.some(log => log.msg === 'Rollback requested.')
        ? item
        : { ...item, logs: [...item.logs, { lv: 'warn', ts: '--', msg: 'Rollback requested.' }] }
    )));
  }, [rollbackRequested]); // eslint-disable-line react-hooks/exhaustive-deps

  const batchDone = isRealMode
    ? !!batchQuery.data && (
      ['succeeded', 'failed', 'partial'].includes(batchQuery.data.status)
      || (Array.isArray(batchQuery.data.jobs) && batchQuery.data.jobs.length > 0
          && batchQuery.data.jobs.every(j => ['succeeded', 'failed'].includes(j.status)))
    )
    : courseItems.every(it => it.status === 'success' || it.status === 'failed');

  const coursesDone = courseItems.every(it => it.status === 'success' || it.status === 'failed');
  const readyToSave = batchDone && coursesDone;

  const batchFail = courseItems.filter(it => it.status === 'failed').length;

  const rDone = regItems.filter(i => i.status === 'success').length;
  const cDone = courseItems.filter(i => i.status === 'success').length;
  const cRun = courseItems.filter(i => i.status === 'running').length;
  const dDone = discItems.filter(i => i.status === 'success').length;
  const pDone = progItems.filter(i => i.status === 'success').length;
  const cPct = courseItems.length > 0 ? Math.round((cDone / courseItems.length) * 100) : 0;

  const allComplete = (!isNewOrg || rDone === regItems.length)
    && cDone === courseItems.length
    && (!courseDiscoveryEnabled || (dDone === discItems.length && pDone === progItems.length));

  const exportStatus = () => {
    if (!batchDone) { return 'running'; }
    if (batchFail === 0) { return 'succeeded'; }
    if (batchFail === courseItems.length) { return 'failed'; }
    return 'partial';
  };

  useEffect(() => {
    if (!readyToSave || historyEntry) { return; }
    if (!isDryRun && onSaveHistory) {
      onSaveHistory({
        id: String(jobId),
        batchId: batchId ?? null,
        createdAt: createdAt || new Date().toISOString(),
        createdBy: createdBy || '-',
        mode: fromMode,
        progName: prog?.name || null,
        targetRun: cfg.runId,
        isDryRun,
        status: exportStatus(),
        orgs,
        cfg,
        jobs: courseItems.map(it => ({
          id: it.id,
          org: it.r?.org,
          orgName: it.r?.orgName,
          name: it.r?.name,
          srcKey: it.r ? makeKey(it.r.srcOrg, it.r.srcNum, it.r.srcRun) : '',
          targetKey: it.r ? makeKey(it.r.org, it.r.num, it.r.run) : '',
          status: it.status,
          elapsed: it.elapsed,
          logs: it.logs || [],
          failReason: it.logs?.filter(l => l.lv === 'error').map(l => l.msg).join('; ') || null,
        })),
      });
    }
    if (onComplete) { onComplete(); }
  }, [readyToSave]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBuildExport = () => buildExport({
    batchId,
    isDryRun,
    createdAt,
    createdBy,
    mode: fromMode,
    progName: prog ? ((prog.icon ? `${prog.icon} ` : '') + prog.name) : null,
    targetRun: cfg?.runId || '',
    status: exportStatus(),
    orgs,
    cfg: cfg || null,
    jobs: courseItems.map(it => ({
      org: it.r?.org || '',
      name: it.r?.name || it.r?.num || '',
      srcKey: makeKey(it.r?.srcOrg || '', it.r?.srcNum || '', it.r?.srcRun || ''),
      targetKey: makeKey(it.r?.org || '', it.r?.num || '', it.r?.run || ''),
      status: it.status,
      elapsed: it.elapsed,
      logs: it.logs || [],
      failReason: null,
    })),
  });

  const handleExport = () => {
    const text = handleBuildExport();
    const execFallback = () => {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); } catch (_e) { /* no-op */ }
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    };
    const writePromise = navigator.clipboard?.writeText(text);
    if (writePromise) {
      writePromise
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })
        .catch(execFallback);
    } else {
      execFallback();
    }
  };

  const phaseCls = (phaseNum) => {
    if (!courseDiscoveryEnabled) { return ' jp-phase--skipped'; }
    if (phase >= phaseNum) { return ''; }
    return ' jp-phase--faded';
  };

  const regColor = () => {
    if (rDone === regItems.length) { return '#6f42c1'; }
    if (phase === 0) { return '#006daa'; }
    return '#c8c8c8';
  };
  const courseColor = () => {
    if (cDone === courseItems.length) { return '#178253'; }
    if (phase >= 1) { return '#006daa'; }
    return '#c8c8c8';
  };
  const discColor = () => {
    if (!courseDiscoveryEnabled) { return '#c8c8c8'; }
    if (dDone === discItems.length && phase >= 2) { return '#178253'; }
    if (phase >= 2) { return '#006daa'; }
    return '#c8c8c8';
  };
  const progColor = () => {
    if (!courseDiscoveryEnabled) { return '#c8c8c8'; }
    if (pDone === progItems.length && phase >= 3) { return '#178253'; }
    if (phase >= 3) { return '#006daa'; }
    return '#c8c8c8';
  };

  // ── Rollback display state ─────────────────────────────────────────────────
  // rollbackStatus / rbInFlight are derived above (Track B) from the live poll,
  // falling back to the viewingEntry snapshot. The counts below read courseItems,
  // which the Track B sync effect keeps current, so tile/phase/chips advance live.
  const rollbackActive = rollbackStatus !== 'none';
  const rbCreated = courseItems.filter(it => it.courseCreated);
  const rbRemoved = rbCreated.filter(it => it.rolledBack).length;
  // The single course currently being deleted (paced sequential rollback) — the
  // first created course not yet removed, by position; null when not in flight.
  const rbDeletingId = deletingJobId(courseItems, rollbackStatus);
  const rbPct = rbCreated.length > 0 ? Math.round((rbRemoved / rbCreated.length) * 100) : 0;
  const ROLLBACK_PILL = {
    pending: { label: 'ROLLING BACK…', variant: 'primary' },
    running: { label: 'ROLLING BACK…', variant: 'primary' },
    // bg overrides the Paragon variant so ROLLED BACK uses the app danger red.
    succeeded: { label: 'ROLLED BACK', variant: 'dark', bg: '#C32D3A' },
    partial: { label: 'ROLLBACK PARTIAL', variant: 'warning' },
    failed: { label: 'ROLLBACK FAILED', variant: 'danger' },
  };
  const rbPill = ROLLBACK_PILL[rollbackStatus];

  // Stat card colors are per-card dynamic values — kept as inline style
  const statCards = [
    ...(isNewOrg ? [{ l: 'Orgs registered', v: `${rDone}/${regItems.length}`, c: regColor() }] : []),
    { l: 'Courses created', v: `${cDone}/${courseItems.length}`, c: courseColor() },
    ...(rollbackActive ? [{ l: 'Courses removed', v: `${rbRemoved}/${rbCreated.length}`, c: '#006daa' }] : []),
    {
      l: 'Discovery synced',
      v: courseDiscoveryEnabled ? `${dDone}/${discItems.length}` : 'Skipped',
      c: discColor(),
    },
    {
      l: 'Programs linked',
      v: courseDiscoveryEnabled ? `${pDone}/${progItems.length}` : 'Skipped',
      c: progColor(),
    },
    { l: 'Orgs complete', v: allComplete ? String(orgs.length) : '-', c: allComplete ? '#178253' : '#6c757d' },
  ];

  if (isRealMode && batchQuery.isError) {
    return (
      <Alert variant="danger" className="mb-0">
        <strong>Failed to load batch status.</strong>
        {' Check that the backend /api/bulk-rerun/batches/ endpoint is reachable.'}
      </Alert>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {isDryRun && (
        <Alert variant="info" className="mb-3 py-2">
          <strong className="jp-alert-title">Dry-run mode - no changes were made</strong>
          All steps validated. Click Execute to apply changes.
        </Alert>
      )}
      {!courseDiscoveryEnabled && (
        <Alert variant="warning" className="mb-3 py-2">
          <strong className="jp-alert-title">Course Discovery not enabled - phases 2 and 3 skipped</strong>
          Only course creation, certificates, and team access will be applied.
        </Alert>
      )}
      {isNewOrg && (
        <Alert variant="primary" className="mb-3 py-2">
          <strong className="jp-alert-title">New organization onboarding in progress</strong>
          Organizations are being registered before course creation begins.
        </Alert>
      )}

      {prog && (
        <div
          className="jp-prog-banner"
          style={{
            background: isNewOrg ? '#f3f0ff' : (prog.colorLt || '#deeef8'),
            border: `1px solid ${isNewOrg ? '#6f42c1' : (prog.color || '#006daa')}44`,
          }}
        >
          {prog.icon && <span className="jp-prog-icon">{prog.icon}</span>}
          <div className="jp-prog-title" style={{ color: isNewOrg ? '#6f42c1' : (prog.color || '#006daa') }}>
            {`${prog.name} - Job #BR-${(batchId || jobId.replace(/^recovered-/, '')).replace(/-/g, '').slice(0, 8).toUpperCase()}`}
            {isDryRun && <Badge variant="info" pill>DRY-RUN</Badge>}
            {isNewOrg && <Badge variant="primary" pill>New org onboarding</Badge>}
          </div>
        </div>
      )}

      <div className="jp-card">
        <div className="jp-card-header">
          <div className="jp-card-header-left">
            <span className="jp-card-title">{`Job #BR-${(batchId || jobId.replace(/^recovered-/, '')).replace(/-/g, '').slice(0, 8).toUpperCase()}`}</span>
            {rbPill && (
              <Badge
                variant={rbPill.variant}
                pill
                className="jp-rb-pill"
                style={rbPill.bg ? { backgroundColor: rbPill.bg, color: '#fff' } : undefined}
              >
                {rbPill.label}
              </Badge>
            )}
            <span className="jp-card-meta">{`${courseItems.length} runs - ${orgs.length} org${orgs.length !== 1 ? 's' : ''}`}</span>
            {isPending && (
              <span style={{
                marginLeft: 6, fontSize: 11, color: '#6c757d', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
              >
                <Spinner animation="border" size="sm" style={{ width: 10, height: 10, borderWidth: '0.15em' }} />
                Submitting...
              </span>
            )}
            {!isPending && isRealMode && batchQuery.isFetching && (
              <Spinner
                animation="border"
                size="sm"
                style={{
                  width: 12, height: 12, borderWidth: '0.15em', marginLeft: 4, color: '#006daa',
                }}
              />
            )}
          </div>
          <div className="jp-card-header-right">
            {allComplete && (
              <Button variant="success" size="sm" onClick={handleExport}>
                {copied ? 'Copied!' : 'Export report'}
              </Button>
            )}
          </div>
        </div>

        <div className="jp-card-body">
          {/* Stat cards */}
          <div className="jp-stat-grid" style={{ gridTemplateColumns: `repeat(${statCards.length},1fr)` }}>
            {statCards.map(s => (
              <div key={s.l} className="jp-stat-card">
                <div className="jp-stat-val" style={{ color: s.c }}>{s.v}</div>
                <div className="jp-stat-label">{s.l}</div>
              </div>
            ))}
          </div>

          {/* Phase 0 — Org registration (new org mode only) */}
          {isNewOrg && (
            <div className="jp-phase">
              <PhaseHeader num={0} label="Phase 0 - Organization registration" sub={`${rDone} of ${regItems.length} registered`} done={rDone === regItems.length} active={phase === 0} accentColor="#6f42c1" />
              <ProgressBar now={regItems.length > 0 ? Math.round((rDone / regItems.length) * 100) : 0} variant="info" />
              <div className="jp-phase-items">
                <PhaseItemRows items={regItems} />
              </div>
            </div>
          )}

          {/* Phase 1 — Course creation, grouped by org */}
          <div className={`jp-phase${phase >= 1 ? '' : ' jp-phase--faded'}`}>
            <div className="jp-phase-header-row">
              <PhaseHeader num={1} label="Phase 1 - Course creation" sub={`${cDone} of ${courseItems.length} complete - ${cRun} running`} done={cDone === courseItems.length} active={phase === 1} />
              <div className="jp-phase-btns">
                <Button variant="tertiary" size="sm" onClick={() => setOpenCOrg(Object.fromEntries(orgs.map(o => [o, true])))}>Expand all</Button>
                <Button variant="tertiary" size="sm" onClick={() => setOpenCOrg(Object.fromEntries(orgs.map(o => [o, false])))}>Collapse all</Button>
              </div>
            </div>
            <ProgressBar now={cPct} variant={cDone === courseItems.length ? 'success' : 'primary'} />
            <div className="jp-phase-items">
              {orgs.map(orgCode => {
                const orgCourseItems = courseItems
                  .filter(it => it.r?.org === orgCode)
                  .sort((a, b) => (a.r?.num || '').localeCompare(b.r?.num || ''));
                if (!orgCourseItems.length) { return null; }
                return (
                  <Phase1OrgGroup
                    key={orgCode}
                    orgCode={orgCode}
                    orgCourseItems={orgCourseItems}
                    isOrgOpen={openCOrg[orgCode] !== false}
                    onToggle={() => setOpenCOrg(p => ({ ...p, [orgCode]: !p[orgCode] }))}
                    rollbackStatus={rollbackStatus}
                    deletingId={rbDeletingId}
                  />
                );
              })}
            </div>
          </div>

          {/* Rollback — deleting the courses this batch created. Marked "↺"
              rather than a phase number because it isn't part of the forward
              1→3 sequence; per-course delete status shows as chips on the
              Phase 1 rows above. Rendered only once a rollback exists. */}
          {rollbackActive && (
            <div className="jp-phase">
              <PhaseHeader
                num="↺"
                label="Rollback - removing created courses"
                sub={`${rbRemoved} of ${rbCreated.length} removed`}
                done={!rbInFlight && rbRemoved === rbCreated.length && rbCreated.length > 0}
                active={rbInFlight}
                accentColor="#006daa"
              />
              <ProgressBar now={rbPct} variant={rbInFlight ? 'primary' : 'info'} />
              {rollbackStatus === 'partial' && (
                <div className="jp-rb-hint">Some courses could not be deleted — see the failed rows above.</div>
              )}
            </div>
          )}

          {/* Phase 2 — Discovery sync */}
          <div className={`jp-phase${phaseCls(2)}`}>
            <PhaseHeader
              num={2}
              label="Phase 2 - Discovery sync"
              sub="refresh_course_metadata + update_index"
              done={courseDiscoveryEnabled && dDone === discItems.length && phase >= 2}
              active={courseDiscoveryEnabled && phase === 2}
              skipped={!courseDiscoveryEnabled}
            />
            {courseDiscoveryEnabled && phase >= 2 && <PhaseItemRows items={discItems} />}
          </div>

          {/* Phase 3 — Program linking */}
          <div className={`jp-phase${phaseCls(3)}`}>
            <PhaseHeader
              num={3}
              label={isNewOrg ? 'Phase 3 - Program creation & linking' : 'Phase 3 - Program linking'}
              sub={isNewOrg ? 'Create new Discovery program and attach all course runs' : 'Discovery API via management shell (Select2 bug workaround)'}
              done={courseDiscoveryEnabled && pDone === progItems.length && phase >= 3}
              active={courseDiscoveryEnabled && phase === 3}
              skipped={!courseDiscoveryEnabled}
            />
            {courseDiscoveryEnabled && phase >= 3 && <PhaseItemRows items={progItems} />}
          </div>
        </div>
      </div>

      {!historyEntry && (
        <JobActionBar
          isDryRun={isDryRun}
          isNewOrg={isNewOrg}
          allComplete={allComplete}
          onExecute={onExecute}
          onNew={onNew}
        />
      )}
    </div>
  );
};

JobProgress.propTypes = {
  cfg: cfgPropType,
  jobId: PropTypes.string.isRequired,
  batchId: PropTypes.string,
  isPending: PropTypes.bool,
  isDryRun: PropTypes.bool,
  createdBy: PropTypes.string,
  createdAt: PropTypes.string,
  rollbackRequested: PropTypes.bool,
  historyEntry: historyEntryPropType,
  onSaveHistory: PropTypes.func,
  onComplete: PropTypes.func,
  onNew: PropTypes.func.isRequired,
  onExecute: PropTypes.func,
};

JobProgress.defaultProps = {
  cfg: null,
  batchId: null,
  isPending: false,
  isDryRun: false,
  createdBy: null,
  createdAt: null,
  rollbackRequested: false,
  historyEntry: null,
  onSaveHistory: null,
  onComplete: null,
  onExecute: null,
};

export default JobProgress;
