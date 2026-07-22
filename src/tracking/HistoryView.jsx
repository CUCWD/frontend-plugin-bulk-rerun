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

  useEffect(() => {
    const statuses = rollbackProgress.data;
    if (!statuses) { return; }
    if (Object.values(statuses).some(s => ROLLBACK_TERMINAL.includes(s))) {
      queryClient.invalidateQueries({ queryKey: ['bulk-rerun-history'] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollbackProgress.data]);

  // Fire the rollback and refetch the history list so the entry's
  // rollbackStatus flips to pending immediately (the query then self-polls
  // until the rollback reaches a terminal state — see useServerHistory).
  const handleRollback = async (entry) => {
    if (!onRollback(entry)) { return; }
    try {
      await rollbackBatch.mutateAsync(entry.batchId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[BulkRerun] Rollback request failed for', entry.batchId, e?.response?.data || e);
    } finally {
      queryClient.invalidateQueries({ queryKey: ['bulk-rerun-history'] });
    }
  };

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandedOrg, setExpandedOrg] = useState({});
  const [enrichedMap, setEnrichedMap] = useState({});
  const [loadingIds, setLoadingIds] = useState(new Set());

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
