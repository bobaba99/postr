/**
 * Shared 8-handle resize component used by both BlockFrame (single
 * selection) and GroupFrame (multiselect bounding box).
 *
 * Renders 4 corner handles + 4 edge midpoint handles around the
 * parent's border box. Each handle is a 12×12px invisible hit zone
 * with a 6×6px visible square indicator — matching the PowerPoint /
 * Google Slides visual language.
 */
import type { Palette } from '@postr/shared';

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
  nw: { top: -6, left: -6 },
  ne: { top: -6, right: -6 },
  sw: { bottom: -6, left: -6 },
  se: { bottom: -6, right: -6 },
  n: { top: -6, left: '50%', transform: 'translateX(-50%)' },
  s: { bottom: -6, left: '50%', transform: 'translateX(-50%)' },
  e: { top: '50%', right: -6, transform: 'translateY(-50%)' },
  w: { top: '50%', left: -6, transform: 'translateY(-50%)' },
};

const ALL_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface ResizeHandlesProps {
  accent: string;
  onPointerDown: (e: React.PointerEvent, handle: ResizeHandle) => void;
}

export function ResizeHandles({ accent, onPointerDown }: ResizeHandlesProps) {
  return (
    <>
      {ALL_HANDLES.map((h) => (
        <div
          key={h}
          onPointerDown={(e) => {
            e.stopPropagation();
            onPointerDown(e, h);
          }}
          style={{
            position: 'absolute',
            ...POSITIONS[h],
            width: 12,
            height: 12,
            cursor: CURSORS[h],
            // Hit zone is 12×12, visual square is 6×6 centered inside
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
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
