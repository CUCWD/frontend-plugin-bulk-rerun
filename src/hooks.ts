// TanStack Query wrappers for the Studio bulk-rerun REST API.
// useValidateCourseKeys — POST /validate/            checks which target keys already exist on the platform.
// useCreateBatch        — POST /batches/             submits a new job to the backend.
// useCancelBatch        — POST /batches/:id/cancel/  cancels a pending/running batch.
// useBatch              — GET  /batches/:id/         polls every 2 s; stops when the job reaches a terminal status.
// useRunningBatches     — GET  /batches/?status=...  fetches the caller's in-progress batches; used to recover
//                                                    active jobs after a page refresh or on a different device.
// useOrgs               — GET  /organizations        fetches org short-names from Studio.
// usePrograms           — GET  discovery /api/v1/programs/?status=active  fetches active programs.
// useCourses            — GET  /courses              fetches up to 500 DEMO-run live courses.
// useJobLogs            — GET  /batches/:id/logs/    fetches log lines for a running job.
import { getConfig, camelCaseObject } from '@edx/frontend-platform';
import { getAuthenticatedHttpClient } from '@edx/frontend-platform/auth';
import { useQuery, useMutation } from '@tanstack/react-query';

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

const mapDetailJobs = (detail: any) => (detail.jobs || []).map((j: any, i: number) => ({
  id: j.id ?? i,
  org: j.org,
  orgName: j.org_name,
  name: j.course_name,
  srcKey: j.src_key || '',
  targetKey: j.target_course_key || j.target_key || '',
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
}));

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
  };
};

export const enrichEntry = (entry: any, detail: any) => ({ ...entry, jobs: mapDetailJobs(detail) });

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

export const useCancelBatch = () => useMutation({
  mutationFn: async (batchId: string) => {
    const { data } = await getAuthenticatedHttpClient()
      .post(`${batchUrl(batchId)}cancel/`);
    return data;
  },
});

// Fetch the current user's batches filtered by status.
// Fetched once on mount (no polling) — used by StepProgress to restore in-flight
// jobs after a page refresh or when navigating from a different device/tab.
export const useRunningBatches = (statusFilter = 'running,pending') => useQuery({
  queryKey: ['bulk-rerun-batches-running', statusFilter],
  queryFn: async () => {
    const { data } = await getAuthenticatedHttpClient()
      .get(`${batchesUrl()}?status=${encodeURIComponent(statusFilter)}`);
    return data as any[];
  },
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  refetchInterval: false,
});

// pollingEnabled lets useBatchSync disable fetching once it has detected a
// terminal state, without changing the query key (so cached data is preserved).
export const useBatch = (batchId: string | null, pollingEnabled = true) => useQuery({
  queryKey: ['bulk-rerun-batch', batchId],
  queryFn: async () => {
    const { data } = await getAuthenticatedHttpClient().get(batchUrl(batchId!));
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
