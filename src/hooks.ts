// TanStack Query wrappers for the Studio bulk-rerun REST API.
// useValidateCourseKeys — POST /validate/            checks which target keys already exist on the platform.
// useCreateBatch        — POST /batches/             submits a new job to the backend.
// useCancelBatch        — POST /batches/:id/cancel/  cancels a pending/running batch.
// useBatch              — GET  /batches/:id/         polls every 5 s (include_logs=false — status only);
//                                                    stops when the job reaches a terminal status.
// useRunningBatches     — GET  /batches/?status=...  fetches ALL users' in-progress batches (shared tracking
//                                                    view); polled so other operators' batches appear live.
// useOrgs               — GET  /organizations        fetches org short-names from Studio.
// usePrograms           — GET  discovery /api/v1/programs/?status=active  fetches active programs.
// useCourses            — GET  /courses              fetches up to 500 DEMO-run live courses.
// useJobLogs            — GET  /batches/:id/logs/    fetches log lines for a running job.
import { getConfig, camelCaseObject } from '@edx/frontend-platform';
import { getAuthenticatedHttpClient } from '@edx/frontend-platform/auth';
import { useQuery, useMutation } from '@tanstack/react-query';
import { makeKey, parseKeyParts } from './utils/courseKeys';

export type CourseApiItem = {
  courseKey: string;
  displayName: string;
  org: string;
  number: string;
  run: string;
};

export type ProgramApiItem = {
  uuid: string;
  title: string;
  courseRunKeys: string[];
};

const studioUrl = () => getConfig().STUDIO_BASE_URL as string;
const discoveryUrl = () => getConfig().DISCOVERY_API_BASE_URL as string;
const validateUrl = () => `${studioUrl()}/api/bulk-rerun/validate/`;
const batchesUrl = () => `${studioUrl()}/api/bulk-rerun/batches/`;
const batchUrl = (id: string) => `${batchesUrl()}${id}/`;
const logsUrl = (jobId: string, since?: number) => `${studioUrl()}/api/bulk-rerun/jobs/${jobId}/logs/${since ? `?since=${since}` : ''}`;

export const useValidateCourseKeys = () => useMutation({
  mutationFn: async (keys: string[]) => {
    const { data } = await getAuthenticatedHttpClient()
      .post(validateUrl(), { keys });
    return data.existing as string[];
  },
});

export const useCreateBatch = () => useMutation({
  mutationFn: async (payload: object) => {
    const { data } = await getAuthenticatedHttpClient()
      .post(batchesUrl(), payload);
    return data;
  },
});

const mapApiStatus = (s: string) => {
  if (s === 'succeeded') { return 'success'; }
  if (s === 'failed') { return 'failed'; }
  return 'pending';
};

// The batch-detail API's job payload carries only course keys, status, timing,
// and logs — org and display name are not job model fields. Derive the org from
// the target key (course-v1:ORG+NUM+RUN) and look display names up in the
// entry's config snapshot, mirroring what JobProgress does for its live view.
// Without this, exports/summaries group jobs under an undefined org and every
// org section renders empty.
const mapDetailJobs = (detail: any, entry?: any) => {
  const nameByTarget: Record<string, string> = {};
  ((entry?.cfg?.rows ?? []) as any[]).forEach((r: any) => {
    nameByTarget[makeKey(r.org, r.num, r.run)] = r.name;
  });
  return (detail.jobs || []).map((j: any, i: number) => {
    const targetKey = j.target_course_key || j.target_key || '';
    const org = j.org || parseKeyParts(targetKey).org;
    return {
      id: j.id ?? i,
      org,
      orgName: j.org_name || org,
      name: j.course_name || nameByTarget[targetKey] || '',
      srcKey: j.src_key || j.source_course_key || '',
      targetKey,
      position: j.position ?? i,
      // Rollback bookkeeping the History summary + Job details use to render
      // per-course rollback chips. Both are plain booleans from the API.
      courseCreated: !!j.course_created,
      rolledBack: !!j.rolled_back,
      status: mapApiStatus(j.status),
      elapsed: j.elapsed_seconds != null ? `${Number(j.elapsed_seconds).toFixed(1)}s` : '',
      logs: Array.isArray(j.logs)
        ? j.logs.map((l: any) => ({
          lv: l.level,
          msg: l.message,
          ts: new Date(l.created_at).toLocaleTimeString('en-US', { hour12: false }),
        }))
        : [],
      failReason: j.error_message || j.fail_reason || null,
    };
  });
};

