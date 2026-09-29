/**
 * What a browser would report about the editor's workspace, for the fit
 * and zoom tests (fix 03, docs/fixes/03-fit-whole-sheet.md). jsdom has no
 * layout, so the canvas's size and the window's width are stubbed; the
 * zoom and the padding are then read off the rendered DOM.
 */
import { vi } from 'vitest';
import { q } from './editorKit';

/**
 * The canvas (`[data-postr-canvas-outer]`) reports `box`, and the window is
 * `innerWidth` wide: matchMedia answers min-/max-width queries for that
 * width, as a browser does.
 */
export function stubScreen(box: { width: number; height: number }, innerWidth = 1920) {
  const real = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute('data-postr-canvas-outer')) {
      const { width, height } = box;
      return { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} } as DOMRect;
    }
    return real.call(this);
  });
  vi.stubGlobal('innerWidth', innerWidth);
  vi.stubGlobal('matchMedia', (query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    const min = /min-width:\s*(\d+)px/.exec(query);
    const matches = (!max || innerWidth <= Number(max[1])) && (!min || innerWidth >= Number(min[1]));
    return {
      matches, media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
      dispatchEvent: () => false,
    };
  });
}

/** The zoom the sheet is drawn at, from its transform. */
export const zoomNow = () =>
  Number(/scale\((-?[\d.e-]+)\)/.exec(q<HTMLElement>('#poster-canvas').style.transform)![1]);

/** The workarea's padding on each side, in px. */
export const workareaPadding = () => {
  const st = q<HTMLElement>('[data-postr-canvas-workarea]').style;
  return {
    left: parseFloat(st.paddingLeft), right: parseFloat(st.paddingRight),
    top: parseFloat(st.paddingTop), bottom: parseFloat(st.paddingBottom),
  };
};

/**
 * The sheet (`pw` × `ph` in, at 10 units per inch) plus its padding at the
 * current zoom, against a `bw` × `bh` canvas: whether it fits, and whether
 * it fills the limiting side (fitted, not merely small).
 */
export function sheetInBox(bw: number, bh: number, pw: number, ph: number) {
  const pad = workareaPadding();
  const w = pw * 10 * zoomNow() + pad.left + pad.right;
  const h = ph * 10 * zoomNow() + pad.top + pad.bottom;
  return { w, h, fits: w <= bw + 0.5 && h <= bh + 0.5, touches: Math.max(w - bw, h - bh) > -0.5 };
}
