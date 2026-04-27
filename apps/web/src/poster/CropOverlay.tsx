/**
 * CropOverlay — Office-style inline crop UI for image / logo blocks.
 *
 * When `active` is true, paints a four-edge crop frame over the
 * block. Dragging an edge inward grows the crop on that side; the
 * area outside the visible rectangle gets darkened so the result is
 * obvious without leaving the canvas. Apply commits the percentages
 * to `block.crop`; Cancel reverts to the snapshot taken at open time.
 *
 * Storage model is the same as the sidebar sliders — one
 * `clip-path: inset()` rule on the existing `<img>` — so cropping
 * stays losslessly reversible. No pixels baked.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Block } from '@postr/shared';

export interface CropOverlayProps {
  block: Block;
  onUpdate: (id: string, patch: Partial<Block>) => void;
  onClose: () => void;
}

type Edge = 'top' | 'right' | 'bottom' | 'left';

const MIN_REMAINING = 10; // never let the crop collapse below 10%

export function CropOverlay({ block, onUpdate, onClose }: CropOverlayProps) {
  const initialRef = useRef<Block['crop'] | null>(block.crop ?? null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [crop, setCrop] = useState<Required<NonNullable<Block['crop']>>>(
    block.crop ?? { top: 0, right: 0, bottom: 0, left: 0 },
  );

  const commit = useCallback(
    (next: typeof crop) => {
      setCrop(next);
      onUpdate(block.id, {
        crop:
          next.top || next.right || next.bottom || next.left
            ? next
            : undefined,
      });
    },
    [block.id, onUpdate],
  );

  const apply = useCallback(() => {
    onClose();
  }, [onClose]);

  const cancel = useCallback(() => {
    onUpdate(block.id, { crop: initialRef.current ?? undefined });
    onClose();
  }, [block.id, onClose, onUpdate]);

  // Reset = revert to no crop, but stay in crop mode so the user
  // can drag again. Different from Cancel (which exits the mode
  // back to the snapshot taken at open time).
  const reset = useCallback(() => {
    const cleared = { top: 0, right: 0, bottom: 0, left: 0 };
    setCrop(cleared);
    onUpdate(block.id, { crop: undefined });
  }, [block.id, onUpdate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        apply();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [apply, cancel]);

  function startDrag(edge: Edge, ev: ReactPointerEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startCrop = { ...crop };
    const startX = ev.clientX;
    const startY = ev.clientY;

    const onMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;
      const next = { ...startCrop };
      const widthPct = (dx / rect.width) * 100;
      const heightPct = (dy / rect.height) * 100;
      switch (edge) {
        case 'top': {
          const max = 100 - startCrop.bottom - MIN_REMAINING;
          next.top = clamp(startCrop.top + heightPct, 0, max);
          break;
        }
        case 'bottom': {
          const max = 100 - startCrop.top - MIN_REMAINING;
          next.bottom = clamp(startCrop.bottom - heightPct, 0, max);
          break;
        }
        case 'left': {
          const max = 100 - startCrop.right - MIN_REMAINING;
          next.left = clamp(startCrop.left + widthPct, 0, max);
          break;
        }
        case 'right': {
          const max = 100 - startCrop.left - MIN_REMAINING;
          next.right = clamp(startCrop.right - widthPct, 0, max);
          break;
        }
      }
      commit(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // Bright "kept" rect — handles + visible region.
  const innerStyle: CSSProperties = {
    position: 'absolute',
    top: `${crop.top}%`,
    right: `${crop.right}%`,
    bottom: `${crop.bottom}%`,
    left: `${crop.left}%`,
    border: '2px solid #c8b6ff',
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
    pointerEvents: 'none',
  };

  return (
    <div
      ref={containerRef}
      data-postr-selection-ui="true"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        cursor: 'default',
      }}
    >
      <div style={innerStyle} />
      {/* edge handles */}
      <Handle edge="top" crop={crop} onDown={startDrag} />
      <Handle edge="right" crop={crop} onDown={startDrag} />
      <Handle edge="bottom" crop={crop} onDown={startDrag} />
      <Handle edge="left" crop={crop} onDown={startDrag} />

      {/* Done / Cancel toolbar — pinned BELOW the block (not over it)
          and sized to be unobtrusive. Anything bigger competes with
          the block-frame controls (move / crop-toggle / delete) for
          attention right above. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: -28,
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 2,
          padding: '2px 3px',
          background: 'rgba(17, 17, 24, 0.95)',
          border: '1px solid #2a2a3a',
          borderRadius: 5,
          boxShadow: '0 3px 10px rgba(0, 0, 0, 0.5)',
          whiteSpace: 'nowrap',
        }}
      >
        <button onClick={cancel} style={btnStyle} title="Cancel (Esc)">
          ✕
        </button>
        <button
          onClick={reset}
          style={btnStyle}
          title="Reset crop (revert to no crop, stay in crop mode)"
        >
          ↺
        </button>
        <button onClick={apply} style={{ ...btnStyle, ...primary }} title="Apply crop (Enter)">
          ✓
        </button>
      </div>
    </div>
  );
}

function Handle({
  edge,
  crop,
  onDown,
}: {
  edge: Edge;
  crop: Required<NonNullable<Block['crop']>>;
  onDown: (edge: Edge, ev: ReactPointerEvent) => void;
}) {
  const horizontal = edge === 'top' || edge === 'bottom';
  const cursor = horizontal ? 'ns-resize' : 'ew-resize';
  // Keep the handles small enough that the cropped image is always
  // visually dominant. Hit-area is extended via an invisible
  // padding wrapper (`paddingPx`) so users can still grab the
  // handles comfortably even though the visible glyph is tiny.
  const size = 5;
  const length = 12;
  const center = `calc(${
    horizontal
      ? crop.left + (100 - crop.left - crop.right) / 2
      : crop.top + (100 - crop.top - crop.bottom) / 2
  }% - ${(horizontal ? length : size) / 2}px)`;
  const positional: CSSProperties = horizontal
    ? {
        left: center,
        width: length,
        height: size,
        [edge === 'top' ? 'top' : 'bottom']: `calc(${edge === 'top' ? crop.top : crop.bottom}% - ${size / 2}px)`,
      }
    : {
        top: center,
        width: size,
        height: length,
        [edge === 'left' ? 'left' : 'right']: `calc(${edge === 'left' ? crop.left : crop.right}% - ${size / 2}px)`,
      };

  return (
    <div
      role="button"
      aria-label={`crop ${edge} edge`}
      onPointerDown={(e) => onDown(edge, e)}
      style={{
        position: 'absolute',
        background: '#c8b6ff',
        border: '1.5px solid #fff',
        borderRadius: 3,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.6)',
        cursor,
        touchAction: 'none',
        ...positional,
      }}
    />
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const btnStyle: CSSProperties = {
  cursor: 'pointer',
  width: 18,
  height: 18,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  fontSize: 10,
  fontWeight: 600,
  color: '#c8cad0',
  background: '#1a1a26',
  border: '1px solid #2a2a3a',
  borderRadius: 3,
  lineHeight: 1,
};

const primary: CSSProperties = {
  background: '#7c6aed',
  color: '#fff',
  border: '1px solid #7c6aed',
};
