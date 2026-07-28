/**
 * The appended template slides — an explainer plus one empty slide per
 * named layout, for the user to duplicate.
 *
 * The load-bearing assertion here is the NO-REGRESSION one: adding six
 * slides after the poster must leave `slide1.xml` BYTE-identical to a
 * deck exported without them. It is checked by exact byte comparison
 * against a poster-only export, not by shape.
 */
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { exportPosterPptx } from '../pptx/writer';
import {
  APPENDED_SLIDE_COUNT,
  EXPLAINER_BODY,
  EXPLAINER_HEADING,
  EXPLAINER_SLIDE_NAME,
  TEMPLATE_SLIDE_LAYOUTS,
  TEMPLATE_SLIDE_PREFIX,
} from '../pptx/templateSlides';
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

/** The `<p:cSld name>` of each slide, in deck order. */
const slideNames = (entries: Record<string, Uint8Array>): string[] =>
  slidePaths(entries).map(
    (p) => /<p:cSld name="([^"]*)"/.exec(decode(entries[p]))?.[1] ?? '',
  );

/** The layout part a given slide is attached to, by its `<p:cSld name>`. */
function layoutNameForSlide(entries: Record<string, Uint8Array>, path: string): string {
  const n = path.replace(/\D+/g, '');
  const rels = decode(entries[`ppt/slides/_rels/slide${n}.xml.rels`]);
  const idx = /slideLayout(\d+)\.xml/.exec(rels);
  expect(idx, `slide${n} has no layout relationship`).not.toBeNull();
  const layout = decode(entries[`ppt/slideLayouts/slideLayout${idx![1]}.xml`]);
  return /<p:cSld name="([^"]*)"/.exec(layout)?.[1] ?? '';
}

describe('the exported deck ships template slides after the poster', () => {
  it('has exactly seven slides', async () => {
    const { entries } = await generate();
    expect(slidePaths(entries).length).toBe(1 + APPENDED_SLIDE_COUNT);
    expect(slidePaths(entries).length).toBe(7);
  });

  it('orders them poster, explainer, then the five layouts', async () => {
    const { entries } = await generate();
    expect(slideNames(entries)).toEqual([
      'Slide 1',
      EXPLAINER_SLIDE_NAME,
      `${TEMPLATE_SLIDE_PREFIX}3-Column Classic`,
      `${TEMPLATE_SLIDE_PREFIX}2-Col Wide Figure`,
      `${TEMPLATE_SLIDE_PREFIX}Billboard`,
      `${TEMPLATE_SLIDE_PREFIX}Sidebar + Focus`,
      `${TEMPLATE_SLIDE_PREFIX}Blank`,
    ]);
  });

  it('appends exactly the number of slides the importer’s cap assumes', async () => {
    // The importer caps how many slides it will treat as ours at
    // APPENDED_SLIDE_COUNT. If the exporter ever appends more, that
    // cap silently starts under-counting — so pin them together.
    const { entries } = await generate();
    expect(slidePaths(entries).length - 1).toBe(APPENDED_SLIDE_COUNT);
    expect(APPENDED_SLIDE_COUNT).toBe(1 + TEMPLATE_SLIDE_LAYOUTS.length);
  });

  it('attaches each template slide to its own named layout', async () => {
    const { entries } = await generate();
    const paths = slidePaths(entries);
    TEMPLATE_SLIDE_LAYOUTS.forEach((layout, i) => {
      // slide1 = poster, slide2 = explainer, slides 3..7 = layouts.
      expect(layoutNameForSlide(entries, paths[i + 2]!)).toBe(layout);
    });
  });

  it('keeps the poster slide on the empty poster layout', async () => {
    const { entries } = await generate();
    expect(layoutNameForSlide(entries, 'ppt/slides/slide1.xml')).toBe(POSTER_LAYOUT);
  });
});

