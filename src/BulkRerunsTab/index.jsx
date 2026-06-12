// Root plugin component. Provides the QueryClient and renders either the 3-step
// wizard (Select → Configure → Review) or the Tracking view (Current / History tabs).
// The custom Stepper here is a visual-only numbered header — not Paragon's
// content-controlling Stepper; step content is rendered by conditional JSX below it.
import { useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getAuthenticatedUser } from '@edx/frontend-platform/auth';

import { useBulkRerunState } from '../state';
import StepSelect    from '../steps/StepSelect';
import StepConfigure from '../steps/StepConfigure';
import StepReview    from '../steps/StepReview';
import StepProgress  from '../steps/StepProgress';
import HistoryView   from '../tracking/HistoryView';
import JobProgress   from '../tracking/JobProgress';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BRAND  = '#006daa';
const SUCCESS = '#178253';
const G500   = '#6c757d';
const G700   = '#454545';
const BORDER = '#dee2e6';
const WHITE  = '#fff';
const FONT   = '"Open Sans",system-ui,sans-serif';

const GLOBAL_STYLE = '@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box;}';

const fmtDate = iso => { try { return new Date(iso).toLocaleString(); } catch (_e) { return iso || ''; } };

const WIZARD_STEPS = ['Select', 'Configure', 'Review and Submit'];

