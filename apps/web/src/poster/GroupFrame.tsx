/**
 * GroupFrame — bounding box overlay for multiselect (2+ blocks).
 *
 * Renders a dashed accent border around the union bounding box of all
 * selected blocks, with 8 resize handles for proportional group resize
 * and a move affordance (drag anywhere inside to move all).
 */
import { useRef } from 'react';
import type { Block, Palette } from '@postr/shared';
import { ResizeHandles, type ResizeHandle } from './resizeHandles';

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
        border: `1.5px dashed ${palette.accent}88`,
        borderRadius: 2,
        cursor: 'move',
        zIndex: 3,
        pointerEvents: 'auto',
      }}
    >
      <ResizeHandles
        accent={palette.accent}
        onPointerDown={(e, handle) => handlePointerDown(e, 'resize', handle)}
      />
    </div>
  );
}
