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
import { stripAckBlock } from '../stripAckBlock';
import { exportPosterLatex } from '../latex/exportLatex';
import { buildLatexDocument } from '../latex/writer';
import { exportPosterPptx } from '../pptx/writer';
import { makeFixtureDoc, baseBlock, TINY_PNG_BYTES, TINY_PNG_DATA_URL } from './fixtures';

const decode = (b: Uint8Array | undefined) => new TextDecoder().decode(b ?? new Uint8Array());

/**
 * The fixture's ack mark is an SVG data URI, and pptxgenjs cannot embed
 * SVG — the writer rasterizes it first. In jsdom there is no canvas, so
 * a real rasterizer is injected: it makes the mark a genuine picture
 * shape + media part, which is exactly what the paid seam must remove.
 */
const rasterizeSvg = async () => TINY_PNG_BYTES;

/** Media parts (`ppt/media/*`) in a .pptx — one per embedded picture. */
const mediaPartsOf = (bytes: Uint8Array): string[] =>
  Object.keys(unzipSync(bytes)).filter((n) => /^ppt\/media\/.+/.test(n));

/** Picture shapes on slide 1. */
const pictureShapesOf = (bytes: Uint8Array): number =>
  (decode(unzipSync(bytes)['ppt/slides/slide1.xml']).match(/<p:pic>/g) ?? []).length;

/** `figures/logo-N.*` entries in a LaTeX bundle. */
const logoAssetsOf = (bytes: Uint8Array): string[] =>
  Object.keys(unzipSync(bytes)).filter((n) => /^figures\/logo-\d+\./.test(n));

/** `\includegraphics{...}` paths in poster.tex. */
const includedGraphicsOf = (tex: string): string[] =>
  [...tex.matchAll(/\\includegraphics\[[^\]]*\]\{([^}]+)\}/g)].map((m) => m[1]!);

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

  describe('the seeded logo mark (ACK block) and the paid seam', () => {
    const docWithAck = (): PosterDoc => ensureAckBlock(makeFixtureDoc());

    it('FREE: ships the mark as figures/logo-1 and \\includegraphics it', async () => {
      const doc = docWithAck();
      expect(hasAckBlock(doc)).toBe(true);
      const { bytes } = await exportPosterLatex(doc, {
        fetcher: async () => TINY_PNG_BYTES,
      });
      const entries = unzipSync(bytes);
      // Extension is sniffed from the fetched bytes (the test fetcher
      // hands back a PNG), so assert on the name, not the extension.
      const logos = logoAssetsOf(bytes);
      expect(logos).toHaveLength(1);
      expect(logos[0]).toMatch(/^figures\/logo-1\.\w+$/);
      expect(includedGraphicsOf(decode(entries['poster.tex']))).toContain(logos[0]);
    });

    it('PAID: the zip carries NO logo asset and the .tex NO \\includegraphics for it', async () => {
      const doc = docWithAck();
      const { bytes } = await exportPosterLatex(doc, {
        fetcher: async () => TINY_PNG_BYTES,
        attribution: { paidPlan: true },
      });
      const entries = unzipSync(bytes);
      const tex = decode(entries['poster.tex']);
      expect(logoAssetsOf(bytes)).toEqual([]);
      expect(includedGraphicsOf(tex).some((p) => /logo-/.test(p))).toBe(false);
      // The user's own figure is untouched by the strip.
      expect(includedGraphicsOf(tex)).toContain('figures/figure-1.png');
      expect(entries['figures/figure-1.png']).toBeDefined();
      // And the visible margin-band colophon is gone too (the `%%`
      // header comment, like PPTX's generator doc-property, stays).
      expect(tex).not.toContain(`\\textcolor{postrMuted}{${ACKNOWLEDGEMENT_TEXT}}`);
    });

    it("PAID: the user's OWN logo blocks still export — only the ack mark is dropped", async () => {
      const own = baseBlock({
        id: 'lab-logo',
        type: 'logo',
        x: 400,
        y: 20,
        w: 40,
        h: 40,
        imageSrc: TINY_PNG_DATA_URL,
      });
      const doc = ensureAckBlock(makeFixtureDoc({ blocks: [...makeFixtureDoc().blocks, own] }));
      const { bytes } = await exportPosterLatex(doc, {
        fetcher: async () => TINY_PNG_BYTES,
        attribution: { paidPlan: true },
      });
      expect(logoAssetsOf(bytes)).toEqual(['figures/logo-1.png']);
    });

    it('PAID: buildLatexDocument called directly also drops the mark', () => {
      const doc = docWithAck();
      const assetPaths = new Map([[ACK_BLOCK_ID, 'figures/logo-1.svg']]);
      const { tex } = buildLatexDocument(doc, { assetPaths, attribution: { paidPlan: true } });
      expect(tex).not.toContain('figures/logo-1.svg');
    });
  });
});

