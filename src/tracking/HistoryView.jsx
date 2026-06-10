// Tracking → History tab. Shows completed bulk runs sorted newest-first.
// Each entry expands to show per-org course breakdowns with individual org-level
// and full-batch plain-text exports (for support email use).
// History is stored in hookstate and persisted to localStorage via state.saveHistory().
import { useState } from 'react';
import { Button, Badge } from '@openedx/paragon';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BRAND    = '#006daa';
const BRAND_LT = '#deeef8';
const SUCCESS  = '#178253';
const SUCCESS_BG = '#d4edda';
const DANGER   = '#c32d3a';
const DANGER_BG = '#fdf0f1';
const WARNING  = '#856404';
const WARNING_BG = '#fff8e6';
const INFO     = '#055160';
const INFO_BG  = '#e8f7fc';
const G50      = '#f8f9fa';
const G100     = '#f0f0f0';
const G200     = '#e0e0e0';
const G400     = '#9e9e9e';
const G500     = '#6c757d';
const G700     = '#454545';
const G900     = '#1f2937';
const BORDER   = '#dee2e6';
const WHITE    = '#fff';
const MONO     = '"SFMono-Regular","Courier New",monospace';

const fmtDate      = iso => { try { return new Date(iso).toLocaleString(); }          catch (_e) { return iso || ''; } };
const fmtDateShort = iso => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (_e) { return iso || ''; } };

// Hoisted maps — avoids object-literal subscript inline in JSX
const STATUS_BG = { succeeded: SUCCESS_BG, partial: WARNING_BG, failed: DANGER_BG, running: BRAND_LT };
const STATUS_C  = { succeeded: SUCCESS,    partial: WARNING,    failed: DANGER,    running: BRAND };
const STATUS_LBL = { succeeded: 'Succeeded', partial: 'Partial', failed: 'Failed', running: 'Running' };
const BADGE_V   = { succeeded: 'success', partial: 'warning', failed: 'danger', running: 'primary' };
const MODE_LABELS = { program: 'By Program', neworg: 'New Org', course: 'By Course', individual: 'Individual' };