const mapBatchSummary = (batch: any) => {
  const cfg = batch.config_json || {};
  const rows: any[] = cfg.rows || [];
  const orgsFromRows = [...new Set<string>(rows.map((r: any) => r.org).filter(Boolean))].sort();
  const orgsFromNewOrgs = (cfg.newOrgs || []).map((o: any) => o.code || '').filter(Boolean);
  return {
    id: `recovered-${batch.id}`,
    batchId: batch.id,
    createdAt: batch.created_at,
    createdBy: batch.created_by_username || '',
    mode: cfg.fromMode || 'course',
    progName: cfg.prog?.name || null,
    targetRun: cfg.runId || batch.target_run || '',
    isDryRun: batch.is_dry_run || false,
    status: batch.status,
    orgs: orgsFromRows.length > 0 ? orgsFromRows : orgsFromNewOrgs,
    cfg: cfg || null,
    jobs: [],
    rollbackStatus: batch.rollback_status || 'none',
    rolledBackAt: batch.rolled_back_at || null,
    createdCourses: batch.created_courses ?? 0,
  };
};

export const enrichEntry = (entry: any, detail: any) => ({ ...entry, jobs: mapDetailJobs(detail, entry) });

export const fetchBatchDetail = async (batchId: string) => {
  const { data } = await getAuthenticatedHttpClient().get(batchUrl(batchId));
  return data;
};

export const useServerHistory = () => useQuery({
  queryKey: ['bulk-rerun-history'],
  queryFn: async () => {
    const { data } = await getAuthenticatedHttpClient()
      .get(`${batchesUrl()}?status=${encodeURIComponent('succeeded,failed,partial')}`);
    return (data as any[]).map(mapBatchSummary);
  },
  staleTime: 0,
  refetchOnWindowFocus: false,
});

// Poll rollback progress for JUST the given batches (normally one) instead of
// re-fetching the whole history list: the list payload carries every batch's
// config_json snapshot, while the detail endpoint with include_logs=false is
// constant-size. Returns { [batchId]: rollback_status }. HistoryView watches
// the result and refreshes the history list once when a rollback terminates.
export const useRollbackProgress = (batchIds: string[]) => useQuery({
  queryKey: ['bulk-rerun-rollback-progress', [...batchIds].sort()],
  queryFn: async () => {
    const client = getAuthenticatedHttpClient();
    const results = await Promise.all(
      batchIds.map(id => client.get(`${batchUrl(id)}?include_logs=false`).then(r => r.data)),
    );
    return Object.fromEntries(
      results.map((b: any) => [b.id, b.rollback_status || 'none']),
    ) as Record<string, string>;
  },
  enabled: batchIds.length > 0,
  refetchInterval: 5000,
  refetchOnWindowFocus: false,
});

// Stop always rolls back: cancelling a batch also deletes every course it
// created so far (backend deletes only course_created=True jobs), so the
// user can immediately resubmit the batch with corrected settings.
export const useCancelBatch = () => useMutation({
  mutationFn: async (batchId: string) => {
    const { data } = await getAuthenticatedHttpClient()
      .post(`${batchUrl(batchId)}cancel/`, { rollback: true });
    return data;
  },
});

// Roll back a terminal batch from the History tab — deletes the courses the
// batch created (never courses it merely adopted). Returns 202; the history
// list is refetched to pick up rollback_status transitions.
export const useRollbackBatch = () => useMutation({
  mutationFn: async (batchId: string) => {
    const { data } = await getAuthenticatedHttpClient()
      .post(`${batchUrl(batchId)}rollback/`);
    return data;
  },
});

// Fetch in-flight batches for ALL users, filtered by status — the tracking page
// is a shared view of every operator's runs. Used by StepProgress to restore
// jobs after a page refresh and to surface batches started by other users.
// Polled every 15 s so another operator's new batch appears without a reload.
export const useRunningBatches = (statusFilter = 'running,pending') => useQuery({
  queryKey: ['bulk-rerun-batches-running', statusFilter],
  queryFn: async () => {
    const { data } = await getAuthenticatedHttpClient()
      .get(`${batchesUrl()}?status=${encodeURIComponent(statusFilter)}`);
    return data as any[];
  },
  staleTime: 0,
  refetchOnWindowFocus: true,
  refetchInterval: 15000,
});

// pollingEnabled lets useBatchSync disable fetching once it has detected a
// terminal state, without changing the query key (so cached data is preserved).
// includeLogs=false requests the constant-size status payload (no nested log
// lines); log lines are then fetched incrementally per job via fetchJobLogs.
export const useBatch = (batchId: string | null, pollingEnabled = true, includeLogs = true) => useQuery({
  queryKey: ['bulk-rerun-batch', batchId, includeLogs],
  queryFn: async () => {
    const { data } = await getAuthenticatedHttpClient()
      .get(`${batchUrl(batchId!)}${includeLogs ? '' : '?include_logs=false'}`);
    return data;
  },
  enabled: !!batchId && pollingEnabled,
  // Stop retrying on 404 — the batch was rolled back (e.g. task failed inside
  // an atomic block with CELERY_ALWAYS_EAGER) and will never appear.
  retry: (failureCount: number, error: any) => {
    if (error?.response?.status === 404) { return false; }
    return failureCount < 3;
  },
  refetchInterval: pollingEnabled ? 5000 : false,
});

