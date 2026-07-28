// Derives per-course rollback display state from the fields the batch-detail
// API already returns (course_created, rolled_back, batch rollback_status).
// Shared by the History summary rows and the Job-details course rows so both
// screens speak one language.
//
// Deletion runs sequentially in position order, so while a rollback is in
// flight the single "currently deleting" course is the first job that created
// a course but has not yet been rolled back. Callers compute that job's id
// once (deletingId) from the full, position-ordered job list and pass it in.

export const ROLLBACK_ACTIVE = ['pending', 'running'];
const ROLLBACK_TERMINAL = ['succeeded', 'partial', 'failed'];

// Returns one of: 'deleted' | 'deleting' | 'queued' | 'failed' | 'nothing' | null
// null means "no rollback column applies" (no rollback was ever requested).
export function jobRollbackState(job, rollbackStatus, deletingId) {
  if (!rollbackStatus || rollbackStatus === 'none') { return null; }
  if (!job.courseCreated) { return 'nothing'; }
  if (job.rolledBack) { return 'deleted'; }
  // Created a course that has not been removed yet.
  if (ROLLBACK_ACTIVE.includes(rollbackStatus)) {
    return job.id === deletingId ? 'deleting' : 'queued';
  }
  if (ROLLBACK_TERMINAL.includes(rollbackStatus)) { return 'failed'; }
  return 'queued';
}

// The id of the course currently being deleted, or null when no rollback is
// actively running. jobs must be in position (creation) order.
export function deletingJobId(jobs, rollbackStatus) {
  if (!ROLLBACK_ACTIVE.includes(rollbackStatus)) { return null; }
  const next = jobs.find(j => j.courseCreated && !j.rolledBack);
  return next ? next.id : null;
}

// { removed, total } tally of created courses that have been rolled back.
export function rollbackTally(jobs) {
  const created = jobs.filter(j => j.courseCreated);
  return { removed: created.filter(j => j.rolledBack).length, total: created.length };
}

// Label + palette for each chip state. Colours are inline (matching the rest of
// this plugin's dynamic-colour style) so no theme tokens are required.
export const ROLLBACK_CHIP = {
  deleted: {
    label: '✕ Deleted', fg: '#3d4553', bg: '#e8eaee', border: 'transparent',
  },
  deleting: {
    label: 'Deleting…', fg: '#006daa', bg: '#deeef8', border: 'transparent', spinner: true,
  },
  queued: {
    label: 'Queued for deletion', fg: '#5b6472', bg: 'transparent', border: '#d0d5dd',
  },
  failed: {
    label: '! Delete failed', fg: '#c53a2e', bg: '#fbeae8', border: 'transparent',
  },
  nothing: {
    label: 'nothing to remove', fg: '#8b93a1', bg: 'transparent', border: 'transparent', ghost: true,
  },
};
