/**
 * Rubber-band selection rectangle rendered during drag-select on the
 * canvas or workspace. Drawn as a translucent accent-colored rect
 * with a dashed border.
 */

interface SelectionRectProps {
  /** Rectangle in poster coordinate units (pre-zoom). */
  x: number;
  y: number;
  w: number;
  h: number;
  accent: string;
}

export function SelectionRect({ x, y, w, h, accent }: SelectionRectProps) {
  return (
    <div
      data-postr-selection-ui="true"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        border: `1px dashed ${accent}`,
        background: `${accent}18`,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  );
}
