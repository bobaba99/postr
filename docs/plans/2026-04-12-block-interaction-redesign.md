# Block Interaction Redesign

Date: 2026-04-12

## Summary

Redesign the poster editor's block interaction model to match PowerPoint/Google Slides conventions: 8-handle bidirectional resize, rubber-band multiselect with group manipulation, smart auto-arrange with font scaling, and supporting fixes for scroll, padding, z-index, and undo/redo feedback.

## 1. 8-Handle Resize System

### Handle type

```typescript
type ResizeHandle =
  | 'n' | 's' | 'e' | 'w'
  | 'nw' | 'ne' | 'sw' | 'se';
```

### Handle placement

8 invisible hit zones (12x12px) at edges and corners of the selection ring. Only render when block is selected. Visual: 6x6px squares, 1px border in accent color, transparent fill.

| Handle | Cursor | Anchor (stays fixed) |
|--------|--------|----------------------|
| `nw` | `nwse-resize` | bottom-right corner |
| `ne` | `nesw-resize` | bottom-left corner |
| `sw` | `nesw-resize` | top-right corner |
| `se` | `nwse-resize` | top-left corner |
| `n` | `ns-resize` | bottom edge |
| `s` | `ns-resize` | top edge |
| `e` | `ew-resize` | left edge |
| `w` | `ew-resize` | right edge |

### Resize math

Top/left handles adjust `(x, y)` simultaneously with `(w, h)`:

- Handle contains `'w'`: `x = ox + dx`, `w = ow - dx`
- Handle contains `'e'`: `w = ow + dx`
- Handle contains `'n'`: `y = oy + dy`, `h = oh - dy`
- Handle contains `'s'`: `h = oh + dy`
- Corners combine both axes

All values pass through `snap()` and enforce minimums (`w >= 40`, `h >= 20`). Rotation-aware local-frame transform (existing cos/sin math) applies to all 8 handles. Heading blocks get all 8 handles (replacing the current right-edge-only bar).

## 2. Overlapping Block Resize + Handle Layering

### Selected block always on top

- Selected block gets `z-index: 2` on BlockFrame wrapper
- Unselected blocks stay at `z-index: 0`
- In multiselect, all selected blocks get `z-index: 2`
- Group bounding box renders at `z-index: 3`

### Handles outside canvas

Current `overflow: visible` on canvas frame already allows this. Workarea padding (96px) exceeds maximum handle overshoot (26px top + 36px rotate = 62px).

## 3. Multiselect + Rubber-Band Selection

### Selection state

```typescript
// Replace
const [selectedId, setSelectedId] = useState<string | null>(null);
// With
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

### Three selection methods

1. **Rubber-band drag** -- pointerdown on empty canvas or workspace, drag beyond 4px threshold, draw selection rectangle. On pointerup, all blocks whose bounding box intersects the rectangle are selected. Visual: 1px dashed accent border + accent fill at 10% opacity.

2. **Shift+click** -- toggle individual blocks in/out of selection.

3. **Cmd/Ctrl+click** -- same as Shift+click.

**Click-without-drag** on canvas/workspace clears selection.

### Group bounding box (GroupFrame)

When `selectedIds.size > 1`:

- Union bounding box wraps all selected blocks
- 8 resize handles (same visual as single-block)
- Move: drag anywhere inside group box to move all
- No rotate handle (matches PowerPoint multiselect behavior)
- 1px dashed accent border (distinguishes from single-block solid border)

### Group move

Delta `(dx, dy)` applied uniformly to every block in `selectedIds`.

### Group resize (proportional mapping)

```
newBlock.x = gx' + ((block.x - gx) / gw) * gw'
newBlock.y = gy' + ((block.y - gy) / gh) * gh'
newBlock.w = (block.w / gw) * gw'
newBlock.h = (block.h / gh) * gh'
```

## 4. Text Box Zero Padding

All text-bearing block types change to `padding: 0`. Content fills block edge-to-edge. Users control whitespace by positioning blocks with gaps, not internal padding. Matches PowerPoint/Slides.

## 5. Scroll Fix

### Root cause

Workarea sizes via `height: max-content` based on canvas frame (`cH * zoom`), but blocks with `height: auto` and `overflow: visible` grow taller than `cH`. Scroll container stops at `cH * zoom + padding`.

### Fix

ResizeObserver on `#poster-canvas` measures actual painted height. Canvas frame height becomes `Math.max(cH * zoom, measuredHeight * zoom)`.

```typescript
const [canvasOverflow, setCanvasOverflow] = useState(0);

useEffect(() => {
  const el = document.getElementById('poster-canvas');
  if (!el) return;
  const ro = new ResizeObserver(([entry]) => {
    const painted = entry.borderBoxSize[0].blockSize;
    setCanvasOverflow(Math.max(0, painted - cH));
  });
  ro.observe(el);
  return () => ro.disconnect();
}, [cH]);

// Frame height:
height: (cH + canvasOverflow) * zoom
```

## 6. Smart Auto-Arrange

### Pass 1 -- layout at current sizes

Run existing column-based layout. Measure total content height per column. If all columns fit within `canvasHeight - margins`, done.

### Pass 2 -- shrink to fit

If any column overflows:

1. Compute scale factor per column: `availableHeight / actualHeight`
2. Take minimum scale factor across all columns
3. Apply uniformly to body and heading font sizes
4. Floor body font at 3 units (~22pt print size)
5. Re-run Pass 1 with scaled sizes

If still doesn't fit at minimum font: compress block heights proportionally. Issues panel flags these.

### Constraints

- Title and authors font sizes never scaled
- Scale factor uniform across all body/heading text
- Column widths preserved
- Block positions recalculated after scaling

## 7. Undo/Redo Toast

Floating pill at bottom-center, 40px above zoom controls:

- Text: "Undo" or "Redo", 13px, muted white
- Background: `rgba(255, 255, 255, 0.1)` + `backdrop-filter: blur(8px)`
- Border-radius: 16px, padding: `6px 16px`
- Animation: fade in 150ms, hold 1s, fade out 300ms
- Rapid presses reset dismiss timer (no stacking)
- Simple `useState<string | null>` + `setTimeout`

## File Map

### Modified

| File | Changes |
|------|---------|
| `poster/blocks.tsx` | 8-handle system, z-index on selected, zero padding, heading resize |
| `poster/PosterEditor.tsx` | `selectedIds` Set, `useBlockDrag` 8-direction + group ops, rubber-band selection, scroll ResizeObserver, undo toast state |
| `poster/autoLayout.ts` | Pass 2 shrink-to-fit with font scaling |

### New

| File | Purpose |
|------|---------|
| `poster/GroupFrame.tsx` | Group bounding box + proportional resize for multiselect |
| `poster/SelectionRect.tsx` | Rubber-band rectangle during drag-select |
| `poster/UndoToast.tsx` | Animated toast pill for undo/redo |
| `poster/resizeHandles.tsx` | Shared 8-handle component for BlockFrame and GroupFrame |

## Implementation Order

1. `resizeHandles.tsx` + BlockFrame integration (8-handle, z-index, zero padding)
2. `useBlockDrag` resize math for all 8 directions
3. `selectedIds` + Shift/Cmd+click
4. `SelectionRect.tsx` + rubber-band drag on canvas/workspace
5. `GroupFrame.tsx` + group move/resize
6. Scroll overflow fix (ResizeObserver)
7. Smart auto-arrange (Pass 2)
8. `UndoToast.tsx`
