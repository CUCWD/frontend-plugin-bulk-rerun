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
// NOTE: useJobLogs (see hooks.ts) can stream per-job log lines as they arrive.
//   Wire it inside a dedicated <JobLogPanel batchJobId={...} /> sub-component
//   once the backend /jobs/:id/logs/ endpoint is live.
import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Alert, Spinner, ProgressBar, Badge } from '@openedx/paragon';

import { useBatch, useJobLogs } from '../hooks';
import { makeKey } from '../utils/courseKeys';
import PhaseHeader from '../steps/StepProgress/PhaseHeader';
import PhaseItemRows from '../steps/StepProgress/PhaseItemRows';
import './JobProgress.scss';

// ── Simulation log sequences (DEMO mode only) ─────────────────────────────────
const ORG_REG_LOGS = [
  { d: 300,  lv: 'info', msg: 'Starting organization registration...' },
  { d: 800,  lv: 'info', msg: 'organizations.api.get_or_create_organization(short_name=\'{code}\', name=\'{name}\')' },
  { d: 1500, lv: 'info', msg: 'Verifying org code is unique in edx-organizations...' },
  { d: 2100, lv: 'ok',   msg: 'Organization registered. edx-organizations record created.' },
  { d: 2500, lv: 'info', msg: 'Syncing to Studio course creation whitelist...' },
  { d: 3000, lv: 'ok',   msg: 'Organization registration complete.' },
];
const COURSE_LOGS = [
  { d: 300,  lv: 'info', msg: 'ProvisioningJob created.' },
  { d: 900,  lv: 'info', msg: 'planner.build_plan(): source key resolved.' },
  { d: 1700, lv: 'info', msg: 'courses.create_rerun(): copying modulestore content...' },
  { d: 2600, lv: 'ok',   msg: 'Course shell created. Target CourseKey registered.' },
  { d: 3100, lv: 'info', msg: 'certificates.setup(): changing course mode Audit -> Honor...' },
  { d: 3600, lv: 'ok',   msg: 'CourseMode updated to Honor.' },
  { d: 4000, lv: 'info', msg: 'certificates.activate(): creating certificate...' },
  { d: 4500, lv: 'ok',   msg: 'Certificate activated.' },
  { d: 4900, lv: 'info', msg: 'access.assign_team(): adding team members from CAR...' },
  { d: 5400, lv: 'ok',   msg: 'Team members assigned.' },
  { d: 5800, lv: 'ok',   msg: 'Rerun complete.' },
];
const DISCOVERY_LOGS = [
  { d: 400,  lv: 'info', msg: 'management.call_command(\'refresh_course_metadata\', course_ids=[...])' },
  { d: 1200, lv: 'info', msg: 'Metadata refreshed. Syncing to Course Discovery service...' },
  { d: 2200, lv: 'ok',   msg: 'Course Discovery metadata updated.' },
  { d: 2700, lv: 'info', msg: 'management.call_command(\'update_index\', course_ids=[...])' },
  { d: 3500, lv: 'ok',   msg: 'Search index updated.' },
  { d: 3800, lv: 'ok',   msg: 'Discovery sync complete.' },
];
const PROGRAM_LOGS = [
  { d: 400,  lv: 'info', msg: 'discovery.link_courses_to_program(): fetching program UUID...' },
  { d: 1100, lv: 'info', msg: 'Program found. Attaching course runs via management shell...' },
  { d: 1900, lv: 'warn', msg: 'NOTE: Discovery admin Select2 widget has known bug in Teak - using management shell workaround.' },
  { d: 2800, lv: 'info', msg: 'program.courses.add(*new_course_run_keys)' },
  { d: 3600, lv: 'ok',   msg: 'All course runs linked to program.' },
  { d: 4000, lv: 'ok',   msg: 'Program linking complete.' },
];

const fmtDate = iso => { try { return new Date(iso).toLocaleString(); } catch (_e) { return iso || ''; } };

const MODE_LBL = { program: 'By Program', neworg: 'New Organization', course: 'By Individual Course' };

const mapApiStatus = (s) => {
  if (s === 'succeeded') return 'success';
  if (s === 'failed')    return 'failed';
  if (s === 'running')   return 'running';
  return 'pending';
};

