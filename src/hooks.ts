// TanStack Query wrappers for the Studio bulk-rerun REST API.
// useValidateCourseKeys — POST /validate/    checks which target keys already exist on the platform.
// useCreateBatch        — POST /batches/     submits a new job to the backend.
// useBatch              — GET  /batches/:id/ polls every 2 s; stops when the job reaches a terminal status.
// useCourses            — GET  /courses      fetches up to 500 live courses (bypassed in DEMO mode).
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

const studioUrl = () => getConfig().STUDIO_BASE_URL as string;
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
  // v4 refetchInterval: (data, _query) => number | false
  refetchInterval: (data: any) => {
    if (['succeeded', 'failed', 'partial'].includes(data?.status)) return false;
    return 2000;
  },
});

const coursesUrl = (search = '') =>
  `${studioUrl()}/api/contentstore/v1/home/courses${search}`;

export const useCourses = (search = '') => useQuery({
  queryKey: ['bulk-rerun-courses', search],
  queryFn:  async (): Promise<CourseApiItem[]> => {
    // Fetch up to 500 courses; for very large installs add pagination later.
    const { data } = await getAuthenticatedHttpClient()
      .get(coursesUrl('?page_size=500'));
    // v1 returns { courses: [...] } or { results: [...] } depending on version
    const normalised = camelCaseObject(data);
    return (normalised.courses ?? normalised.results ?? []) as CourseApiItem[];
  },
  staleTime: 60_000,
});

export const useJobLogs = (jobId: string | null, since?: number) => useQuery({
  queryKey: ['bulk-rerun-job-logs', jobId, since],
  queryFn:  async () => {
    const { data } = await getAuthenticatedHttpClient()
      .get(logsUrl(jobId!, since));
    return data;
  },
  enabled: !!jobId,
});
