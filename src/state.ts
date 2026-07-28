// Hookstate singleton shared across the entire plugin. Covers wizard navigation
// (bulkView, step), in-flight wizard data (rows, cfg), active job tracking, and run history.
// History is written to localStorage on every save so it survives page refresh.
// activeJobs are merged from the server's all-users batch list via useRunningBatches
// polling (see StepProgress), so every operator sees the same Current tab.
//
// IMPORTANT: all write operations (set/merge) use the module-level `bulkRerunState`
// reference directly, never the component-scoped `s` from useHookstate. Using `s`
// for writes throws HOOKSTATE-102 whenever the owning component unmounts between
// renders (e.g. a view-change causes BulkRerunsTab to remount).
import { hookstate, useHookstate } from '@hookstate/core';

// ---- types ----------------------------------------------------------------
export type ActiveJob = {
  id: string;
  cfg: any;
  isDry: boolean;
  batchId: string | null; // real API batch ID; null means DEMO simulation mode
  isPending: boolean; // true while waiting for POST /batches/ to return
  createdAt: string;
  createdBy: string;
  done?: boolean; // set when the batch reaches a terminal state; the card stays
  //                 visible until dismissed but no longer counts as "active"
};

export type HistoryEntry = {
  id: string;
  batchId: string | null; // backend batch UUID; null for DEMO/sim runs
  createdAt: string;
  createdBy: string;
  mode: string;
  progName: string | null;
  targetRun: string;
  isDryRun: boolean;
  status: string;
  orgs: string[];
  cfg: any;
  jobs: any[];
};

type BulkRerunState = {
  bulkView: string;
  trackingSubTab: string;
  step: number;
  viewingEntry: HistoryEntry | null;

  rows: any[];
  fromMode: string;
  prog: any | null;
  newOrgs: any[];
  cfg: any | null;

  activeJobs: ActiveJob[];
  jobsExpanded: Record<string, boolean>;
  jobUserFilter: string;
  runActive: boolean;

  history: HistoryEntry[];
};

// Load persisted history once at module initialisation
const loadHistory = (): HistoryEntry[] => {
  try {
    const raw = localStorage.getItem('bulk_rerun_history');
    if (raw) { return JSON.parse(raw) as HistoryEntry[]; }
  } catch (_e) { /* ignore */ }
  return [];
};

const VALID_BULK_VIEWS = ['wizard', 'tracking'];
const VALID_TRACKING_TABS = ['current', 'history'];

const loadSession = () => {
  try {
    const bulkView = sessionStorage.getItem('bulk_rerun_view');
    const trackingSubTab = sessionStorage.getItem('bulk_rerun_tab');
    return {
      bulkView: bulkView && VALID_BULK_VIEWS.includes(bulkView) ? bulkView : 'wizard',
      trackingSubTab: trackingSubTab && VALID_TRACKING_TABS.includes(trackingSubTab) ? trackingSubTab : 'current',
    };
  } catch (_e) { /* ignore */ }
  return { bulkView: 'wizard', trackingSubTab: 'current' };
};

const { bulkView: savedView, trackingSubTab: savedTab } = loadSession();

const INITIAL: BulkRerunState = {
  bulkView: savedView,
  trackingSubTab: savedTab,
  step: 0,
  viewingEntry: null,

  rows: [],
  fromMode: 'course',
  prog: null,
  newOrgs: [],
  cfg: null,

  activeJobs: [],
  jobsExpanded: {},
  jobUserFilter: '',
  runActive: false,

  history: loadHistory(),
};

const g = hookstate<BulkRerunState>(INITIAL);

