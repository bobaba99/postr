/**
 * FigureTab — the two-mode figure workbench (plot-picker v2 plan §1).
 *
 *   ○ Make a figure    ● Check a figure
 *
 * "Check" is the entire existing ReadabilityPanel, unmoved. "Make"
 * is the chart-chooser ladder with an insert action. Both stay
 * mounted (inactive one display:none) so switching modes never
 * loses ladder progress or a pasted plot script; display:none keeps
 * the hidden mode out of the a11y tree and tab order.
 *
 * Mode state lives in PosterEditor, not here — the sidebar remounts
 * its panel on every tab switch (keyed content), and the canvas
 * figure-size overlay needs to know the mode too. For the same reason
 * the checker's script is kept per poster in this browser, and the
 * Make ladder's progress for the session, under `posterId` (plan
 * item 7, docs/fixes/07-figure-script-kept.md).
 */
import type { CSSProperties } from 'react';
import type { Block, ChartSpec, Palette } from '@postr/shared';
import { ChartChooser } from '@/charts/ladder/ChartChooser';
import type { PosterTableRef } from '@/charts/ladder/DataStep';
import { ChartPalettePicker } from '@/charts/ChartPalettePicker';
import { distinctSeries } from '@/charts/plotOptions';
import { ReadabilityPanel } from '../ReadabilityPanel';
import { posterScriptSlot } from '../figureScriptDraft';

export type FigureMode = 'make' | 'check';

interface FigureTabProps {
  mode: FigureMode;
  onChangeMode: (mode: FigureMode) => void;
  /** Selected image block, if any — feeds the readability checker. */
  selectedImageBlock: Block | null;
  defaultFigureWidthIn: number;
  defaultFigureHeightIn: number;
  /** Poster palette + resolved CSS font — previews match the poster. */
  palette: Palette;
  fontFamily: string;
  posterTables: PosterTableRef[];
  onInsertChart: (spec: ChartSpec, caption: string) => void;
  /** Selected chart block, if any — enables the per-chart palette picker. */
  selectedChartBlock: Block | null;
  onUpdateChartSpec: (blockId: string, spec: ChartSpec) => void;
  /**
   * The open poster: the checker's script is kept under it (and a
   * different poster gets its own checker), and so is the ladder's
   * progress. Omitted, both last only while this tab is mounted.
   */
  posterId?: string | null;
}

const segmentStyle = (active: boolean): CSSProperties => ({
  flex: 1,
  border: 'none',
  background: active ? '#7c6aed' : 'transparent',
  color: active ? '#ffffff' : '#c8cad0',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
});

export function FigureTab({
  mode,
  onChangeMode,
  selectedImageBlock,
  defaultFigureWidthIn,
  defaultFigureHeightIn,
  palette,
  fontFamily,
  posterTables,
  onInsertChart,
  selectedChartBlock,
  onUpdateChartSpec,
  posterId = null,
}: FigureTabProps) {
  const selectedChartSpec = selectedChartBlock?.chartSpec ?? null;
  // Only multi-series charts colour from the categorical palette; a
  // single-series chart fills from one slot, so the picker would
  // persist a seriesPaletteId that changes nothing. Gate it out.
  const chartHasSeries =
    selectedChartSpec !== null && distinctSeries(selectedChartSpec).length >= 2;
  return (
    <div>
      {/* Per-chart palette control — contextual to the current
          selection, so it sits above the make/check modes and shows
          only when a multi-series chart block is selected. Recolours
          that one chart's series fills; clearing hands it back to the
          poster theme. */}
      {selectedChartBlock && selectedChartSpec && chartHasSeries && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: '#0f0f17',
            border: '1px solid #2a2a3a',
            borderRadius: 8,
          }}
        >
          <ChartPalettePicker
            spec={selectedChartSpec}
            onChange={(seriesPaletteId) => {
              // Clearing drops the key entirely (spread of `undefined`
              // is omitted by JSON.stringify on autosave), so a reset
              // chart serializes identically to one never overridden.
              const { seriesPaletteId: _drop, ...rest } = selectedChartSpec;
              onUpdateChartSpec(
                selectedChartBlock.id,
                seriesPaletteId ? { ...rest, seriesPaletteId } : rest,
              );
            }}
          />
        </div>
      )}

      <div
        role="group"
        aria-label="Figure tools"
        style={{
          display: 'flex',
          gap: 4,
          padding: 4,
          background: '#14141f',
          border: '1px solid #2a2a3a',
          borderRadius: 8,
          marginTop: 12,
        }}
      >
        <button
          type="button"
          aria-pressed={mode === 'make'}
          onClick={() => onChangeMode('make')}
          style={segmentStyle(mode === 'make')}
        >
          Make a figure
        </button>
        <button
          type="button"
          aria-pressed={mode === 'check'}
          onClick={() => onChangeMode('check')}
          style={segmentStyle(mode === 'check')}
        >
          Check a figure
        </button>
      </div>

      <div style={{ display: mode === 'make' ? undefined : 'none' }}>
        <div style={{ paddingTop: 14 }}>
          <ChartChooser
            layout="panel"
            draftScope={posterId}
            palette={palette}
            fontFamily={fontFamily}
            posterTables={posterTables}
            actions={[
              {
                label: 'Insert selected figures',
                primary: true,
                // One block per selected figure, in panel order — the
                // insert handler already places each new block, so
                // looping is the whole extension.
                run: (selection) => {
                  for (const figure of selection) {
                    onInsertChart(figure.spec, figure.caption);
                  }
                },
                busyLabel: (n) => (n > 1 ? `Inserting ${n} figures…` : 'Inserting…'),
              },
            ]}
            // No size promise: chart text prints at 18 pt (axis titles 24)
            // unless the block is too small for its legend at that size, and
            // then no smaller than the canonical minimums, 14 and 18 pt
            // (charts/chartLayout.ts; record 13c).
            confirmation="Inserted on your poster"
          />
        </div>
      </div>

      <div style={{ display: mode === 'check' ? undefined : 'none' }}>
        <ReadabilityPanel
          selectedBlock={selectedImageBlock}
          defaultFigureWidthIn={defaultFigureWidthIn}
          defaultFigureHeightIn={defaultFigureHeightIn}
          draftSlot={posterId ? posterScriptSlot(posterId) : null}
        />
      </div>
    </div>
  );
}
