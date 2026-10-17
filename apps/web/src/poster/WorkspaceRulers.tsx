/**
 * WorkspaceRulers — the inch rulers along the top and left of the canvas,
 * fixed to the canvas's edges, Figma-style.
 *
 * The marks are placed from where the page lays the sheet out, read
 * against each ruler bar, never from a formula for where it ought to be.
 * The formula (the workarea's gutter less the scroll) left out the
 * workarea's centring of the sheet and the bars' own 24 px inset, and put
 * the marks up to 38.8 in off at the fit and 138 in at the zoom floor
 * (docs/fixes/04-rulers-match-sheet.md, cause A).
 *
 * The reading is the sheet's layout slot (the untransformed box that holds
 * its frame), not the sheet's painted box: the editor's entrance animation
 * scales the frame for 0.4 s and fires no event, and a reading of the
 * painted box taken during it stayed up to 5 px off (the fix's record).
 * The reading is redone after every render that can move the sheet (the
 * zoom and the gutter), when the canvas scrolls (a listener of the rulers'
 * own), and when the canvas, the sheet's frame or the workarea that centres
 * the sheet changes size: a resize that leaves the zoom unchanged (a fit
 * capped at 5×, a fit set by the other axis, a new poster height)
 * re-renders nothing else, and the rulers then stopped part of the way
 * along, or kept the old position (cause B); and WebKit, with scrollbars
 * that take space, moved the centred sheet with only the workarea resizing
 * (the step 9-F review, F-01). A reading from bars with no size (Preview
 * hides the editor) is ignored.
 *
 * The marks move with the sheet by layout: each reading is written to the
 * left (top ruler) or top (left ruler) of the layer that holds them, from
 * the resize observer or the scroll event itself, before the browser paints,
 * and rounded to the screen's whole device pixels (the second step 10
 * review, R3-F1; the review of the port, R1-F1). A
 * browser snaps layout to its device pixel grid when it paints and does not
 * always snap a transform a script sets (the follow-up review's critic,
 * CG-1). Measured with scripts/ruler-paint-check.mjs (the record's section
 * 11.3): placed by layout, 0 of 27,093 painted ticks smeared over 265
 * layouts; moved by the same rounded translate, WebKit at 1.25 and 1.5
 * smeared 226 and 121 of 3,078 each, Chromium none.
 * Through React state alone the new position reached
 * the page a task later, after the frame was painted, and the rulers showed
 * the old position for a frame or two on leaving Preview, a size change, the
 * guides panel closing, the sidebar hiding, each pinch step, a wheel scroll
 * and a jump to a block (cause C). React renders only which marks exist:
 * across the canvas's whole scrollable content as it was at the last
 * reading, and a margin past each end of the bars (a bar's length, at most
 * 600 px); chosen again, at ordinary priority, when the content changes or
 * the bars leave them. A synchronous flush of the rulers' state renders any
 * pending update of the editor with it, inside the callback (the step 9
 * review of cause C), so the rulers flush only when the bars would otherwise
 * show a stretch without marks; in React's own commit they set their state
 * plainly, since React refuses a flush there (the step 9-E review, E-03).
 * The bars leave the marks after a resize that moves the sheet past the
 * margin (leaving Preview after the window grew, the step 9-D review, D-01;
 * the window growing at the zoom floor, in width or in height alone), and
 * on a scroll into content that grew with nothing the rulers observe
 * resizing (a block nudged far off the sheet; the second step 10 review, R1-F1 and
 * R2-F1).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { PX } from './constants';

/**
 * The sheet's top-left corner in each bar's own coordinates, each bar's
 * length, the canvas's scrollable content (its start in the bars'
 * coordinates, and its size), and where the bars start on the screen (the
 * top bar's left, the left bar's top), in px.
 */
interface SheetInBars {
  x: number;
  y: number;
  width: number;
  height: number;
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  barX: number;
  barY: number;
}

/** The ruler bars' thickness, in px. */
const RULER_PX = 24;
/**
 * How near below a half device pixel a reading rounds up, in device px (see
 * place()): above single precision's error on any page coordinate up to
 * 100,000 device px (0.006), below every engine's layout grid.
 */
const TIE = 1 / 128;
const BAR_BG = '#12121e';
const BAR_EDGE = '1px solid rgba(255,255,255,0.08)';

