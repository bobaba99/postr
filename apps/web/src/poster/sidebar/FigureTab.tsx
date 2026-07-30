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
 * figure-size overlay needs to know the mode too.
 */
import type { CSSProperties } from 'react';
import type { Block, ChartSpec, Palette } from '@postr/shared';
import { ChartChooser } from '@/charts/ladder/ChartChooser';
import type { PosterTableRef } from '@/charts/ladder/DataStep';
import { ChartPalettePicker } from '@/charts/ChartPalettePicker';
import { ReadabilityPanel } from '../ReadabilityPanel';

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
}: FigureTabProps) {
  const selectedChartSpec = selectedChartBlock?.chartSpec ?? null;
  return (
    <div>
      {/* Per-chart palette control — contextual to the current
          selection, so it sits above the make/check modes and shows
          only when a chart block is selected. Recolours that one
          chart's series fills; clearing hands it back to the poster
          theme. */}
      {selectedChartBlock && selectedChartSpec && (
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
            confirmation="Inserted — legible at print size"
          />
        </div>
      </div>

      <div style={{ display: mode === 'check' ? undefined : 'none' }}>
        <ReadabilityPanel
          selectedBlock={selectedImageBlock}
          defaultFigureWidthIn={defaultFigureWidthIn}
          defaultFigureHeightIn={defaultFigureHeightIn}
        />
      </div>
    </div>
  );
}
