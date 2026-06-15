// Tracking → History tab. Shows completed bulk runs sorted newest-first.
// Each entry expands to show per-org course breakdowns with individual org-level
// and full-batch plain-text exports (for support email use).
// History is stored in hookstate and persisted to localStorage via state.saveHistory().
import { useState } from 'react';
import { Button, Badge } from '@openedx/paragon';
import './HistoryView.scss';

const fmtDate      = iso => { try { return new Date(iso).toLocaleString(); }          catch (_e) { return iso || ''; } };
const fmtDateShort = iso => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (_e) { return iso || ''; } };

const STATUS_LBL  = { succeeded: 'Succeeded', partial: 'Partial', failed: 'Failed', running: 'Running' };
const BADGE_V     = { succeeded: 'success', partial: 'warning', failed: 'danger', running: 'primary' };
const MODE_LABELS = { program: 'By Program', neworg: 'New Org', course: 'By Course', individual: 'Individual' };

function statusLbl(s) { return STATUS_LBL[s] || s; }
function modeLabel(e) { return MODE_LABELS[e.mode] || e.mode; }

// ── Build per-org job groups ──────────────────────────────────────────────────
function orgGroups(entry) {
  const map = {};
  (entry.jobs || []).forEach(j => {
    if (!map[j.org]) map[j.org] = { org: j.org, orgName: j.orgName || j.org, jobs: [] };
    map[j.org].jobs.push(j);
  });
  return Object.values(map).sort((a, b) => a.org.localeCompare(b.org)).map(g => ({
    ...g, jobs: g.jobs.slice().sort((a, b) => (a.targetKey || '').localeCompare(b.targetKey || '')),
  }));
}

// ── Export text builders ──────────────────────────────────────────────────────
function exportOrgText(entry, group) {
  return [
    'Bulk Rerun Summary  -  ' + group.orgName + ' (' + group.org + ')',
    '-'.repeat(60),
    'Job ID:     BR-' + (entry.batchId || entry.id.replace(/^recovered-/, '')),
    'Run ID:     ' + entry.targetRun,
    'Date:       ' + fmtDate(entry.createdAt),
    'Created by: ' + entry.createdBy,
    'Mode:       ' + modeLabel(entry) + (entry.progName ? '  -  ' + entry.progName : ''),
    'Dry run:    ' + (entry.isDryRun ? 'Yes  -  no changes applied' : 'No'),
    '',
    'Course Changes:',
    ...group.jobs.map(j => '  ' + (j.status === 'success' ? '✓' : '✗') + ' ' + j.srcKey + '\n       -> ' + j.targetKey + '   (' + (j.elapsed || '-') + ')'),
    '',
    'Total: ' + group.jobs.length + ' courses  |  ' +
      group.jobs.filter(j => j.status === 'success').length + ' succeeded  |  ' +
      group.jobs.filter(j => j.status !== 'success').length + ' failed',
    '',
    'Generated ' + new Date().toLocaleString() + ' for support / email use.',
  ].join('\n');
}

