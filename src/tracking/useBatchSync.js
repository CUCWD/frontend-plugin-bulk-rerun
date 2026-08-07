import { useEffect, useRef, useState } from 'react';
import { useBatch, fetchBatchDetail, fetchJobLogs } from '../hooks';
import { makeKey } from '../utils/courseKeys';

const mapApiStatus = (s) => {
  if (s === 'succeeded') { return 'success'; }
  if (s === 'failed') { return 'failed'; }
  if (s === 'running') { return 'running'; }
  return 'pending';
};

const mapLogLines = (lines) => lines.map(l => ({
  lv: l.level,
  msg: l.message,
  ts: new Date(l.created_at).toLocaleTimeString('en-US', { hour12: false }),
}));

// Polling is split into two cheap streams instead of one growing one:
//  1. useBatch with includeLogs=false — constant-size status payload every 5 s.
//  2. A 2 s log poller that fetches only NEW lines (?since=<last id>) and only
//     for running jobs, plus one final catch-up fetch when a job goes terminal.
// A one-shot full-detail fetch on mount seeds log history and per-job since
// cursors, so a page refresh mid-batch behaves like a page that never closed.
const useBatchSync = ({
  batchId,
  isRealMode,
  historyEntry,
  setCourseItems,
  setRegItems,
  setDiscItems,
  setProgItems,
  setPhase,
}) => {
  // Once we see a terminal state we flip this to false, which sets
  // enabled:false on useBatch and immediately stops all API calls.
  const [pollingEnabled, setPollingEnabled] = useState(true);

  // Incremental-log bookkeeping.  seeded gates the log poller until the
  // hydration fetch has set each job's since cursor — polling before that
  // would re-fetch (and duplicate) the full history.
  const [seeded, setSeeded] = useState(false);
  const lastLogIdRef = useRef({}); // job id -> highest log line id seen
  const finalFetchedRef = useRef(new Set()); // job ids that got their post-terminal catch-up fetch

  // Disable polling in history mode — the full batch detail (including logs) is already
  // fetched once by HistoryView.getEnriched() before JobProgress mounts.
  const batchQuery = useBatch(historyEntry ? null : (batchId || null), pollingEnabled, false);

  // One-shot hydration: full detail (with logs) on mount/refresh.  Seeds each
  // item's log array and jobId, and each job's since cursor to the highest log
  // id in the response — id__gt filtering on the logs endpoint guarantees no
  // gap between this snapshot and the incremental polls that take over.
  useEffect(() => {
    if (!isRealMode || historyEntry || !batchId) { return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const detail = await fetchBatchDetail(batchId);
        if (cancelled || !Array.isArray(detail.jobs)) { return; }
        const jobByKey = Object.fromEntries(detail.jobs.map(j => [j.target_course_key, j]));
        detail.jobs.forEach(j => {
          lastLogIdRef.current[j.id] = (j.logs || []).reduce((m, l) => Math.max(m, l.id), 0);
        });
        setCourseItems(prev => prev.map(item => {
          const targetKey = item.r ? makeKey(item.r.org, item.r.num, item.r.run) : null;
          const job = targetKey ? jobByKey[targetKey] : null;
          if (!job) { return item; }
          const logs = Array.isArray(job.logs) && job.logs.length > 0
            ? mapLogLines(job.logs)
            : item.logs;
          return { ...item, jobId: job.id, logs };
        }));
      } catch { /* hydration is best-effort; the pollers below still populate state */
      } finally {
        if (!cancelled) { setSeeded(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [batchId, isRealMode, historyEntry]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-mode: sync batch API response → local item state every 5 s poll.
  // Status/elapsed/phase only — log lines arrive via the incremental poller.
  // Matches jobs by target_course_key (not index) because the API's default
  // ordering (-created_at) differs from the wizard's row order.
  useEffect(() => {
    if (!isRealMode || !batchQuery.data) { return; }
    const batch = batchQuery.data;

    if (typeof batch.phase === 'number') { setPhase(batch.phase); }

    if (Array.isArray(batch.jobs) && batch.jobs.length > 0) {
      const jobByKey = Object.fromEntries(batch.jobs.map(j => [j.target_course_key, j]));
      setCourseItems(prev => prev.map(item => {
        const targetKey = item.r ? makeKey(item.r.org, item.r.num, item.r.run) : null;
        const job = targetKey ? jobByKey[targetKey] : null;
        if (!job) { return item; }
        const apiStatus = mapApiStatus(job.status);
        const elapsed = job.elapsed_seconds != null
          ? `${job.elapsed_seconds.toFixed(1)}s`
          : item.elapsed;
        // Placeholder shown when a job failed before producing any log lines;
        // marked synthetic so the log poller replaces it with real lines if
        // the final catch-up fetch returns any.
        const logs = item.logs.length === 0 && job.error_message && apiStatus === 'failed'
          ? [{
            lv: 'error', msg: job.error_message, ts: '--', synthetic: true,
          }]
          : item.logs;
        return {
          ...item,
          status: apiStatus,
          jobId: job.id,
          elapsed,
          logs,
          // These flags are present even in the lightweight detail response.
          // Keep them on Current-tab rows before rollback starts so the
          // optimistic rollback state can render the correct per-course chips.
          courseCreated: job.course_created == null ? item.courseCreated : !!job.course_created,
          rolledBack: job.rolled_back == null ? item.rolledBack : !!job.rolled_back,
        };
      }));
    }

    if (Array.isArray(batch.reg_items) && batch.reg_items.length > 0) {
      setRegItems(prev => prev.map((item, i) => {
        const ri = batch.reg_items[i];
        if (!ri) { return item; }
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
        if (!di) { return item; }
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
        if (!pi) { return item; }
        return {
          ...item,
          status: mapApiStatus(pi.status),
          logs: Array.isArray(pi.logs) && pi.logs.length > 0 ? pi.logs : item.logs,
        };
      }));
    }

    // Stop polling once the batch or all its jobs reach a terminal state.
    // This sets enabled:false on useBatch, which immediately prevents any
    // further API calls without changing the query key (cached data is kept).
    const statusDone = ['succeeded', 'failed', 'partial'].includes(batch.status);
    const allJobsDone = Array.isArray(batch.jobs) && batch.jobs.length > 0
      && batch.jobs.every(j => ['succeeded', 'failed'].includes(j.status));
    if (statusDone || allJobsDone) {
      setPollingEnabled(false);
    }
  }, [batchQuery.data, isRealMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Incremental log poller: every 2 s, fetch new lines for running jobs and a
  // final catch-up for jobs that reached a terminal state (their last lines
  // may have been written after the previous tick).  Sequential requests to
  // avoid a burst; with worker concurrency capped this is 1-2 requests/tick.
  useEffect(() => {
    if (!isRealMode || historyEntry || !seeded) { return undefined; }
    const jobs = batchQuery.data?.jobs;
    if (!Array.isArray(jobs) || jobs.length === 0) { return undefined; }

    let cancelled = false;
    const tick = async () => {
      const targets = jobs.filter(j => j.status === 'running'
        || (['succeeded', 'failed'].includes(j.status) && !finalFetchedRef.current.has(j.id)));
      for (const job of targets) { // eslint-disable-line no-restricted-syntax
        try {
          // eslint-disable-next-line no-await-in-loop
          const data = await fetchJobLogs(job.id, lastLogIdRef.current[job.id] || 0);
          if (cancelled) { return; }
          if (['succeeded', 'failed'].includes(job.status)) {
            finalFetchedRef.current.add(job.id);
          }
          const lines = Array.isArray(data.logs) ? data.logs : [];
          if (lines.length === 0) { continue; } // eslint-disable-line no-continue
          lastLogIdRef.current[job.id] = lines.reduce(
            (m, l) => Math.max(m, l.id),
            lastLogIdRef.current[job.id] || 0,
          );
          const mapped = mapLogLines(lines);
          setCourseItems(prev => prev.map(item => (item.jobId === job.id
            ? { ...item, logs: [...item.logs.filter(l => !l.synthetic), ...mapped] }
            : item)));
        } catch { /* transient failure — retry on the next tick */ }
      }
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [batchQuery.data, isRealMode, historyEntry, seeded]); // eslint-disable-line react-hooks/exhaustive-deps

  return { batchQuery };
};

export default useBatchSync;
