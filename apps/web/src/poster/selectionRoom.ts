/**
 * What a selected block's controls need from the screen (plan item 19,
 * record docs/fixes/19-controls-one-size.md): the size of the box its
 * resize handles sit on, whether the rotate control has room below the
 * block, and the type label's width (a handle row wider than its block
 * shows only its move button: review finding F3).
 *
 * The handles sit on the block's padding box: its rendered size less the
 * selection border. A block that grows with its text (title, text, table,
 * references, authors, a captioned image) renders at another height than
 * it stores, so the size comes from a ResizeObserver, not from `block.h`
 * (the stored-against-rendered trap of records 02 and 03). It is in sheet
 * units: a transform (the zoom, a rotation) does not change a layout size.
 *
 * Whether the rotate control fits below is read from the screen each time
 * the block renders (the editor renders every block when the canvas
 * scrolls: PosterEditor's `scrollPos`) and when the canvas changes size
 * without a render: the block's centre, the visible canvas and the ZoomBar
 * (`[data-postr-canvas-chrome]`, beside the scroll container). Only while
 * the block is selected. Before layout (and in jsdom, which does none) the
 * size is the stored one and the control stays below.
 */
import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { rotateFitsBelow, type Rect } from './selectionLayout';

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

export interface SelectionRoom {
  /** The handles' box in sheet units (the stored size until measured). */
  widthUnits: number;
  heightUnits: number;
  /** The rotate control has room below the block. */
  rotateBelow: boolean;
  /** The type label's width on screen as last drawn, px (0 before it is drawn, and in jsdom). */
  labelPx: number;
}

export function useSelectionRoom(
  frameRef: RefObject<HTMLElement | null>,
  { active, zoom, rotationDeg, stored, labelRef }: {
    active: boolean;
    zoom: number;
    rotationDeg: number;
    stored: { w: number; h: number };
    labelRef?: RefObject<HTMLElement | null>;
  },
): SelectionRoom {
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const [rotateBelow, setRotateBelow] = useState(true);
  const [labelPx, setLabelPx] = useState(0);
  const widthUnits = measured?.w ?? stored.w;
  const heightUnits = measured?.h ?? stored.h;

  // The padding box (the frame has no padding: its content box), while selected.
  useEffect(() => {
    const el = frameRef.current;
    if (!active || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      const box = entry.contentBoxSize?.[0];
      const w = box ? box.inlineSize : entry.contentRect.width;
      const h = box ? box.blockSize : entry.contentRect.height;
      if (!(w > 0 && h > 0)) return;
      setMeasured((prev) => (prev && Math.abs(prev.w - w) < 0.01 && Math.abs(prev.h - h) < 0.01 ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, frameRef]);

  const measure = useCallback(() => {
    const el = frameRef.current;
    const outer = el?.closest<HTMLElement>('[data-postr-canvas-outer]');
    if (!el || !outer) return;
    const o = outer.getBoundingClientRect();
    const view = { x: o.left + outer.clientLeft, y: o.top + outer.clientTop, w: outer.clientWidth, h: outer.clientHeight };
    const stage = outer.parentElement ?? document.body;
    const obstacles = [...stage.querySelectorAll('[data-postr-canvas-chrome]')].map(rectOf);
    const b = rectOf(el);
    const fits = rotateFitsBelow({
      centre: { x: b.x + b.w / 2, y: b.y + b.h / 2 },
      halfH: (heightUnits * zoom) / 2,
      rotationDeg,
      view,
      obstacles,
    });
    setRotateBelow((prev) => (prev === fits ? prev : fits));
  }, [frameRef, heightUnits, zoom, rotationDeg]);

  // Each render of a selected block: it may have moved, grown or turned,
  // the zoom changed, or the canvas scrolled. Same answer, no re-render.
  useLayoutEffect(() => {
    if (active) measure();
  });

  // The type label's width, each render of a selected block that draws it
  // (its text and the turn it shows can change): its layout width, which is
  // its width on screen (the row is drawn in px and scaled back by the
  // zoom), and which the selection's pop animation does not scale. Kept
  // while the label is not drawn: whether the row has room for it is
  // decided by this width, so reading 0 then would show it again.
  useLayoutEffect(() => {
    const el = labelRef?.current;
    if (!active || !el) return;
    const w = parseFloat(getComputedStyle(el).width);
    const next = Number.isFinite(w) ? w : 0;
    setLabelPx((prev) => (Math.abs(prev - next) < 0.01 ? prev : next));
  });

  // The canvas changing size without a render (the guidelines panel
  // sliding open at a zoom the change does not refit) moves the ZoomBar.
  useEffect(() => {
    const outer = frameRef.current?.closest<HTMLElement>('[data-postr-canvas-outer]');
    if (!active || !outer || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(outer);
    return () => ro.disconnect();
  }, [active, frameRef, measure]);

  return { widthUnits, heightUnits, rotateBelow: active ? rotateBelow : true, labelPx: active ? labelPx : 0 };
}
