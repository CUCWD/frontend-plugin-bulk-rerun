// Wizard step 3 — final pre-flight review before submission.
// Conflict detection runs client-side against the existsSet returned by the validate API.
// Mode toggle: 'preview' dispatches a dry-run job; 'execute' creates real course reruns.
// The Submit button is disabled while any conflict row is unresolved.
import { useState } from 'react';
import { Button, Alert, Badge, Spinner } from '@openedx/paragon';

import { useCreateBatch } from '../../hooks';
import { buildBatchPayload } from '../../utils/batchPayload';
import { makeKey, detectConflict } from '../../utils/courseKeys';
import OrgRoleSummary from './OrgRoleSummary';

// ── Design tokens ────────────────────────────────────────────────────────────
const BRAND     = '#006daa';
const BRAND_LT  = '#deeef8';
const BRAND_XLT = '#eef6fb';
const SUCCESS   = '#178253';
const SUCCESS_BG = '#d4edda';
const DANGER    = '#c32d3a';
const DANGER_BG = '#fdf0f1';
const DANGER_BDR = '#f1aeb5';
const WARNING   = '#856404';
const WARNING_BG = '#fff8e6';
const WARNING_BDR = '#ffc107';
const G50       = '#f8f9fa';
const G200      = '#e0e0e0';
const G500      = '#6c757d';
const G700      = '#454545';
const G900      = '#1f2937';
const BORDER    = '#dee2e6';
const WHITE     = '#fff';
const MONO      = '"SFMono-Regular","Courier New",monospace';

// Hoisted lookup maps
const CONFLICT_MSG_MAP = {
  exists: 'Key already exists in the platform',
  dup:    'Duplicate key within this batch',
  self:   'Target key is identical to source',
  org:    'Organization not found in platform',
};
const CONFLICT_LABEL_MAP = {
  exists: 'Already exists',
  dup:    'Duplicate',
  self:   'Same as source',
  org:    'Unknown org',
};

