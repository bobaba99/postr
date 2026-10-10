/**
 * Whether the charts on the editor's sheet can be copied, for Export ›
 * PowerPoint (record docs/fixes/31-exports-charts.md, review rounds 1 and 2,
 * R1-F2 and R2-F1).
 *
 * The PowerPoint file's chart pictures are copies of the charts as the
 * editor draws them (export/pptx/chartPicture.ts), so the export needs the
 * sheet as the editor shows it:
 * - a chart still drawing when the user clicks (Observable Plot's chunk
 *   still loading, or a redraw for a new size) has nothing to copy yet, or
 *   only its drawing for the old size: each chart block carries
 *   CHART_DRAWING_ATTR while it draws (charts/ChartBlock.tsx);
 * - a sheet Preview hides (the editor's tree set to display: none, the
 *   Export tab with it) is drawn nowhere: every box on it reads 0;
 * - a sheet gone (the editor left) has nothing on it.
 * The export waits until the sheet is shown and no chart on it draws, for
 * at most CHART_DRAW_WAIT_MS; past that, or at once when the sheet is gone,
 * it exports nothing and spends nothing (poster/sidebar/
 * EditableExportButtons.tsx). The free PDF does not wait: its print window
 * must open inside the click, and it leaves Preview itself.
 */

/** Present on a chart block while it draws: its first drawing, or a redraw. */
export const CHART_DRAWING_ATTR = 'data-postr-chart-drawing';

/** How long Export › PowerPoint waits for the sheet to be copied. */
export const CHART_DRAW_WAIT_MS = 10_000;

/** What the Export tab says when a chart is still drawing after the wait. */
export const CHARTS_STILL_DRAWING = 'A chart is still drawing, so nothing was exported. Try again in a moment.';

/** What the Export tab says when Preview still hides the poster after the wait. */
export const SHEET_HIDDEN = 'The poster was hidden in Preview, so its charts could not be copied and nothing was exported. Try again.';

/** What the export says when the editor was left during it (no Export tab is left to show it). */
export const SHEET_GONE = 'The editor was left before the poster’s charts could be copied, so nothing was exported.';

/** Thrown by an export that met a chart still drawing after the wait: nothing was written. */
export class ChartsStillDrawingError extends Error {
  constructor() {
    super(CHARTS_STILL_DRAWING);
    this.name = 'ChartsStillDrawingError';
  }
}

/** Thrown by an export that found the sheet hidden after the wait, or gone: nothing was written. */
export class SheetNotShownError extends Error {
  constructor(readonly why: 'hidden' | 'gone') {
    super(why === 'hidden' ? SHEET_HIDDEN : SHEET_GONE);
    this.name = 'SheetNotShownError';
  }
}

/** The editor's sheet, where every chart is drawn. */
export const editorSheet = (): HTMLElement | null =>
  typeof document === 'undefined' ? null : document.getElementById('poster-canvas');

/** Whether `sheet` is drawn on the page (Preview hides it: its box reads 0). */
export const sheetShown = (sheet: Element): boolean => sheet.getBoundingClientRect().width > 0;

/** How many charts on the editor's sheet are drawing now. */
export function chartsDrawing(): number {
  return editorSheet()?.querySelectorAll(`[${CHART_DRAWING_ATTR}]`).length ?? 0;
}

const POLL_MS = 100;

/**
 * Resolves once the charts on the editor's sheet can be copied: the sheet
 * shown and no chart on it drawing (at once when they can). Past
 * `timeoutMs` it throws ChartsStillDrawingError (a chart still drawing) or
 * SheetNotShownError (the sheet hidden); at once SheetNotShownError when
 * the sheet is gone (the editor left). The caller reads the charts as soon
 * as this resolves, in the same task: nothing the user does can come
 * between.
 */
export function waitForChartsReadable(timeoutMs: number = CHART_DRAW_WAIT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      const sheet = editorSheet();
      if (!sheet) return reject(new SheetNotShownError('gone'));
      const shown = sheetShown(sheet);
      if (shown && chartsDrawing() === 0) return resolve();
      if (Date.now() >= deadline) return reject(shown ? new ChartsStillDrawingError() : new SheetNotShownError('hidden'));
      setTimeout(check, POLL_MS);
    };
    check();
  });
}
