/**
 * ChartPalettePicker — pin one chart to a fixed CVD-tested science
 * palette, or hand it back to the poster theme.
 *
 * The first option ("Poster theme (default)") clears the override so
 * the chart's series fills follow the poster palette again — the
 * default state, selected whenever `spec.seriesPaletteId` is unset or
 * stale. Every other option is a tested palette from
 * `seriesPalettesFor(seriesCount)`, drawn as its actual colours so the
 * user picks by eye, not by name.
 *
 * Selection survives greyscale (border weight + colour, not colour
 * alone) so the picker reads on a mono screenshot. Motion uses the
 * shared ease/duration CSS tokens and stays under the reduced-motion
 * threshold (a colour/border cross-fade, no transform).
 */
import type { CSSProperties } from 'react';
import type { ChartSpec } from '@postr/shared';
import { distinctSeries } from './plotOptions';
import { findSeriesPalette, seriesPalettesFor, type SeriesPalette } from './seriesPalettes';

interface ChartPalettePickerProps {
  spec: ChartSpec;
  onChange: (seriesPaletteId: string | undefined) => void;
}

const optionStyle = (active: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  minHeight: 44,
  padding: '6px 10px',
  borderRadius: 8,
  border: `2px solid ${active ? '#7c6aed' : '#2a2a3a'}`,
  background: active ? 'rgba(124,106,237,0.12)' : '#14141f',
  color: '#c8cad0',
  cursor: 'pointer',
  textAlign: 'left',
  transition:
    'border-color var(--dur-fast, 160ms) var(--ease-out, ease), background var(--dur-fast, 160ms) var(--ease-out, ease)',
});

function Swatches({ colors }: { colors: readonly string[] }) {
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0 }}>
      {colors.map((c, i) => (
        <span
          key={`${c}-${i}`}
          style={{
            width: 14,
            height: 14,
            background: c,
            border: '1px solid rgba(0,0,0,0.15)',
            marginLeft: i === 0 ? 0 : -1,
          }}
        />
      ))}
    </span>
  );
}

export function ChartPalettePicker({ spec, onChange }: ChartPalettePickerProps) {
  const seriesCount = Math.max(1, distinctSeries(spec).length);
  const currentId = spec.seriesPaletteId;
  const resolved: SeriesPalette | null = currentId ? findSeriesPalette(currentId) : null;
  const isStale = Boolean(currentId) && resolved === null;
  const themeActive = !currentId || isStale;
  const options = seriesPalettesFor(seriesCount);

  return (
    <div>
      <span
        style={{
          display: 'block',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#9ca3af',
          marginBottom: 8,
        }}
      >
        Chart colours
      </span>

      {isStale && (
        <p
          role="note"
          style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.5, color: '#e8b4c0' }}
        >
          This chart&rsquo;s saved palette is no longer available &mdash; showing the poster theme.
        </p>
      )}

      <div
        role="group"
        aria-label="Chart colour palette"
        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
      >
        <button
          type="button"
          aria-pressed={themeActive}
          onClick={() => onChange(undefined)}
          style={optionStyle(themeActive)}
        >
          <span
            aria-hidden="true"
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'linear-gradient(135deg,#2f6f8f,#b0533a)',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Poster theme (default)</span>
        </button>

        {options.map((p) => {
          const active = p.id === currentId;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(p.id)}
              title={p.note}
              style={optionStyle(active)}
            >
              <Swatches colors={p.colors} />
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{p.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