export default function StepReview({ cfg, onBack, onSubmit }) {
  const {
    rows = [], runId = '', sched = {}, certs = {},
    orgRosters = {}, removeOp = true, gating = {},
    fromMode = 'course', prog = null, newOrgs = [],
    courseDiscoveryEnabled = true, existsSet,
  } = cfg || {};

  const existsSetSafe = existsSet instanceof Set ? existsSet : new Set(existsSet || []);

  const dryRunEnabled = process.env.ENABLE_BULK_RERUN_DRY_RUN === 'true' || process.env.ENABLE_BULK_RERUN_DRY_RUN === true;

  const createBatch = useCreateBatch();

  const [mode,        setMode]        = useState(dryRunEnabled ? 'preview' : 'execute');
  const [busy,        setBusy]        = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const conflicts = rows.map((r, i) => detectConflict(r, rows, i, existsSetSafe));
  const nConf = conflicts.filter(Boolean).length;
  const canGo = nConf === 0 && !busy;

  const orgs = [...new Set(rows.map(r => r.org))].sort((a, b) => a.localeCompare(b));
  const [openOrgs, setOpenOrgs] = useState(() => Object.fromEntries(orgs.map(o => [o, true])));

  const CERT_DISP_MAP = {
    early_no_info:   'Immediately upon passing',
    early_with_info: 'Immediately with course info',
    end:             'After course end date',
  };
  const certDisplay = CERT_DISP_MAP[certs.display] || certs.display;

  const GATING_LBL_MAP = {
    disabled: 'Disabled', copy: 'Copy from source',
    template: 'Apply template', custom: 'Custom map',
  };
  const gatingLabel = GATING_LBL_MAP[gating.mode] || gating.mode;

  const rosterFilled = Object.values(orgRosters).flat().filter(r => r.email);

  // Execution mode options (no template literals in JSX attributes)
  const execOptions = [
    {
      v: 'preview', icon: '🔍',
      title: 'Preview plan (dry-run)',
      desc: 'Validates all steps without creating or modifying any data',
    },
    {
      v: 'execute', icon: '▶',
      title: 'Execute reruns',
      desc: 'Creates course runs, applies settings' + (courseDiscoveryEnabled ? ', syncs Discovery, links programs' : ''),
    },
  ];

  return (
    <div>
      {nConf > 0
        ? (
          <Alert variant="danger" className="mb-3 py-2">
            <strong style={{ display: 'block', marginBottom: 4 }}>{nConf + ' conflict' + (nConf !== 1 ? 's' : '') + ' - submission blocked'}</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 16, lineHeight: 2 }}>
              {rows.map((r, i) => (
                conflicts[i]
                  ? (
                    <li key={r.id}>
                      <code style={{ fontFamily: MONO, fontSize: 12 }}>{makeKey(r.org, r.num, r.run)}</code>
                      {' - '}
                      {CONFLICT_MSG_MAP[conflicts[i]]}
                    </li>
                  )
                  : null
              ))}
            </ul>
          </Alert>
        )
        : (
          <Alert variant="success" className="mb-3 py-2">
            <strong style={{ display: 'block', marginBottom: 2 }}>All course keys verified - no conflicts detected</strong>
            Every target key checked against the platform. Ready to submit.
          </Alert>
        )}

      {!courseDiscoveryEnabled && (
        <Alert variant="warning" className="mb-3 py-2">
          <strong style={{ display: 'block', marginBottom: 2 }}>Course Discovery is not enabled - phases 2 and 3 will be skipped</strong>
          This job will only execute Phase 1 (course creation).
        </Alert>
      )}

      {/* Execution mode — entire panel hidden when ENABLE_DRY_RUN is false; app runs execute-only */}
      {dryRunEnabled && (
        <div style={{ border: '1px solid ' + BORDER, borderRadius: 4, marginBottom: 14, background: WHITE }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid ' + BORDER }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: G700 }}>Execution mode</span>
          </div>
          <div style={{ padding: '12px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {execOptions.map(m => (
              <label
                key={m.v}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px',
                  border: '2px solid ' + (mode === m.v ? BRAND : BORDER),
                  borderRadius: 4, cursor: 'pointer',
                  background: mode === m.v ? BRAND_XLT : WHITE,
                  transition: 'border .12s',
                }}
              >
                <input
                  type="radio"
                  name="execmode"
                  value={m.v}
                  checked={mode === m.v}
                  onChange={() => setMode(m.v)}
                  style={{ marginTop: 3, accentColor: BRAND }}
                />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{m.icon + ' ' + m.title}</div>
                  <div style={{ fontSize: 12, color: G500, marginTop: 3, lineHeight: 1.5 }}>{m.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Settings summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div style={{ border: '1px solid ' + BORDER, borderRadius: 4, background: WHITE }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid ' + BORDER }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: G700 }}>Scheduling &amp; certificates</span>
          </div>
          <div style={{ padding: '10px 16px' }}>
            {[
              ['Course dates',     sched.start + ' to ' + sched.end],
              ['Enrollment',       sched.enrollStart + ' to ' + sched.enrollEnd],
              ['Pacing',           sched.pacing === 'instructor' ? 'Instructor-paced' : 'Self-paced'],
              ['Target run',       runId],
              ['Course mode',      (certs.mode || '').toUpperCase()],
              ['Cert display',     certDisplay],
              ['Student certs',    certs.studentGenCert ? 'Enabled' : 'Disabled'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0 12px', borderBottom: '1px solid ' + BORDER, padding: '6px 0' }}>
                <span style={{ fontSize: 13, color: G500, whiteSpace: 'nowrap' }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 500, fontFamily: k === 'Target run' ? MONO : 'inherit' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid ' + BORDER, borderRadius: 4, background: WHITE }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid ' + BORDER }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: G700 }}>Team, gating &amp; job</span>
          </div>
          <div style={{ padding: '10px 16px' }}>
            {[
              ['Selection',         fromMode === 'course' ? 'By Individual Course' : fromMode],
              ['Total runs',        String(rows.length)],
              ['Organizations',     orgs.join(', ') || '-'],
              ['Team members',      rosterFilled.length ? (rosterFilled.length + ' from CAR') : 'None'],
              ['Remove provisioner',removeOp ? 'Yes' : 'No'],
              ['Lesson gating',     gatingLabel],
              ['Key conflicts',     nConf > 0 ? (nConf + ' conflict' + (nConf !== 1 ? 's' : '')) : 'None'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0 12px', borderBottom: '1px solid ' + BORDER, padding: '6px 0' }}>
                <span style={{ fontSize: 13, color: G500, whiteSpace: 'nowrap' }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: (k === 'Key conflicts' && nConf > 0) ? DANGER : (k === 'Key conflicts' ? SUCCESS : G900) }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Course runs accordion */}
      <div style={{ border: '1px solid ' + BORDER, borderRadius: 4, marginBottom: 14, background: WHITE }}>
        <div style={{
          padding: '12px 20px', borderBottom: '1px solid ' + BORDER,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: G700 }}>
            {rows.length + ' course run' + (rows.length !== 1 ? 's' : '') + ' across ' + orgs.length + ' org' + (orgs.length !== 1 ? 's' : '')}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="tertiary" size="sm" onClick={() => setOpenOrgs(Object.fromEntries(orgs.map(o => [o, true])))}>Expand all</Button>
            <Button variant="tertiary" size="sm" onClick={() => setOpenOrgs(Object.fromEntries(orgs.map(o => [o, false])))}>Collapse all</Button>
          </div>
        </div>

        {orgs.map(orgCode => {
          const orgRows = rows.map((r, i) => ({ ...r, i })).filter(r => r.org === orgCode);
          const orgErr  = orgRows.some(r => !!conflicts[r.i]);
          const isOpen  = openOrgs[orgCode] !== false;
          const accent  = orgErr ? DANGER : SUCCESS;

          return (
            <div key={orgCode} style={{ borderBottom: '1px solid ' + BORDER }}>
              <div
                onClick={() => setOpenOrgs(p => ({ ...p, [orgCode]: !isOpen }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px', cursor: 'pointer',
                  background: orgErr ? DANGER_BG : G50,
                  borderLeft: '4px solid ' + accent,
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '.85'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  {orgErr ? '✕' : '✓'}
                </div>
                <span style={{ fontWeight: 600, fontSize: 13, color: accent }}>{orgCode}</span>
                <span style={{ fontSize: 12, color: G500 }}>{orgRows[0]?.orgName + ' - ' + orgRows.length + ' course' + (orgRows.length !== 1 ? 's' : '')}</span>
                {orgErr && (
                  <Badge variant="danger" pill style={{ fontSize: 11, lineHeight: 1.5 }}>conflict</Badge>
                )}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: G500 }}>{isOpen ? '▲ collapse' : '▼ expand'}</span>
              </div>

              {isOpen && (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid ' + BORDER, background: WHITE }}>
                          <th style={{ padding: '7px 8px 7px 20px', width: 28 }} />
                          <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: SUCCESS, background: SUCCESS_BG, whiteSpace: 'nowrap', borderBottom: '2px solid ' + SUCCESS }}>Course Name</th>
                          <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: SUCCESS, background: SUCCESS_BG, whiteSpace: 'nowrap', borderBottom: '2px solid ' + SUCCESS }}>Src Org</th>
                          <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: SUCCESS, background: SUCCESS_BG, whiteSpace: 'nowrap', borderBottom: '2px solid ' + SUCCESS }}>Src Course #</th>
                          <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: SUCCESS, background: SUCCESS_BG, whiteSpace: 'nowrap', borderBottom: '2px solid ' + SUCCESS }}>Src Run</th>
                          <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: BRAND, background: BRAND_LT, whiteSpace: 'nowrap', borderBottom: '2px solid ' + BRAND }}>Target Org</th>
                          <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: BRAND, background: BRAND_LT, whiteSpace: 'nowrap', borderBottom: '2px solid ' + BRAND }}>Target Course #</th>
                          <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: BRAND, background: BRAND_LT, whiteSpace: 'nowrap', borderBottom: '2px solid ' + BRAND }}>Target Run</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orgRows.map(r => {
                          const ct = conflicts[r.i];
                          const ctLabel = ct ? CONFLICT_LABEL_MAP[ct] : null;
                          return (
                            <tr key={r.id} style={{
                              borderBottom: '1px solid ' + BORDER,
                              background: ct === 'exists' ? '#fff5f5' : ct ? '#fffbf0' : WHITE,
                              borderLeft: '3px solid ' + (ct === 'exists' ? DANGER : ct ? WARNING_BDR : 'transparent'),
                            }}>
                              <td style={{ padding: '7px 8px 7px 18px' }}>
                                {ct
                                  ? <span style={{ cursor: 'help', fontSize: 13 }}>{ct === 'exists' ? '🚫' : '⚠️'}</span>
                                  : <span style={{ color: SUCCESS, fontSize: 12 }}>✓</span>}
                              </td>
                              <td style={{ padding: '7px 10px', color: G700, whiteSpace: 'nowrap', background: '#f4fbf6' }}>{r.name}</td>
                              <td style={{ padding: '7px 10px', fontFamily: MONO, fontSize: 11, color: SUCCESS, whiteSpace: 'nowrap', background: '#f4fbf6' }}>{r.srcOrg}</td>
                              <td style={{ padding: '7px 10px', fontFamily: MONO, fontSize: 11, color: SUCCESS, whiteSpace: 'nowrap', background: '#f4fbf6' }}>{r.srcNum}</td>
                              <td style={{ padding: '7px 10px', fontFamily: MONO, fontSize: 11, color: SUCCESS, whiteSpace: 'nowrap', background: '#f4fbf6' }}>{r.srcRun}</td>
                              <td style={{ padding: '7px 10px', fontFamily: MONO, fontSize: 11, color: BRAND, whiteSpace: 'nowrap', background: BRAND_XLT }}>{r.org}</td>
                              <td style={{ padding: '7px 10px', fontFamily: MONO, fontSize: 11, color: BRAND, whiteSpace: 'nowrap', background: BRAND_XLT }}>{r.num}</td>
                              <td style={{ padding: '7px 10px', fontFamily: MONO, fontSize: 11, color: BRAND, whiteSpace: 'nowrap', background: BRAND_XLT }}>{r.run}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* OrgRoleSummary — named component, never inline/IIFE */}
                  <OrgRoleSummary orgCode={orgCode} orgRosters={orgRosters} />
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit error */}
      {submitError && (
        <Alert variant="danger" className="mb-3 py-2">
          <strong style={{ display: 'block', marginBottom: 2 }}>Submission failed</strong>
          {submitError}
        </Alert>
      )}

      {/* Bottom action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button variant="outline-primary" onClick={onBack} disabled={busy}>Back to configure</Button>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {nConf > 0 && (
            <Button variant="tertiary" onClick={onBack} style={{ color: DANGER, borderColor: DANGER_BDR }}>
              Fix conflicts first
            </Button>
          )}
          <Button
            variant={mode === 'preview' ? 'outline-primary' : 'primary'}
            disabled={!canGo}
            onClick={async () => {
              setBusy(true);
              setSubmitError(null);
              try {
                const payload = buildBatchPayload(cfg, mode === 'preview');
                const result = await createBatch.mutateAsync(payload);
                onSubmit(mode, result?.id ?? null);
              } catch (err) {
                setBusy(false);
                setSubmitError(
                  err?.response?.data?.detail
                  || err?.message
                  || 'Could not reach /api/bulk-rerun/batches/ — check backend connectivity.'
                );
              }
            }}
          >
            {busy
              ? (
                <>
                  <Spinner animation="border" size="sm" style={{ width: 14, height: 14, borderWidth: '0.15em', marginRight: 6 }} />
                  {mode === 'preview' ? 'Running preview...' : 'Submitting...'}
                </>
              )
              : (mode === 'preview' ? '🔍 Preview plan' : '▶ Execute reruns')}
          </Button>
        </div>
      </div>
    </div>
  );
}