describe('slide 1 is unchanged by the appended slides', () => {
  it('is BYTE-identical to a deck exported without templates', async () => {
    const withTemplates = await generate();
    const posterOnly = await generate({}, { templateSlides: false });
    expect(slidePaths(posterOnly.entries).length).toBe(1);
    expect(withTemplates.entries['ppt/slides/slide1.xml']).toEqual(
      posterOnly.entries['ppt/slides/slide1.xml'],
    );
  });

  it('keeps slide 1 byte-identical for a HALVED poster too', async () => {
    const withTemplates = await generate({ widthIn: 96, heightIn: 48 });
    const posterOnly = await generate(
      { widthIn: 96, heightIn: 48 },
      { templateSlides: false },
    );
    expect(withTemplates.entries['ppt/slides/slide1.xml']).toEqual(
      posterOnly.entries['ppt/slides/slide1.xml'],
    );
  });

  it('keeps slide 1 rels byte-identical, so its media still resolves', async () => {
    const withTemplates = await generate();
    const posterOnly = await generate({}, { templateSlides: false });
    expect(withTemplates.entries['ppt/slides/_rels/slide1.xml.rels']).toEqual(
      posterOnly.entries['ppt/slides/_rels/slide1.xml.rels'],
    );
  });

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

describe('the explainer slide', () => {
  const explainer = (entries: Record<string, Uint8Array>): string =>
    decode(entries['ppt/slides/slide2.xml']);

  it('tells the user what the next slides are and to duplicate one', async () => {
    const { entries } = await generate();
    const xml = explainer(entries);
    expect(xml).toContain('empty templates');
    expect(xml).toContain('Duplicate Slide');
  });

  it('stays in the house voice — no marketing, no AI', async () => {
    for (const copy of [EXPLAINER_HEADING, EXPLAINER_BODY]) {
      expect(copy).not.toMatch(/\bAI\b|artificial intelligence|magic|powerful|seamless/i);
    }
    // Terse enough to read at a glance on a poster-sized canvas.
    expect(`${EXPLAINER_HEADING} ${EXPLAINER_BODY}`.length).toBeLessThan(320);
  });

  it('uses the poster font and palette so it reads as part of the deck', async () => {
    const { doc, entries } = await generate();
    const p = resolveMasterPalette(doc.palette);
    const xml = explainer(entries);
    expect(xml).toContain(`typeface="${doc.fontFamily}"`);
    expect(xml).toContain(`val="${p.accent}"`);
    expect(xml).toContain(`<a:solidFill><a:srgbClr val="${p.bg}"/></a:solidFill>`);
  });

  it('tracks a custom font rather than hardcoding the default', async () => {
    const { entries } = await generate({ fontFamily: 'Lora' });
    expect(explainer(entries)).toContain('typeface="Lora"');
  });

  it('routes the font through the safeFontFamily allowlist', async () => {
    // A hostile family can arrive from an imported deck; pptxgenjs
    // interpolates it into `typeface="…"` unescaped.
    const { entries } = await generate({ fontFamily: 'Ampers & <Sons>' });
    const xml = explainer(entries);
    expect(xml).not.toContain('Ampers & <Sons>');
    expect(xml).toContain('typeface="Source Sans 3"');
  });
});

describe('the template slides are empty', () => {
  /** The template slide carrying a given layout's name. */
  const templateSlideXml = (
    entries: Record<string, Uint8Array>,
    layout: string,
  ): string => {
    const path = slidePaths(entries).find((p) =>
      decode(entries[p]).includes(`name="${TEMPLATE_SLIDE_PREFIX}${layout}"`),
    );
    expect(path, `no slide for ${layout}`).toBeDefined();
    return decode(entries[path!]);
  };

  it('carries no authored text beyond its own layout label', async () => {
    const { entries } = await generate();
    for (const layout of TEMPLATE_SLIDE_LAYOUTS) {
      const xml = templateSlideXml(entries, layout);
      // pptxgenjs materializes each layout placeholder onto the slide
      // as an EMPTY, click-to-type shape — that is what makes the
      // slide usable. The only actual <a:t> run is the label.
      const runs = xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? [];
      expect(runs.length, `${layout} has stray text`).toBe(1);
      expect(runs[0]).toBe(`<a:t>${layout.replace(/&/g, '&amp;')}</a:t>`);
      // No pictures, tables or charts of its own.
      expect(xml).not.toContain('<p:pic>');
      expect(xml).not.toContain('<a:tbl>');
    }
  });

  it('gives every layout placeholder an empty, click-to-type shape', async () => {
    const { entries } = await generate();
    // 3-Column Classic: title + authors + 3 heading/body pairs = 8.
    const xml = templateSlideXml(entries, '3-Column Classic');
    expect((xml.match(/<p:ph\b[\s\S]*?type="(?:title|body)"/g) ?? []).length).toBe(8);
    // None of the layout's prompt text is baked onto the slide.
    expect(xml).not.toContain('Click to add title');
    expect(xml).not.toContain('Click to add text');
  });

  it('does not repeat the poster content on any template slide', async () => {
    const { entries } = await generate();
    for (const path of slidePaths(entries).slice(1)) {
      expect(decode(entries[path])).not.toContain('Whisker Maps');
    }
  });
});

describe('the appended slides keep the archive well-formed', () => {
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

  it('parses every XML part of a seven-slide export', async () => {
    const { entries } = await generate();
    expectAllPartsParse(entries);
  });

  it('parses every XML part when the poster is halved', async () => {
    const { entries } = await generate({ widthIn: 96, heightIn: 48 });
    expectAllPartsParse(entries);
  });

  it('registers all seven slides in the presentation part', async () => {
    const { entries } = await generate();
    const presentation = decode(entries['ppt/presentation.xml']);
    expect((presentation.match(/<p:sldId /g) ?? []).length).toBe(7);
  });
});
