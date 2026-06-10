// Tracking → Current tab. Lists all active jobs from hookstate.
// JobProgress is always mounted (visibility toggled via display:none, not conditional
// render) so the simulation timer keeps running when a job card is collapsed.
// key={job.id + '-' + job.isDry} remounts JobProgress when a dry-run is promoted to real.
import { Button, Badge, Form } from '@openedx/paragon';

import { useBulkRerunState } from '../../state';
import JobProgress from '../../tracking/JobProgress';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BRAND    = '#006daa';
const SUCCESS  = '#178253';
const DANGER   = '#c32d3a';
const WARNING  = '#856404';
const WARNING_BG = '#fff8e6';
const G50      = '#f8f9fa';
const G500     = '#6c757d';
const G700     = '#454545';
const G900     = '#1f2937';
const BORDER   = '#dee2e6';
const WHITE    = '#fff';
const MONO     = '"SFMono-Regular","Courier New",monospace';

const fmtDate = iso => { try { return new Date(iso).toLocaleString(); } catch (_e) { return iso || ''; } };

export default function StepProgress({ onGoWizard, onSaveHistory }) {
  const {
    activeJobs,
    removeActiveJob,
    flipActiveJobDry,
    jobsExpanded,
    toggleJobExpanded,
    jobUserFilter,
    setJobUserFilter,
    softReset,
    setBulkView,
  } = useBulkRerunState();

  const visibleJobs = jobUserFilter
    ? activeJobs.filter(j => j.createdBy === jobUserFilter)
    : activeJobs;

  const uniqueUsers = [...new Set(activeJobs.map(j => j.createdBy))].sort();

  if (activeJobs.length === 0) {
    return (
      <div style={{ border: '1px solid ' + BORDER, borderRadius: 4, background: WHITE }}>
        <div style={{ padding: '3rem', textAlign: 'center', color: G500 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4, color: G700 }}>No active runs</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>
            Start a bulk run from the wizard. Progress will appear here in real time.
          </div>
          <Button variant="primary" onClick={onGoWizard}>Go to Bulk Run Wizard</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: G700, fontWeight: 500 }}>
          {activeJobs.length + ' active run' + (activeJobs.length !== 1 ? 's' : '')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span style={{ fontSize: 12, color: G500 }}>Filter by user:</span>
          <Form.Control
            as="select"
            size="sm"
            value={jobUserFilter}
            onChange={e => setJobUserFilter(e.target.value)}
            style={{ minWidth: 180 }}
          >
            <option value="">{'All users (' + activeJobs.length + ')'}</option>
            {uniqueUsers.map(u => (
              <option key={u} value={u}>
                {u + ' (' + activeJobs.filter(j => j.createdBy === u).length + ')'}
              </option>
            ))}
          </Form.Control>
          {jobUserFilter && (
            <Button variant="tertiary" size="sm" onClick={() => setJobUserFilter('')}>Clear</Button>
          )}
        </div>
      </div>

      {jobUserFilter && visibleJobs.length === 0 && (
        <div style={{ border: '1px solid ' + BORDER, borderRadius: 4, background: WHITE }}>
          <div style={{ padding: '2rem', textAlign: 'center', color: G500, fontSize: 13 }}>
            {'No active runs for '}
            <strong>{jobUserFilter}</strong>
            {'.'}
            <Button variant="tertiary" size="sm" onClick={() => setJobUserFilter('')} style={{ marginLeft: 8 }}>Show all</Button>
          </div>
        </div>
      )}

      {activeJobs.map(job => {
        if (jobUserFilter && job.createdBy !== jobUserFilter) return null;
        const isExpanded = jobsExpanded[String(job.id)] !== false;
        const borderRadius = isExpanded ? '4px 4px 0 0' : '4px';

        return (
          <div key={job.id} style={{ marginBottom: 16 }}>
            {/* Collapsible job header */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', background: G50,
                border: '1px solid ' + BORDER, borderRadius,
                cursor: 'pointer',
              }}
              onClick={() => toggleJobExpanded(job.id)}
            >
              <span style={{ fontWeight: 600, fontSize: 13, fontFamily: MONO, color: G900 }}>
                {'BR-' + job.id}
              </span>
              {job.isDry && (
                <Badge variant="warning" pill style={{ fontSize: 10, lineHeight: 1.5 }}>DRY RUN</Badge>
              )}
              <span style={{ fontSize: 12, color: G500 }}>
                {fmtDate(job.createdAt) + ' - ' + job.createdBy}
              </span>
              <div style={{ flex: 1 }} />
              <Button
                variant="tertiary"
                size="sm"
                onClick={e => { e.stopPropagation(); toggleJobExpanded(job.id); }}
              >
                {isExpanded ? 'Collapse' : 'Expand'}
              </Button>
              <Button
                variant="tertiary"
                size="sm"
                style={{ color: DANGER }}
                onClick={e => { e.stopPropagation(); removeActiveJob(job.id); }}
              >
                Dismiss
              </Button>
            </div>

            {/*
              Step4 is ALWAYS mounted here so the simulation keeps running
              when the job header is collapsed. Use display:none, NOT conditional render.
              key={job.id + "-" + job.isDry} triggers remount when dry->real.
            */}
            <div
              style={{
                display: isExpanded ? 'block' : 'none',
                border: '1px solid ' + BORDER, borderTop: 'none',
                borderRadius: '0 0 4px 4px', padding: 20, background: WHITE,
              }}
            >
              <JobProgress
                key={job.id + '-' + job.isDry}
                cfg={job.cfg}
                jobId={job.id}
                batchId={job.batchId ?? null}
                isDryRun={job.isDry}
                createdBy={job.createdBy}
                createdAt={job.createdAt}
                onSaveHistory={onSaveHistory}
                onComplete={() => { if (!job.isDry) removeActiveJob(job.id); }}
                onNew={() => { softReset(); setBulkView('wizard'); }}
                onExecute={() => flipActiveJobDry(job.id)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