const coursesUrl = (search = '') => `${studioUrl()}/api/contentstore/v1/home/courses${search}`;

// Active programs from course-discovery — GET DISCOVERY_API_BASE_URL/api/v1/programs/?status=active
// Returns [] when DISCOVERY_API_BASE_URL is not configured.
export const usePrograms = (options?: { enabled?: boolean }) => useQuery({
  queryKey: ['bulk-rerun-programs'],
  queryFn: async (): Promise<ProgramApiItem[]> => {
    const base = discoveryUrl();
    if (!base) { return []; }
    const { data } = await getAuthenticatedHttpClient()
      .get(`${base}/api/v1/programs/?status=active&page_size=50`);
    const normalised = camelCaseObject(data);
    const results = (normalised.results ?? []) as any[];
    return results.map((p: any) => ({
      uuid: p.uuid,
      title: p.title,
      courseRunKeys: (p.courses ?? []).flatMap((c: any) => (c.courseRuns ?? []).map((r: any) => r.key)),
    }));
  },
  enabled: options?.enabled ?? true,
  staleTime: 300_000,
});

export type OrgApiItem = {
  name: string;
  shortName: string;
};

// Destination orgs — GET ${LMS_BASE_URL}/api/organizations/v0/organizations/
// Returns objects with both display name and short_name.
// The endpoint paginates at 20 per page, so we follow `next` until exhausted.
export const useOrgs = () => useQuery({
  queryKey: ['bulk-rerun-orgs'],
  queryFn: async (): Promise<OrgApiItem[]> => {
    const lmsUrl = getConfig().LMS_BASE_URL as string;
    const client = getAuthenticatedHttpClient();
    const allItems: any[] = [];
    let url: string | null = `${lmsUrl}/api/organizations/v0/organizations/`;
    while (url) {
      // Pages must be fetched sequentially: each response's `next` URL is the
      // only way to reach the following page, so there is nothing to parallelise.
      // eslint-disable-next-line no-await-in-loop
      const { data } = await client.get(url);
      const normalised = camelCaseObject(data) as any;
      const items: any[] = Array.isArray(normalised) ? normalised : (normalised.results ?? []);
      allItems.push(...items);
      url = Array.isArray(normalised) ? null : (normalised.next ?? null);
    }
    return allItems.map((o: any) => ({ name: o.name || o.shortName, shortName: o.shortName }));
  },
  staleTime: 300_000,
});

export const useCourses = (search = '', options?: { enabled?: boolean }) => useQuery({
  queryKey: ['bulk-rerun-courses', search],
  queryFn: async (): Promise<CourseApiItem[]> => {
    // Fetch up to 500 courses; for very large installs add pagination later.
    const { data } = await getAuthenticatedHttpClient()
      .get(coursesUrl('?page_size=500'));
    // v1 returns { courses: [...] } or { results: [...] } depending on version
    const normalised = camelCaseObject(data);
    const all = (normalised.courses ?? normalised.results ?? []) as CourseApiItem[];
    return all.filter(c => c.run.toUpperCase().includes('DEMO'));
  },
  staleTime: 60_000,
  enabled: options?.enabled ?? true,
});

// POST ${LMS_BASE_URL}/api/user/v1/accounts/search_emails
// Returns the set of emails that resolve to an existing platform account.
export const useSearchEmails = () => useMutation({
  mutationFn: async (emails: string[]): Promise<Set<string>> => {
    const lmsUrl = getConfig().LMS_BASE_URL as string;
    const normalised = emails.map(e => e.toLowerCase());
    const { data } = await getAuthenticatedHttpClient()
      .post(`${lmsUrl}/api/user/v1/accounts/search_emails`, { emails: normalised });
    const items: any[] = Array.isArray(data) ? data : [];
    return new Set(items.map((u: any) => (u.email as string).toLowerCase()));
  },
});

// One-shot incremental log fetch — returns { job_id, job_status, logs } with
// only the lines whose id > since (all lines when since is 0/undefined).
// Used by useBatchSync's log poller so each tick transfers only new lines.
export const fetchJobLogs = async (jobId: string, since?: number) => {
  const { data } = await getAuthenticatedHttpClient().get(logsUrl(jobId, since));
  return data as { job_id: string; job_status: string; logs: any[] };
};

// Polling is stopped by CourseJobLogStream unmounting when the job reaches a
// terminal status — the observer destruction clears the interval timer.
export const useJobLogs = (jobId: string | null) => useQuery({
  queryKey: ['bulk-rerun-job-logs', jobId],
  queryFn: async () => {
    const { data } = await getAuthenticatedHttpClient()
      .get(logsUrl(jobId!));
    return data;
  },
  enabled: !!jobId,
  refetchInterval: 2000,
});
