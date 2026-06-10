// Draft extraction of the per-org course-run table from StepConfigure.
// Uses THEME tokens and Paragon Icon/WarningFilled for conflict indicators.
// NOT currently imported — the active table is inline in StepConfigure/index.jsx.
import React from 'react';
import { Badge, Form, Icon } from '@openedx/paragon';
import { WarningFilled } from '@openedx/paragon/icons';

import { THEME } from '../../theme';

const CONFLICT_LABELS = {
  exists: { variant: 'danger',  text: 'Already exists' },
  dup:    { variant: 'warning', text: 'Duplicate' },
  self:   { variant: 'warning', text: 'Same as source' },
};

const headBase = {
  padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11,
  whiteSpace: 'nowrap',
};
const srcHead = { ...headBase, color: THEME.srcText, background: THEME.srcHeadBg, borderBottom: `2px solid ${THEME.srcText}` };
const tgtHead = { ...headBase, color: THEME.tgtText, background: THEME.tgtHeadBg, borderBottom: `2px solid ${THEME.tgtText}` };
const neutralHead = { ...headBase, color: '#454545', background: THEME.headBg, borderBottom: `2px solid ${THEME.border}` };

const srcCell = { padding: '6px 10px', background: THEME.srcCellBg, whiteSpace: 'nowrap' };
const tgtCell = { padding: '5px 8px', background: THEME.tgtCellBg };

const CourseRunTable = ({
  rows, conflicts, runOverrides, onOverrideChange, onFieldChange, runId,
}) => (
  <div>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ ...neutralHead, width: 32 }} aria-label="Conflict status" />
            {/* Source — green */}
            <th style={srcHead}>Course name</th>
            <th style={srcHead}>Src org</th>
            <th style={srcHead}>Src course #</th>
            <th style={srcHead}>Src run</th>
            {/* Target — blue */}
            <th style={tgtHead}>Target org</th>
            <th style={tgtHead}>Target course #</th>
            <th style={tgtHead}>Target run</th>
            {/* Status */}
            <th style={{ ...neutralHead, width: 130 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const conflict = conflicts[i];
            const rowBg = conflict === 'exists'
              ? THEME.conflictExistsBg
              : conflict ? THEME.conflictOtherBg : undefined;
            const overridden = runOverrides[r.id] !== undefined;
            return (
              <tr
                key={r.id}
                style={{
                  borderBottom: `1px solid ${THEME.border}`,
                  borderLeft: `3px solid ${conflict === 'exists' ? THEME.danger : conflict ? '#ffc107' : 'transparent'}`,
                }}
              >
                <td style={{ padding: '6px 8px', textAlign: 'center', background: rowBg }}>
                  {conflict
                    ? <Icon src={WarningFilled} size="xs" className={conflict === 'exists' ? 'text-danger' : 'text-warning'} />
                    : <span className="text-success">✓</span>}
                </td>
                {/* Source cells — read-only, green */}
                <td style={srcCell}>{r.name}</td>
                <td style={{ ...srcCell }}>
                  <span className="font-monospace small" style={{ color: THEME.srcText }}>{r.srcOrg}</span>
                </td>
                <td style={srcCell}>
                  <span className="font-monospace small" style={{ color: THEME.srcText }}>{r.srcNum}</span>
                </td>
                <td style={srcCell}>
                  <span className="font-monospace small" style={{ color: THEME.srcText }}>{r.srcRun}</span>
                </td>
                {/* Target cells — editable, blue */}
                <td style={tgtCell}>
                  <Form.Control
                    size="sm"
                    value={r.org}
                    isInvalid={!!conflict}
                    onChange={e => onFieldChange(r.id, 'org', e.target.value)}
                  />
                </td>
                <td style={tgtCell}>
                  <Form.Control
                    size="sm"
                    className="font-monospace"
                    value={r.num}
                    isInvalid={!!conflict}
                    onChange={e => onFieldChange(r.id, 'num', e.target.value)}
                  />
                </td>
                <td style={tgtCell}>
                  <Form.Control
                    size="sm"
                    className="font-monospace"
                    value={r.run}
                    isInvalid={!!conflict}
                    placeholder={runId}
                    onChange={e => onOverrideChange(r.id, e.target.value)}
                  />
                  {overridden && (
                    <span className="text-muted" style={{ fontSize: 10 }}>overridden</span>
                  )}
                </td>
                {/* Status */}
                <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                  {conflict && (
                    <Badge variant={CONFLICT_LABELS[conflict]?.variant || 'danger'}>
                      {CONFLICT_LABELS[conflict]?.text}
                    </Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

export default CourseRunTable;