function readSheetInBars(canvas: HTMLElement, top: HTMLElement, left: HTMLElement): SheetInBars | null {
  // The frame's parent is laid out where the frame is, but nothing
  // transforms it; the sheet sits at the frame's top-left corner.
  const slot = canvas.querySelector('[data-postr-canvas-frame]')?.parentElement;
  if (!slot) return null;
  const s = slot.getBoundingClientRect();
  const t = top.getBoundingClientRect();
  const l = left.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  // The content reaches past the client box by the scrollbars that take
  // space, which the bars run over, and by the fraction a box's width has
  // and its client width does not: scrolled to the far end, those showed
  // stretches of bar past the content, and each such scroll took the
  // synchronous path (the step 9-E review, E-01).
  return {
    x: s.left - t.left, y: s.top - l.top, width: t.width, height: l.height,
    contentX: c.left + canvas.clientLeft - canvas.scrollLeft - t.left,
    contentY: c.top + canvas.clientTop - canvas.scrollTop - l.top,
    contentWidth: canvas.scrollWidth + c.width - canvas.clientWidth - canvas.clientLeft + 1,
    contentHeight: canvas.scrollHeight + c.height - canvas.clientHeight - canvas.clientTop + 1,
    barX: t.left, barY: l.top,
  };
}

const sameReading = (a: SheetInBars | null, b: SheetInBars | null) =>
  a === b ||
  (!!a && !!b &&
    (Object.keys(a) as (keyof SheetInBars)[]).every((k) => Math.abs(a[k] - b[k]) < 0.01));

/** A stretch along one bar, in px from the sheet's 0". */
interface Span {
  from: number;
  to: number;
}

/**
 * How far past each end of a bar the marks reach, in px: enough for the
 * sheet to move under a sidebar hiding or a panel closing without new marks,
 * and no more (a bar's length each side rendered three times main's marks at
 * the zoom floor on a wide screen; the step 9-D review, D-03).
 */
const MARGIN_PX = 600;

/**
 * The stretch the marks chosen at a reading cover along one bar: the
 * canvas's whole scrollable content at that reading, which no scroll moves
 * past unless the content grew with nothing observed resizing (the second step 10
 * review, R1-F1), and a margin past either end of the bar, for a resize or
 * a size change that moves the sheet more than the content reaches.
 */
function coveredSpan(origin: number, length: number, contentStart: number, contentLength: number): Span {
  const margin = Math.min(length, MARGIN_PX);
  return {
    from: Math.min(contentStart - origin, -origin - margin),
    to: Math.max(contentStart - origin + contentLength, length + margin - origin),
  };
}

const spanX = (r: SheetInBars) => coveredSpan(r.x, r.width, r.contentX, r.contentWidth);
const spanY = (r: SheetInBars) => coveredSpan(r.y, r.height, r.contentY, r.contentHeight);

/** The marks chosen at reading `drawn` cover the bars at `at`. In px from the sheet's 0", so at any zoom. */
const covers = (drawn: SheetInBars, at: SheetInBars) => {
  const x = spanX(drawn);
  const y = spanY(drawn);
  return x.from <= -at.x && at.width - at.x <= x.to && y.from <= -at.y && at.height - at.y <= y.to;
};

/**
 * The marks chosen at reading `drawn` still serve the bars at `at`: the
 * content is the same (a scroll moves it with the sheet; a zoom, a resize or
 * a size change does not), and they cover the bars.
 */
const stillCovered = (drawn: SheetInBars, at: SheetInBars) => {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  return near(drawn.contentX - drawn.x, at.contentX - at.x) && near(drawn.contentWidth, at.contentWidth) &&
    near(drawn.contentY - drawn.y, at.contentY - at.y) && near(drawn.contentHeight, at.contentHeight) &&
    covers(drawn, at);
};

/**
 * Where the sheet is in the two ruler bars, kept current when the canvas
 * scrolls or it, the sheet's frame or the workarea resizes. `read` re-reads
 * it; the caller also calls it after a zoom or gutter change. Each reading is
 * put on the marks' layers at once; `drawn` is the reading the rendered
 * marks were chosen for, and changes only when the bars leave them.
 */