function exportBatchText(entry) {
  const groups    = orgGroups(entry);
  const succeeded = (entry.jobs || []).filter(j => j.status === 'success').length;
  return [
    'BULK RERUN COMPLETE SUMMARY',
    '='.repeat(60),
    'Job ID:     BR-' + (entry.batchId || entry.id.replace(/^recovered-/, '')),
    'Run ID:     ' + entry.targetRun,
    'Date:       ' + fmtDate(entry.createdAt),
    'Created by: ' + entry.createdBy,
    'Mode:       ' + modeLabel(entry) + (entry.progName ? '  -  ' + entry.progName : ''),
    'Status:     ' + statusLbl(entry.status),
    'Dry run:    ' + (entry.isDryRun ? 'Yes  -  no changes applied' : 'No'),
    'Courses:    ' + succeeded + '/' + (entry.jobs || []).length + ' succeeded',
    'Orgs:       ' + (entry.orgs?.join(', ') || '-'),
    '',
    ...groups.flatMap(g => [
      '='.repeat(60),
      'ORG: ' + g.orgName + ' (' + g.org + ')',
      '-'.repeat(40),
      ...g.jobs.map(j => '  ' + (j.status === 'success' ? '✓' : '✗') + ' ' + j.targetKey + '   (' + (j.elapsed || '-') + ')'),
      '  Summary: ' + g.jobs.filter(j => j.status === 'success').length + '/' + g.jobs.length + ' succeeded',
      '',
    ]),
    'Generated ' + new Date().toLocaleString() + ' for support / email / ticket use.',
  ].join('\n');
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HistoryView({ entries, onView, onNewRun }) {
  const allEntries = [...entries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const [expandedIds,  setExpandedIds]  = useState(new Set());
  const [allExpanded,  setAllExpanded]  = useState(false);
  const [expandedOrg,  setExpandedOrg]  = useState({});
  const [copied, setCopied] = useState(null);

  const copy = async (text, id) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2500); }
    catch (_e) { /* modern browsers only */ }
  };

  return (
    <div>
      {/* Header */}
      <div className="hv-header">
        <div>
          <div className="hv-header-title">Run History</div>
          <div className="hv-header-subtitle">
            {allEntries.length + ' bulk run' + (allEntries.length !== 1 ? 's' : '') + ' on record - sorted newest first'}
          </div>
        </div>
        <div className="hv-header-actions">
          {allEntries.length > 0 && (
            <Button
              variant="outline-primary"
              onClick={() => {
                if (allExpanded) {
                  setExpandedIds(new Set());
                  setAllExpanded(false);
                } else {
                  setExpandedIds(new Set(allEntries.map(e => e.id)));
                  setAllExpanded(true);
                }
              }}
            >
              {allExpanded ? 'Collapse All Summary' : 'Expand All Summary'}
            </Button>
          )}
          <Button variant="primary" onClick={onNewRun}>+ New Bulk Run</Button>
        </div>
      </div>

      {/* Empty state */}
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

      {/* Entry list */}
      {allEntries.map(entry => {
        const st        = entry.status;
        const isOpen    = expandedIds.has(entry.id);
        const groups    = orgGroups(entry);
        const succeeded = (entry.jobs || []).filter(j => j.status === 'success').length;
        const failed    = (entry.jobs || []).length - succeeded;
        const slbl      = statusLbl(st);
        const bv        = BADGE_V[st] || 'light';

        return (
          <div key={entry.id} className="hv-entry">
            {/* Entry row */}
            <div className="hv-entry-row">
              <div className={`hv-entry-dot hv-entry-dot--${st}`} />

              <div className="hv-entry-info">
                <div className="hv-entry-top">
                  <span className="hv-entry-id">{'BR-' + (entry.batchId || entry.id.replace(/^recovered-/, '')).replace(/-/g, '').slice(0, 8).toUpperCase()}</span>
                  <Badge variant={bv} pill className="hv-entry-badge">{slbl}</Badge>
                  {entry.isDryRun && <Badge variant="info" pill className="hv-entry-badge">DRY RUN</Badge>}
                  <span className="hv-entry-mode">{modeLabel(entry) + (entry.progName ? '  -  ' + entry.progName : '')}</span>
                </div>
                <div className="hv-entry-meta">
                  <span>{fmtDateShort(entry.createdAt)}</span>
                  <span>{entry.createdBy}</span>
                  <span>{'Run: ' + entry.targetRun}</span>
                  <span>{(entry.orgs?.length || 0) + ' org' + (entry.orgs?.length !== 1 ? 's' : '')}</span>
                  <span className={succeeded > 0 ? 'hv-entry-ok--has' : 'hv-entry-ok'}>{succeeded + ' ok'}</span>
                  {failed > 0 && <span className="hv-entry-fail">{failed + ' failed'}</span>}
                </div>
              </div>

              <div className="hv-entry-actions">
                <Button variant="tertiary" size="sm" onClick={() => copy(exportBatchText(entry), 'all-' + entry.id)}>
                  {copied === 'all-' + entry.id ? 'Copied!' : 'Export all'}
                </Button>
                <Button variant="outline-primary" size="sm" onClick={() => onView(entry)}>View details</Button>
                <Button variant="tertiary" size="sm" onClick={() => setExpandedIds(prev => { const n = new Set(prev); isOpen ? n.delete(entry.id) : n.add(entry.id); return n; })}>
                  {isOpen ? 'Hide' : 'Summary'}
                </Button>
              </div>
            </div>

            {/* Expandable org summary */}
            {isOpen && (
              <div className="hv-summary">
                {groups.map(g => {
                  const gKey       = entry.id + '-' + g.org;
                  const gOpen      = expandedOrg[gKey] !== false;
                  const gSucceeded = g.jobs.filter(j => j.status === 'success').length;
                  const gFailed    = g.jobs.length - gSucceeded;
                  return (
                    <div key={g.org} className="hv-org">
                      <div className={`hv-org-header${gFailed > 0 ? ' hv-org-header--fail' : ''}`}>
                        <div
                          className="hv-org-header-inner"
                          onClick={() => setExpandedOrg(p => ({ ...p, [gKey]: !gOpen }))}
                        >
                          <span className="hv-org-name">{g.orgName}</span>
                          <span className="hv-org-code">{g.org}</span>
                          <span className={`hv-org-count${gFailed > 0 ? ' hv-org-count--fail' : ''}`}>
                            {gSucceeded + '/' + g.jobs.length + ' succeeded'}
                          </span>
                          <span className="hv-org-chevron">{gOpen ? '▲' : '▼'}</span>
                        </div>
                        <Button variant="tertiary" size="sm" onClick={() => copy(exportOrgText(entry, g), gKey)}>
                          {copied === gKey ? 'Copied!' : 'Export org'}
                        </Button>
                      </div>

                      {gOpen && (
                        <div className="hv-courses">
                          {g.jobs.map((j, ji) => (
                            <div key={ji} className={`hv-course${j.status !== 'success' ? ' hv-course--fail' : ''}`}>
                              <span className={`hv-course-icon${j.status !== 'success' ? ' hv-course-icon--fail' : ''}`}>
                                {j.status === 'success' ? '✓' : '✗'}
                              </span>
                              <div className="hv-course-info">
                                <div className="hv-course-name">{j.name || j.targetKey}</div>
                                <div className="hv-course-key">{j.srcKey + ' -> ' + j.targetKey}</div>
                              </div>
                              <span className="hv-course-elapsed">{j.elapsed || '-'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Batch export footer */}
                <div className="hv-batch-footer">
                  <span className="hv-batch-footer-text">
                    Export individual org summaries above, or copy the full batch report:
                  </span>
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() => copy(exportBatchText(entry), 'all2-' + entry.id)}
                  >
                    {copied === 'all2-' + entry.id ? 'Copied to clipboard!' : 'Copy full batch report'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
