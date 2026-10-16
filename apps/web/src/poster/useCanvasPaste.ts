/**
 * The canvas's paste and drop (record 34, docs/fixes/34-paste-drop.md): the
 * listeners for the rule table in canvasPaste.ts.
 *
 * - ⌘V / Ctrl+V with nothing in edit mode (table B): a document `paste`
 *   listener. A paste whose target or focused element is a field, a menu
 *   or editable text is the field's own (`isEditing`); nothing happens
 *   while a table shows cells selected by dragging (`cellRangeShown`), a
 *   dialog is open, or the editor is read-only or previewing.
 * - An image pasted into a text (table A row 3): RichTextEditor hands the
 *   file to `pasteImageNextTo`.
 * - A drop: `onDragOver` takes a drag that carries files (a browser fires
 *   `drop` only on a page that cancelled `dragover`, and otherwise opens the
 *   file in the tab); `onDrop` places new blocks or replaces an image.
 *
 * A new block is made once its image is stored (imageFile.ts) and goes into
 * the poster in ONE `commit` (one undo step), with the poster as it is by
 * then; nothing is added if another poster was opened meanwhile. Filling an
 * existing image block (an empty one selected, or one a file is dropped on)
 * is the image block's own upload (blocks.tsx ImageBlock, through
 * imageFile.ts `IMAGE_FILE_EVENT`), so it is stored, drawn and undone as its
 * "+ Upload figure" and Replace are.
 */
import { useCallback, useEffect, useRef, type DragEvent, type RefObject } from 'react';
import { nanoid } from 'nanoid';
import type { Block } from '@postr/shared';
import { usePosterStore } from '@/stores/posterStore';
import {
  cellRangeShown, centredIn, dropPositions, filesOf, insertSize, isEditing, nextTo, readCanvasPaste, tableFromRows,
  type Box, type Size,
} from './canvasPaste';
import { imageBlockSize, imageFileProblem, putFileIntoImageBlock, readImageSize, storeImageFile } from './imageFile';

export interface CanvasPasteOptions {
  /** False while read-only or previewing. */
  enabled: boolean;
  /** A dialog is asking the user something: the canvas waits (PosterEditor's modalDialogOpen). */
  dialogOpen: () => boolean;
  /** The canvas's scroll container (data-postr-canvas-outer). */
  canvasRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  /** The sheet in units. */
  sheet: Size;
  selectedIds: Set<string>;
  /** The poster's owner and id: where an image is uploaded. */
  userId: string | null | undefined;
  posterId: string | null | undefined;
  /** Put new blocks into the poster as one undo step and select them. */
  commit: (blocks: Block[]) => void;
}

/** A new block of a type, at a place, of a size. */
function newBlock(type: Block['type'], at: { x: number; y: number }, size: Size, fields: Partial<Block>): Block {
  return {
    id: `b${nanoid(6)}`, type, x: at.x, y: at.y, w: size.w, h: size.h,
    content: '', imageSrc: null, imageFit: 'contain', tableData: null, ...fields,
  };
}

/** Image files that pass the upload's checks; each other one is named in the upload's message. */
function usableImages(files: File[]): File[] {
  return files.filter((f) => {
    const problem = imageFileProblem(f);
    if (problem) window.alert(problem);
    return !problem;
  });
}

const sheetEl = () => document.getElementById('poster-canvas');

