// Converts the StepConfigure cfg object into the POST /batches/ request body.
// team_members is flattened to a single array (one entry per person per org)
// because the API expects a flat list, not a nested object keyed by org.
import { makeKey } from './courseKeys';

const FROM_MODE_TO_API: Record<string, string> = {
  course:   'individual',
  program:  'program_rerun',
  new_org:  'new_org',
};

// DRF DateTimeField with USE_TZ=True requires full ISO 8601 with timezone.
// Date-only strings (e.g. "2026-08-01") are rejected as timezone-naive.
const toIso = (d: string | undefined): string => {
  if (!d) return '';
  return d.includes('T') ? d : d + 'T00:00:00Z';
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildBatchPayload(cfg: any, isDryRun = false) {
  const {
    rows = [],
    runId,
    sched = {},
    certs = {},
    orgRosters = {},
    removeOp = true,
    gating = {},
    fromMode = 'course',
  } = cfg;

  return {
    mode: FROM_MODE_TO_API[fromMode] ?? 'individual',
    is_dry_run: isDryRun,
    target_run: runId,
    courses: rows.map((r: any) => ({
      source_course_key: makeKey(r.srcOrg, r.srcNum, r.srcRun),
      target_course_key: makeKey(r.org, r.num, r.run),
      job_type: r.isNewOrg ? 'new_org' : 'individual',
    })),
    settings: {
      course_start:             toIso(sched.start),
      course_end:               toIso(sched.end),
      enrollment_start:         toIso(sched.enrollStart),
      enrollment_end:           toIso(sched.enrollEnd),
      pacing:                   sched.pacing,
      course_mode:              certs.mode,
      cert_display:             certs.display,
      create_cert:              certs.create,
      student_gen_cert:         certs.studentGenCert,
      cert_on_dashboard:        certs.certOnDashboard,
      gating_mode:              gating.mode,
      gating_template_id:       gating.templateId ?? '',
      remove_provisioner_after: removeOp,
    },
    team_members: Object.entries(orgRosters)
      .flatMap(([_org, members]: [string, any[]]) =>
        members
          .filter((m: any) => m.email && m.email.includes('@'))
          .map((m: any) => ({
            email:           m.email,
            studio_role:     m.studio,
            discussion_role: m.discussion,
          }))
      ),
  };
}
