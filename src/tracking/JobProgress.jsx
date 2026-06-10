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

import { useBatch } from '../hooks';
import { makeKey } from '../utils/courseKeys';
import PhaseHeader from '../steps/StepProgress/PhaseHeader';
import PhaseItemRows from '../steps/StepProgress/PhaseItemRows';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BRAND    = '#006daa';
const BRAND_DK = '#004f80';
const BRAND_LT = '#deeef8';
const BRAND_XLT = '#eef6fb';
const SUCCESS  = '#178253';
const PURPLE   = '#6f42c1';
const PURPLE_BG = '#f3f0ff';
const G50      = '#f8f9fa';
const G300     = '#c8c8c8';
const G500     = '#6c757d';
const G700     = '#454545';
const G900     = '#1f2937';
const BORDER   = '#dee2e6';
const WHITE    = '#fff';
const MONO     = '"SFMono-Regular","Courier New",monospace';
const FONT     = '"Open Sans",system-ui,sans-serif';

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

// MODE label map — hoisted to avoid object-literal subscript inline in JSX
const MODE_LBL = { program: 'By Program', neworg: 'New Organization', course: 'By Individual Course' };

// Maps API status strings ('succeeded', 'running', …) to the component's internal format.
const mapApiStatus = (s) => {
  if (s === 'succeeded') return 'success';
  if (s === 'failed')    return 'failed';
  if (s === 'running')   return 'running';
  return 'pending';
};

