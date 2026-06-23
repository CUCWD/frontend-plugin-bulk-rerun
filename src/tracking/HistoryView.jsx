// Tracking → History tab. Shows completed bulk runs sorted newest-first.
// Each entry expands to show per-org course breakdowns with a full-batch
// plain-text export button (for support email / Zendesk use).
// History is stored in hookstate and persisted to localStorage via state.saveHistory().
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Button } from '@openedx/paragon';
import HistoryEntry from './HistoryEntry';
import './HistoryView.scss';

const HistoryView = ({ entries, onView, onNewRun }) => {
  const allEntries = [...entries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandedOrg, setExpandedOrg] = useState({});

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedIds(new Set());
      setAllExpanded(false);
    } else {
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

      {allEntries.map(entry => (
        <HistoryEntry
          key={entry.id}
          entry={entry}
          isOpen={expandedIds.has(entry.id)}
          onToggle={() => setExpandedIds(prev => {
            const n = new Set(prev);
            if (expandedIds.has(entry.id)) { n.delete(entry.id); } else { n.add(entry.id); }
            return n;
          })}
          expandedOrg={expandedOrg}
          setExpandedOrg={setExpandedOrg}
          onView={onView}
        />
      ))}
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
