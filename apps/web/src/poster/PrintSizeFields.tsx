/**
 * "Printed figure size" — width/height inputs plus preset chips for
 * the public figure-readability page (pages/FigureReadability.tsx).
 *
 * Controlled: `value` is the committed size the check runs against;
 * `onChange` receives a new object (never a mutation). While an input
 * has focus its text is a DRAFT — nothing commits until blur or Enter,
 * so a half-typed "2" never runs a check at 2 inches. Escape reverts
 * the draft. Parsing, clamping and the presets live in printSize.ts.
 *
 * No Supabase or store imports: this must stay mountable on a page that
 * creates no session.
 */
import { useId, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  PRINT_SIZE_PRESETS,
  clampInches,
  matchingPresetId,
  parseInches,
  type PrintSize,
} from './printSize';

interface Props {
  value: PrintSize;
  onChange: (next: PrintSize) => void;
}

type Axis = 'w' | 'h';

interface Draft {
  axis: Axis;
  text: string;
}

const AXIS_LABEL: Record<Axis, string> = { w: 'Width', h: 'Height' };

function format(n: number): string {
  return String(n);
}

export function PrintSizeFields({ value, onChange }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const baseId = useId();
  const pressedId = matchingPresetId(value.w, value.h);

  const commit = (axis: Axis, text: string) => {
    const parsed = parseInches(text);
    setDraft(null);
    if (parsed === null) return; // revert to the committed value
    const next = clampInches(parsed);
    if (next === value[axis]) return;
    onChange({ ...value, [axis]: next });
  };

  const onKeyDown = (axis: Axis) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(axis, e.currentTarget.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(null);
    }
  };

  const renderInput = (axis: Axis) => {
    const id = `${baseId}-${axis}`;
    const text = draft?.axis === axis ? draft.text : format(value[axis]);
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-[#c8cad0]">
          {AXIS_LABEL[axis]}
        </label>
        <div className="relative">
          {/* type="text", not "number": Chromium drops the "," keystroke
              in a number input, so a comma-decimal locale would type
              "7,5" and commit 75. A text field with a decimal keypad
              lets the comma reach parseInches; clampInches bounds it. */}
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            pattern="[0-9]*[.,]?[0-9]*"
            value={text}
            onFocus={(e) => setDraft({ axis, text: e.currentTarget.value })}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setDraft({ axis, text: e.currentTarget.value })
            }
            onBlur={(e) => commit(axis, e.currentTarget.value)}
            onKeyDown={onKeyDown(axis)}
            // 16px: iOS Safari zooms the page on focus below that.
            // min-h-11: the 44px target floor.
            className="w-full min-h-11 rounded-lg border border-[#2a2a3a] bg-[#14141f] py-2 pl-3 pr-10 text-base text-[#e2e2e8] outline-none transition-colors duration-fast ease-smooth focus:border-[#7c6aed]"
            style={{ fontSize: 16 }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[#8b8f99]"
          >
            in
          </span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <span
        id={`${baseId}-legend`}
        className="block text-[13px] font-bold uppercase tracking-[1.2px] text-[#9ca3af]"
      >
        Printed figure size
      </span>

      {/* Side by side even on a phone: two short numeric fields fit a
          375px viewport, and stacking them hides that they are a pair. */}
      <div
        role="group"
        aria-labelledby={`${baseId}-legend`}
        className="mt-3 grid grid-cols-2 gap-3"
      >
        {renderInput('w')}
        {renderInput('h')}
      </div>

      <div
        role="group"
        aria-label="Print size presets"
        className="mt-3 flex flex-wrap gap-2"
      >
        {PRINT_SIZE_PRESETS.map((preset) => {
          const active = preset.id === pressedId;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setDraft(null);
                onChange({ w: preset.w, h: preset.h });
              }}
              className="min-h-11 rounded-full px-4 py-2 text-left text-[15px] font-semibold transition-colors duration-base ease-smooth"
              style={{
                border: `2px solid ${active ? '#7c6aed' : '#2a2a3a'}`,
                background: active ? '#5641b8' : '#14141f',
                color: active ? '#fff' : '#c8cad0',
                cursor: 'pointer',
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[#8b8f99]">
        Measure the space the figure will fill on the printed poster, not the
        image file. If your code sets ggsave() or figsize, the check scales
        from that canvas to this size; otherwise it assumes the figure renders
        at this size.
      </p>
    </div>
  );
}
