/**
 * Copy, cut and paste blocks (record 35, docs/fixes/35-block-copy.md): the
 * listeners for the rule table in blockClipboard.ts.
 *
 * - ⌘C / Ctrl+C and ⌘X / Ctrl+X with blocks selected and nothing in edit
 *   mode (no caret in a text, a cell or a field, no cells selected by
 *   dragging, no text the user selected on the page since their last press
 *   on the canvas, no dialog open; not read-only, previewing or reviewing): a
 *   window `keydown` listener writes the payload to the system clipboard
 *   through the browser's own copy event (`document.execCommand('copy')`,
 *   whose `copy` event this hook's listener fills), then ⌘X deletes the
 *   copied blocks as Delete does. Writing the clipboard is not an undo step.
 *   Only a payload ⌘V accepts is written (else nothing is copied or cut,
 *   R1-4), and ⌘X leaves on the poster a picture ⌘V could not bring back
 *   (R1-2), as it leaves the credit mark.
 * - ⌘V of a payload: record 34's canvas paste (useCanvasPaste.ts) finds it
 *   first (table B's order 1) and hands it to `pasteBlocks`: the rules (C4
 *   refusals, C3 places) on the poster as it is, then ONE commit (one undo
 *   step) at once; each image's own file is copied after (D) and takes the
 *   place of what the block showed meanwhile silently, in the poster and in
 *   its undo and redo steps (`settleCopiedFiles`; review round 2, R2-1: a
 *   paste that waited for its files let a ⌘Z pressed meanwhile undo the
 *   step before, which ⌘⇧Z could not bring back; round 3, R3-3). One toast
 *   says what was left out (C4, D) or that the payload cannot be pasted
 *   (C6).
 */
