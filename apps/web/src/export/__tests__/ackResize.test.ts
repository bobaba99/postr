/**
 * The acknowledgement mark across a poster RESIZE.
 *
 * `preserveLocked` restores a locked block verbatim — its rect
 * included. A rect is only meaningful in the coordinate space it was
 * computed in, so a mark preserved across a size change carries
 * coordinates from a canvas that no longer exists: at best it lands on
 * top of the new template's content, at worst it sits off the sheet
 * entirely and prints clipped or not at all.
 *
 * These tests run the FULL preset matrix — every real POSTER_SIZES
 * transition, against real `makeBlocks('3col')` templates and real
 * `ensureAckBlock` seeding — and assert the invariants `ackPlacement`
 * claims for itself actually survive the resize path.
 */
import { describe, expect, it } from 'vitest';
import type { Block, PosterDoc } from '@postr/shared';
import { preserveLocked } from '../blockLock';
import { ACK_BLOCK_ID, ensureAckBlock, replaceAckBlock } from '../ackBlock';
import { makeBlocks } from '@/poster/templates';
import { M, POSTER_SIZES } from '@/poster/constants';
import { makeFixtureDoc } from './fixtures';

const KEYS = Object.keys(POSTER_SIZES);

function overlaps(a: Block, b: Block): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

/**
 * A doc at `key`, laid out from the real template and seeded.
 *
 * The stock `3col` template packs content edge to edge INSIDE the
 * margins — on 48×36 it spans x 10…470 and y 10…342.2 against a 350
 * margin line — so a seeded mark has nowhere legal to sit and is
 * correctly declined. Every scenario here therefore trims the last
 * template block, which is what a real poster looks like once a user
 * has deleted or shortened a section: enough room for the mark, and
 * the arrangement in which a stale rect actually does damage.
 */
function docAt(key: string): PosterDoc {
  const sz = POSTER_SIZES[key]!;
  const full = makeBlocks('3col', sz.w, sz.h);
  return ensureAckBlock(
    makeFixtureDoc({
      widthIn: sz.w,
      heightIn: sz.h,
      blocks: full.slice(0, -1),
    }),
  );
}

/**
 * Exactly what `PosterEditor.changeSize` does: rebuild from the
 * template, preserve the locked mark, then re-place it for the new
 * canvas.
 */
function resize(doc: PosterDoc, toKey: string): PosterDoc {
  const sz = POSTER_SIZES[toKey]!;
  const next = makeBlocks('3col', sz.w, sz.h).slice(0, -1);
  return replaceAckBlock({
    ...doc,
    widthIn: sz.w,
    heightIn: sz.h,
    blocks: preserveLocked(doc.blocks, next),
  });
}

describe('resize — the mark survives every preset transition', () => {
  for (const from of KEYS) {
    for (const to of KEYS) {
      it(`${from} → ${to}: mark stays on-canvas, inside the margin, and clear of every block`, () => {
        const next = resize(docAt(from), to);
        const mark = next.blocks.find((b) => b.id === ACK_BLOCK_ID);
        // Dropping the mark is a legal outcome only when the canvas
        // genuinely has no room; every preset here does have room.
        expect(mark, `mark dropped on ${from} → ${to}`).toBeDefined();

        const canvasW = next.widthIn * 10;
        const canvasH = next.heightIn * 10;
        expect(mark!.x).toBeGreaterThanOrEqual(M);
        expect(mark!.y).toBeGreaterThanOrEqual(M);
        expect(mark!.x + mark!.w).toBeLessThanOrEqual(canvasW - M);
        expect(mark!.y + mark!.h).toBeLessThanOrEqual(canvasH - M);

        for (const b of next.blocks) {
          if (b.id === ACK_BLOCK_ID) continue;
          expect(overlaps(mark!, b), `overlapped ${b.type} ${b.id}`).toBe(false);
        }
      });
    }
  }

  it('keeps the mark locked and keeps its identity through a resize', () => {
    const next = resize(docAt('36×48'), '24×36');
    const mark = next.blocks.find((b) => b.id === ACK_BLOCK_ID)!;
    expect(mark.locked).toBe(true);
    expect(mark.imageSrc).toBeTruthy();
    expect(next.blocks.filter((b) => b.id === ACK_BLOCK_ID)).toHaveLength(1);
  });

  it('re-places the exact case the review found: 36×48 → 24×36', () => {
    // The mark was previously restored at y = 460 on a 360-tall
    // canvas — 112 units past the bottom edge.
    const next = resize(docAt('36×48'), '24×36');
    const mark = next.blocks.find((b) => b.id === ACK_BLOCK_ID)!;
    expect(mark.y + mark.h).toBeLessThanOrEqual(360 - M);
  });
});

