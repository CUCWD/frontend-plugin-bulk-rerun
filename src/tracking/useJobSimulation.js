import { useEffect, useRef, useCallback } from 'react';

// ── Simulation log sequences (DEMO mode only) ─────────────────────────────────
const ORG_REG_LOGS = [
  { d: 300, lv: 'info', msg: 'Starting organization registration...' },
  { d: 800, lv: 'info', msg: 'organizations.api.get_or_create_organization(short_name=\'{code}\', name=\'{name}\')' },
  { d: 1500, lv: 'info', msg: 'Verifying org code is unique in edx-organizations...' },
  { d: 2100, lv: 'ok', msg: 'Organization registered. edx-organizations record created.' },
  { d: 2500, lv: 'info', msg: 'Syncing to Studio course creation whitelist...' },
  { d: 3000, lv: 'ok', msg: 'Organization registration complete.' },
];
const COURSE_LOGS = [
  { d: 300, lv: 'info', msg: 'ProvisioningJob created.' },
  { d: 900, lv: 'info', msg: 'planner.build_plan(): source key resolved.' },
  { d: 1700, lv: 'info', msg: 'courses.create_rerun(): copying modulestore content...' },
  { d: 2600, lv: 'ok', msg: 'Course shell created. Target CourseKey registered.' },
  { d: 3100, lv: 'info', msg: 'certificates.setup(): changing course mode Audit -> Honor...' },
  { d: 3600, lv: 'ok', msg: 'CourseMode updated to Honor.' },
  { d: 4000, lv: 'info', msg: 'certificates.activate(): creating certificate...' },
  { d: 4500, lv: 'ok', msg: 'Certificate activated.' },
  { d: 4900, lv: 'info', msg: 'access.assign_team(): adding team members from CAR...' },
  { d: 5400, lv: 'ok', msg: 'Team members assigned.' },
  { d: 5800, lv: 'ok', msg: 'Rerun complete.' },
];
const DISCOVERY_LOGS = [
  { d: 400, lv: 'info', msg: 'management.call_command(\'refresh_course_metadata\', course_ids=[...])' },
  { d: 1200, lv: 'info', msg: 'Metadata refreshed. Syncing to Course Discovery service...' },
  { d: 2200, lv: 'ok', msg: 'Course Discovery metadata updated.' },
  { d: 2700, lv: 'info', msg: 'management.call_command(\'update_index\', course_ids=[...])' },
  { d: 3500, lv: 'ok', msg: 'Search index updated.' },
  { d: 3800, lv: 'ok', msg: 'Discovery sync complete.' },
];
const PROGRAM_LOGS = [
  { d: 400, lv: 'info', msg: 'discovery.link_courses_to_program(): fetching program UUID...' },
  { d: 1100, lv: 'info', msg: 'Program found. Attaching course runs via management shell...' },
  { d: 1900, lv: 'warn', msg: 'NOTE: Discovery admin Select2 widget has known bug in Teak - using management shell workaround.' },
  { d: 2800, lv: 'info', msg: 'program.courses.add(*new_course_run_keys)' },
  { d: 3600, lv: 'ok', msg: 'All course runs linked to program.' },
  { d: 4000, lv: 'ok', msg: 'Program linking complete.' },
];

const useJobSimulation = ({
  isSimMode,
  isHistoryMode,
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
}) => {
  const booted = useRef(false);

  const ts = () => new Date().toLocaleTimeString('en-US', { hour12: false });

  const runItem = useCallback((seq, setFn, onAllDone, listIdx) => item => {
    const pad = isDryRun ? s => `[DRY-RUN] ${s}` : s => s;
    const subst = s => s.replace('{code}', item.code || item.org || '').replace('{name}', item.name || '');
    const steps = seq.map(l => ({ ...l, msg: pad(subst(l.msg)) }));
    setFn(p => p.map(it => (it.id !== item.id ? it : { ...it, status: 'running', t0: Date.now() })));
    steps.forEach(({ d, lv, msg }) => setTimeout(() => {
      setFn(p => {
        const cur = p.find(it => it.id === item.id);
        if (!cur || cur.status === 'success') { return p; }
        const next = p.map(it => (it.id !== item.id ? it : { ...it, logs: [...it.logs, { lv, msg, ts: ts() }] }));
        if (msg.includes('complete') || msg.includes('Rerun complete') || msg.includes('complete.')) {
          const fin = next.map(it => (it.id !== item.id ? it : { ...it, status: 'success', elapsed: `${((Date.now() - cur.t0) / 1000).toFixed(1)}s` }));
          const nxtItem = fin.find(it => it.status === 'pending');
          if (nxtItem) {
            const nxtIdx = fin.findIndex(it => it.id === nxtItem.id);
            setTimeout(() => runItem(seq, setFn, onAllDone, nxtIdx)(nxtItem), 300);
          } else if (onAllDone && fin.every(it => it.status === 'success')) {
            setTimeout(() => { onAllDone(); }, 600);
          }
          return fin;
        }
        return next;
      });
    }, d + (listIdx || 0) * 350));
  }, [isDryRun]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isSimMode || booted.current) { return; }
    booted.current = true;
    setTimeout(() => {
      if (isNewOrg) {
        regItems.slice(0, 2).forEach((it, i) => setTimeout(
          () => runItem(ORG_REG_LOGS, setRegItems, () => setPhase(1), i)(it),
          i * 400,
        ));
      } else {
        courseItems.slice(0, 3).forEach((it, i) => setTimeout(
          () => runItem(COURSE_LOGS, setCourseItems, null, i)(it),
          i * 300,
        ));
      }
    }, 400);
  }, [isSimMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isSimMode) { return; }
    if (phase === 1 && booted.current && isNewOrg) {
      courseItems.slice(0, 3).forEach((it, i) => setTimeout(
        () => runItem(COURSE_LOGS, setCourseItems, null, i)(it),
        i * 300,
      ));
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const cDoneCount = courseItems.filter(i => i.status === 'success').length;
  useEffect(() => {
    if (isHistoryMode) { return; }
    if (cDoneCount > 0 && cDoneCount === courseItems.length && phase === 1) {
      if (courseDiscoveryEnabled) { setTimeout(() => setPhase(2), 600); }
    }
  }, [cDoneCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isHistoryMode) { return; }
    if (phase === 2 && courseDiscoveryEnabled) {
      discItems.slice(0, 2).forEach((it, i) => setTimeout(
        () => runItem(DISCOVERY_LOGS, setDiscItems, () => setPhase(3), i)(it),
        i * 400,
      ));
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isHistoryMode) { return; }
    if (phase === 3 && courseDiscoveryEnabled) {
      progItems.slice(0, 2).forEach((it, i) => setTimeout(
        () => runItem(PROGRAM_LOGS, setProgItems, null, i)(it),
        i * 400,
      ));
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
};

export default useJobSimulation;
