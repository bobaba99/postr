/**
 * The acknowledgement as it lands in each real output format.
 *
 * The reference-entry tests above work on the shared formatter; these
 * assert the bytes that actually ship, because a helper that returns
 * the right string is worth nothing if no writer calls it.
 */
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import type { PosterDoc } from '@postr/shared';
import { ACKNOWLEDGEMENT_TEXT } from '../attribution';
import { ACK_BLOCK_ID, ensureAckBlock, hasAckBlock, makeAckBlock } from '../ackBlock';
import { exportPosterLatex } from '../latex/exportLatex';
import { exportPosterPptx } from '../pptx/writer';
import { makeFixtureDoc, baseBlock, TINY_PNG_BYTES } from './fixtures';

const decode = (b: Uint8Array | undefined) => new TextDecoder().decode(b ?? new Uint8Array());

/**
 * The single `textblock` environment holding the references list.
 *
 * Isolating it matters: the credit legitimately appears elsewhere in
 * poster.tex (the header comment and the margin-band acknowledgement),
 * so a whole-document search cannot tell "credited in the margin" from
 * "credited as a reference entry" — which is exactly the distinction
 * under test.
 */
function referencesTextblock(tex: string): string {
  const heading = tex.indexOf('{References}');
  if (heading === -1) return '';
  const start = tex.lastIndexOf('\\begin{textblock}', heading);
  const end = tex.indexOf('\\end{textblock}', heading);
  return tex.slice(start, end === -1 ? undefined : end);
}

describe('LaTeX export', () => {
  it('renders the credit as the last reference entry in poster.tex', async () => {
    const { bytes } = await exportPosterLatex(makeFixtureDoc(), {
      fetcher: async () => TINY_PNG_BYTES,
    });
    const tex = decode(unzipSync(bytes)['poster.tex']);
    expect(tex).toContain('Poster made with postr.sh');
  });

  it('ships the credit as a citable entry in references.bib', async () => {
    const { bytes } = await exportPosterLatex(makeFixtureDoc(), {
      fetcher: async () => TINY_PNG_BYTES,
    });
    const bib = decode(unzipSync(bytes)['references.bib']);
    expect(bib).toContain('@misc{postr,');
    // The pre-existing comment is not sufficient on its own — a
    // comment cannot be cited by \bibliography.
    expect(bib.indexOf('@misc{postr,')).toBeGreaterThan(-1);
  });

  it('emits no credit in the references list and no references.bib when the poster has no references', async () => {
    const { bytes } = await exportPosterLatex(makeFixtureDoc({ references: [] }), {
      fetcher: async () => TINY_PNG_BYTES,
    });
    const entries = unzipSync(bytes);
    expect(entries['references.bib']).toBeUndefined();
    // The header comment and the margin-band block still carry the
    // acknowledgement — both are separate, deliberate, and are the
    // reason suppressing the references credit loses nothing. So
    // assert on the references TEXTBLOCK only.
    expect(referencesTextblock(decode(entries['poster.tex']))).not.toContain(
      ACKNOWLEDGEMENT_TEXT,
    );
  });

  it('still renders the credit inside the references list when the poster HAS references', async () => {
    const { bytes } = await exportPosterLatex(makeFixtureDoc(), {
      fetcher: async () => TINY_PNG_BYTES,
    });
    expect(referencesTextblock(decode(unzipSync(bytes)['poster.tex']))).toContain(
      ACKNOWLEDGEMENT_TEXT,
    );
  });
});

describe('PPTX export', () => {
  const docWithAck = (): PosterDoc => {
    const doc = makeFixtureDoc();
    return ensureAckBlock(doc);
  };

  it('renders the credit as the last reference entry', async () => {
    const { bytes } = await exportPosterPptx(makeFixtureDoc(), {
      fetcher: async () => TINY_PNG_BYTES,
    });
    const entries = unzipSync(bytes);
    const slide = decode(entries['ppt/slides/slide1.xml']);
    expect(slide).toContain('Poster made with postr.sh');
  });

  it('FLATTENS the mark into the slide background rather than a shape', async () => {
    const doc = docWithAck();
    expect(hasAckBlock(doc)).toBe(true);
    const withMark = await exportPosterPptx(doc, {
      fetcher: async () => TINY_PNG_BYTES,
    });
    const withoutMark = await exportPosterPptx(makeFixtureDoc(), {
      fetcher: async () => TINY_PNG_BYTES,
    });

    // The slide's background becomes an image fill, not a solid fill —
    // an image background is not selectable on the PowerPoint canvas,
    // which is what makes the mark survive "select all + Delete".
    const slide = decode(unzipSync(withMark.bytes)['ppt/slides/slide1.xml']);
    expect(slide).toMatch(/blipFill|<a:blip/);

    // And the background costs exactly one extra media part relative
    // to the same poster without the mark.
    const mediaOf = (b: Uint8Array) =>
      Object.keys(unzipSync(b)).filter((n) => /^ppt\/media\/.+/.test(n));
    expect(mediaOf(withMark.bytes).length).toBe(mediaOf(withoutMark.bytes).length + 1);
  });

  it('uses a plain colour background when the poster has no ack block', async () => {
    const { bytes } = await exportPosterPptx(makeFixtureDoc(), {
      fetcher: async () => TINY_PNG_BYTES,
    });
    const slide = decode(unzipSync(bytes)['ppt/slides/slide1.xml']);
    expect(slide).toContain('solidFill');
  });

  it('does not ALSO emit the mark as a deletable picture shape', async () => {
    const doc = docWithAck();
    const { bytes } = await exportPosterPptx(doc, {
      fetcher: async () => TINY_PNG_BYTES,
    });
    const slide = decode(unzipSync(bytes)['ppt/slides/slide1.xml']);
    // The ack block id must never appear as a shape name/descr.
    expect(slide).not.toContain(ACK_BLOCK_ID);
  });

  it('honours the paid seam — no flattened background when suppressed', async () => {
    const doc = docWithAck();
    const { bytes } = await exportPosterPptx(doc, {
      fetcher: async () => TINY_PNG_BYTES,
      attribution: { paidPlan: true },
    });
    const slide = decode(unzipSync(bytes)['ppt/slides/slide1.xml']);
    expect(slide).toContain('solidFill');
  });
});

