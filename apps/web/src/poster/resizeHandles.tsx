/**
 * Shared 8-handle resize component used by both BlockFrame (single
 * selection) and GroupFrame (multiselect bounding box).
 *
 * Renders the corner and edge-midpoint handles it is given around the
 * parent's padding box. Each handle is a 24 × 24 CSS px invisible hit zone
 * with an 8 × 8 CSS px visible square, the same size on screen at every
 * zoom (plan item 19, docs/fixes/19-controls-one-size.md): it is drawn in
 * px and scaled back by the sheet's zoom (`UNZOOM`) about the corner it is
 * placed by, which sits half a hit area (`ctl`) past the edge. Each names
 * its direction in `data-postr-resize-handle`.
 */
import { HANDLE_MARK, HIT, UNZOOM, ctl } from './selectionLayout';

export type ResizeHandle =
  | 'n' | 's' | 'e' | 'w'
  | 'nw' | 'ne' | 'sw' | 'se';

const CURSORS: Record<ResizeHandle, string> = {
  nw: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  se: 'nwse-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

/**
 * Position styles for each handle (centered on the edge/corner): the box's
 * placing corner is half a hit area out, and it scales about that corner.
 */
const OFF = ctl(-HIT / 2);
const POSITIONS: Record<ResizeHandle, React.CSSProperties> = {
  nw: { top: OFF, left: OFF, transformOrigin: 'left top' },
  ne: { top: OFF, right: OFF, transformOrigin: 'right top' },
  sw: { bottom: OFF, left: OFF, transformOrigin: 'left bottom' },
  se: { bottom: OFF, right: OFF, transformOrigin: 'right bottom' },
  n: { top: OFF, left: '50%', marginLeft: OFF, transformOrigin: 'left top' },
  s: { bottom: OFF, left: '50%', marginLeft: OFF, transformOrigin: 'left bottom' },
  e: { top: '50%', marginTop: OFF, right: OFF, transformOrigin: 'right top' },
  w: { top: '50%', marginTop: OFF, left: OFF, transformOrigin: 'left top' },
};

interface ResizeHandlesProps {
  accent: string;
  onPointerDown: (e: React.PointerEvent, handle: ResizeHandle) => void;
  /** The handles to draw (`blockControls` in selectionLayout.ts picks them for the box's size on screen). */
  handles: readonly ResizeHandle[];
}

export function ResizeHandles({ accent, onPointerDown, handles }: ResizeHandlesProps) {
  return (
    <>
      {handles.map((h) => (
        <div
          key={h}
          data-postr-resize-handle={h}
          onPointerDown={(e) => {
            e.stopPropagation();
            onPointerDown(e, h);
          }}
          style={{
            position: 'absolute',
            ...POSITIONS[h],
            width: HIT,
            height: HIT,
            transform: UNZOOM,
            cursor: CURSORS[h],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: HANDLE_MARK,
              height: HANDLE_MARK,
              border: `1px solid ${accent}`,
              background: '#fff',
              borderRadius: 1,
              boxSizing: 'border-box',
            }}
          />
        </div>
      ))}
    </>
  );
}
