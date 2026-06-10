// Validates the four scheduling date fields as a group:
//   • all four fields are required
//   • course end must be after course start
//   • enrollment window must sit entirely inside the course window
// The same logic exists inline in StepConfigure/index.jsx for live form feedback;
// this standalone export is used in unit tests.
type Sched = { start: string; end: string; enrollStart: string; enrollEnd: string };

export function validateSched(s: Sched): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!s.start)       errs.start = 'Required';
  if (!s.end)         errs.end = 'Required';
  if (!s.enrollStart) errs.enrollStart = 'Required';
  if (!s.enrollEnd)   errs.enrollEnd = 'Required';
  if (s.start && s.end && s.start >= s.end)
    errs.end = 'Must be after course start date';
  if (s.enrollStart && s.enrollEnd && s.enrollStart >= s.enrollEnd)
    errs.enrollEnd = 'Must be after enrollment start';
  if (s.start && s.enrollStart && s.enrollStart > s.start)
    errs.enrollStart = 'Enrollment must open on or before course start';
  if (s.end && s.enrollEnd && s.enrollEnd > s.end)
    errs.enrollEnd = 'Enrollment must close on or before course end';
  return errs;
}