function useSheetInBars(
  canvasRef: RefObject<HTMLDivElement | null>,
  topRef: RefObject<HTMLDivElement | null>,
  leftRef: RefObject<HTMLDivElement | null>,
) {
  const [drawn, setDrawn] = useState<SheetInBars | null>(null);
  const last = useRef<SheetInBars | null>(null);
  // The reading the marks on the page were chosen at.
  const onPage = useRef<SheetInBars | null>(null);
  useLayoutEffect(() => {
    onPage.current = drawn;
  }, [drawn]);
  const topMarksRef = useRef<HTMLDivElement | null>(null);
  const leftMarksRef = useRef<HTMLDivElement | null>(null);

  /**
   * Put the latest reading on the marks' layers: by layout, which the browser
   * snaps to its device pixel grid when it paints, and on the screen's whole
   * device pixels. Moved by an unrounded translate, a tick at a fractional
   * pixel was painted smeared over two (the second step 10 review, R3-F1);
   * moved by a rounded one, WebKit still smeared 226 of 3,078 ticks at a
   * ratio of 1.25 and 121 at 1.5, where layout smeared none (the record's
   * section 11.3; the follow-up review's critic, CG-1, found the same kind of
   * count). The rounding is of the layer's place on the screen, not in its
   * bar: at a browser zoom the bars themselves sit at a fraction of a device
   * pixel (24 px is 21.6 device px at 90 %), and a layer rounded in its bar
   * was rounded again by the browser, the painted 0" a device pixel off the
   * sheet's painted edge at ratios 0.9, 1.1, 1.8 and 2.2 (the review of the
   * port, R1-F1; scripts/ruler-paint-check.mjs). The 0" mark stays within
   * half a device pixel of the sheet's layout edge, on the device pixel the
   * browser paints that edge on (the record's section 11.9). A sheet laid out
   * at exactly half a device pixel is painted on the pixel after it (a half
   * rounds up), but Chromium reports boxes at single precision, so its
   * reading can come back a hair below the half (553.4999845 for 553.5 at a
   * ratio of 2.2) and was rounded down, a device pixel before the painted
   * edge (3 of 30 layouts at 2.2); a reading within TIE of a half rounds up.
   * Every engine lays boxes out on a grid coarser than TIE (1/64 device px in
   * Chromium; 1/64 or 1/60 CSS px in WebKit and Firefox, 0.011 device px or
   * more from a ratio of 0.67), so no genuine reading sits that near below a
   * half.
   */
  const place = useCallback(() => {
    const at = last.current;
    if (!at) return;
    const dpr = window.devicePixelRatio || 1;
    const snap = (v: number) => Math.round(v * dpr + TIE) / dpr;
    if (topMarksRef.current) topMarksRef.current.style.left = `${snap(at.barX + at.x) - at.barX}px`;
    if (leftMarksRef.current) leftMarksRef.current.style.top = `${snap(at.barY + at.y) - at.barY}px`;
  }, []);

  /**
   * Read the layout, and if the sheet or a bar moved, put it on the marks
   * now. `inCommit`: called from React's own commit (a layout effect), where
   * an update renders before the frame is painted anyway, and flushSync is
   * refused (the step 9-E review, E-03).
   */
  const read = useCallback((inCommit = false) => {
    const canvas = canvasRef.current;
    if (!canvas || !topRef.current || !leftRef.current) return;
    const next = readSheetInBars(canvas, topRef.current, leftRef.current);
    // Bars with no size are hidden (Preview hides the editor): nothing to
    // read. Adopted, such a reading left the rulers blank for a frame or two
    // on the way back, until the marks were chosen again.
    if (next && (next.width <= 0 || next.height <= 0)) return;
    if (sameReading(next, last.current)) return;
    last.current = next;
    place();
    const shown = onPage.current;
    if (shown && next && !covers(shown, next)) {
      // The bars would show a stretch with no marks until the next render:
      // render them now. Rare, since the marks reach across the whole
      // scrollable content as it was at the last reading: a resize that
      // moves the sheet past the margin (leaving Preview after the window
      // grew, the step 9-D review, D-01; the window growing at the zoom
      // floor, in width or in height alone), or a scroll into content that
      // grew with nothing observed resizing, such as a block nudged far off
      // the sheet (the second step 10 review, R1-F1 and R2-F1).
      if (inCommit) setDrawn(next);
      else flushSync(() => setDrawn(next));
      return;
    }
    setDrawn((prev) => (prev && next && stillCovered(prev, next) ? prev : next));
  }, [canvasRef, topRef, leftRef, place]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => read());
    ro.observe(canvas);
    const sheetFrame = canvas.querySelector('[data-postr-canvas-frame]');
    if (sheetFrame) ro.observe(sheetFrame);
    // The workarea centres the sheet, and can move it with neither of the
    // two above changing size: WebKit, with scrollbars that take space, lays
    // it out narrower for a frame while a scrollbar comes and goes, and the
    // rulers stayed 5 px off (the step 9-F review, F-01).
    const workarea = canvas.querySelector('[data-postr-canvas-workarea]');
    if (workarea) ro.observe(workarea);
    const onScroll = () => read();
    canvas.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      ro.disconnect();
      canvas.removeEventListener('scroll', onScroll);
    };
  }, [canvasRef, read]);

  // The device pixel ratio can change with nothing resizing or scrolling (the
  // window moved to a display of another density). The layers then sit on a
  // reading rounded for the old grid until the next scroll or resize (the
  // follow-up review, R2P-F1, measured a whole ruler smeared after a change
  // from 2 to 1 when they were moved by a translate). Placed by layout they
  // stay crisp, but without this the painted 0" sat up to a device pixel
  // from the sheet's painted edge after 7 of 25 emulated changes
  // (scripts/ruler-paint-check.mjs, change@…; the record's section 11.3).
  // Round it for the new grid, and listen for the next ratio.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    let query: MediaQueryList | null = null;
    const onChange = () => {
      place();
      listen();
    };
    function listen() {
      query?.removeEventListener('change', onChange);
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      query.addEventListener('change', onChange);
    }
    listen();
    return () => query?.removeEventListener('change', onChange);
  }, [place]);

  return { drawn, read, topMarksRef, leftMarksRef };
}