function statusBg(s)  { return STATUS_BG[s]  || G200; }
function statusC(s)   { return STATUS_C[s]   || G500; }
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
    'Job ID:     BR-' + entry.id,
    'Run ID:     ' + entry.targetRun,
    'Date:       ' + fmtDate(entry.createdAt),
    'Created by: ' + entry.createdBy,
    'Mode:       ' + modeLabel(entry) + (entry.progName ? '  -  ' + entry.progName : ''),
    'Dry run:    ' + (entry.isDryRun ? 'Yes  -  no changes applied' : 'No'),
    '',
    'Course Changes:',
    ...group.jobs.map(j => '  ' + (j.status === 'success' ? 'v' : 'x') + ' ' + j.srcKey + '\n       -> ' + j.targetKey + '   (' + (j.elapsed || '-') + ')'),
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
    'Job ID:     BR-' + entry.id,
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
      ...g.jobs.map(j => '  ' + (j.status === 'success' ? 'v' : 'x') + ' ' + j.targetKey + '   (' + (j.elapsed || '-') + ')'),
      '  Summary: ' + g.jobs.filter(j => j.status === 'success').length + '/' + g.jobs.length + ' succeeded',
      '',
    ]),
    'Generated ' + new Date().toLocaleString() + ' for support / email / ticket use.',
  ].join('\n');
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HistoryView({ entries, onView, onNewRun }) {
  const allEntries = [...entries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const [expandedId,  setExpandedId]  = useState(null);
  const [expandedOrg, setExpandedOrg] = useState({});
  const [copied, setCopied] = useState(null);

  const copy = async (text, id) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2500); }
    catch (_e) { /* modern browsers only */ }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: G900 }}>Run History</div>
          <div style={{ fontSize: 12, color: G500, marginTop: 2 }}>
            {allEntries.length + ' bulk run' + (allEntries.length !== 1 ? 's' : '') + ' on record - sorted newest first'}
          </div>
        </div>
        <Button variant="primary" onClick={onNewRun}>+ New Bulk Run</Button>
      </div>

      {/* Empty state */}
      {allEntries.length === 0 && (
        <div style={{ border: '1px solid ' + BORDER, borderRadius: 4, background: WHITE }}>
          <div style={{ padding: '3rem', textAlign: 'center', color: G500 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, color: G700 }}>No runs yet</div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>Completed bulk runs will appear here automatically.</div>
            <Button variant="primary" onClick={onNewRun}>Start first bulk run</Button>
          </div>
        </div>
      )}

      {/* Entry list */}
      {allEntries.map(entry => {
        const st        = entry.status;
        const isOpen    = expandedId === entry.id;
        const groups    = orgGroups(entry);
        const succeeded = (entry.jobs || []).filter(j => j.status === 'success').length;
        const failed    = (entry.jobs || []).length - succeeded;
        const sbg       = statusBg(st);
        const sc        = statusC(st);
        const slbl      = statusLbl(st);
        const bv        = BADGE_V[st] || 'light';

        return (
          <div key={entry.id} style={{ border: '1px solid ' + BORDER, borderRadius: 4, marginBottom: 12, overflow: 'hidden', background: WHITE }}>
            {/* Entry row */}
            <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: sc, flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: G900, fontFamily: MONO }}>{'BR-' + entry.id}</span>
                  <Badge variant={bv} pill style={{ fontSize: 11, lineHeight: 1.5 }}>{slbl}</Badge>
                  {entry.isDryRun && <Badge variant="info" pill style={{ fontSize: 11, lineHeight: 1.5 }}>DRY RUN</Badge>}
                  <span style={{ fontSize: 12, color: G500 }}>{modeLabel(entry) + (entry.progName ? '  -  ' + entry.progName : '')}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 12, color: G500, flexWrap: 'wrap' }}>
                  <span>{fmtDateShort(entry.createdAt)}</span>
                  <span>{entry.createdBy}</span>
                  <span>{'Run: ' + entry.targetRun}</span>
                  <span>{(entry.orgs?.length || 0) + ' org' + (entry.orgs?.length !== 1 ? 's' : '')}</span>
                  <span style={{ color: succeeded > 0 ? SUCCESS : G400 }}>{succeeded + ' ok'}</span>
                  {failed > 0 && <span style={{ color: DANGER }}>{failed + ' failed'}</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={() => copy(exportBatchText(entry), 'all-' + entry.id)}
                >
                  {copied === 'all-' + entry.id ? 'Copied!' : 'Export all'}
                </Button>
                <Button variant="outline-primary" size="sm" onClick={() => onView(entry)}>View details</Button>
                <Button variant="tertiary" size="sm" onClick={() => setExpandedId(isOpen ? null : entry.id)}>
                  {isOpen ? 'Hide' : 'Summary'}
                </Button>
              </div>
            </div>

            {/* Expandable org summary */}
            {isOpen && (
              <div style={{ borderTop: '1px solid ' + BORDER }}>
                {groups.map(g => {
                  const gKey       = entry.id + '-' + g.org;
                  const gOpen      = expandedOrg[gKey] !== false;
                  const gSucceeded = g.jobs.filter(j => j.status === 'success').length;
                  const gFailed    = g.jobs.length - gSucceeded;
                  return (
                    <div key={g.org} style={{ borderBottom: '1px solid ' + BORDER }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', background: G50, borderLeft: '4px solid ' + (gFailed > 0 ? DANGER : SUCCESS) }}>
                        <div
                          onClick={() => setExpandedOrg(p => ({ ...p, [gKey]: !gOpen }))}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, cursor: 'pointer' }}
                        >
                          <span style={{ fontWeight: 600, fontSize: 13, color: G900 }}>{g.orgName}</span>
                          <span style={{ fontSize: 11, fontFamily: MONO, color: G500 }}>{g.org}</span>
                          <span style={{ fontSize: 12, color: gFailed > 0 ? DANGER : SUCCESS }}>
                            {gSucceeded + '/' + g.jobs.length + ' succeeded'}
                          </span>
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: G400 }}>{gOpen ? '▲' : '▼'}</span>
                        </div>
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={() => copy(exportOrgText(entry, g), gKey)}
                        >
                          {copied === gKey ? 'Copied!' : 'Export org'}
                        </Button>
                      </div>

                      {gOpen && (
                        <div style={{ background: WHITE }}>
                          {g.jobs.map((j, ji) => (
                            <div
                              key={ji}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '6px 18px 6px 26px',
                                borderBottom: ji < g.jobs.length - 1 ? ('1px solid ' + G100) : 'none',
                                background: j.status !== 'success' ? '#fff5f5' : WHITE,
                              }}
                            >
                              <span style={{ color: j.status === 'success' ? SUCCESS : DANGER, fontSize: 13, flexShrink: 0 }}>
                                {j.status === 'success' ? 'v' : 'x'}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: G700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {j.name || j.targetKey}
                                </div>
                                <div style={{ fontSize: 11, color: G400, fontFamily: MONO }}>
                                  {j.srcKey + ' -> ' + j.targetKey}
                                </div>
                              </div>
                              <span style={{ fontSize: 11, color: G400, flexShrink: 0 }}>{j.elapsed || '-'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Batch export footer */}
                <div style={{ padding: '10px 18px', background: G50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 12, color: G500 }}>
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
