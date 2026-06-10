// Inline-editable run-ID cell for the course table in StepConfigure.
// Must be defined OUTSIDE StepConfigure so React sees a stable component reference
// across renders — defining it inside would remount on every render, destroying focus.
// Auto-sizes its input width via canvas text measurement so the field hugs its content.
import { useState } from 'react';

const BRAND = '#006daa';
const BRAND_LT = '#deeef8';
const DANGER = '#c32d3a';
const DANGER_BG = '#fdf0f1';
const MONO = '"SFMono-Regular","Courier New",monospace';

const _canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
function measureText(text) {
  if (!_canvas) return 80;
  const ctx = _canvas.getContext('2d');
  ctx.font = '12px SFMono-Regular, Courier New, monospace';
  return Math.ceil(ctx.measureText(text).width);
}
export function runCellWidth(value) {
  return Math.min(220, Math.max(80, measureText(String(value)) + 16));
}

export default function EditableRunCell({ value, onChange, hasError = false }) {
  const [focused, setFocused] = useState(false);
  const w = runCellWidth(value);

  const baseBorder = hasError ? '1px solid ' + DANGER : '1px solid transparent';
  const focusBorder = hasError ? '1px solid ' + DANGER : '1px solid ' + BRAND;
  const baseBg = hasError ? DANGER_BG : 'transparent';

  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        border: focused ? focusBorder : baseBorder,
        borderRadius: 3,
        padding: '4px 6px',
        fontSize: 12,
        fontFamily: MONO,
        color: hasError ? DANGER : '#1f2937',
        background: focused ? '#fff' : baseBg,
        width: w,
        outline: 'none',
        boxShadow: focused ? ('0 0 0 2px ' + (hasError ? DANGER_BG : BRAND_LT)) : 'none',
        transition: 'border .12s, box-shadow .12s',
      }}
    />
  );
}