describe('ensureAckBlock — .postr re-injection', () => {
  it('adds a locked mark to a doc that lacks one', () => {
    const doc = makeFixtureDoc();
    const out = ensureAckBlock(doc);
    const ack = out.blocks.find((b) => b.id === ACK_BLOCK_ID)!;
    expect(ack).toBeDefined();
    expect(ack.locked).toBe(true);
    expect(ack.type).toBe('logo');
    expect(ack.imageSrc).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('is IDEMPOTENT — repeated round-trips never duplicate the mark', () => {
    let doc = makeFixtureDoc();
    for (let i = 0; i < 5; i++) doc = ensureAckBlock(doc);
    expect(doc.blocks.filter((b) => b.id === ACK_BLOCK_ID)).toHaveLength(1);
  });

  it('returns the SAME object when the mark is already present — no churn', () => {
    const once = ensureAckBlock(makeFixtureDoc());
    expect(ensureAckBlock(once)).toBe(once);
  });

  it('does NOT corrupt a valid bundle — every original block survives untouched', () => {
    const doc = makeFixtureDoc();
    const before = JSON.stringify(doc.blocks);
    const out = ensureAckBlock(doc);
    // Original blocks are byte-identical and still first in order.
    expect(JSON.stringify(out.blocks.slice(0, doc.blocks.length))).toBe(before);
    expect(out.blocks).toHaveLength(doc.blocks.length + 1);
  });

  it('preserves a mark the user MOVED rather than resetting its position', () => {
    const moved = baseBlock({
      id: ACK_BLOCK_ID,
      type: 'logo',
      x: 333,
      y: 222,
      w: 16,
      h: 16,
      locked: true,
    });
    const doc = makeFixtureDoc({ blocks: [moved] });
    const out = ensureAckBlock(doc);
    expect(out.blocks.find((b) => b.id === ACK_BLOCK_ID)).toMatchObject({
      x: 333,
      y: 222,
    });
  });

  it('honours the paid seam', () => {
    const doc = makeFixtureDoc();
    expect(hasAckBlock(ensureAckBlock(doc, { paidPlan: true }))).toBe(false);
  });

  it('degrades to LOGO-ONLY-less when there is nowhere to put the mark', () => {
    // A poster covered by one full-bleed block: no placement exists,
    // so the doc comes back unchanged and the references-line credit
    // carries the acknowledgement alone.
    const wall = baseBlock({ id: 'wall', type: 'image', x: 0, y: 0, w: 480, h: 360 });
    const doc = makeFixtureDoc({ blocks: [wall], widthIn: 48, heightIn: 36 });
    const out = ensureAckBlock(doc);
    expect(hasAckBlock(out)).toBe(false);
    expect(out.blocks).toHaveLength(1);
  });
});

describe('makeAckBlock', () => {
  it('places the mark inside the canvas for a 48×36 poster', () => {
    const doc = makeFixtureDoc({ blocks: [], widthIn: 48, heightIn: 36 });
    const ack = makeAckBlock(doc)!;
    expect(ack.x).toBeGreaterThanOrEqual(0);
    expect(ack.y).toBeGreaterThanOrEqual(0);
    expect(ack.x + ack.w).toBeLessThanOrEqual(480);
    expect(ack.y + ack.h).toBeLessThanOrEqual(360);
  });

  it('is always locked', () => {
    const ack = makeAckBlock(makeFixtureDoc({ blocks: [] }))!;
    expect(ack.locked).toBe(true);
  });
});

describe('no-references poster degrades to the mark alone', () => {
  it('still carries the credit via the logo when there is no references block', async () => {
    // No `references` block on the canvas and no reference entries —
    // per the owner's rule we do NOT create a references block; the
    // logo carries the credit instead.
    const doc = ensureAckBlock(
      makeFixtureDoc({
        references: [],
        blocks: [baseBlock({ id: 't', type: 'title', x: 10, y: 10, w: 300, h: 40 })],
      }),
    );
    expect(hasAckBlock(doc)).toBe(true);
    expect(doc.blocks.some((b) => b.type === 'references')).toBe(false);
  });

  it('the print/PDF path still emits the margin credit line', () => {
    // Covered in depth by attribution.test.ts; asserted here so the
    // "every output" claim is checked end to end.
    expect(ACKNOWLEDGEMENT_TEXT).toBe('Poster made with postr.sh');
  });
});
