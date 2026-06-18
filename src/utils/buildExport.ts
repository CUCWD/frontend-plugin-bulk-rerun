// Shared plain-text report builder for "Export report" clipboard output.
// Used by both JobProgress (live view) and HistoryView (history entries).
//
// Callers normalise their local state into ExportEntry before calling buildExport().

const MODE_LBL: Record<string, string> = {
  program: 'By Program',
  neworg:  'New Organization',
  course:  'By Individual Course',
};

const STATUS_TXT: Record<string, string> = {
  succeeded: 'Complete',
  partial:   'Partial failures',
  failed:    'Failed',
  running:   'In progress',
};

const CERT_DISP_LBL: Record<string, string> = {
  early_no_info:   'Immediately upon passing',
  early_with_info: 'Immediately with course info',
  end:             'After course end date',
};

const GATING_LBL: Record<string, string> = {
  copy:     'Copy from source',
  custom:   'Custom map',
  disabled: 'Disabled',
};

const ICON: Record<string, string> = {
  success: '[✓]',
  failed:  '[✗]',
  running: '[…]',
  pending: '[○]',
};

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleString(); } catch (_) { return iso || ''; }
};

export interface ExportJob {
  org:        string;
  name:       string;
  srcKey:     string;
  targetKey:  string;
  status:     string;
  elapsed:    string;
  logs:       Array<{ lv: string; msg: string }>;
  failReason: string | null;
}

export interface ExportEntry {
  batchId:   string | null;
  isDryRun:  boolean;
  createdAt: string;
  createdBy: string;
  mode:      string;
  progName:  string | null;
  targetRun: string;
  status:    string;
  orgs:      string[];
  cfg:       {
    runId?:     string;
    sched?:     { start?: string; end?: string; enrollStart?: string; enrollEnd?: string; pacing?: string };
    certs?:     { mode?: string; display?: string };
    gating?:    { mode?: string; minScore?: string; minComplete?: string };
    removeOp?:  boolean;
  } | null;
  jobs: ExportJob[];
}

export function buildExport(entry: ExportEntry): string {
  const ml      = MODE_LBL[entry.mode] || entry.mode;
  const orgs    = entry.orgs?.length
    ? entry.orgs
    : [...new Set(entry.jobs.map(j => j.org))].sort((a, b) => a.localeCompare(b));

  const lines: string[] = [
    'BULK COURSE RERUN SUMMARY',
    '═'.repeat(60),
    'Batch ID:    ' + (entry.isDryRun ? 'DRY-RUN' : (entry.batchId || '-')),
    'Date:        ' + fmtDate(entry.createdAt),
    'Created by:  ' + (entry.createdBy || '-'),
    'Mode:        ' + ml + (entry.progName ? '  -  ' + entry.progName : ''),
    'Target run:  ' + (entry.targetRun || '-'),
    'Dry run:     ' + (entry.isDryRun ? 'Yes' : 'No'),
    'Status:      ' + (STATUS_TXT[entry.status] || entry.status || 'In progress'),
    'Courses:     ' + entry.jobs.length + ' total across ' + orgs.length + ' org' + (orgs.length !== 1 ? 's' : ''),
    '',
  ];

  const cfg = entry.cfg;
  if (cfg?.sched) {
    const certs  = cfg.certs  || {};
    const gating = cfg.gating || {};
    const sched  = cfg.sched;
    const gatingStr = (GATING_LBL[gating.mode || ''] || gating.mode || '-')
      + (gating.mode === 'custom' ? ` (${gating.minScore ?? '80'}% score, ${gating.minComplete ?? '100'}% completion)` : '');
    lines.push(
      'SETTINGS',
      '─'.repeat(60),
      'Scheduling:   ' + (sched.start || '-') + ' → ' + (sched.end || '-'),
      'Enrollment:   ' + (sched.enrollStart || '-') + ' → ' + (sched.enrollEnd || '-'),
      'Pacing:       ' + (sched.pacing === 'self' ? 'Self-paced' : 'Instructor-paced'),
      'Course mode:  ' + (certs.mode ? certs.mode.charAt(0).toUpperCase() + certs.mode.slice(1) : '-'),
      'Cert display: ' + (CERT_DISP_LBL[certs.display || ''] || certs.display || '-'),
      'Gating:       ' + gatingStr,
      'Remove provisioner: ' + (cfg.removeOp ? 'Yes' : 'No'),
      '',
    );
  }

  lines.push('COURSES', '─'.repeat(60));
  orgs.forEach(orgCode => {
    const orgJobs = entry.jobs
      .filter(j => j.org === orgCode)
      .sort((a, b) => (a.targetKey || '').localeCompare(b.targetKey || ''));
    lines.push('', '-- ' + orgCode + ' ' + '-'.repeat(Math.max(0, 48 - orgCode.length)));
    orgJobs.forEach(j => {
      const icon    = ICON[j.status] || '[○]';
      const elapsed = j.elapsed ? '  (' + j.elapsed + ')' : '';
      lines.push(icon + ' ' + (j.name || j.targetKey) + elapsed);
      lines.push('    Source:  ' + (j.srcKey || '-'));
      lines.push('    Target:  ' + (j.targetKey || '-'));
      if (j.status === 'failed') {
        const firstErr = (j.logs || []).find(l => l.lv === 'err' || l.lv === 'error');
        if (firstErr) lines.push('    Error:   ' + firstErr.msg);
        else if (j.failReason) lines.push('    Error:   ' + j.failReason);
      }
      if ((j.logs || []).length > 0) {
        lines.push('    Logs:');
        j.logs.forEach(l => lines.push('      [' + l.lv + ']  ' + l.msg));
      }
      lines.push('');
    });
  });
  lines.push('');
  return lines.join('\n');
}