// ---- hook -----------------------------------------------------------------
export const useBulkRerunState = () => {
  const s = useHookstate(g);

  return {
    // -- navigation --
    bulkView: s.bulkView.get() as string,
    setBulkView: (v: string) => {
      g.bulkView.set(v);
      try { sessionStorage.setItem('bulk_rerun_view', v); } catch (_e) { /* ignore */ }
    },
    trackingSubTab: s.trackingSubTab.get() as string,
    setTrackingSubTab: (v: string) => {
      g.trackingSubTab.set(v);
      try { sessionStorage.setItem('bulk_rerun_tab', v); } catch (_e) { /* ignore */ }
    },
    step: s.step.get() as number,
    setStep: (n: number) => g.step.set(n),
    viewingEntry: s.viewingEntry.get({ noproxy: true }) as HistoryEntry | null,
    setViewingEntry: (e: HistoryEntry | null) => g.viewingEntry.set(e as any),

    // -- wizard data --
    rows: s.rows.get({ noproxy: true }) as any[],
    setRows: (r: any[]) => g.rows.set(r),
    fromMode: s.fromMode.get() as string,
    setFromMode: (m: string) => g.fromMode.set(m),
    prog: (s as any).prog.get({ noproxy: true }) as any,
    setProg: (p: any) => (g as any).prog.set(p),
    newOrgs: s.newOrgs.get({ noproxy: true }) as any[],
    setNewOrgs: (os: any[]) => g.newOrgs.set(os),
    cfg: (s as any).cfg.get({ noproxy: true }) as any,
    setCfg: (c: any) => (g as any).cfg.set(c),

    // -- tracking --
    activeJobs: s.activeJobs.get({ noproxy: true }) as ActiveJob[],
    addActiveJob: (job: ActiveJob) => {
      g.activeJobs.set([...(g.activeJobs.get({ noproxy: true }) as ActiveJob[]), job]);
    },
    addActiveJobs: (jobs: ActiveJob[]) => {
      g.activeJobs.set([...(g.activeJobs.get({ noproxy: true }) as ActiveJob[]), ...jobs]);
    },
    removeActiveJob: (id: string) => {
      g.activeJobs.set((g.activeJobs.get({ noproxy: true }) as ActiveJob[]).filter(j => j.id !== id));
    },
    // Marks a job's batch as terminal. Stored on the job (not component state) so
    // the "N active runs" count and the Dismiss button survive tab navigation.
    markActiveJobDone: (id: string) => {
      g.activeJobs.set(
        (g.activeJobs.get({ noproxy: true }) as ActiveJob[]).map(j => (j.id === id ? { ...j, done: true } : j)),
      );
    },
    flipActiveJobDry: (id: string) => {
      g.activeJobs.set(
        (g.activeJobs.get({ noproxy: true }) as ActiveJob[]).map(j => (j.id === id ? { ...j, isDry: false } : j)),
      );
    },
    // Atomically promotes a completed dry-run job to a real submission. Sets isDry,
    // batchId, and isPending together so JobProgress remounts exactly once with the
    // correct real batchId rather than the stale dry-run batchId.
    promoteJobToReal: (id: string, batchId: string | null) => {
      g.activeJobs.set(
        (g.activeJobs.get({ noproxy: true }) as ActiveJob[]).map(j => (j.id === id ? {
          ...j, isDry: false, batchId, isPending: false,
        } : j)),
      );
    },
    updateActiveJobBatchId: (id: string, batchId: string | null) => {
      g.activeJobs.set(
        (g.activeJobs.get({ noproxy: true }) as ActiveJob[]).map(
          j => (j.id === id ? { ...j, batchId, isPending: false } : j),
        ),
      );
    },

    jobsExpanded: s.jobsExpanded.get({ noproxy: true }) as Record<string, boolean>,
    toggleJobExpanded: (id: string) => {
      const cur = { ...(g.jobsExpanded.get({ noproxy: true }) as Record<string, boolean>) };
      cur[id] = !cur[id];
      g.jobsExpanded.set(cur);
    },

    jobUserFilter: s.jobUserFilter.get() as string,
    setJobUserFilter: (v: string) => g.jobUserFilter.set(v),
    runActive: s.runActive.get() as boolean,
    setRunActive: (v: boolean) => g.runActive.set(v),

    // -- history --
    history: s.history.get({ noproxy: true }) as HistoryEntry[],
    saveHistory: (entry: HistoryEntry) => {
      // Read from localStorage as the source of truth rather than g.history.get()
      // so that rapid back-to-back saves (two jobs completing close together) don't
      // read stale hookstate and silently drop the previous entry.
      let current: HistoryEntry[] = [];
      try {
        const raw = localStorage.getItem('bulk_rerun_history');
        if (raw) { current = JSON.parse(raw) as HistoryEntry[]; }
      } catch (_e) { /* ignore */ }
      // Idempotency guard: JobProgress can remount (e.g. user views a history detail
      // and returns to Current tab) and re-fire this save when the batch query resolves
      // again. Deduplicate by batchId for real runs, or by local job id for DEMO runs.
      const isDupe = current.some(e => (entry.batchId ? e.batchId === entry.batchId : e.id === entry.id));
      if (isDupe) { return; }
      const updated = [entry, ...current].slice(0, 100);
      g.history.set(updated as any);
      try { localStorage.setItem('bulk_rerun_history', JSON.stringify(updated)); } catch (_e) { /* ignore */ }
    },

    // -- reset helpers --
    softReset: () => {
      g.step.set(0);
      g.rows.set([]);
      (g as any).prog.set(null);
      (g as any).cfg.set(null);
      g.newOrgs.set([]);
      g.viewingEntry.set(null);
    },
    reset: () => {
      g.set({ ...INITIAL, history: g.history.get({ noproxy: true }) as HistoryEntry[] } as any);
    },
  };
};
