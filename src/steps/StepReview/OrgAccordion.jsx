// Draft org accordion for StepReview using Paragon Collapsible.
// NOT currently imported — the accordion is rendered inline in StepReview/index.jsx.
import React from 'react';
import { Collapsible, Badge } from '@openedx/paragon';

import { makeKey } from '../../utils/courseKeys';
import { THEME } from '../../theme';

const srcHead = {
  padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11,
  color: THEME.srcText, background: THEME.srcHeadBg, whiteSpace: 'nowrap',
  borderBottom: `2px solid ${THEME.srcText}`,
};
const tgtHead = {
  padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11,
  color: THEME.tgtText, background: THEME.tgtHeadBg, whiteSpace: 'nowrap',
  borderBottom: `2px solid ${THEME.tgtText}`,
};
const neutralHead = {
  padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11,
  color: '#454545', background: THEME.headBg,
  borderBottom: `2px solid ${THEME.border}`,
};

const OrgAccordion = ({ org, rows }) => (
  <Collapsible
    defaultOpen
    title={(
      <div className="d-flex align-items-center gap-2">
        <strong>{org}</strong>
        <Badge variant="primary">{rows.length} courses</Badge>
      </div>
    )}
    className="mb-2"
  >
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={srcHead}>Source course</th>
            <th style={tgtHead}>Target course</th>
            <th style={neutralHead}>Course name</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} style={{ borderBottom: `1px solid ${THEME.border}` }}>
              <td style={{ padding: '6px 10px', background: THEME.srcCellBg, whiteSpace: 'nowrap' }}>
                <span className="font-monospace small" style={{ color: THEME.srcText }}>
                  {makeKey(r.srcOrg, r.srcNum, r.srcRun)}
                </span>
              </td>
              <td style={{ padding: '6px 10px', background: THEME.tgtCellBg, whiteSpace: 'nowrap' }}>
                <span className="font-monospace small" style={{ color: THEME.tgtText }}>
                  {makeKey(r.org, r.num, r.run)}
                </span>
              </td>
              <td style={{ padding: '6px 10px' }}>{r.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Collapsible>
);

export default OrgAccordion;