/** Every whole inch in a span, at `inchPx` px to the inch. */
function inchesOf({ from, to }: Span, inchPx: number): number[] {
  const first = Math.floor(from / inchPx);
  const last = Math.ceil(to / inchPx);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
}

interface WorkspaceRulersProps {
  /** The canvas's scroll container (`data-postr-canvas-outer`), which holds the sheet. */
  canvasRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  gutterX: number;
  gutterY: number;
}

export const WorkspaceRulers = memo(function WorkspaceRulers({
  canvasRef,
  zoom,
  gutterX,
  gutterY,
}: WorkspaceRulersProps) {
  const topRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const inchPx = PX * zoom;
  const { drawn, read, topMarksRef, leftMarksRef } = useSheetInBars(canvasRef, topRef, leftRef);
  // The zoom and the gutter each move the sheet: read it again
  // once this render is on the page.
  useLayoutEffect(() => {
    read(true);
  }, [read, zoom, gutterX, gutterY]);

  return (
    <>
      <div
        ref={topRef}
        data-postr-ruler=""
        style={{
          position: 'absolute', top: 0, left: RULER_PX, right: 0, height: RULER_PX,
          background: BAR_BG, borderBottom: BAR_EDGE,
          overflow: 'hidden', pointerEvents: 'none', zIndex: 12,
        }}
      >
        {/* The sheet's 0" is this layer's left edge, which place() sets. */}
        <div ref={topMarksRef} style={{ position: 'absolute', left: 0, top: 0, bottom: 0 }}>
          {drawn && inchesOf(spanX(drawn), inchPx).map((inch) => {
            const isMajor = inch % 5 === 0;
            return (
              <div key={inch} style={{ position: 'absolute', left: inch * inchPx, bottom: 0 }}>
                <div style={{ width: 1, height: isMajor ? 12 : 7, background: 'rgba(255,255,255,0.35)' }} />
                {isMajor && (
                  <span style={{
                    position: 'absolute', left: 3, bottom: 12,
                    fontSize: 9, color: 'rgba(255,255,255,0.45)',
                    fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap',
                  }}>
                    {inch}"
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div
        ref={leftRef}
        data-postr-ruler=""
        style={{
          position: 'absolute', top: RULER_PX, left: 0, bottom: 0, width: RULER_PX,
          background: BAR_BG, borderRight: BAR_EDGE,
          overflow: 'hidden', pointerEvents: 'none', zIndex: 12,
        }}
      >
        {/* The sheet's 0" is this layer's top edge, which place() sets. */}
        <div ref={leftMarksRef} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          {drawn && inchesOf(spanY(drawn), inchPx).map((inch) => {
            const isMajor = inch % 5 === 0;
            return (
              <div key={inch} style={{ position: 'absolute', top: inch * inchPx, left: 0 }}>
                <div style={{ height: 1, width: isMajor ? 12 : 7, background: 'rgba(255,255,255,0.35)' }} />
                {isMajor && (
                  <span style={{
                    position: 'absolute', top: 3, left: 12,
                    fontSize: 9, color: 'rgba(255,255,255,0.45)',
                    fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap',
                    writingMode: 'vertical-lr',
                  }}>
                    {inch}"
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* Corner square */}
      <div data-postr-ruler="" style={{
        position: 'absolute', top: 0, left: 0, width: RULER_PX, height: RULER_PX,
        background: BAR_BG, borderRight: BAR_EDGE, borderBottom: BAR_EDGE,
        zIndex: 13, pointerEvents: 'none',
      }} />
    </>
  );
});
