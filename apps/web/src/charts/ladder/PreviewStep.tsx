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
 *
 * ## Selection
 *
 * Panels are multi-selectable. Each panel header carries a real
 * `<input type="checkbox">` (not a div with a role) so keyboard and
 * screen-reader behaviour is the platform's, not ours. Actions run
 * once over the whole selection, which is what makes "download three
 * figures as one zip" and "insert both charts as separate blocks"
 * expressible at all.
 *
 * The single-select fast path stays the common case: the top-ranked
 * panel is pre-selected on mount, so a user who wants exactly the
 * recommended figure clicks the primary action once and is done —
 * identical to the pre-multi-select flow.
 *
 * Deselecting everything disables the actions and says why, rather
 * than leaving a live button that silently does nothing.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { ChartSpec, Palette } from '@postr/shared';
import type { InferredTable } from '../inferColumns';
import { buildChartSpec, captionFor } from '../buildSpec';
import { recommendFigures, type RoleChoice } from '../recommend';
import { SAMPLE_DATA_LABEL } from '../sampleData';
import { BusyIndicator } from '@/components/BusyIndicator';
import { ChartPreview } from './ChartPreview';

/** One selected figure, handed to an action in panel order. */
export interface SelectedFigure {
  spec: ChartSpec;
  caption: string;
  /** Display name of the chart form, e.g. "Bar chart". */
  formName: string;
  /** Panel letter — 'A', 'B', 'C' — for predictable file naming. */
  letter: string;
}

export interface PreviewAction {
  label: string;
  /**
   * Runs once for the whole selection, in panel order. Multi-file
   * output is the action's problem, not the panel's: downloads zip,
   * inserts loop.
   *
   * Must reject (or throw) when the action fails — the success
   * confirmation is gated on it resolving, so a swallowed rejection
   * would show "✓ done" next to an error banner.
   */
  run: (selection: SelectedFigure[]) => void | Promise<void>;
  primary?: boolean;
  /** Shown while `run` is in flight, e.g. "Zipping 3 figures…". */
  busyLabel?: (count: number) => string;
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
  /** Shown after the primary action ran. Receives the figure count. */
  confirmation?: string;
  /**
   * True when the VALUES behind these previews were synthesised from
   * the detected columns rather than supplied by the user. Drives the
   * unmissable sample-data banner and the caption prefix.
   */
  sample?: boolean;
}

const PANEL_LETTERS = ['A', 'B', 'C'];

/** An action in flight, with the selection it was actually given. */
interface RunningAction {
  label: string;
  /** Size of the selection snapshot handed to `run`. */
  count: number;
}

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

export function letterFor(index: number): string {
  return PANEL_LETTERS[index] ?? String(index + 1);
}

