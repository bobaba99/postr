/**
 * PreviewStep — ranked candidate figures, presented the way a
 * journal presents figures (v2 plan §4):
 *
 * - Panels labelled A, B, C — the multi-panel figure convention,
 *   not "Option 1 / 2 / 3".
 * - Each panel carries a journal-style caption in the recommender's
 *   voice. The caption is real output: on insert it is seeded into
 *   the chart block's caption field.
 * - The "why" line is methods voice — the actual perceptual
 *   justification, defensible if a PI asks.
 * - Panels sit on paper-white with the poster's own type, visually
 *   distinct from the editor chrome around them.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import type { ChartSpec, Palette } from '@postr/shared';
import type { InferredTable } from '../inferColumns';
import { buildChartSpec, captionFor } from '../buildSpec';
import { recommend, type RoleChoice } from '../recommend';
import { ChartPreview } from './ChartPreview';

export interface PreviewAction {
  label: string;
  run: (spec: ChartSpec, caption: string, formName: string) => void | Promise<void>;
  primary?: boolean;
}

interface PreviewStepProps {
  table: InferredTable;
  choice: RoleChoice;
  palette: Palette;
  /** Poster surface font for panels + captions. */
  fontFamily: string;
  /** 'panel' stacks; 'page' lays out a responsive grid. */
  layout: 'panel' | 'page';
  actions: PreviewAction[];
  /** Shown under a panel after its primary action ran. */
  confirmation?: string;
}

const PANEL_LETTERS = ['A', 'B', 'C'];

const cardStyle: CSSProperties = {
  background: '#faf9f6',
  border: '1px solid #e3e0d8',
  borderRadius: 6,
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minWidth: 0,
};

export function PreviewStep({
  table,
  choice,
  palette,
  fontFamily,
  layout,
  actions,
  confirmation,
}: PreviewStepProps) {
  const [confirmedIndex, setConfirmedIndex] = useState<number | null>(null);

  const panels = useMemo(() => {
    return recommend(table, choice)
      .map((rec) => {
        const spec = buildChartSpec(table, rec);
        if (!spec) return null;
        return { rec, spec, caption: captionFor(table, rec) };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }, [table, choice]);

  if (panels.length === 0) {
    return (
      <div style={{ fontSize: 13, color: '#8a8a95', padding: '12px 0' }}>
        We couldn’t find a numeric measure to chart in this table. Add a column of numbers and
        try again.
      </div>
    );
  }

  return (
    <div
      style={
        layout === 'page'
          ? {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 16,
              alignItems: 'start',
            }
          : { display: 'flex', flexDirection: 'column', gap: 14 }
      }
    >
      {panels.map((panel, i) => (
        <figure key={panel.rec.form} className="postr-rise-in" style={{ ...cardStyle, margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              style={{
                fontFamily,
                fontWeight: 800,
                fontSize: 18,
                color: '#1c1b1a',
              }}
            >
              {PANEL_LETTERS[i] ?? String(i + 1)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#44423d' }}>
              {panel.rec.name}
            </span>
            {i === 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#2f6f4f',
                  marginLeft: 'auto',
                }}
              >
                Recommended
              </span>
            )}
          </div>

          <ChartPreview spec={panel.spec} palette={palette} fontFamily={fontFamily} />

          <figcaption style={{ fontFamily, fontSize: 13.5, lineHeight: 1.45, color: '#1c1b1a' }}>
            <strong>{PANEL_LETTERS[i] ?? i + 1}.</strong> {panel.caption}
          </figcaption>

          <p style={{ fontSize: 12, lineHeight: 1.5, color: '#6e6a62', margin: 0 }}>
            {panel.rec.why}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  if (action.primary) setConfirmedIndex(i);
                  void action.run(panel.spec, panel.caption, panel.rec.name);
                }}
                style={{
                  border: action.primary ? 'none' : '1px solid #c9c6c0',
                  background: action.primary ? '#2f6f8f' : 'transparent',
                  color: action.primary ? '#ffffff' : '#44423d',
                  borderRadius: 7,
                  padding: '7px 12px',
                  fontSize: 13,
                  fontWeight: action.primary ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {action.label}
              </button>
            ))}
            {confirmation && confirmedIndex === i && (
              <span style={{ fontSize: 12, color: '#2f6f4f', fontWeight: 600 }}>
                ✓ {confirmation}
              </span>
            )}
          </div>
        </figure>
      ))}
    </div>
  );
}