import { useCallback, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import type { Block } from '@postr/shared';
import { usePosterStore } from '@/stores/posterStore';
import { copyPosterImage, heldAfterCopy, isOwnFile } from '@/data/posterImages';
import {
  CLIP_MESSAGES, admit, chartsMessage, clipboardOf, copiedBlocks, copyOffset, fromClip, imagesLostMessage, keptOnSheet,
  pictureTravels, picturesStayMessage, readClip, refusalMessage, withCopiedFiles, type ClipPayload, type CopiedFile,
} from './blockClipboard';
import { cellRangeShown, isEditing } from './canvasPaste';

export interface BlockClipboardOptions {
  /** False while read-only, previewing or reviewing. */
  enabled: boolean;
  /** A dialog is asking the user something: the keys wait (PosterEditor's modalDialogOpen). */
  dialogOpen: () => boolean;
  selectedIds: Set<string>;
  /** The sheet in units. */
  sheet: { w: number; h: number };
  /** The poster's owner and id: where a pasted image's file is copied. */
  userId: string | null | undefined;
  posterId: string | null | undefined;
  /** Put new blocks into the poster as one undo step and select them (PosterEditor commitPastedBlocks). */
  commit: (blocks: Block[]) => void;
  /** Delete blocks as Delete does (the credit mark spared); the refusal message, if any. */
  remove: (ids: string[]) => string | null;
  toast: (msg: string) => void;
}

/**
 * Put `clip` on the system clipboard through the browser's copy event:
 * `execCommand('copy')`, run inside the user's own ⌘C or ⌘X, fires the event,
 * whose listener (`pending`) writes the payload. In Chromium, Firefox and
 * WebKit the event fires with nothing selected on the page (MEASURED, record
 * 35 §8: canvas-paste-check C-copy-text clears the page's selection first).
 * Whether the payload was written.
 */
function writeClipboard(clip: { html: string; text: string }, pending: { current: { html: string; text: string } | null }, wrote: { current: boolean }): boolean {
  pending.current = clip;
  wrote.current = false;
  try {
    document.execCommand('copy');
  } catch {
    // An engine that refuses the command leaves `wrote` false.
  } finally {
    pending.current = null;
  }
  return wrote.current;
}

/** The text selected on the page ('' when the selection is collapsed or there is none). */
function selectedText(): string {
  const sel = window.getSelection();
  return sel && !sel.isCollapsed ? sel.toString() : '';
}

/**
 * D (R2-1): the copied files of poster `posterId`'s pasted or cloned blocks
 * take the place of what each showed while copying, silently: not an undo
 * step (the step that added the block is the one ⌘Z undoes), and only in a
 * block that still shows it (a Replace or an undo made meanwhile stays).
 * The same in every undo and redo step that holds the block showing it
 * (R3-3: else an undo of a step made while copying, or a redo of the paste
 * undone before its file was copied, put the source back). Nothing when
 * another poster is open by then.
 */
export function settleCopiedFiles(posterId: string | null | undefined, files: readonly CopiedFile[]): void {
  const st = usePosterStore.getState();
  if (!files.length || st.posterId !== posterId || !st.doc) return;
  const next = withCopiedFiles(st.doc.blocks, files);
  if (next) st.setBlocksSilent(next);
  st.rewriteHistory((blocks) => withCopiedFiles(blocks, files));
}

/**
 * How many of blocks `ids` are on poster `posterId` as it is now and show no
 * picture: the images a "couldn't be copied" toast may name when it is shown
 * (R3-2: a ⌘Z or a Replace made meanwhile is the user's). 0 when another
 * poster is open by then.
 */
export function emptyOnPoster(posterId: string | null | undefined, ids: ReadonlySet<string>): number {
  const st = usePosterStore.getState();
  if (st.posterId !== posterId) return 0;
  return (st.doc?.blocks ?? []).filter((b) => ids.has(b.id) && !b.imageSrc).length;
}

export function useBlockClipboard(opts: BlockClipboardOptions) {
  const ref = useRef(opts);
  ref.current = opts;
  const pending = useRef<{ html: string; text: string } | null>(null);
  const wrote = useRef(false);

  // The copy event's writer: only for a copy this hook started.
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const clip = pending.current;
      if (!clip || !e.clipboardData) return;
      e.clipboardData.setData('text/html', clip.html);
      e.clipboardData.setData('text/plain', clip.text);
      e.preventDefault();
      wrote.current = true;
    };
    document.addEventListener('copy', onCopy, true);
    return () => document.removeEventListener('copy', onCopy, true);
  }, []);

  // A press on the canvas (a rubber band, a click on a block) ends any text
  // selection on the page outside a field: the user's last act decides what
  // ⌘C copies. Text selected after it (the sidebar's words) is the user's,
  // and ⌘C copies it (the browser's copy), though a block stays selected.
  // WebKit's rubber band leaves the words it crossed selected, from the
  // sidebar into the canvas, in the shape of a triple-click in the sidebar
  // (MEASURED, record 35 §9: neither end of the range tells them apart), and
  // remembering the band's words to tell them apart at ⌘C failed in WebKit
  // (the selected text had changed by then), so the press clears them. Left
  // alone: a selection while a field has the focus (the caret or words in a
  // text, a cell), one made in a table (its cells dragged across), and the
  // words a double- or triple-click selects (R3-4: the References block's
  // words; the press made that selection). The click count is mousedown's:
  // pointerdown's `detail` is 0 in Chromium and Firefox (MEASURED, §9).
  useEffect(() => {
    let fromCanvas = false;
    let inTable = false;
    let multi = false;
    const down = (e: Event) => {
      const t = e.target as Element | null;
      fromCanvas = !!t?.closest?.('[data-postr-canvas-outer]');
      inTable = !!t?.closest?.('table');
      multi = false;
    };
    const clicks = (e: MouseEvent) => {
      multi = e.detail >= 2;
    };
    const up = () => {
      const sel = window.getSelection();
      if (fromCanvas && !inTable && !multi && sel && !sel.isCollapsed && !isEditing(document.activeElement)) sel.removeAllRanges();
      fromCanvas = false;
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('mousedown', clicks, true);
    window.addEventListener('pointerup', up, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('mousedown', clicks, true);
      window.removeEventListener('pointerup', up, true);
    };
  }, []);

  // C1 and C2: ⌘C / Ctrl+C and ⌘X / Ctrl+X.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'c' && key !== 'x') return;
      const o = ref.current;
      if (!o.enabled || o.selectedIds.size === 0 || o.dialogOpen()) return;
      if (isEditing(e.target as Element | null) || isEditing(document.activeElement) || cellRangeShown()) return;
      // Text the user selected on the page since their last press on the canvas: the browser's copy of it.
      if (selectedText().trim()) return;
      const doc = usePosterStore.getState().doc;
      if (!doc) return;
      const { blocks, charts } = copiedBlocks(doc.blocks, o.selectedIds);
      // Only the credit mark selected: ⌘C copies nothing (the browser's own
      // copy has nothing either); ⌘X refuses as Delete does.
      if (!blocks.length && !charts && key === 'c') return;
      e.preventDefault();
      // ⌘X leaves on the poster a picture ⌘V could not bring back (R1-2).
      const stay = key === 'x' ? blocks.filter((b) => !pictureTravels(b)) : [];
      const moved = blocks.filter((b) => !stay.includes(b));
      const messages: string[] = [];
      if (moved.length) {
        const clip = clipboardOf(moved);
        // Only a payload ⌘V accepts: else nothing is copied or cut (R1-4).
        if (!readClip(clip.html)?.payload) {
          o.toast(CLIP_MESSAGES.tooLarge);
          return;
        }
        if (!writeClipboard(clip, pending, wrote)) {
          o.toast(CLIP_MESSAGES.copyFailed);
          return;
        }
      }
      if (charts) messages.push(chartsMessage(charts));
      if (stay.length) messages.push(picturesStayMessage(stay.length));
      if (key === 'x') {
        // The copied blocks, and the locked ones selected (Delete's toast for the credit mark); a chart and a picture that stays are not cut.
        const ids = doc.blocks.filter((b) => o.selectedIds.has(b.id) && (b.locked || moved.includes(b))).map((b) => b.id);
        const refusal = ids.length ? o.remove(ids) : null;
        if (refusal) messages.push(refusal);
      }
      if (messages.length) o.toast(messages.join(' '));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /**
   * C3, C4, D, C6: paste a payload (null: it failed validation). The copies
   * go in at once, as one undo step (R2-1); an image shows its source while
   * its file is copied when that is this account's own file (its own
   * picture), else nothing, and takes its own file once copied. A copy that
   * fails keeps it showing that file, which nothing deletes, unless storage
   * says the file does not exist (`heldAfterCopy`; R3-1: a figure cut in one
   * poster and pasted in another was lost from both when storage was busy;
   * the final check's F35-FC-2, correction 5: the same when storage refused
   * for a reason not about the file). Another account's file is never
   * shown, so its block is empty. The toast once the copies have answered,
   * naming only the pasted images then on the poster and empty (R3-2: a ⌘Z
   * or a Replace made meanwhile is the user's).
   */
  const pasteBlocks = useCallback(async (payload: ClipPayload | null) => {
    const o = ref.current;
    if (!payload) {
      o.toast(CLIP_MESSAGES.invalid);
      return;
    }
    const doc = usePosterStore.getState().doc;
    if (!doc) return;
    const { userId, posterId } = o;
    // C4 and C3 on the poster as it is at the key: a refused block needs no file.
    const { kept, refused } = admit(payload.blocks, doc.blocks);
    const offset = copyOffset(payload.blocks, doc.blocks);
    const made = kept.map((c) => {
      const { block, src, lost } = fromClip(c, `b${nanoid(6)}`);
      const shown = src && isOwnFile(src, userId) ? src : null;
      return { block: { ...block, ...keptOnSheet(c, offset, o.sheet), imageSrc: shown }, src, lost };
    });
    const blocks = made.map((m) => m.block);
    if (blocks.length) o.commit(blocks);
    const copies: CopiedFile[] = await Promise.all(made.filter((m) => m.src).map(async (m) => {
      const copied = await copyPosterImage(m.src!, userId, posterId, m.block.id);
      return { id: m.block.id, from: m.block.imageSrc, to: heldAfterCopy(m.block.imageSrc, copied) };
    }));
    if (usePosterStore.getState().posterId !== posterId) return;
    settleCopiedFiles(posterId, copies);
    const emptied = new Set([...made.filter((m) => m.lost).map((m) => m.block.id), ...copies.filter((c) => !c.to).map((c) => c.id)]);
    const lost = emptyOnPoster(posterId, emptied);
    const messages = [...(refused.length ? [refusalMessage(refused)] : []), ...(lost ? [imagesLostMessage(lost)] : [])];
    if (messages.length) o.toast(messages.join(' '));
  }, []);

  return { pasteBlocks };
}