export function PreviewStep({
  table,
  choice,
  palette,
  fontFamily,
  layout,
  actions,
  confirmation,
  sample = false,
}: PreviewStepProps) {
  const [confirmed, setConfirmed] = useState<number | null>(null);
  // The in-flight action carries its own frozen snapshot of the
  // selection. `run` was handed that exact list, so the busy label and
  // the confirmation must be counted from it — never from the live
  // selection, which the user can still change while the action runs.
  const [running, setRunning] = useState<RunningAction | null>(null);

  const advice = useMemo(() => recommendFigures(table, choice), [table, choice]);

  const panels = useMemo(() => {
    return advice.recommendations
      .map((rec) => {
        const spec = buildChartSpec(table, rec);
        if (!spec) return null;
        // The sample prefix is baked into the caption string itself,
        // not layered on at render time — the caption is seeded into
        // the block on insert, so the warning has to survive the
        // handoff.
        return { rec, spec, caption: captionFor(table, rec, { sample }) };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }, [advice, table, sample]);

  // Keyed by panel form so the set survives a re-render without
  // depending on array identity. The top-ranked panel starts selected
  // — that is what keeps the one-figure case a single click.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const first = panels[0];
    setSelected(first ? new Set([first.rec.form]) : new Set());
    setConfirmed(null);
  }, [panels]);

  const toggle = (form: string) => {
    setConfirmed(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(form)) next.delete(form);
      else next.add(form);
      return next;
    });
  };

  // Panel order, not click order — figure A always precedes figure B
  // in a zip listing and in the blocks an insert creates.
  const selection = useMemo<SelectedFigure[]>(
    () =>
      panels
        .map((panel, i) => ({ panel, i }))
        .filter(({ panel }) => selected.has(panel.rec.form))
        .map(({ panel, i }) => ({
          spec: panel.spec,
          caption: panel.caption,
          formName: panel.rec.name,
          letter: letterFor(i),
        })),
    [panels, selected],
  );

  if (panels.length === 0) {
    // "No single chart fits" is a real answer, not a failure — the
    // design shape says why, and saying it is more useful than
    // rendering a figure that quietly drops most of the columns.
    return (
      <div
        style={{
          border: '1px solid #e3e0d8',
          background: '#faf9f6',
          borderRadius: 6,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: '#44423d', letterSpacing: '0.04em' }}>
          {advice.shape.label}
        </span>
        <p style={{ margin: 0, fontFamily, fontSize: 13.5, lineHeight: 1.5, color: '#1c1b1a' }}>
          {advice.note ??
            'We couldn’t find a numeric measure to chart in this table. Add a column of numbers and try again.'}
        </p>
      </div>
    );
  }

  const count = selection.length;
  const nothingSelected = count === 0;
  const busy = running !== null;

  const runAction = (action: PreviewAction) => {
    if (nothingSelected || busy) return;
    // Freeze the selection for the whole run. `snapshot` is what the
    // action is given, so it is also what the busy label counts and
    // what the confirmation reports — otherwise a mid-flight tick
    // could make "✓ 2 figures — done" appear for a 1-figure run.
    const snapshot = selection;
    setConfirmed(null);
    setRunning({ label: action.label, count: snapshot.length });
    void (async () => {
      try {
        await action.run(snapshot);
        if (action.primary) setConfirmed(snapshot.length);
      } catch {
        setConfirmed(null);
      } finally {
        setRunning(null);
      }
    })();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sample && (
        // Unmissable by construction: role="status" so it is
        // announced, high-contrast amber so it reads at a glance, and
        // placed above the figures rather than under them.
        <div
          role="status"
          style={{
            border: '1px solid #b07a26',
            background: 'rgba(214, 158, 46, 0.12)',
            borderRadius: 6,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <strong style={{ fontSize: 13, color: '#d9a441' }}>{SAMPLE_DATA_LABEL}</strong>
          <span style={{ fontSize: 12.5, lineHeight: 1.45, color: '#c8cad0' }}>
            These values were generated from the columns we detected, so you can see the shape of
            the figure. Replace them with your own numbers before using it.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#8a8a95', letterSpacing: '0.04em' }}>
          {advice.shape.label}
        </span>
        {advice.note && (
          <span style={{ fontSize: 12.5, lineHeight: 1.45, color: '#8a8a95' }}>{advice.note}</span>
        )}
      </div>

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
        {panels.map((panel, i) => {
          const letter = letterFor(i);
          const isSelected = selected.has(panel.rec.form);
          return (
            <figure
              key={panel.rec.form}
              className="postr-rise-in"
              style={{
                ...cardStyle,
                margin: 0,
                // The selected state has to survive a greyscale
                // screenshot, so it is a border weight + colour
                // change, not colour alone.
                borderColor: isSelected ? '#2f6f8f' : '#e3e0d8',
                boxShadow: isSelected ? '0 0 0 1px #2f6f8f' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    minWidth: 0,
                    // The whole "☑ A Bar chart" row is the target, not
                    // just the box — that is what makes selection
                    // comfortable on a phone.
                    minHeight: 44,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    // Locked while an action runs: the selection the
                    // action was handed must not drift underneath it.
                    disabled={busy}
                    onChange={() => toggle(panel.rec.form)}
                    style={{
                      // Selecting panels is how the download set is
                      // built, so this is a primary control. 15px is
                      // half the touch floor; 22px plus the padded
                      // label around it clears 44px of tappable row.
                      width: 22,
                      height: 22,
                      flexShrink: 0,
                      accentColor: '#2f6f8f',
                      cursor: busy ? 'not-allowed' : 'pointer',
                    }}
                  />
                  <span
                    style={{
                      fontFamily,
                      fontWeight: 800,
                      fontSize: 18,
                      color: '#1c1b1a',
                    }}
                  >
                    {letter}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#44423d' }}>
                    {panel.rec.name}
                  </span>
                </label>
                {i === 0 && (
                  <span
                    style={{
                      // 12px floor — this badge is the ladder's actual
                      // recommendation, not decoration.
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#2f6f4f',
                      marginLeft: 'auto',
                      flexShrink: 0,
                    }}
                  >
                    Recommended
                  </span>
                )}
              </div>

              <ChartPreview spec={panel.spec} palette={palette} fontFamily={fontFamily} />

              <figcaption style={{ fontFamily, fontSize: 13.5, lineHeight: 1.45, color: '#1c1b1a' }}>
                <strong>{letter}.</strong> {panel.caption}
              </figcaption>

              <p style={{ fontSize: 12, lineHeight: 1.5, color: '#6e6a62', margin: 0 }}>
                {panel.rec.why}
              </p>
            </figure>
          );
        })}
      </div>

      {/* One action bar for the whole selection — actions belong to
          the selection, not to any single panel. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          paddingTop: 2,
        }}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => runAction(action)}
            disabled={nothingSelected || busy}
            aria-describedby={nothingSelected ? 'postr-chart-selection-hint' : undefined}
            style={{
              border: action.primary ? 'none' : '1px solid #c9c6c0',
              background: action.primary ? '#2f6f8f' : 'transparent',
              color: action.primary ? '#ffffff' : '#44423d',
              borderRadius: 7,
              padding: '0 16px',
              // Download is the terminal action of the whole ladder —
              // the one button the page exists to deliver the user to.
              // It measured 34px tall; 44px is the floor.
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 14,
              fontWeight: action.primary ? 600 : 400,
              cursor: nothingSelected || busy ? 'not-allowed' : 'pointer',
              opacity: nothingSelected || busy ? 0.55 : 1,
            }}
          >
            {count > 1 ? `${action.label} (${count})` : action.label}
          </button>
        ))}

        {busy && (
          <BusyIndicator
            inline
            tone="#2f6f8f"
            label={
              actions.find((a) => a.label === running.label)?.busyLabel?.(running.count) ??
              (running.count > 1
                ? `Preparing ${running.count} figures…`
                : 'Preparing your figure…')
            }
            style={{ fontSize: 12 }}
          />
        )}

        {!busy && confirmation && confirmed !== null && (
          <span
            role="status"
            aria-live="polite"
            style={{ fontSize: 12, color: '#2f6f4f', fontWeight: 600 }}
          >
            ✓ {confirmed > 1 ? `${confirmed} figures — ${confirmation}` : confirmation}
          </span>
        )}
      </div>

      {nothingSelected && (
        <p
          id="postr-chart-selection-hint"
          style={{ fontSize: 12, color: '#8a8a95', margin: 0 }}
        >
          Tick at least one figure above to continue.
        </p>
      )}
    </div>
  );
}
