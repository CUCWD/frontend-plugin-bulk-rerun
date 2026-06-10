// Course key utilities. A CourseKey has the form "course-v1:ORG+NUM+RUN".
// makeKey builds one; parseKeyParts splits one back into its three components.
// detectConflict is the client-side pre-flight validator called from StepConfigure and StepReview.
// It reports: 'exists' (key already on platform), 'dup' (same key used twice in this batch), or 'self' (source === target).
export const makeKey = (org: string, num: string, run: string) =>
  `course-v1:${org}+${num}+${run}`;

export const RUN_ID_RE = /^[A-Za-z0-9_\-~.]+$/;

export function validateRunId(id: string, maxLen = 100): { ok: boolean; msg: string } {
  if (!id?.trim())         return { ok: false, msg: 'Run identifier is required' };
  if (!RUN_ID_RE.test(id)) return { ok: false, msg: 'Invalid characters - allowed: letters, digits, _ - ~ .' };
  if (id.length > maxLen)  return { ok: false, msg: `Too long - max ${maxLen} chars` };
  return { ok: true, msg: 'Valid edx-platform run identifier' };
}

export const courseRunPrefix = (run: string): string => {
  if (run === 'DEMO') return 'Demo: ';
  if (run === 'DEV')  return 'DEV: ';
  return '';
};

export const stripRunPrefix = (s: string): string =>
  s.replace(/^(Demo|DEV):\s*/i, '').trim();

// Splits "course-v1:ORG+NUM+RUN" into {org, num, run}
export function parseKeyParts(key: string): { org: string; num: string; run: string } {
  const stripped = (key || '').replace(/^course-v1:/, '');
  const parts = stripped.split('+');
  return { org: parts[0] || '', num: parts[1] || '', run: parts[2] || '' };
}

export type CourseRow = {
  id: string;
  name: string;
  org: string;
  num: string;
  run: string;
  orgName?: string;
  srcOrg: string;
  srcNum: string;
  srcRun: string;
  isNewOrg: boolean;
  fromDemo: boolean;
  progId?: string;
};

export function detectConflict(
  row: CourseRow,
  all: CourseRow[],
  idx: number,
  existsSet = new Set<string>(),
): 'exists' | 'dup' | 'self' | null {
  const tk = makeKey(row.org, row.num, row.run);
  if (existsSet.has(tk))                                                           return 'exists';
  if (all.some((r, i) => i !== idx && makeKey(r.org, r.num, r.run) === tk))       return 'dup';
  if (row.org === row.srcOrg && row.num === row.srcNum && row.run === row.srcRun)  return 'self';
  return null;
}
