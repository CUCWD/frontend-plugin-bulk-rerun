// Tracking → History tab. Shows completed bulk runs sorted newest-first.
// Each entry expands to show per-org course breakdowns with a full-batch
// plain-text export button (for support email / Zendesk use).
// History is fetched from the server via useServerHistory (always up to date).
// Job details are lazy-loaded and cached locally when the user expands Summary
// or clicks View details — avoids N+1 fetches on page load.
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Button } from '@openedx/paragon';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchBatchDetail, enrichEntry, useRollbackBatch, useRollbackProgress,
} from '../hooks';
import HistoryEntry from './HistoryEntry';
import './HistoryView.scss';

const ROLLBACK_TERMINAL = ['succeeded', 'partial', 'failed'];

const HistoryView = ({ entries, onView, onNewRun }) => {
  const allEntries = [...entries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const queryClient = useQueryClient();
  const rollbackBatch = useRollbackBatch();

  // Poll ONLY the batches with a rollback in flight (constant-size detail
  // endpoint) rather than re-fetching the whole history list every tick.
  // When a polled rollback reaches a terminal state, refresh the list once
  // so the entry's badge and rolled_back_at update, which also empties
  // inFlightIds and stops the polling.
  const inFlightIds = allEntries
    .filter(e => e.batchId && (e.rollbackStatus === 'pending' || e.rollbackStatus === 'running'))
    .map(e => e.batchId);
  const rollbackProgress = useRollbackProgress(inFlightIds);

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandedOrg, setExpandedOrg] = useState({});
  const [enrichedMap, setEnrichedMap] = useState({});
  const [loadingIds, setLoadingIds] = useState(new Set());

  // Track A — live summary updates. The 5 s rollback poll carries fresh per-job
  // rolled_back flags; merge them into the cached enriched entry so the
  // per-course chips and "n/m removed" tally advance live (only already-enriched,
  // i.e. visible, entries are touched — the slim poll has no logs, so we merge
  // rather than overwrite). When a rollback reaches a terminal state, refetch the
  // history list once so the row badge / rolled_back_at settle and polling stops.
  useEffect(() => {
    const details = rollbackProgress.data;
    if (!details) { return; }
    setEnrichedMap((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(details).forEach(([id, detail]) => {
        const existing = prev[id];
        if (!existing || !Array.isArray(detail.jobs)) { return; }
        const byKey = Object.fromEntries(detail.jobs.map(dj => [dj.target_course_key, dj]));
        next[id] = {
          ...existing,
          rollbackStatus: detail.rollback_status || existing.rollbackStatus,
          rolledBackAt: detail.rolled_back_at || existing.rolledBackAt,
          jobs: (existing.jobs || []).map((j) => {
            const fresh = byKey[j.targetKey];
            return fresh
              ? { ...j, rolledBack: !!fresh.rolled_back, courseCreated: !!fresh.course_created }
              : j;
          }),
        };
        changed = true;
      });
      return changed ? next : prev;
    });
    if (Object.values(details).some(d => ROLLBACK_TERMINAL.includes(d.rollback_status))) {
      queryClient.invalidateQueries({ queryKey: ['bulk-rerun-history'] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollbackProgress.data]);

  // Fire the rollback. Optimistically flip this batch to a rolling-back state
  // right away — both in the history-list cache (so inFlightIds picks it up and
  // polling starts immediately, and the badge flips) and in enrichedMap (so an
  // expanded entry's per-course chips react on click) — before the server
  // round-trip. The 2 s poll then confirms/corrects. A final list refetch settles
  // the terminal state.
  const handleRollback = async (entry) => {
    if (!entry.batchId) { return; }
    const id = entry.batchId;
    queryClient.setQueryData(['bulk-rerun-history'], old => (Array.isArray(old)
      ? old.map(e => (e.batchId === id ? { ...e, rollbackStatus: 'pending' } : e))
      : old));
    setEnrichedMap(prev => (prev[id]
      ? { ...prev, [id]: { ...prev[id], rollbackStatus: 'pending' } }
      : prev));
    try {
      await rollbackBatch.mutateAsync(id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[BulkRerun] Rollback request failed for', id, e?.response?.data || e);
    } finally {
      queryClient.invalidateQueries({ queryKey: ['bulk-rerun-history'] });
    }
  };

  const getEnriched = async (entry) => {
    if (!entry.batchId) { return entry; }
    if (enrichedMap[entry.batchId]) { return enrichedMap[entry.batchId]; }
    if (entry.jobs?.length > 0) { return entry; }
    setLoadingIds(prev => new Set([...prev, entry.batchId]));
    try {
      const detail = await fetchBatchDetail(entry.batchId);
      const enriched = enrichEntry(entry, detail);
      setEnrichedMap(prev => ({ ...prev, [entry.batchId]: enriched }));
      return enriched;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[BulkRerun] Failed to fetch batch detail for', entry.batchId, e);
      return entry;
    } finally {
      setLoadingIds(prev => { const n = new Set(prev); n.delete(entry.batchId); return n; });
    }
  };

  const handleView = async (entry) => {
    const enriched = await getEnriched(entry);
    onView(enriched);
  };

  const handleToggle = async (entry) => {
    const isExpanding = !expandedIds.has(entry.id);
    if (isExpanding) { await getEnriched(entry); }
    setExpandedIds(prev => {
      const n = new Set(prev);
      if (n.has(entry.id)) { n.delete(entry.id); } else { n.add(entry.id); }
      return n;
    });
  };

  const toggleAll = async () => {
    if (allExpanded) {
      setExpandedIds(new Set());
      setAllExpanded(false);
    } else {
      await Promise.allSettled(
        allEntries
          .filter(e => e.batchId && !enrichedMap[e.batchId] && !(e.jobs?.length > 0))
          .map(e => getEnriched(e)),
      );
      setExpandedIds(new Set(allEntries.map(e => e.id)));
      setAllExpanded(true);
    }
  };

  return (
    <div>
      <div className="hv-header">
        <div>
          <div className="hv-header-title">Run History</div>
          <div className="hv-header-subtitle">
            {`${allEntries.length} bulk run${allEntries.length !== 1 ? 's' : ''} on record - sorted newest first`}
          </div>
        </div>
        <div className="hv-header-actions">
          {allEntries.length > 0 && (
            <Button variant="outline-primary" onClick={toggleAll}>
              {allExpanded ? 'Collapse All Summary' : 'Expand All Summary'}
            </Button>
          )}
          <Button variant="primary" onClick={onNewRun}>+ New Bulk Run</Button>
        </div>
      </div>

      {allEntries.length === 0 && (
        <div className="hv-empty">
          <div className="hv-empty-inner">
            <div className="hv-empty-icon">📋</div>
            <div className="hv-empty-title">No runs yet</div>
            <div className="hv-empty-desc">Completed bulk runs will appear here automatically.</div>
            <Button variant="primary" onClick={onNewRun}>Start first bulk run</Button>
          </div>
        </div>
      )}

      {allEntries.map(entry => {
        const displayEntry = enrichedMap[entry.batchId] || entry;
        return (
          <HistoryEntry
            key={entry.id}
            entry={displayEntry}
            isLoadingDetail={loadingIds.has(entry.batchId)}
            isOpen={expandedIds.has(entry.id)}
            onToggle={() => handleToggle(entry)}
            expandedOrg={expandedOrg}
            setExpandedOrg={setExpandedOrg}
            onView={handleView}
            getEnriched={getEnriched}
            onRollback={handleRollback}
            isRollbackPending={rollbackBatch.isPending}
          />
        );
      })}
    </div>
  );
};

HistoryView.propTypes = {
  entries: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    batchId: PropTypes.string,
    createdAt: PropTypes.string,
    status: PropTypes.string,
    jobs: PropTypes.arrayOf(PropTypes.shape({})),
  })).isRequired,
  onView: PropTypes.func.isRequired,
  onNewRun: PropTypes.func.isRequired,
};

export default HistoryView;
