// Inline-editable run-ID cell for the course table in StepConfigure.
// Must be defined OUTSIDE StepConfigure so React sees a stable component reference
// across renders — defining it inside would remount on every render, destroying focus.
// On focus the input expands to show all content; on blur it collapses to column width.
import { useState } from 'react';
import { RUN_ID_RE } from '../../utils/courseKeys';
import './EditableRunCell.scss';

const _canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
function measureText(text) {
  if (!_canvas) return 80;
  const ctx = _canvas.getContext('2d');
  ctx.font = '15px SFMono-Regular, Courier New, monospace';
  return Math.ceil(ctx.measureText(text).width);
}

export default function EditableRunCell({ value, onChange, hasError = false }) {
  const [focused, setFocused] = useState(false);

  const hasInvalidChars = value.length > 0 && !RUN_ID_RE.test(value);
  const showError = hasError || hasInvalidChars;

  // When focused, break out of the fixed-layout table column by switching to
  // position:absolute so the input is not clipped to the cell's fixed width.
  const inputStyle = focused
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        height: '100%',
        width: Math.max(80, measureText(String(value)) + 24),
        zIndex: 10,
      }
    : {};

  return (
    <input
      className={`erc-input${showError ? ' has-error' : ''}${focused ? ' erc-input--expanded' : ''}`}
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={inputStyle}
    />
  );
}
