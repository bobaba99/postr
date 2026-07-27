/**
 * ChipRow — accessible chip options for ladder questions.
 *
 * Single-select rows auto-advance the ladder (the caller's onPick
 * fires immediately); multi-select rows toggle and the caller
 * renders its own continue affordance. Real <button>s throughout so
 * the whole ladder is completable by keyboard alone.
 */
import type { CSSProperties } from 'react';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface ChipRowProps<T extends string> {
  label: string;
  options: Array<ChipOption<T>>;
  selected: T[] | T | null;
  onPick: (value: T) => void;
  multi?: boolean;
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

export function ChipRow<T extends string>({
  label,
  options,
  selected,
  onPick,
  multi = false,
}: ChipRowProps<T>) {
  const selectedSet = new Set(
    selected === null ? [] : Array.isArray(selected) ? selected : [selected],
  );
  return (
    <div role="group" aria-label={label} style={rowStyle}>
      {options.map((option) => {
        const isOn = selectedSet.has(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isOn}
            onClick={() => onPick(option.value)}
            className="postr-chart-chip"
            style={{
              border: `1px solid ${isOn ? '#7c6aed' : '#2a2a3a'}`,
              background: isOn ? 'rgba(124, 106, 237, 0.16)' : '#14141f',
              color: isOn ? '#d6cfff' : '#c8cad0',
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 13,
              lineHeight: 1.3,
              cursor: 'pointer',
              textAlign: 'left',
              // Color/border transitions come from the global button
              // rule in index.css (140ms, reduced-motion aware).
            }}
          >
            {multi && isOn ? '✓ ' : ''}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
