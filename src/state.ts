// Hookstate singleton shared across the entire plugin. Covers wizard navigation
// (bulkView, step), in-flight wizard data (rows, cfg), active job tracking, and run history.
// History is written to localStorage on every save so it survives page refresh.
//
// IMPORTANT: all write operations (set/merge) use the module-level `bulkRerunState`
// reference directly, never the component-scoped `s` from useHookstate. Using `s`
// for writes throws HOOKSTATE-102 whenever the owning component unmounts between
// renders (e.g. a view-change causes BulkRerunsTab to remount).
import { hookstate, useHookstate } from '@hookstate/core';

// ---- types ----------------------------------------------------------------
export type ActiveJob = {
  id:        string;
  cfg:       any;
  isDry:     boolean;
  batchId:   string | null;  // real API batch ID; null means DEMO simulation mode
  isPending: boolean;        // true while waiting for POST /batches/ to return
  createdAt: string;
  createdBy: string;
};

export type HistoryEntry = {
  id:         string;
  batchId:    string | null;  // backend batch UUID; null for DEMO/sim runs
  createdAt:  string;
  createdBy:  string;
  mode:       string;
  progName:   string | null;
  targetRun:  string;
  isDryRun:   boolean;
  status:     string;
  orgs:       string[];
  cfg:        any;
  jobs:       any[];
};

type BulkRerunState = {
  bulkView:       string;
  trackingSubTab: string;
  step:           number;
  viewingEntry:   HistoryEntry | null;

  rows:    any[];
  fromMode: string;
  prog:    any | null;
  newOrgs: any[];
  cfg:     any | null;

  activeJobs:    ActiveJob[];
  jobsExpanded:  Record<string, boolean>;
  jobUserFilter: string;
  runActive:     boolean;

  history: HistoryEntry[];
};

// Load persisted history once at module initialisation
const loadHistory = (): HistoryEntry[] => {
  try {
    const raw = localStorage.getItem('bulk_rerun_history');
    if (raw) return JSON.parse(raw) as HistoryEntry[];
  } catch (_e) { /* ignore */ }
  return [];
};

const INITIAL: BulkRerunState = {
  bulkView:       'wizard',
  trackingSubTab: 'current',
  step:           0,
  viewingEntry:   null,

  rows:    [],
  fromMode: 'course',
  prog:    null,
  newOrgs: [],
  cfg:     null,

  activeJobs:    [],
  jobsExpanded:  {},
  jobUserFilter: '',
  runActive:     false,

  history: loadHistory(),
};

const g = hookstate<BulkRerunState>(INITIAL);

// ---- hook -----------------------------------------------------------------
export const useBulkRerunState = () => {
  const s = useHookstate(g);

  return {
    // -- navigation --
    bulkView:          s.bulkView.get() as string,
    setBulkView:       (v: string) => g.bulkView.set(v),
    trackingSubTab:    s.trackingSubTab.get() as string,
    setTrackingSubTab: (v: string) => g.trackingSubTab.set(v),
    step:              s.step.get() as number,
    setStep:           (n: number) => g.step.set(n),
    viewingEntry:      s.viewingEntry.get({ noproxy: true }) as HistoryEntry | null,
    setViewingEntry:   (e: HistoryEntry | null) => g.viewingEntry.set(e as any),

    // -- wizard data --
    rows:        s.rows.get({ noproxy: true }) as any[],
    setRows:     (r: any[]) => g.rows.set(r),
    fromMode:    s.fromMode.get() as string,
    setFromMode: (m: string) => g.fromMode.set(m),
    prog:        (s as any).prog.get({ noproxy: true }) as any,
    setProg:     (p: any) => (g as any).prog.set(p),
    newOrgs:     s.newOrgs.get({ noproxy: true }) as any[],
    setNewOrgs:  (os: any[]) => g.newOrgs.set(os),
    cfg:         (s as any).cfg.get({ noproxy: true }) as any,
    setCfg:      (c: any) => (g as any).cfg.set(c),

    // -- tracking --
    activeJobs:     s.activeJobs.get({ noproxy: true }) as ActiveJob[],
    addActiveJob:   (job: ActiveJob) => {
      g.activeJobs.set([...(g.activeJobs.get({ noproxy: true }) as ActiveJob[]), job]);
    },
    removeActiveJob: (id: string) => {
      g.activeJobs.set((g.activeJobs.get({ noproxy: true }) as ActiveJob[]).filter(j => j.id !== id));
    },
    flipActiveJobDry: (id: string) => {
      g.activeJobs.set(
        (g.activeJobs.get({ noproxy: true }) as ActiveJob[]).map(j => j.id === id ? { ...j, isDry: false } : j)
      );
    },
    updateActiveJobBatchId: (id: string, batchId: string | null) => {
      g.activeJobs.set(
        (g.activeJobs.get({ noproxy: true }) as ActiveJob[]).map(j =>
          j.id === id ? { ...j, batchId, isPending: false } : j
        )
      );
    },

    jobsExpanded:     s.jobsExpanded.get({ noproxy: true }) as Record<string, boolean>,
    toggleJobExpanded: (id: string) => {
      const cur = { ...(g.jobsExpanded.get({ noproxy: true }) as Record<string, boolean>) };
      cur[id] = !cur[id];
      g.jobsExpanded.set(cur);
    },

    jobUserFilter:    s.jobUserFilter.get() as string,
    setJobUserFilter: (v: string) => g.jobUserFilter.set(v),
    runActive:        s.runActive.get() as boolean,
    setRunActive:     (v: boolean) => g.runActive.set(v),

    // -- history --
    history: s.history.get({ noproxy: true }) as HistoryEntry[],
    saveHistory: (entry: HistoryEntry) => {
      const current = g.history.get({ noproxy: true }) as HistoryEntry[];
      const updated = [entry, ...current].slice(0, 100);
      g.history.set(updated as any);
      try { localStorage.setItem('bulk_rerun_history', JSON.stringify(updated)); }
      catch (_e) { /* ignore */ }
    },

    // -- reset helpers --
    softReset: () => {
      g.step.set(0);
      g.rows.set([]);
      (g as any).prog.set(null);
      g.newOrgs.set([]);
      g.viewingEntry.set(null);
    },
    reset: () => {
      g.set({ ...INITIAL, history: g.history.get({ noproxy: true }) as HistoryEntry[] } as any);
    },
  };
};
