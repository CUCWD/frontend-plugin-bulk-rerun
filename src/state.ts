// Hookstate singleton shared across the entire plugin. Covers wizard navigation
// (bulkView, step), in-flight wizard data (rows, cfg), active job tracking, and run history.
// History is written to localStorage on every save so it survives page refresh.
import { hookstate, useHookstate } from '@hookstate/core';

// ---- types ----------------------------------------------------------------
export type ActiveJob = {
  id:        number;
  cfg:       any;
  isDry:     boolean;
  batchId:   string | null;  // real API batch ID; null means DEMO simulation mode
  createdAt: string;
  createdBy: string;
};

export type HistoryEntry = {
  id:         string;
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

const bulkRerunState = hookstate<BulkRerunState>(INITIAL);

// ---- hook -----------------------------------------------------------------
export const useBulkRerunState = () => {
  const s = useHookstate(bulkRerunState);

  return {
    // -- navigation --
    bulkView:          s.bulkView.get() as string,
    setBulkView:       (v: string) => s.bulkView.set(v),
    trackingSubTab:    s.trackingSubTab.get() as string,
    setTrackingSubTab: (v: string) => s.trackingSubTab.set(v),
    step:              s.step.get() as number,
    setStep:           (n: number) => s.step.set(n),
    viewingEntry:      s.viewingEntry.get() as HistoryEntry | null,
    setViewingEntry:   (e: HistoryEntry | null) => s.viewingEntry.set(e as any),

    // -- wizard data --
    rows:        s.rows.get() as any[],
    setRows:     (r: any[]) => s.rows.set(r),
    fromMode:    s.fromMode.get() as string,
    setFromMode: (m: string) => s.fromMode.set(m),
    prog:        s.prog.get() as any | null,
    setProg:     (p: any) => s.prog.set(p),
    newOrgs:     s.newOrgs.get() as any[],
    setNewOrgs:  (os: any[]) => s.newOrgs.set(os),
    cfg:         s.cfg.get() as any | null,
    setCfg:      (c: any) => s.cfg.set(c),

    // -- tracking --
    activeJobs:     s.activeJobs.get() as ActiveJob[],
    addActiveJob:   (job: ActiveJob) => {
      s.activeJobs.set([...(s.activeJobs.get() as ActiveJob[]), job]);
    },
    removeActiveJob: (id: number) => {
      s.activeJobs.set((s.activeJobs.get() as ActiveJob[]).filter(j => j.id !== id));
    },
    flipActiveJobDry: (id: number) => {
      s.activeJobs.set(
        (s.activeJobs.get() as ActiveJob[]).map(j => j.id === id ? { ...j, isDry: false } : j)
      );
    },

    jobsExpanded:     s.jobsExpanded.get() as Record<string, boolean>,
    toggleJobExpanded: (id: number) => {
      const cur = { ...(s.jobsExpanded.get() as Record<string, boolean>) };
      cur[String(id)] = !cur[String(id)];
      s.jobsExpanded.set(cur);
    },

    jobUserFilter:    s.jobUserFilter.get() as string,
    setJobUserFilter: (v: string) => s.jobUserFilter.set(v),
    runActive:        s.runActive.get() as boolean,
    setRunActive:     (v: boolean) => s.runActive.set(v),

    // -- history --
    history: s.history.get() as HistoryEntry[],
    saveHistory: (entry: HistoryEntry) => {
      const current = s.history.get() as HistoryEntry[];
      const updated = [entry, ...current].slice(0, 100);
      s.history.set(updated as any);
      try { localStorage.setItem('bulk_rerun_history', JSON.stringify(updated)); }
      catch (_e) { /* ignore */ }
    },

    // -- reset helpers --
    softReset: () => {
      s.step.set(0);
      s.rows.set([]);
      s.prog.set(null);
      s.newOrgs.set([]);
      s.viewingEntry.set(null);
    },
    reset: () => {
      s.set({ ...INITIAL, history: s.history.get() as HistoryEntry[] } as any);
    },
  };
};
