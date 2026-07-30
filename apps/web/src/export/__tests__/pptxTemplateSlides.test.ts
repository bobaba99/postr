/**
 * The poster PPTX export is a SINGLE slide — the poster canvas, nothing
 * else.
 *
 * The empty talk-layout template slides (an explainer plus one slide per
 * named layout) used to be appended after the poster. They belong to the
 * talk deck, not the poster, and have been removed from the poster export
 * path. `export/pptx/templateSlides.ts` stays intact for the talk deck to
 * reuse; this file guards that the POSTER path no longer calls it.
 *
 * The load-bearing assertion is the one at the top: a poster `.pptx` has
 * exactly one `ppt/slides/slideN.xml`. The rest confirm that dropping the
 * appended slides did not disturb the poster slide itself — background
 * fill, the selectable acknowledgement picture, the half-size note the
 * importer reads — and that the archive is still well-formed.
 */
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { exportPosterPptx } from '../pptx/writer';
import { POSTER_LAYOUT, resolveMasterPalette } from '../pptx/masters';
import { makeFixtureDoc, TINY_PNG_BYTES } from './fixtures';

const decode = (bytes: Uint8Array | undefined): string =>
  bytes ? new TextDecoder().decode(bytes) : '';

async function generate(overrides = {}, options = {}) {
  const doc = makeFixtureDoc(overrides);
  const result = await exportPosterPptx(doc, {
    fetcher: async () => TINY_PNG_BYTES,
    ...options,
  });
  return { doc, result, entries: unzipSync(result.bytes) };
}

const slidePaths = (entries: Record<string, Uint8Array>): string[] =>
  Object.keys(entries)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.replace(/\D+/g, '')) - Number(b.replace(/\D+/g, '')));

/** The layout part a given slide is attached to, by its `<p:cSld name>`. */
function layoutNameForSlide(entries: Record<string, Uint8Array>, path: string): string {
  const n = path.replace(/\D+/g, '');
  const rels = decode(entries[`ppt/slides/_rels/slide${n}.xml.rels`]);
  const idx = /slideLayout(\d+)\.xml/.exec(rels);
  expect(idx, `slide${n} has no layout relationship`).not.toBeNull();
  const layout = decode(entries[`ppt/slideLayouts/slideLayout${idx![1]}.xml`]);
  return /<p:cSld name="([^"]*)"/.exec(layout)?.[1] ?? '';
}

describe('the poster export is a single slide', () => {
  it('emits exactly one ppt/slides/slideN.xml — no appended talk templates', async () => {
    const { entries } = await generate();
    expect(slidePaths(entries)).toEqual(['ppt/slides/slide1.xml']);
  });

  it('stays a single slide for a HALVED poster too', async () => {
    const { entries } = await generate({ widthIn: 96, heightIn: 48 });
    expect(slidePaths(entries).length).toBe(1);
  });

  it('registers exactly one slide in the presentation part', async () => {
    const { entries } = await generate();
    const presentation = decode(entries['ppt/presentation.xml']);
    expect((presentation.match(/<p:sldId /g) ?? []).length).toBe(1);
  });

  it('keeps the poster slide on the empty poster layout', async () => {
    const { entries } = await generate();
    expect(layoutNameForSlide(entries, 'ppt/slides/slide1.xml')).toBe(POSTER_LAYOUT);
  });

  it('opting out of templateSlides is now a no-op — still one slide', async () => {
    // `templateSlides: false` was the no-regression seam that diffed
    // slide1.xml against a poster-only deck. With the poster path no
    // longer appending anything, the flag can only ever produce the same
    // single slide — asserted so a future re-wiring cannot quietly
    // reintroduce the appended slides behind the default.
    const withFlag = await generate({}, { templateSlides: false });
    const withoutFlag = await generate();
    expect(slidePaths(withFlag.entries).length).toBe(1);
    expect(withFlag.entries['ppt/slides/slide1.xml']).toEqual(
      withoutFlag.entries['ppt/slides/slide1.xml'],
    );
  });
});

describe('the single poster slide is unchanged', () => {
  it('still carries the acknowledgement mark as a selectable picture', async () => {
    const { entries } = await generate();
    expect(decode(entries['ppt/slides/slide1.xml'])).toContain('<p:pic>');
  });

  it('still uses a solid-fill background, not a flattened picture', async () => {
    const { doc, entries } = await generate();
    const slide = decode(entries['ppt/slides/slide1.xml']);
    const bg = resolveMasterPalette(doc.palette).bg;
    expect(slide).toContain(`<a:solidFill><a:srgbClr val="${bg}"/></a:solidFill>`);
    expect(slide).not.toContain('<p:bgPr><a:blipFill');
  });

  it('still writes the dc:subject half-size note the importer reads', async () => {
    const { entries, result } = await generate({ widthIn: 96, heightIn: 48 });
    expect(result.scaled).toBe(true);
    expect(decode(entries['docProps/core.xml'])).toContain('exactly half size (48×24 in)');
  });
});

describe('the appended slides no longer exist', () => {
  it('ships no explainer or layout template slide', async () => {
    const { entries } = await generate();
    const onlySlide = decode(entries['ppt/slides/slide1.xml']);
    // The old explainer copy and its Postr-template marker must be gone.
    expect(onlySlide).not.toContain('empty templates');
    expect(onlySlide).not.toContain('Duplicate Slide');
    for (const path of slidePaths(entries)) {
      expect(decode(entries[path])).not.toContain('Postr template - ');
    }
  });
});

describe('the poster export keeps the archive well-formed', () => {
  const expectAllPartsParse = (entries: Record<string, Uint8Array>): void => {
    const parser = new DOMParser();
    for (const part of Object.keys(entries).filter((n) => /\.(xml|rels)$/.test(n))) {
      const parsed = parser.parseFromString(decode(entries[part]), 'application/xml');
      expect(
        parsed.getElementsByTagName('parsererror').length,
        `${part} is not well-formed XML`,
      ).toBe(0);
    }
  };

  it('parses every XML part of a single-slide export', async () => {
    const { entries } = await generate();
    expectAllPartsParse(entries);
  });

  it('parses every XML part when the poster is halved', async () => {
    const { entries } = await generate({ widthIn: 96, heightIn: 48 });
    expectAllPartsParse(entries);
  });
});