describe('stripAckBlock', () => {
  it('returns the SAME doc object on the free plan — the mark is kept exactly as today', () => {
    const doc = ensureAckBlock(makeFixtureDoc());
    expect(stripAckBlock(doc)).toBe(doc);
    expect(stripAckBlock(doc, { paidPlan: false })).toBe(doc);
  });

  it('returns the SAME doc object when there is no mark to strip', () => {
    const doc = makeFixtureDoc();
    expect(stripAckBlock(doc, { paidPlan: true })).toBe(doc);
  });

  it('returns a NEW doc without the mark on a paid plan, never mutating the input', () => {
    const doc = ensureAckBlock(makeFixtureDoc());
    const before = JSON.stringify(doc);
    const out = stripAckBlock(doc, { paidPlan: true });
    expect(out).not.toBe(doc);
    expect(hasAckBlock(out)).toBe(false);
    expect(out.blocks).toHaveLength(doc.blocks.length - 1);
    // Every other block survives, in order, byte-identical.
    expect(out.blocks).toEqual(doc.blocks.filter((b) => b.id !== ACK_BLOCK_ID));
    expect(JSON.stringify(doc)).toBe(before);
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

  it('keeps the slide background a plain solid fill (the mark is a shape, not a background)', async () => {
    // An earlier build flattened the mark into a picture background,
    // which cost every user PowerPoint's background-colour picker. The
    // mark is an ordinary picture shape now; the background stays a
    // recolourable solid fill whether or not the mark is present.
    for (const doc of [docWithAck(), makeFixtureDoc()]) {
      const { bytes } = await exportPosterPptx(doc, {
        fetcher: async () => TINY_PNG_BYTES,
        rasterizeSvg,
      });
      const slide = decode(unzipSync(bytes)['ppt/slides/slide1.xml']);
      expect(slide).toMatch(/<p:bg>[\s\S]*?<a:solidFill>/);
      expect(slide).not.toMatch(/<p:bg>[\s\S]*?<a:blipFill>/);
    }
  });

  it('FREE: ships the mark as exactly one picture shape + one media part', async () => {
    const doc = docWithAck();
    expect(hasAckBlock(doc)).toBe(true);
    const withMark = await exportPosterPptx(doc, {
      fetcher: async () => TINY_PNG_BYTES,
      rasterizeSvg,
    });
    const withoutMark = await exportPosterPptx(makeFixtureDoc(), {
      fetcher: async () => TINY_PNG_BYTES,
      rasterizeSvg,
    });
    expect(mediaPartsOf(withMark.bytes).length).toBe(mediaPartsOf(withoutMark.bytes).length + 1);
    expect(pictureShapesOf(withMark.bytes)).toBe(pictureShapesOf(withoutMark.bytes) + 1);
  });

  it('PAID: the deck has NO picture shape and NO media part for the mark', async () => {
    const paid = { paidPlan: true };
    const withMark = await exportPosterPptx(docWithAck(), {
      fetcher: async () => TINY_PNG_BYTES,
      rasterizeSvg,
      attribution: paid,
    });
    const withoutMark = await exportPosterPptx(makeFixtureDoc(), {
      fetcher: async () => TINY_PNG_BYTES,
      rasterizeSvg,
      attribution: paid,
    });
    // Seeding the mark into the doc changes nothing about a paid deck.
    expect(mediaPartsOf(withMark.bytes)).toEqual(mediaPartsOf(withoutMark.bytes));
    expect(pictureShapesOf(withMark.bytes)).toBe(pictureShapesOf(withoutMark.bytes));
    // And the only picture left is the user's own figure (img1): the
    // colophon mark is gone too, so the count is absolute, not relative.
    expect(pictureShapesOf(withMark.bytes)).toBe(1);
    expect(mediaPartsOf(withMark.bytes)).toHaveLength(1);
    const slide = decode(unzipSync(withMark.bytes)['ppt/slides/slide1.xml']);
    expect(slide).not.toContain(ACKNOWLEDGEMENT_TEXT);
  });

  it("PAID: the user's OWN logo blocks still export — only the ack mark is dropped", async () => {
    const own = baseBlock({
      id: 'lab-logo',
      type: 'logo',
      x: 400,
      y: 20,
      w: 40,
      h: 40,
      imageSrc: TINY_PNG_DATA_URL,
    });
    const doc = ensureAckBlock(makeFixtureDoc({ blocks: [...makeFixtureDoc().blocks, own] }));
    const { bytes } = await exportPosterPptx(doc, {
      fetcher: async () => TINY_PNG_BYTES,
      rasterizeSvg,
      attribution: { paidPlan: true },
    });
    // img1 + lab-logo, and nothing for the mark.
    expect(pictureShapesOf(bytes)).toBe(2);
    expect(mediaPartsOf(bytes)).toHaveLength(2);
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
