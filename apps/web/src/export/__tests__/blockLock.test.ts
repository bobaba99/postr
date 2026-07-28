/**
 * Locked-block enforcement — one test per delete path.
 *
 * The guard is shared, but the POINT of the feature is that no path
 * escapes it, so each path gets its own case. A new delete path added
 * without a case here is the failure mode this file exists to catch.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import type { Block, PosterDoc } from '@postr/shared';
import {
  LOCKED_BLOCK_REFUSAL,
  filterDeletable,
  isLocked,
  preserveLocked,
} from '../blockLock';
import { usePosterStore } from '@/stores/posterStore';
import { makeFixtureDoc, baseBlock } from './fixtures';

const locked = (over: Partial<Block> = {}): Block =>
  baseBlock({ id: 'ack', type: 'logo', locked: true, x: 10, y: 10, w: 12, h: 12, ...over });

const plain = (id: string, over: Partial<Block> = {}): Block =>
  baseBlock({ id, type: 'text', x: 0, y: 0, w: 50, h: 20, ...over });

describe('isLocked', () => {
  it('is true only for locked === true', () => {
    expect(isLocked({ locked: true })).toBe(true);
    expect(isLocked({ locked: undefined })).toBe(false);
    expect(isLocked({})).toBe(false);
  });
});

describe('filterDeletable', () => {
  it('removes an unlocked block and reports no refusal', () => {
    const blocks = [plain('a'), plain('b')];
    const out = filterDeletable(blocks, ['a']);
    expect(out.blocks.map((b) => b.id)).toEqual(['b']);
    expect(out.removedIds).toEqual(['a']);
    expect(out.refused).toBe(false);
    expect(out.refusalMessage).toBeNull();
  });

  it('spares a locked block and reports the refusal copy', () => {
    const blocks = [plain('a'), locked()];
    const out = filterDeletable(blocks, ['ack']);
    expect(out.blocks.map((b) => b.id)).toEqual(['a', 'ack']);
    expect(out.removedIds).toEqual([]);
    expect(out.refusalMessage).toBe(LOCKED_BLOCK_REFUSAL);
  });

  it('deletes what it can from a MIXED selection and keeps the locked one', () => {
    const blocks = [plain('a'), locked(), plain('b')];
    const out = filterDeletable(blocks, ['a', 'ack', 'b']);
    expect(out.blocks.map((b) => b.id)).toEqual(['ack']);
    expect(out.removedIds).toEqual(['a', 'b']);
    expect(out.refusalMessage).toBe(LOCKED_BLOCK_REFUSAL);
  });

  it('preserves paint order (array order) among survivors', () => {
    const blocks = [plain('a'), plain('b'), locked(), plain('c')];
    const out = filterDeletable(blocks, ['b']);
    expect(out.blocks.map((b) => b.id)).toEqual(['a', 'ack', 'c']);
  });

  it('never mutates its input', () => {
    const blocks = [plain('a'), locked()];
    const snapshot = JSON.stringify(blocks);
    filterDeletable(blocks, ['a', 'ack']);
    expect(JSON.stringify(blocks)).toBe(snapshot);
  });
});

describe('preserveLocked', () => {
  it('re-appends a locked block dropped from a replacement list', () => {
    const prev = [plain('a'), locked()];
    const next = [plain('a')];
    expect(preserveLocked(prev, next).map((b) => b.id)).toEqual(['a', 'ack']);
  });

  it('re-appends with the block geometry intact', () => {
    const prev = [locked({ x: 88, y: 120, w: 16, h: 16 })];
    const out = preserveLocked(prev, []);
    expect(out[0]).toMatchObject({ x: 88, y: 120, w: 16, h: 16 });
  });

  it('leaves a locked block that IS present exactly as the new list has it', () => {
    // This is what keeps a locked block movable: a drag writes new
    // coordinates through setBlocks, and the guard must not revert them.
    const prev = [locked({ x: 10, y: 10 })];
    const next = [locked({ x: 200, y: 300 })];
    const out = preserveLocked(prev, next);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ x: 200, y: 300 });
  });

  it('does not duplicate when the block is present', () => {
    const prev = [locked()];
    const next = [locked(), plain('a')];
    expect(preserveLocked(prev, next).filter((b) => b.id === 'ack')).toHaveLength(1);
  });

  it('is a no-op when nothing is locked', () => {
    const prev = [plain('a'), plain('b')];
    expect(preserveLocked(prev, []).map((b) => b.id)).toEqual([]);
  });
});

// =========================================================================
// Store-level: one case per real delete path
// =========================================================================

function seed(blocks: Block[]): PosterDoc {
  const doc = makeFixtureDoc({ blocks });
  usePosterStore.getState().setPoster('p1', doc);
  return doc;
}

const ids = () => usePosterStore.getState().doc!.blocks.map((b) => b.id);

describe('delete paths — the locked block survives every one', () => {
  beforeEach(() => {
    usePosterStore.setState({ posterId: null, doc: null, canUndo: false, canRedo: false });
  });

  it('PATH: store removeBlock', () => {
    seed([plain('a'), locked()]);
    usePosterStore.getState().removeBlock('ack');
    expect(ids()).toContain('ack');
  });

  it('PATH: store removeBlock still deletes unlocked blocks', () => {
    seed([plain('a'), locked()]);
    usePosterStore.getState().removeBlock('a');
    expect(ids()).toEqual(['ack']);
  });

  it('PATH: a refused removeBlock pushes NO undo entry', () => {
    seed([plain('a'), locked()]);
    expect(usePosterStore.getState().canUndo).toBe(false);
    usePosterStore.getState().removeBlock('ack');
    expect(usePosterStore.getState().canUndo).toBe(false);
  });

  it('PATH: single-block delete (frame button / context menu / sidebar) via setBlocks', () => {
    // deleteBlock in PosterEditor computes `filterDeletable` then
    // writes via setBlocks; both layers are exercised here.
    const doc = seed([plain('a'), locked()]);
    const out = filterDeletable(doc.blocks, ['ack']);
    usePosterStore.getState().setBlocks(out.blocks);
    expect(ids()).toContain('ack');
  });

  it('PATH: multi-select keyboard batch delete', () => {
    const doc = seed([plain('a'), plain('b'), locked()]);
    const out = filterDeletable(doc.blocks, new Set(['a', 'b', 'ack']));
    usePosterStore.getState().setBlocks(out.blocks);
    expect(ids()).toEqual(['ack']);
  });

  it('PATH: raw setBlocks that simply omits the block (clear-all / auto-layout)', () => {
    seed([plain('a'), locked()]);
    usePosterStore.getState().setBlocks([]);
    expect(ids()).toEqual(['ack']);
  });

  it('PATH: setBlocksSilent (drag intermediates) cannot drop it either', () => {
    seed([plain('a'), locked()]);
    usePosterStore.getState().setBlocksSilent([]);
    expect(ids()).toEqual(['ack']);
  });

  it('PATH: template swap replacing the whole block list', () => {
    seed([plain('a'), locked()]);
    usePosterStore.getState().setBlocks([plain('t1'), plain('t2')]);
    expect(ids()).toContain('ack');
  });
});

describe('undo / redo cannot remove the locked block', () => {
  beforeEach(() => {
    usePosterStore.setState({ posterId: null, doc: null, canUndo: false, canRedo: false });
  });

  it('UNDO cannot restore a state that predates the block', () => {
    // Seed a doc WITHOUT the ack block, then add it — the undo stack
    // now holds a snapshot in which the block does not exist.
    seed([plain('a')]);
    usePosterStore.getState().setBlocks([plain('a'), locked()]);
    expect(ids()).toContain('ack');

    usePosterStore.getState().undo();
    expect(ids()).toContain('ack');
  });

  it('UNDO still reverts everything else', () => {
    seed([plain('a')]);
    usePosterStore.getState().setBlocks([plain('a'), plain('b'), locked()]);
    usePosterStore.getState().undo();
    // 'b' is gone (the real undo), 'ack' is not.
    expect(ids()).not.toContain('b');
    expect(ids()).toContain('ack');
  });

  it('REDO cannot advance into a state without the block', () => {
    seed([plain('a'), locked()]);
    // A delete that somehow removed it (simulating a pre-guard build's
    // history) lands in the redo stack after an undo.
    usePosterStore.setState((s) => ({
      doc: { ...s.doc!, blocks: [plain('a')] },
    }));
    usePosterStore.getState().setBlocks([plain('a'), plain('b')]);
    usePosterStore.getState().undo();
    usePosterStore.getState().redo();
    expect(ids()).toContain('ack');
  });

  it('a locked block MOVED then undone keeps the move reverted but stays present', () => {
    seed([locked({ x: 10, y: 10 })]);
    usePosterStore.getState().setBlocks([locked({ x: 300, y: 400 })]);
    usePosterStore.getState().undo();
    const blk = usePosterStore.getState().doc!.blocks.find((b) => b.id === 'ack')!;
    expect(blk).toMatchObject({ x: 10, y: 10 });
  });
});

describe('refusal copy', () => {
  it('states the exchange without scolding or advertising a tier', () => {
    expect(LOCKED_BLOCK_REFUSAL).toBe('Postr is free — this credit stays on the poster.');
    // No paid tier exists, so no upgrade language may appear.
    expect(LOCKED_BLOCK_REFUSAL).not.toMatch(/upgrade|pro\b|premium|pay|subscri/i);
    // Not a lecture.
    expect(LOCKED_BLOCK_REFUSAL).not.toMatch(/cannot|not allowed|forbidden|denied/i);
    expect(LOCKED_BLOCK_REFUSAL).not.toMatch(/\bAI\b/);
  });
});
