/**
 * Shared 8-handle resize component used by both BlockFrame (single
 * selection) and GroupFrame (multiselect bounding box).
 *
 * Renders 4 corner handles + 4 edge midpoint handles around the
 * parent's border box. Each handle is a 10×10px invisible hit zone
 * with a 5×5px visible square indicator.
 */

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

/** Position styles for each handle (centered on the edge/corner). */
const POSITIONS: Record<ResizeHandle, React.CSSProperties> = {
  nw: { top: -5, left: -5 },
  ne: { top: -5, right: -5 },
  sw: { bottom: -5, left: -5 },
  se: { bottom: -5, right: -5 },
  n: { top: -5, left: '50%', transform: 'translateX(-50%)' },
  s: { bottom: -5, left: '50%', transform: 'translateX(-50%)' },
  e: { top: '50%', right: -5, transform: 'translateY(-50%)' },
  w: { top: '50%', left: -5, transform: 'translateY(-50%)' },
};

const ALL_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CORNER_HANDLES: ResizeHandle[] = ['nw', 'ne', 'se', 'sw'];

interface ResizeHandlesProps {
  accent: string;
  onPointerDown: (e: React.PointerEvent, handle: ResizeHandle) => void;
  /** Show only corner handles (for proportional-only resize). */
  cornersOnly?: boolean;
}

export function ResizeHandles({ accent, onPointerDown, cornersOnly }: ResizeHandlesProps) {
  const handles = cornersOnly ? CORNER_HANDLES : ALL_HANDLES;
  return (
    <>
      {handles.map((h) => (
        <div
          key={h}
          onPointerDown={(e) => {
            e.stopPropagation();
            onPointerDown(e, h);
          }}
          style={{
            position: 'absolute',
            ...POSITIONS[h],
            width: 10,
            height: 10,
            cursor: CURSORS[h],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: 5,
              height: 5,
              border: `1px solid ${accent}`,
              background: '#fff',
              borderRadius: 1,
            }}
          />
        </div>
      ))}
    </>
  );
}