// ── Main component ────────────────────────────────────────────────────────────
export default function JobProgress({
  cfg,
  jobId,
  batchId,      // real API batch ID (string); when provided, real polling replaces simulation
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

  // ── Initialise items for each phase ────────────────────────────────────────
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
  // Phase initial value: historyEntry → 4, isNewOrg → 0, else → 1
  const [phase,       setPhase]       = useState(historyEntry ? 4 : isNewOrg ? 0 : 1);
  const [openCOrg,    setOpenCOrg]    = useState(() => Object.fromEntries(orgs.map(o => [o, true])));

  const booted = useRef(false);

  // ── Mode flags ─────────────────────────────────────────────────────────────
  const isRealMode = !!batchId && !historyEntry;
  const isSimMode  = !batchId && !historyEntry;

  // ── Real API polling ───────────────────────────────────────────────────────
  // useBatch is always called (React hook rules); it is self-disabled when
  // batchId is falsy (enabled: !!batchId inside the hook).
  const batchQuery = useBatch(batchId || null);

  // Sync each poll tick → component state
  useEffect(() => {
    if (!isRealMode || !batchQuery.data) return;
    const batch = batchQuery.data;

    // Advance the active phase indicator
    if (typeof batch.phase === 'number') setPhase(batch.phase);

    // Update course item statuses and log lines
    if (Array.isArray(batch.jobs) && batch.jobs.length > 0) {
      setCourseItems(prev => prev.map((item, i) => {
        const job = batch.jobs[i];
        if (!job) return item;
        const status = mapApiStatus(job.status);
        const logs = Array.isArray(job.logs) && job.logs.length > 0 ? job.logs : item.logs;
        return { ...item, status, logs, elapsed: job.elapsed || item.elapsed };
      }));
    }

    // Update org registration items (phase 0, new-org mode)
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

    // Update discovery sync items (phase 2)
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

    // Update program linking items (phase 3)
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

  // ── Derived counts ─────────────────────────────────────────────────────────
  // In real mode, completion is determined by the batch-level API status so the
  // save-to-history effect fires reliably even if a sync tick is still in flight.
  const batchDone = isRealMode
    ? !!batchQuery.data && ['succeeded', 'failed', 'partial'].includes(batchQuery.data.status)
    : courseItems.every(it => it.status === 'success' || it.status === 'failed');

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

  // ── Save to history when batch completes ───────────────────────────────────
  useEffect(() => {
    if (!batchDone || historyEntry) return;
    if (!isDryRun && onSaveHistory) {
      onSaveHistory({
        id:        String(jobId),
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
  }, [batchDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const ts = () => new Date().toLocaleTimeString('en-US', { hour12: false });

  // ── Generic item runner — DEMO simulation only ────────────────────────────
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

  // ── Boot once: start first simulation phase (DEMO mode only) ──────────────
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 0→1 transition: start courses after org registration (DEMO mode only)
  useEffect(() => {
    if (!isSimMode) return;
    if (phase === 1 && booted.current && isNewOrg) {
      courseItems.slice(0, 3).forEach((it, i) =>
        setTimeout(() => runItem(COURSE_LOGS, setCourseItems, null, i)(it), i * 300)
      );
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // All courses done → advance to discovery (DEMO mode only)
  const cDoneCount = courseItems.filter(i => i.status === 'success').length;
  useEffect(() => {
    if (!isSimMode) return;
    if (cDoneCount > 0 && cDoneCount === courseItems.length && phase === 1) {
      if (courseDiscoveryEnabled) setTimeout(() => setPhase(2), 600);
    }
  }, [cDoneCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isSimMode) return;
    if (phase === 2 && courseDiscoveryEnabled) {
      discItems.slice(0, 2).forEach((it, i) =>
        setTimeout(() => runItem(DISCOVERY_LOGS, setDiscItems, () => setPhase(3), i)(it), i * 400)
      );
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isSimMode) return;
    if (phase === 3 && courseDiscoveryEnabled) {
      progItems.slice(0, 2).forEach((it, i) =>
        setTimeout(() => runItem(PROGRAM_LOGS, setProgItems, null, i)(it), i * 400)
      );
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Export helpers ────────────────────────────────────────────────────────
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

  // ── Stat card data — hoisted, no inline object ─────────────────────────────
  const statCards = [
    ...(isNewOrg ? [{ l: 'Orgs registered', v: rDone + '/' + regItems.length,                c: rDone === regItems.length ? PURPLE   : phase === 0 ? BRAND : G300 }] : []),
    {              l: 'Courses created',   v: cDone + '/' + courseItems.length,               c: cDone === courseItems.length ? SUCCESS : phase >= 1 ? BRAND : G300 },
    {              l: 'Discovery synced',  v: courseDiscoveryEnabled ? (dDone + '/' + discItems.length) : 'Skipped',
                   c: !courseDiscoveryEnabled ? G300 : dDone === discItems.length && phase >= 2 ? SUCCESS : phase >= 2 ? BRAND : G300 },
    {              l: 'Programs linked',   v: courseDiscoveryEnabled ? (pDone + '/' + progItems.length) : 'Skipped',
                   c: !courseDiscoveryEnabled ? G300 : pDone === progItems.length && phase >= 3 ? SUCCESS : phase >= 3 ? BRAND : G300 },
    {              l: 'Orgs complete',     v: allComplete ? String(orgs.length) : '-',         c: allComplete ? SUCCESS : G500 },
  ];

  // ── Real mode: loading and error states ───────────────────────────────────
  if (isRealMode && batchQuery.isLoading && !batchQuery.data) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: G500, fontFamily: FONT }}>
        <Spinner animation="border" size="sm" style={{ marginRight: 8 }} />
        Connecting to batch API...
      </div>
    );
  }

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
          <strong style={{ display: 'block', marginBottom: 2 }}>Dry-run mode - no changes were made</strong>
          All steps validated. Click Execute to apply changes.
        </Alert>
      )}
      {!courseDiscoveryEnabled && (
        <Alert variant="warning" className="mb-3 py-2">
          <strong style={{ display: 'block', marginBottom: 2 }}>Course Discovery not enabled - phases 2 and 3 skipped</strong>
          Only course creation, certificates, and team access will be applied.
        </Alert>
      )}
      {isNewOrg && (
        <Alert variant="primary" className="mb-3 py-2">
          <strong style={{ display: 'block', marginBottom: 2 }}>New organization onboarding in progress</strong>
          Organizations are being registered before course creation begins.
        </Alert>
      )}

      {prog && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: isNewOrg ? PURPLE_BG : (prog.colorLt || BRAND_LT), border: '1px solid ' + (isNewOrg ? PURPLE : (prog.color || BRAND)) + '44', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          {prog.icon && <span style={{ fontSize: 20 }}>{prog.icon}</span>}
          <div style={{ fontWeight: 600, fontSize: 14, color: isNewOrg ? PURPLE : (prog.color || BRAND), display: 'flex', alignItems: 'center', gap: 8 }}>
            {prog.name + ' - Job #BR-' + jobId}
            {isDryRun && (
              <Badge variant="info" pill style={{ fontSize: 11, lineHeight: 1.5 }}>DRY-RUN</Badge>
            )}
            {isNewOrg && (
              <Badge variant="primary" pill style={{ fontSize: 11, lineHeight: 1.5 }}>New org onboarding</Badge>
            )}
          </div>
        </div>
      )}

      <div style={{ border: '1px solid ' + BORDER, borderRadius: 4, background: WHITE }}>
        {/* Card header */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid ' + BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: G700 }}>{'Job #BR-' + jobId}</span>
            <span style={{ fontSize: 12, color: G500 }}>{courseItems.length + ' runs - ' + orgs.length + ' org' + (orgs.length !== 1 ? 's' : '')}</span>
            {isRealMode && batchQuery.isFetching && (
              <Spinner animation="border" size="sm" style={{ width: 12, height: 12, borderWidth: '0.15em', marginLeft: 4, color: BRAND }} />
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {allComplete && (
              <Button variant="success" size="sm" onClick={handleExport}>
                {copied ? 'Copied!' : 'Export summary'}
              </Button>
            )}
          </div>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + statCards.length + ',1fr)', gap: 10, marginBottom: 16 }}>
            {statCards.map(s => (
              <div key={s.l} style={{ background: G50, border: '1px solid ' + BORDER, borderRadius: 4, padding: '10px 14px' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.c, marginBottom: 2 }}>{s.v}</div>
                <div style={{ fontSize: 12, color: G500 }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Phase 0 — Org registration (new org mode only) */}
          {isNewOrg && (
            <div style={{ marginBottom: 16 }}>
              <PhaseHeader num={0} label="Phase 0 - Organization registration" sub={rDone + ' of ' + regItems.length + ' registered'} done={rDone === regItems.length} active={phase === 0} accentColor={PURPLE} />
              <ProgressBar now={regItems.length > 0 ? Math.round(rDone / regItems.length * 100) : 0} variant="info" />
              <div style={{ marginTop: 8 }}>
                <PhaseItemRows items={regItems} />
              </div>
            </div>
          )}

          {/* Phase 1 — Course creation, grouped by org */}
          <div style={{ marginBottom: 16, opacity: phase >= 1 ? 1 : 0.45, transition: 'opacity .3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <PhaseHeader num={1} label="Phase 1 - Course creation" sub={cDone + ' of ' + courseItems.length + ' complete - ' + cRun + ' running'} done={cDone === courseItems.length} active={phase === 1} />
              <div style={{ display: 'flex', gap: 6 }}>
                <Button variant="tertiary" size="sm" onClick={() => setOpenCOrg(Object.fromEntries(orgs.map(o => [o, true])))}>Expand all</Button>
                <Button variant="tertiary" size="sm" onClick={() => setOpenCOrg(Object.fromEntries(orgs.map(o => [o, false])))}>Collapse all</Button>
              </div>
            </div>
            <ProgressBar now={cPct} variant={cDone === courseItems.length ? 'success' : 'primary'} />
            <div style={{ marginTop: 8 }}>
              {orgs.map(orgCode => {
                const orgCourseItems = courseItems
                  .filter(it => it.r?.org === orgCode)
                  .sort((a, b) => (a.r?.num || '').localeCompare(b.r?.num || ''));
                if (!orgCourseItems.length) return null;
                const orgDone    = orgCourseItems.filter(it => it.status === 'success').length;
                const orgRunning = orgCourseItems.filter(it => it.status === 'running').length;
                const isOrgOpen  = openCOrg[orgCode] !== false;
                const allDone    = orgDone === orgCourseItems.length;
                const accent     = allDone ? SUCCESS : orgRunning > 0 ? BRAND : G300;
                return (
                  <div key={orgCode} style={{ border: '1px solid ' + BORDER, borderRadius: 4, marginBottom: 8, overflow: 'hidden' }}>
                    <div
                      onClick={() => setOpenCOrg(p => ({ ...p, [orgCode]: !isOrgOpen }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', background: G50, borderLeft: '4px solid ' + accent }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#e9ecef'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = G50; }}
                    >
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                        {allDone ? 'v' : orgRunning > 0
                          ? <Spinner animation="border" size="sm" style={{ width: 10, height: 10, borderWidth: '0.15em', color: '#fff' }} />
                          : 'o'}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 13, color: accent }}>{orgCode}</span>
                      <span style={{ fontSize: 12, color: G500 }}>
                        {orgDone + '/' + orgCourseItems.length + ' complete' + (orgRunning > 0 ? ' - ' + orgRunning + ' running' : '')}
                      </span>
                      <div style={{ flex: 1 }} />
                      <span style={{ fontSize: 11, color: G500 }}>{isOrgOpen ? '▲' : '▼'}</span>
                    </div>
                    {isOrgOpen && (
                      <div style={{ padding: '4px 0' }}>
                        <PhaseItemRows items={orgCourseItems} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Phase 2 — Discovery sync */}
          <div style={{ marginBottom: 16, opacity: courseDiscoveryEnabled ? (phase >= 2 ? 1 : 0.45) : 0.35, transition: 'opacity .3s' }}>
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
          <div style={{ opacity: courseDiscoveryEnabled ? (phase >= 3 ? 1 : 0.45) : 0.35, transition: 'opacity .3s' }}>
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

      {/* Action bar — hidden when viewing history */}
      {!historyEntry && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
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