export function useCanvasPaste(opts: CanvasPasteOptions) {
  const ref = useRef(opts);
  ref.current = opts;

  /** The part of the sheet the canvas shows, in units; null when none of it shows. */
  const viewOfSheet = useCallback((): Box | null => {
    const outer = ref.current.canvasRef.current;
    const sheet = sheetEl();
    if (!outer || !sheet) return null;
    const o = outer.getBoundingClientRect();
    const s = sheet.getBoundingClientRect();
    const z = ref.current.zoom;
    const x0 = Math.max(o.left + outer.clientLeft, s.left);
    const y0 = Math.max(o.top + outer.clientTop, s.top);
    const x1 = Math.min(o.left + outer.clientLeft + outer.clientWidth, s.right);
    const y1 = Math.min(o.top + outer.clientTop + outer.clientHeight, s.bottom);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: (x0 - s.left) / z, y: (y0 - s.top) / z, w: (x1 - x0) / z, h: (y1 - y0) / z };
  }, []);

  /**
   * New image blocks from image files already checked: each stored under
   * its new block's id and measured, then all placed by `place` (given
   * their sizes) and put into the poster in one commit — unless another
   * poster was opened while they were stored.
   */
  const addImages = useCallback(async (files: File[], place: (sizes: Size[]) => Array<{ x: number; y: number }>) => {
    const { userId, posterId } = ref.current;
    const made = await Promise.all(files.map(async (file) => {
      const id = `b${nanoid(6)}`;
      const [natural, src] = await Promise.all([readImageSize(file), storeImageFile(file, userId, posterId, id)]);
      return src ? { id, src, size: imageBlockSize(natural, insertSize('image')) } : null;
    }));
    const stored = made.filter((m): m is NonNullable<typeof m> => m !== null);
    if (!stored.length || usePosterStore.getState().posterId !== posterId) return;
    const at = place(stored.map((m) => m.size));
    ref.current.commit(stored.map((m, i) => ({ ...newBlock('image', at[i]!, m.size, { imageSrc: m.src }), id: m.id })));
  }, []);

  // Table B: ⌘V with nothing in edit mode.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const o = ref.current;
      if (!o.enabled || !e.clipboardData) return;
      if (isEditing(e.target as Element | null) || isEditing(document.activeElement) || cellRangeShown() || o.dialogOpen()) return;
      const what = readCanvasPaste(e.clipboardData);
      if (!what) return;
      e.preventDefault();
      const view = viewOfSheet();
      if (what.kind === 'table' || what.kind === 'text') {
        const size = insertSize(what.kind);
        const at = centredIn(view, size, o.sheet);
        o.commit([what.kind === 'table'
          ? newBlock('table', at, size, { tableData: tableFromRows(what.rows) })
          : newBlock('text', at, size, { content: what.html })]);
        return;
      }
      if (!usableImages([what.file]).length) return;
      const doc = usePosterStore.getState().doc;
      const only = o.selectedIds.size === 1 ? doc?.blocks.find((b) => o.selectedIds.has(b.id)) : undefined;
      if (only?.type === 'image' && !only.imageSrc) {
        putFileIntoImageBlock(only.id, what.file);
        return;
      }
      void addImages([what.file], ([size]) => [centredIn(view, size!, o.sheet)]);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [addImages, viewOfSheet]);

  /** Table A row 3: an image pasted while editing text block `blockId`: a new image block next to it as drawn; the text left as it is. */
  const pasteImageNextTo = useCallback((blockId: string, file: File) => {
    const o = ref.current;
    if (!o.enabled || !usableImages([file]).length) return;
    const b = usePosterStore.getState().doc?.blocks.find((x) => x.id === blockId);
    if (!b) return;
    const el = sheetEl()?.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
    const drawn: Box = { x: b.x, w: b.w, y: el?.offsetTop ?? b.y, h: el?.offsetHeight ?? b.h };
    // The new image block is selected once stored: the text is left now, as PowerPoint leaves it.
    (document.activeElement as HTMLElement | null)?.blur?.();
    void addImages([file], ([size]) => [nextTo(drawn, size!, o.sheet)]);
  }, [addImages]);

  const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!ref.current.enabled || !carriesFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    const o = ref.current;
    if (!o.enabled || !carriesFiles(e)) return;
    e.preventDefault();
    const images = usableImages(filesOf(e.dataTransfer));
    if (!images.length) return;
    const hit = (e.target as Element | null)?.closest?.('#poster-canvas [data-block-id]');
    const onBlock = usePosterStore.getState().doc?.blocks.find((b) => b.id === hit?.getAttribute('data-block-id'));
    if (images.length === 1 && onBlock?.type === 'image') {
      putFileIntoImageBlock(onBlock.id, images[0]!);
      return;
    }
    const s = sheetEl()?.getBoundingClientRect();
    if (!s) return;
    const pt = { x: (e.clientX - s.left) / o.zoom, y: (e.clientY - s.top) / o.zoom };
    void addImages(images, (sizes) => dropPositions(pt, sizes, o.sheet));
  }, [addImages]);

  return { pasteImageNextTo, onDragOver, onDrop };
}
