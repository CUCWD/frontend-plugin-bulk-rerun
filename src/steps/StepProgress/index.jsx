// Tracking → Current tab. Lists all active jobs from hookstate.
// JobProgress is always mounted (visibility toggled via display:none, not conditional
// render) so the simulation timer keeps running when a job card is collapsed.
// key={job.id + '-' + job.isDry} remounts JobProgress when a dry-run is promoted to real.
import { Button, Badge, Form } from '@openedx/paragon';

import { useBulkRerunState } from '../../state';
import JobProgress from '../../tracking/JobProgress';
import './index.scss';

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
      <div className="sp-empty">
        <div className="sp-empty-icon">📊</div>
        <div className="sp-empty-title">No active runs</div>
        <div className="sp-empty-sub">
          Start a bulk run from the wizard. Progress will appear here in real time.
        </div>
        <Button variant="primary" onClick={onGoWizard}>Go to Bulk Run Wizard</Button>
      </div>
    );
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="sp-filter-bar">
        <span className="sp-filter-count">
          {activeJobs.length + ' active run' + (activeJobs.length !== 1 ? 's' : '')}
        </span>
        <div className="sp-filter-right">
          <span className="sp-filter-label">Filter by user:</span>
          <Form.Control
            as="select"
            size="sm"
            value={jobUserFilter}
            onChange={e => setJobUserFilter(e.target.value)}
            className="sp-filter-select"
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
        <div className="sp-no-match">
          {'No active runs for '}
          <strong>{jobUserFilter}</strong>
          {'.'}
          <Button variant="tertiary" size="sm" onClick={() => setJobUserFilter('')} style={{ marginLeft: 8 }}>Show all</Button>
        </div>
      )}

      {activeJobs.map(job => {
        if (jobUserFilter && job.createdBy !== jobUserFilter) return null;
        const isExpanded = jobsExpanded[String(job.id)] !== false;

        return (
          <div key={job.id} className="sp-job-card">
            {/* Collapsible job header */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div
              className={`sp-job-header sp-job-header--${isExpanded ? 'expanded' : 'collapsed'}`}
              onClick={() => toggleJobExpanded(job.id)}
            >
              <span className="sp-job-id">{'BR-' + (job.batchId ? job.batchId.replace(/-/g, '').slice(0, 8).toUpperCase() : job.id)}</span>
              {job.isDry && <Badge variant="warning" pill>DRY RUN</Badge>}
              <span className="sp-job-meta">
                <span className="sp-job-meta-date">{fmtDate(job.createdAt)}</span>
                <span className="sp-job-meta-sep">·</span>
                <span className="sp-job-meta-user">{job.createdBy}</span>
              </span>
              <div className="sp-job-spacer" />
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
                className="sp-dismiss-btn"
                onClick={e => { e.stopPropagation(); removeActiveJob(job.id); }}
              >
                Dismiss
              </Button>
            </div>

            {/*
              JobProgress is ALWAYS mounted so the simulation keeps running
              when the header is collapsed. Use display:none, NOT conditional render.
              key={job.id + "-" + job.isDry} triggers remount when dry->real.
            */}
            <div className="sp-job-body" style={{ display: isExpanded ? 'block' : 'none' }}>
              <JobProgress
                key={job.id + '-' + job.isDry}
                cfg={job.cfg}
                jobId={job.id}
                batchId={job.batchId ?? null}
                isPending={job.isPending ?? false}
                isDryRun={job.isDry}
                createdBy={job.createdBy}
                createdAt={job.createdAt}
                onSaveHistory={onSaveHistory}
                onComplete={() => {}}
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
