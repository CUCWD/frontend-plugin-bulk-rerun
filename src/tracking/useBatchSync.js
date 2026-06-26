import { useEffect } from 'react';
import { useBatch } from '../hooks';
import { makeKey } from '../utils/courseKeys';

const mapApiStatus = (s) => {
  if (s === 'succeeded') { return 'success'; }
  if (s === 'failed') { return 'failed'; }
  if (s === 'running') { return 'running'; }
  return 'pending';
};

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
  // Disable polling in history mode — the full batch detail (including logs) is already
  // fetched once by HistoryView.getEnriched() before JobProgress mounts.
  const batchQuery = useBatch(historyEntry ? null : (batchId || null));

  // Real-mode: sync batch API response → local item state every 2 s poll.
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
        const apiLogs = Array.isArray(job.logs) && job.logs.length > 0
          ? job.logs.map(l => ({
            lv: l.level,
            msg: l.message,
            ts: new Date(l.created_at).toLocaleTimeString('en-US', { hour12: false }),
          }))
          : null;
        const errorLog = !apiLogs && job.error_message && apiStatus === 'failed'
          ? [{ lv: 'error', msg: job.error_message, ts: '--' }]
          : [];
        const logs = apiLogs || (errorLog.length > 0 ? errorLog : item.logs);
        return {
          ...item, status: apiStatus, jobId: job.id, elapsed, logs,
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
  }, [batchQuery.data, isRealMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return { batchQuery };
};

export default useBatchSync;
