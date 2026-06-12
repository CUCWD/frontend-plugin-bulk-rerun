// TanStack Query wrappers for the Studio bulk-rerun REST API.
// useValidateCourseKeys — POST /validate/       checks which target keys already exist on the platform.
// useCreateBatch        — POST /batches/        submits a new job to the backend.
// useBatch              — GET  /batches/:id/    polls every 2 s; stops when the job reaches a terminal status.
// useOrgs               — GET  /organizations   fetches org short-names from Studio.
// usePrograms           — GET  discovery /api/v1/programs/?status=active  fetches active programs.
// useCourses            — GET  /courses         fetches up to 500 DEMO-run live courses.
// useJobLogs            — GET  /batches/:id/logs/ fetches log lines for a running job.
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

const studioUrl    = () => getConfig().STUDIO_BASE_URL    as string;
const discoveryUrl = () => getConfig().DISCOVERY_API_BASE_URL as string;
const validateUrl = () => `${studioUrl()}/api/bulk-rerun/validate/`;
const batchesUrl  = () => `${studioUrl()}/api/bulk-rerun/batches/`;
const batchUrl    = (id: string) => `${batchesUrl()}${id}/`;
const logsUrl     = (jobId: string, since?: number) =>
  `${studioUrl()}/api/bulk-rerun/jobs/${jobId}/logs/${since ? `?since=${since}` : ''}`;

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

export const useBatch = (batchId: string | null) => useQuery({
  queryKey:  ['bulk-rerun-batch', batchId],
  queryFn:   async () => {
    const { data } = await getAuthenticatedHttpClient().get(batchUrl(batchId!));
    return data;
  },
  enabled: !!batchId,
  // Stop retrying on 404 — the batch was rolled back (e.g. task failed inside
  // an atomic block with CELERY_ALWAYS_EAGER) and will never appear.
  retry: (failureCount: number, error: any) => {
    if (error?.response?.status === 404) return false;
    return failureCount < 3;
  },
  refetchInterval: (query: any) => {
    if (['succeeded', 'failed', 'partial'].includes(query?.state?.data?.status)) return false;
    if (query?.state?.status === 'error') return false;
    return 2000;
  },
});

const coursesUrl = (search = '') =>
  `${studioUrl()}/api/contentstore/v1/home/courses${search}`;

// Active programs from course-discovery — GET DISCOVERY_API_BASE_URL/api/v1/programs/?status=active
// Returns [] when DISCOVERY_API_BASE_URL is not configured.
export const usePrograms = (options?: { enabled?: boolean }) => useQuery({
  queryKey: ['bulk-rerun-programs'],
  queryFn:  async (): Promise<ProgramApiItem[]> => {
    const base = discoveryUrl();
    if (!base) return [];
    const { data } = await getAuthenticatedHttpClient()
      .get(`${base}/api/v1/programs/?status=active&page_size=50`);
    const normalised = camelCaseObject(data);
    const results = (normalised.results ?? []) as any[];
    return results.map((p: any) => ({
      uuid: p.uuid,
      title: p.title,
      courseRunKeys: (p.courses ?? []).flatMap((c: any) =>
        (c.courseRuns ?? []).map((r: any) => r.key)
      ),
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
export const useOrgs = () => useQuery({
  queryKey: ['bulk-rerun-orgs'],
  queryFn: async (): Promise<OrgApiItem[]> => {
    const lmsUrl = getConfig().LMS_BASE_URL as string;
    const { data } = await getAuthenticatedHttpClient()
      .get(`${lmsUrl}/api/organizations/v0/organizations/`);
    const normalised = camelCaseObject(data) as any;
    const items: any[] = Array.isArray(normalised) ? normalised : (normalised.results ?? []);
    return items.map((o: any) => ({ name: o.name || o.shortName, shortName: o.shortName }));
  },
  staleTime: 300_000,
});

export const useCourses = (search = '', options?: { enabled?: boolean }) => useQuery({
  queryKey: ['bulk-rerun-courses', search],
  queryFn:  async (): Promise<CourseApiItem[]> => {
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
    const { data } = await getAuthenticatedHttpClient()
      .post(`${lmsUrl}/api/user/v1/accounts/search_emails`, { emails });
    const items: any[] = Array.isArray(data) ? data : [];
    return new Set(items.map((u: any) => u.email as string));
  },
});

export const useJobLogs = (jobId: string | null) => useQuery({
  queryKey: ['bulk-rerun-job-logs', jobId],
  queryFn:  async () => {
    const { data } = await getAuthenticatedHttpClient()
      .get(logsUrl(jobId!));
    return data;
  },
  enabled: !!jobId,
  refetchInterval: (data: any) => {
    if (['succeeded', 'failed'].includes(data?.job_status)) return false;
    return 2000;
  },
});
