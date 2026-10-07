/**
 * GroupFrame — bounding box overlay for multiselect (2+ blocks).
 *
 * Renders a dashed accent border around the union bounding box of all
 * selected blocks, with 8 resize handles for proportional group resize
 * and a move affordance (drag anywhere inside to move all). The dashed
 * outline and the handles are the same size on screen at every zoom, and a
 * box small on screen draws fewer handles, as a block does (plan item 19,
 * `selectionLayout.ts`). The outline is four strips along the box, each
 * scaled back to 1.5 px across, with dashes of 4 px every 7 px along it:
 * a dashed border would be drawn in the sheet's units and grow with the
 * zoom (as on main: 15 px at 10×).
 */
import { useRef } from 'react';
import type { Block, Palette } from '@postr/shared';
import { ResizeHandles, type ResizeHandle } from './resizeHandles';
import { UNZOOM_X, UNZOOM_Y, blockControls, ctl } from './selectionLayout';

interface GroupFrameProps {
  blocks: Block[];
  selectedIds: Set<string>;
  palette: Palette;
  zoom: number;
  onGroupMove: (dx: number, dy: number) => void;
  onGroupResize: (handle: ResizeHandle, dx: number, dy: number) => void;
  onGroupDragEnd: () => void;
}

/** Compute the union bounding box of selected blocks. */
export function groupBounds(blocks: Block[], selectedIds: Set<string>) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of blocks) {
    if (!selectedIds.has(b.id)) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function GroupFrame({
  blocks,
  selectedIds,
  palette,
  zoom,
  onGroupMove,
  onGroupResize,
  onGroupDragEnd,
}: GroupFrameProps) {
  const { x, y, w, h } = groupBounds(blocks, selectedIds);
  const dragRef = useRef<{
    sx: number; sy: number;
    mode: 'move' | 'resize';
    handle: ResizeHandle;
    active: boolean;
  } | null>(null);

  const handlePointerDown = (
    e: React.PointerEvent,
    mode: 'move' | 'resize',
    handle: ResizeHandle = 'se',
  ) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      mode,
      handle,
      active: false,
    };

    const onMove = (ev: PointerEvent) => {
      const s = dragRef.current;
      if (!s) return;
      const dx = (ev.clientX - s.sx) / zoom;
      const dy = (ev.clientY - s.sy) / zoom;
      if (!s.active && Math.hypot(ev.clientX - s.sx, ev.clientY - s.sy) < 4) return;
      s.active = true;
      if (s.mode === 'move') {
        onGroupMove(dx, dy);
      } else {
        onGroupResize(s.handle, dx, dy);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragRef.current?.active) {
        onGroupDragEnd();
      }
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (!Number.isFinite(x)) return null;

  // A 1.5 px dashed line along each side: 4 px dashes, 3 px gaps.
  const line = `${palette.accent}88`;
  const dashes = (deg: number) => `repeating-linear-gradient(${deg}deg, ${line} 0 ${ctl(4)}, transparent 0 ${ctl(7)})`;
  const side = (s: 'top' | 'bottom' | 'left' | 'right'): React.CSSProperties =>
    s === 'top' || s === 'bottom'
      ? { position: 'absolute', left: 0, right: 0, [s]: 0, height: 1.5, transform: UNZOOM_Y, transformOrigin: `center ${s}`, backgroundImage: dashes(90), pointerEvents: 'none' }
      : { position: 'absolute', top: 0, bottom: 0, [s]: 0, width: 1.5, transform: UNZOOM_X, transformOrigin: `${s} center`, backgroundImage: dashes(180), pointerEvents: 'none' };

  return (
    <div
      data-postr-selection-ui="true"
      onPointerDown={(e) => handlePointerDown(e, 'move')}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        cursor: 'move',
        zIndex: 3,
        pointerEvents: 'auto',
      }}
    >
      <div style={side('top')} />
      <div style={side('bottom')} />
      <div style={side('left')} />
      <div style={side('right')} />
      <ResizeHandles
        accent={palette.accent}
        onPointerDown={(e, handle) => handlePointerDown(e, 'resize', handle)}
        handles={blockControls({ wPx: w * zoom, hPx: h * zoom }).handles}
      />
    </div>
  );
}