describe('replaceAckBlock — conservative and pure', () => {
  it('leaves a mark that is still legal exactly where the user put it', () => {
    const doc = docAt('48×36');
    const before = doc.blocks.find((b) => b.id === ACK_BLOCK_ID)!;
    const after = replaceAckBlock(doc).blocks.find((b) => b.id === ACK_BLOCK_ID)!;
    expect(after).toEqual(before);
  });

  it('is a no-op on a doc that carries no mark', () => {
    const doc = makeFixtureDoc({ blocks: makeBlocks('3col', 48, 36) });
    expect(replaceAckBlock(doc)).toBe(doc);
  });

  it('on a FULL stock template, either declines or places legally — never forces', () => {
    // `3col` packs content to the margin line on most presets, so a
    // seeded mark is usually refused and the references-line credit
    // carries the acknowledgement alone. Where a preset DOES leave a
    // gap the mark is taken — but it must still obey the margin and
    // the overlap rule. Both outcomes are correct; a forced placement
    // sitting on the user's content is not.
    for (const key of KEYS) {
      const sz = POSTER_SIZES[key]!;
      const blocks = makeBlocks('3col', sz.w, sz.h);
      const doc = ensureAckBlock(
        makeFixtureDoc({ widthIn: sz.w, heightIn: sz.h, blocks }),
      );
      const mark = doc.blocks.find((b) => b.id === ACK_BLOCK_ID);
      if (!mark) continue; // declined — the documented degradation
      expect(mark.x, key).toBeGreaterThanOrEqual(M);
      expect(mark.y, key).toBeGreaterThanOrEqual(M);
      expect(mark.x + mark.w, key).toBeLessThanOrEqual(sz.w * 10 - M);
      expect(mark.y + mark.h, key).toBeLessThanOrEqual(sz.h * 10 - M);
      for (const b of blocks) {
        expect(overlaps(mark, b), `${key}: overlapped ${b.type}`).toBe(false);
      }
    }
  });

  it('moves no block other than the mark', () => {
    const doc = docAt('36×48');
    const others = doc.blocks.filter((b) => b.id !== ACK_BLOCK_ID);
    const snapshot = JSON.stringify(others);
    const next = replaceAckBlock({ ...doc, widthIn: 24, heightIn: 36 });
    const after = next.blocks.filter((b) => b.id !== ACK_BLOCK_ID);
    expect(JSON.stringify(after)).toBe(snapshot);
  });

  it('never mutates the input doc', () => {
    const doc = docAt('36×48');
    const snapshot = JSON.stringify(doc);
    replaceAckBlock({ ...doc, widthIn: 24, heightIn: 36 });
    expect(JSON.stringify(doc)).toBe(snapshot);
  });

  it('drops the mark rather than forcing it when the new canvas has no room', () => {
    const doc = docAt('48×36');
    // 3 × 3 in leaves nothing inside the margins.
    const next = replaceAckBlock({ ...doc, widthIn: 3, heightIn: 3 });
    expect(next.blocks.some((b) => b.id === ACK_BLOCK_ID)).toBe(false);
  });
});