function Stepper({ steps, cur }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0px', padding: '12px 24px', background: WHITE }}>
      {steps.map((s, i) => {
        const done   = i < cur;
        const active = i === cur;
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: done ? SUCCESS : active ? BRAND : '#e0e0e0',
                color: (done || active) ? '#fff' : G500,
              }}>
                {i + 1}
              </div>
              <span style={{ fontSize: 16, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap', color: done ? SUCCESS : active ? BRAND : G500 }}>
                {s}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? SUCCESS : '#e0e0e0', margin: '0 8px', transition: 'background .3s' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Inner component (inside QueryClientProvider) ───────────────────────────────
function BulkRerunsTabInner() {
  const topRef = useRef(null);

  const scrollToTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth' });

  const currentUser = (getAuthenticatedUser()?.email) || 'admin@example.org';

  const {
    bulkView,       setBulkView,
    trackingSubTab, setTrackingSubTab,
    step,           setStep,
    rows,           setRows,
    fromMode,       setFromMode,
    prog,           setProg,
    newOrgs,        setNewOrgs,
    cfg,            setCfg,
    viewingEntry,   setViewingEntry,
    addActiveJob,
    removeActiveJob,
    updateActiveJobBatchId,
    setRunActive,
    softReset,
    saveHistory,
    history,
  } = useBulkRerunState();

  const handleStepSelectNext = (nextRows, mode, nextProg, nextNewOrgs) => {
    setRows(nextRows);
    setFromMode(mode);
    setProg(nextProg);
    setNewOrgs(nextNewOrgs || []);
    setStep(1);
    scrollToTop();
  };

  const handleStepConfigureNext = (nextCfg) => {
    setCfg(nextCfg);
    setStep(2);
    scrollToTop();
  };

  const handleStepReviewSubmit = (mode) => {
    const tempId = Date.now().toString(36).slice(-6).toUpperCase();
    addActiveJob({
      id:        tempId,
      cfg,
      isDry:     mode === 'preview',
      batchId:   null,
      isPending: true,
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
    });
    setRunActive(true);
    softReset();
    setBulkView('tracking');
    setTrackingSubTab('current');
    scrollToTop();
    return tempId;
  };

  const BULK_VIEWS = [
    { id: 'wizard',   label: 'Bulk Run Wizard' },
    { id: 'tracking', label: 'Tracking Progress' },
  ];

  const defaultCfg = {
    rows: [], runId: '',
    sched: { start: '', end: '', enrollStart: '', enrollEnd: '', pacing: 'instructor' },
    certs: { mode: 'honor', display: 'early_no_info', create: true, studentGenCert: true, certOnDashboard: true },
    orgRosters: {}, removeOp: false, gating: { mode: 'disabled', templateId: '' },
    fromMode, prog, newOrgs, courseDiscoveryEnabled: true, existsSet: [],
  };

  return (
    <div style={{ fontFamily: FONT, padding: 24 }}>
      <style>{GLOBAL_STYLE}</style>
      <div ref={topRef} style={{ position: 'relative', top: -80 }} />

      {/* ── Bulk reruns sub-nav ── */}
      <div style={{ display: 'flex', marginBottom: 20, borderBottom: '1px solid ' + BORDER, background: WHITE, borderRadius: '4px 4px 0 0', padding: '0 4px' }}>
        {BULK_VIEWS.map(v => {
          const active = bulkView === v.id;
          return (
            <div
              key={v.id}
              onClick={() => setBulkView(v.id)}
              style={{
                padding: '11px 18px', cursor: 'pointer', userSelect: 'none',
                fontSize: 16, fontWeight: 500,
                borderBottom: '3px solid ' + (active ? BRAND : 'transparent'),
                color: active ? BRAND : G700,
                transition: 'color .12s',
              }}
            >
              {v.label}
            </div>
          );
        })}
      </div>

      {/* ── Wizard view ── */}
      {bulkView === 'wizard' && (
        <>
          <Stepper steps={WIZARD_STEPS} cur={step} />

          {step === 0 && (
            <StepSelect
              courseDiscoveryEnabled
              onNext={handleStepSelectNext}
            />
          )}

          {step === 1 && (
            <StepConfigure
              rows={rows}
              fromMode={fromMode}
              prog={prog}
              newOrgs={newOrgs}
              courseDiscoveryEnabled
              savedCfg={cfg}
              onBack={() => { setStep(0); scrollToTop(); }}
              onNext={handleStepConfigureNext}
            />
          )}

          {step === 2 && (
            <StepReview
              cfg={cfg || defaultCfg}
              onBack={() => { setStep(1); scrollToTop(); }}
              onSubmit={handleStepReviewSubmit}
              onBatchReady={(tempId, batchId) => updateActiveJobBatchId(tempId, batchId)}
              onBatchFailed={(tempId) => removeActiveJob(tempId)}
            />
          )}
        </>
      )}

      {/* ── Tracking view ── */}
      {bulkView === 'tracking' && (
        <div>
          {/* Sub-tab bar */}
          <div style={{ display: 'flex', marginBottom: 16, borderBottom: '1px solid ' + BORDER, background: WHITE, borderRadius: '4px 4px 0 0', padding: '0 4px' }}>
            {[
              { id: 'current', label: 'Current' },
              { id: 'history', label: 'History (' + history.length + ')' },
            ].map(t => {
              const active = trackingSubTab === t.id && !viewingEntry;
              return (
                <div
                  key={t.id}
                  onClick={() => { setTrackingSubTab(t.id); setViewingEntry(null); }}
                  style={{
                    padding: '10px 16px', cursor: 'pointer', userSelect: 'none',
                    fontSize: 14, fontWeight: 500,
                    borderBottom: '3px solid ' + (active ? BRAND : 'transparent'),
                    color: active ? BRAND : G700,
                    transition: 'color .12s',
                  }}
                >
                  {t.label}
                </div>
              );
            })}
          </div>

          {/* Current tab */}
          {trackingSubTab === 'current' && !viewingEntry && (
            <StepProgress
              onGoWizard={() => setBulkView('wizard')}
              onSaveHistory={saveHistory}
            />
          )}

          {/* History tab or detail view */}
          {(trackingSubTab === 'history' || viewingEntry) && (
            viewingEntry
              ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <button
                      onClick={() => setViewingEntry(null)}
                      style={{ padding: '5px 12px', fontSize: 13, border: '1px solid ' + BORDER, borderRadius: 4, background: WHITE, cursor: 'pointer', color: BRAND }}
                    >
                      History
                    </button>
                    <span style={{ fontSize: 13, color: G500 }}>
                      {'Viewing run BR-' + viewingEntry.id + ' - ' + fmtDate(viewingEntry.createdAt)}
                    </span>
                  </div>
                  <JobProgress
                    cfg={viewingEntry.cfg}
                    jobId={viewingEntry.id}
                    batchId={viewingEntry.batchId ?? null}
                    isDryRun={viewingEntry.isDryRun}
                    historyEntry={viewingEntry}
                    createdBy={viewingEntry.createdBy}
                    createdAt={viewingEntry.createdAt}
                    onNew={() => { setViewingEntry(null); setBulkView('wizard'); softReset(); }}
                    onExecute={() => {}}
                  />
                </div>
              )
              : (
                <HistoryView
                  entries={history}
                  onView={e => { setViewingEntry(e); scrollToTop(); }}
                  onNewRun={() => { setBulkView('wizard'); softReset(); }}
                />
              )
          )}
        </div>
      )}
    </div>
  );
}

// ── QueryClient singleton ──────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries:   { retry: 1, staleTime: 30000 },
    mutations: { retry: 0 },
  },
});

// ── Exported component ─────────────────────────────────────────────────────────
export default function BulkRerunsTab() {
  return (
    <QueryClientProvider client={queryClient}>
      <BulkRerunsTabInner />
    </QueryClientProvider>
  );
}