// ── Per-job log streamer ───────────────────────────────────────────────────────
// Renders nothing — polls GET /jobs/:jobId/logs/ every 2 s and pushes
// parsed log lines to the parent via onLogs whenever the response changes.
function CourseJobLogStream({ jobId, onLogs }) {
  const { data } = useJobLogs(jobId);
  useEffect(() => {
    if (!Array.isArray(data?.logs)) return;
    const mapped = data.logs.map(l => ({
      lv:  l.level,
      msg: l.message,
      ts:  new Date(l.created_at).toLocaleTimeString('en-US', { hour12: false }),
    }));
    onLogs(jobId, mapped);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JobProgress({
  cfg,
  jobId,
  batchId,
  isPending,
  isDryRun,
  createdBy,
  createdAt,
  historyEntry,
  onSaveHistory,
  onComplete,
  onNew,
  onExecute,
}) {
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
    if (historyEntry) return [];
    return isNewOrg
      ? newOrgs.map((o, i) => ({ id: 'r' + i, code: o.code, name: o.name, status: 'pending', logs: [], elapsed: '', t0: 0 }))
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
            org: tOrg, orgName: j.orgName || tOrg, name: j.name,
            num: tNum, run: tRun,
            srcOrg: srcParts[0] || '', srcNum: srcParts[1] || '', srcRun: srcParts[2] || '',
          },
          status: j.status === 'success' ? 'success' : j.status === 'failed' ? 'failed' : 'pending',
          logs: j.logs?.length > 0 ? j.logs
            : j.failReason ? [{ lv: 'error', ts: '--', msg: j.failReason }]
            : j.status === 'success' ? [{ lv: 'info', ts: '--', msg: 'Completed successfully.' }]
            : [{ lv: 'info', ts: '--', msg: 'No log data available.' }],
          elapsed: j.elapsed || '', t0: 0,
        };
      });
    }
    return rows.map((r, i) => ({ id: i, r, status: 'pending', logs: [], elapsed: '', t0: 0 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initDisc = useCallback(() => orgs.map((org, i) => ({
    id: 'd' + i, org,
    status: historyEntry && courseDiscoveryEnabled ? 'success' : 'pending',
    logs: historyEntry && courseDiscoveryEnabled ? [{ lv: 'info', ts: '--', msg: 'Discovery sync completed.' }] : [],
    elapsed: '', t0: 0,
  })), []); // eslint-disable-line react-hooks/exhaustive-deps

  const initProgItems = useCallback(() => orgs.map((org, i) => ({
    id: 'p' + i, org,
    status: historyEntry && courseDiscoveryEnabled ? 'success' : 'pending',
    logs: historyEntry && courseDiscoveryEnabled ? [{ lv: 'info', ts: '--', msg: 'Program linking completed.' }] : [],
    elapsed: '', t0: 0,
  })), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [regItems,    setRegItems]    = useState(initReg);
  const [courseItems, setCourseItems] = useState(initCourse);
  const [discItems,   setDiscItems]   = useState(initDisc);
  const [progItems,   setProgItems]   = useState(initProgItems);
  const [phase,       setPhase]       = useState(historyEntry ? 4 : isNewOrg ? 0 : 1);
  const [openCOrg,    setOpenCOrg]    = useState(() => Object.fromEntries(orgs.map(o => [o, true])));

  const booted = useRef(false);

  const isRealMode = !!batchId && !historyEntry;
  // Simulation only runs when there is no real batchId and no pending API call.
  const isSimMode  = !batchId && !historyEntry && !isPending;

  const batchQuery = useBatch(batchId || null);

  useEffect(() => {
    if (!isRealMode || !batchQuery.data) return;
    const batch = batchQuery.data;

    if (typeof batch.phase === 'number') setPhase(batch.phase);

    if (Array.isArray(batch.jobs) && batch.jobs.length > 0) {
      setCourseItems(prev => prev.map((item, i) => {
        const job = batch.jobs[i];
        if (!job) return item;
        const apiStatus = mapApiStatus(job.status);
        const elapsed   = job.elapsed_seconds != null
          ? job.elapsed_seconds.toFixed(1) + 's'
          : item.elapsed;
        // Prefer logs from the batch API response (added via jobs__logs prefetch);
        // fall back to whatever CourseJobLogStream has already streamed.
        const apiLogs = Array.isArray(job.logs) && job.logs.length > 0
          ? job.logs.map(l => ({
              lv:  l.level,
              msg: l.message,
              ts:  new Date(l.created_at).toLocaleTimeString('en-US', { hour12: false }),
            }))
          : null;
        // Surface error_message as a fallback log line for failed jobs with no logs.
        const errorLog = !apiLogs && job.error_message && apiStatus === 'failed'
          ? [{ lv: 'error', msg: job.error_message, ts: '--' }]
          : [];
        const logs = apiLogs || (errorLog.length > 0 ? errorLog : item.logs);
        return { ...item, status: apiStatus, jobId: job.id, elapsed, logs };
      }));
    }

    if (Array.isArray(batch.reg_items) && batch.reg_items.length > 0) {
      setRegItems(prev => prev.map((item, i) => {
        const ri = batch.reg_items[i];
        if (!ri) return item;
        return {
          ...item,
          status: mapApiStatus(ri.status),
          logs: Array.isArray(ri.logs) && ri.logs.length > 0 ? ri.logs : item.logs,
        };
      }));
    }

    if (Array.isArray(batch.disc_items) && batch.disc_items.length > 0) {
      setDiscItems(prev => prev.map((item, i) => {
        const di = batch.disc_items[i];
        if (!di) return item;
        return {
          ...item,
          status: mapApiStatus(di.status),
          logs: Array.isArray(di.logs) && di.logs.length > 0 ? di.logs : item.logs,
        };
      }));
    }

    if (Array.isArray(batch.prog_items) && batch.prog_items.length > 0) {
      setProgItems(prev => prev.map((item, i) => {
        const pi = batch.prog_items[i];
        if (!pi) return item;
        return {
          ...item,
          status: mapApiStatus(pi.status),
          logs: Array.isArray(pi.logs) && pi.logs.length > 0 ? pi.logs : item.logs,
        };
      }));
    }
  }, [batchQuery.data, isRealMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const batchDone = isRealMode
    ? !!batchQuery.data && ['succeeded', 'failed', 'partial'].includes(batchQuery.data.status)
    : courseItems.every(it => it.status === 'success' || it.status === 'failed');

  // All course items are in a terminal local state. In real mode this lags one
  // render behind batchDone (the data effect must run first); using both guards
  // ensures onSaveHistory sees the correct per-job statuses.
  const coursesDone = courseItems.every(it => it.status === 'success' || it.status === 'failed');
  const readyToSave = batchDone && coursesDone;

  const batchFail = courseItems.filter(it => it.status === 'failed').length;

  const rDone = regItems.filter(i => i.status === 'success').length;
  const cDone = courseItems.filter(i => i.status === 'success').length;
  const cRun  = courseItems.filter(i => i.status === 'running').length;
  const dDone = discItems.filter(i => i.status === 'success').length;
  const pDone = progItems.filter(i => i.status === 'success').length;
  const cPct  = courseItems.length > 0 ? Math.round(cDone / courseItems.length * 100) : 0;

  const allComplete =
    (!isNewOrg || rDone === regItems.length) &&
    cDone === courseItems.length &&
    (!courseDiscoveryEnabled || (dDone === discItems.length && pDone === progItems.length));

  useEffect(() => {
    if (!readyToSave || historyEntry) return;
    if (!isDryRun && onSaveHistory) {
      onSaveHistory({
        id:        String(jobId),
        batchId:   batchId ?? null,
        createdAt: createdAt || new Date().toISOString(),
        createdBy: createdBy || '-',
        mode:      fromMode,
        progName:  prog?.name || null,
        targetRun: cfg.runId,
        isDryRun,
        status:    batchFail === 0 ? 'succeeded' : batchFail === courseItems.length ? 'failed' : 'partial',
        orgs,
        cfg,
        jobs: courseItems.map(it => ({
          id:        it.id,
          org:       it.r?.org,
          orgName:   it.r?.orgName,
          name:      it.r?.name,
          srcKey:    it.r ? makeKey(it.r.srcOrg, it.r.srcNum, it.r.srcRun) : '',
          targetKey: it.r ? makeKey(it.r.org,    it.r.num,    it.r.run)    : '',
          status:    it.status,
          elapsed:   it.elapsed,
          logs:      it.logs || [],
          failReason: it.logs?.filter(l => l.lv === 'error').map(l => l.msg).join('; ') || null,
        })),
      });
    }
    if (onComplete) onComplete();
  }, [readyToSave]); // eslint-disable-line react-hooks/exhaustive-deps

  // When viewing a history entry that has a batchId, fetch live log data from the
  // API and overlay it onto the already-initialised courseItems. This handles both
  // entries saved before logs were included in the history payload and entries where
  // the API returned richer log data than what was captured at save time.
  useEffect(() => {
    if (!historyEntry || !batchQuery.data) return;
    const batch = batchQuery.data;
    if (!Array.isArray(batch.jobs) || batch.jobs.length === 0) return;
    setCourseItems(prev => prev.map((item, i) => {
      const job = batch.jobs[i];
      if (!job || !Array.isArray(job.logs) || job.logs.length === 0) return item;
      const liveLogs = job.logs.map(l => ({
        lv:  l.level,
        msg: l.message,
        ts:  new Date(l.created_at).toLocaleTimeString('en-US', { hour12: false }),
      }));
      return { ...item, logs: liveLogs };
    }));
  }, [batchQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const ts = () => new Date().toLocaleTimeString('en-US', { hour12: false });

  const runItem = useCallback((seq, setFn, onAllDone, listIdx) => item => {
    const pad   = isDryRun ? s => '[DRY-RUN] ' + s : s => s;
    const subst = s => s.replace('{code}', item.code || item.org || '').replace('{name}', item.name || '');
    const steps = seq.map(l => ({ ...l, msg: pad(subst(l.msg)) }));
    setFn(p => p.map(it => it.id !== item.id ? it : { ...it, status: 'running', t0: Date.now() }));
    steps.forEach(({ d, lv, msg }) => setTimeout(() => {
      setFn(p => {
        const cur = p.find(it => it.id === item.id);
        if (!cur || cur.status === 'success') return p;
        const next = p.map(it => it.id !== item.id ? it : { ...it, logs: [...it.logs, { lv, msg, ts: ts() }] });
        if (msg.includes('complete') || msg.includes('Rerun complete') || msg.includes('complete.')) {
          const fin = next.map(it => it.id !== item.id ? it : { ...it, status: 'success', elapsed: ((Date.now() - cur.t0) / 1000).toFixed(1) + 's' });
          const nxtItem = fin.find(it => it.status === 'pending');
          if (nxtItem) {
            const nxtIdx = fin.findIndex(it => it.id === nxtItem.id);
            setTimeout(() => runItem(seq, setFn, onAllDone, nxtIdx)(nxtItem), 300);
          } else if (onAllDone && fin.every(it => it.status === 'success')) {
            setTimeout(onAllDone, 600);
          }
          return fin;
        }
        return next;
      });
    }, d + (listIdx || 0) * 350));
  }, [isDryRun]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isSimMode) return;
    if (booted.current) return;
    booted.current = true;
    setTimeout(() => {
      if (isNewOrg) {
        regItems.slice(0, 2).forEach((it, i) =>
          setTimeout(() => runItem(ORG_REG_LOGS, setRegItems, () => setPhase(1), i)(it), i * 400)
        );
      } else {
        courseItems.slice(0, 3).forEach((it, i) =>
          setTimeout(() => runItem(COURSE_LOGS, setCourseItems, null, i)(it), i * 300)
        );
      }
    }, 400);
  }, [isSimMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isSimMode) return;
    if (phase === 1 && booted.current && isNewOrg) {
      courseItems.slice(0, 3).forEach((it, i) =>
        setTimeout(() => runItem(COURSE_LOGS, setCourseItems, null, i)(it), i * 300)
      );
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const cDoneCount = courseItems.filter(i => i.status === 'success').length;
  useEffect(() => {
    if (historyEntry) return;
    if (cDoneCount > 0 && cDoneCount === courseItems.length && phase === 1) {
      if (courseDiscoveryEnabled) setTimeout(() => setPhase(2), 600);
    }
  }, [cDoneCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (historyEntry) return;
    if (phase === 2 && courseDiscoveryEnabled) {
      discItems.slice(0, 2).forEach((it, i) =>
        setTimeout(() => runItem(DISCOVERY_LOGS, setDiscItems, () => setPhase(3), i)(it), i * 400)
      );
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (historyEntry) return;
    if (phase === 3 && courseDiscoveryEnabled) {
      progItems.slice(0, 2).forEach((it, i) =>
        setTimeout(() => runItem(PROGRAM_LOGS, setProgItems, null, i)(it), i * 400)
      );
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildExport = () => {
    const modeLabel  = MODE_LBL[fromMode] || fromMode;
    const progLabel  = prog ? (prog.icon || '') + ' ' + prog.name : 'Mixed / Individual';
    const statusTxt  = batchDone
      ? (batchFail === 0 ? 'Complete' : 'Partial failures')
      : 'In progress';
    const lines = [
      'BULK COURSE RERUN SUMMARY',
      '═'.repeat(52),
      'Date:        ' + fmtDate(createdAt),
      'Created by:  ' + (createdBy || '-'),
      'Mode:        ' + modeLabel + (prog ? '  -  ' + progLabel : ''),
      'Target run:  ' + (cfg?.runId || '-'),
      'Dry run:     ' + (isDryRun ? 'Yes' : 'No'),
      'Status:      ' + statusTxt,
      'Courses:     ' + rows.length + ' total across ' + orgs.length + ' org' + (orgs.length !== 1 ? 's' : ''),
      '',
    ];
    orgs.forEach(orgCode => {
      const orgRows = rows.filter(r => r.org === orgCode).sort((a, b) => a.srcNum.localeCompare(b.srcNum));
      lines.push('-- ' + orgCode + ' ' + '-'.repeat(Math.max(0, 44 - orgCode.length)));
      orgRows.forEach(r => {
        const job = courseItems.find(it => it.r?.id === r.id);
        const icon = job?.status === 'success' ? 'v' : job?.status === 'failed' ? 'x' : job?.status === 'running' ? '*' : 'o';
        lines.push(icon + ' ' + r.name);
        lines.push('  Source:  ' + makeKey(r.srcOrg, r.srcNum, r.srcRun));
        lines.push('  Target:  ' + makeKey(r.org, r.num, r.run));
      });
      lines.push('');
    });
    return lines.join('\n');
  };

  const handleExport = () => {
    const text = buildExport();
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  };

  // Stat card colors are per-card dynamic values — kept as inline style
  const statCards = [
    ...(isNewOrg ? [{ l: 'Orgs registered', v: rDone + '/' + regItems.length,                c: rDone === regItems.length ? '#6f42c1' : phase === 0 ? '#006daa' : '#c8c8c8' }] : []),
    {              l: 'Courses created',   v: cDone + '/' + courseItems.length,               c: cDone === courseItems.length ? '#178253' : phase >= 1 ? '#006daa' : '#c8c8c8' },
    {              l: 'Discovery synced',  v: courseDiscoveryEnabled ? (dDone + '/' + discItems.length) : 'Skipped',
                   c: !courseDiscoveryEnabled ? '#c8c8c8' : dDone === discItems.length && phase >= 2 ? '#178253' : phase >= 2 ? '#006daa' : '#c8c8c8' },
    {              l: 'Programs linked',   v: courseDiscoveryEnabled ? (pDone + '/' + progItems.length) : 'Skipped',
                   c: !courseDiscoveryEnabled ? '#c8c8c8' : pDone === progItems.length && phase >= 3 ? '#178253' : phase >= 3 ? '#006daa' : '#c8c8c8' },
    {              l: 'Orgs complete',     v: allComplete ? String(orgs.length) : '-',         c: allComplete ? '#178253' : '#6c757d' },
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
      {/* One log streamer per course job in real mode — renders null, drives log state */}
      {isRealMode && courseItems.map(item =>
        item.jobId ? (
          <CourseJobLogStream
            key={item.jobId}
            jobId={item.jobId}
            onLogs={(id, logs) => setCourseItems(prev =>
              prev.map(it => it.jobId === id ? { ...it, logs } : it)
            )}
          />
        ) : null
      )}

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
            border: '1px solid ' + (isNewOrg ? '#6f42c1' : (prog.color || '#006daa')) + '44',
          }}
        >
          {prog.icon && <span className="jp-prog-icon">{prog.icon}</span>}
          <div className="jp-prog-title" style={{ color: isNewOrg ? '#6f42c1' : (prog.color || '#006daa') }}>
            {prog.name + ' - Job #BR-' + (batchId ? batchId.replace(/-/g, '').slice(0, 8).toUpperCase() : jobId)}
            {isDryRun && <Badge variant="info" pill>DRY-RUN</Badge>}
            {isNewOrg && <Badge variant="primary" pill>New org onboarding</Badge>}
          </div>
        </div>
      )}

      <div className="jp-card">
        <div className="jp-card-header">
          <div className="jp-card-header-left">
            <span className="jp-card-title">{'Job #BR-' + (batchId ? batchId.replace(/-/g, '').slice(0, 8).toUpperCase() : jobId)}</span>
            <span className="jp-card-meta">{courseItems.length + ' runs - ' + orgs.length + ' org' + (orgs.length !== 1 ? 's' : '')}</span>
            {isPending && (
              <span style={{ marginLeft: 6, fontSize: 11, color: '#6c757d', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Spinner animation="border" size="sm" style={{ width: 10, height: 10, borderWidth: '0.15em' }} />
                Submitting...
              </span>
            )}
            {!isPending && isRealMode && batchQuery.isFetching && (
              <Spinner animation="border" size="sm" style={{ width: 12, height: 12, borderWidth: '0.15em', marginLeft: 4, color: '#006daa' }} />
            )}
          </div>
          <div className="jp-card-header-right">
            {allComplete && (
              <Button variant="success" size="sm" onClick={handleExport}>
                {copied ? 'Copied!' : 'Export summary'}
              </Button>
            )}
          </div>
        </div>

        <div className="jp-card-body">
          {/* Stat cards */}
          <div className="jp-stat-grid" style={{ gridTemplateColumns: 'repeat(' + statCards.length + ',1fr)' }}>
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
              <PhaseHeader num={0} label="Phase 0 - Organization registration" sub={rDone + ' of ' + regItems.length + ' registered'} done={rDone === regItems.length} active={phase === 0} accentColor="#6f42c1" />
              <ProgressBar now={regItems.length > 0 ? Math.round(rDone / regItems.length * 100) : 0} variant="info" />
              <div className="jp-phase-items">
                <PhaseItemRows items={regItems} />
              </div>
            </div>
          )}

          {/* Phase 1 — Course creation, grouped by org */}
          <div className={`jp-phase${phase >= 1 ? '' : ' jp-phase--faded'}`}>
            <div className="jp-phase-header-row">
              <PhaseHeader num={1} label="Phase 1 - Course creation" sub={cDone + ' of ' + courseItems.length + ' complete - ' + cRun + ' running'} done={cDone === courseItems.length} active={phase === 1} />
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
                if (!orgCourseItems.length) return null;
                const orgDone    = orgCourseItems.filter(it => it.status === 'success').length;
                const orgRunning = orgCourseItems.filter(it => it.status === 'running').length;
                const isOrgOpen  = openCOrg[orgCode] !== false;
                const allDone    = orgDone === orgCourseItems.length;
                const stateMod   = allDone ? '--done' : orgRunning > 0 ? '--running' : '';
                const orgName    = orgCourseItems[0]?.r?.orgName || orgCode;
                return (
                  <div key={orgCode} className="jp-org-item">
                    {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                    <div
                      onClick={() => setOpenCOrg(p => ({ ...p, [orgCode]: !isOrgOpen }))}
                      className={`jp-org-header${stateMod ? ' jp-org-header' + stateMod : ''}`}
                    >
                      <div className={`jp-org-dot${stateMod ? ' jp-org-dot' + stateMod : ''}`}>
                        {allDone ? '✓' : orgRunning > 0
                          ? <Spinner animation="border" size="sm" style={{ width: 10, height: 10, borderWidth: '0.15em', color: '#fff' }} />
                          : 'o'}
                      </div>
                      <span className={`jp-org-name${stateMod ? ' jp-org-name' + stateMod : ''}`}>
                        {orgName !== orgCode ? `${orgName} (${orgCode})` : orgCode}
                      </span>
                      <span className="jp-org-meta">
                        {orgDone + '/' + orgCourseItems.length + ' complete' + (orgRunning > 0 ? ' - ' + orgRunning + ' running' : '')}
                      </span>
                      <div className="jp-org-spacer" />
                      <span className="jp-org-toggle">{isOrgOpen ? '▲' : '▼'}</span>
                    </div>
                    {isOrgOpen && (
                      <div className="jp-org-rows">
                        <PhaseItemRows items={orgCourseItems} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Phase 2 — Discovery sync */}
          <div className={`jp-phase${!courseDiscoveryEnabled ? ' jp-phase--skipped' : phase >= 2 ? '' : ' jp-phase--faded'}`}>
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
          <div className={`jp-phase${!courseDiscoveryEnabled ? ' jp-phase--skipped' : phase >= 3 ? '' : ' jp-phase--faded'}`}>
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
        <div className="jp-action-bar">
          {isDryRun && allComplete && (
            <Button variant={isNewOrg ? 'brand' : 'primary'} onClick={onExecute}>
              {isNewOrg ? 'Onboard organizations' : 'Execute reruns'}
            </Button>
          )}
          <Button variant="outline-primary" onClick={onNew}>+ New job</Button>
        </div>
      )}
    </div>
  );
}
