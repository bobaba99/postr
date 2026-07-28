/**
 * PPTX slide masters — the named layout set that lets a user add or
 * duplicate a slide in PowerPoint and inherit the poster's styling
 * instead of Office defaults.
 *
 * The load-bearing assertion in this file is the NO-REGRESSION one:
 * the poster slide's own XML must be untouched by the existence of
 * layouts. It is checked by exact EMU/point values, not by shape.
 */
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { exportPosterPptx } from '../pptx/writer';
import {
  LAYOUT_BILLBOARD,
  LAYOUT_BLANK,
  LAYOUT_SIDEBAR,
  LAYOUT_THREE_COL,
  LAYOUT_TWO_COL,
  MASTER_LAYOUT_NAMES,
  POSTER_LAYOUT,
  applyThemeColors,
  resolveMasterPalette,
  safeFontFamily,
  themeColorXml,
} from '../pptx/masters';
import { parsePptx } from '@/import/pptx/parsePptx';
import { makeFixtureDoc, TINY_PNG_BYTES } from './fixtures';

const decode = (bytes: Uint8Array | undefined): string =>
  bytes ? new TextDecoder().decode(bytes) : '';

async function generate(overrides = {}) {
  const doc = makeFixtureDoc(overrides);
  const result = await exportPosterPptx(doc, { fetcher: async () => TINY_PNG_BYTES });
  return { doc, result, entries: unzipSync(result.bytes) };
}

/** All slide layout parts, keyed by their `<p:cSld name>`. */
function layoutsByName(entries: Record<string, Uint8Array>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, bytes] of Object.entries(entries)) {
    if (!/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)) continue;
    const xml = decode(bytes);
    const title = /<p:cSld name="([^"]*)"/.exec(xml)?.[1];
    if (title) out.set(title, xml);
  }
  return out;
}

/** The layout part the poster slide is actually attached to. */
function slideLayoutXml(entries: Record<string, Uint8Array>): string {
  const rels = decode(entries['ppt/slides/_rels/slide1.xml.rels']);
  const target = /slideLayout(\d+)\.xml/.exec(rels);
  expect(target).not.toBeNull();
  return decode(entries[`ppt/slideLayouts/slideLayout${target![1]}.xml`]);
}

describe('named layout set', () => {
  it('defines every poster layout as a named slide layout', async () => {
    const { entries } = await generate();
    const names = [...layoutsByName(entries).keys()];
    for (const expected of MASTER_LAYOUT_NAMES) {
      expect(names).toContain(expected);
    }
  });

  it('names the layouts after the poster templates the user knows', async () => {
    const { entries } = await generate();
    const names = [...layoutsByName(entries).keys()];
    expect(names).toContain(LAYOUT_THREE_COL);
    expect(names).toContain(LAYOUT_TWO_COL);
    expect(names).toContain(LAYOUT_BILLBOARD);
    expect(names).toContain(LAYOUT_SIDEBAR);
    expect(names).toContain(LAYOUT_BLANK);
  });

  it('registers every layout on the single slide master', async () => {
    const { entries } = await generate();
    const rels = decode(entries['ppt/slideMasters/_rels/slideMaster1.xml.rels']);
    // 6 poster layouts + pptxgenjs's own DEFAULT layout.
    const linked = rels.match(/slideLayout\d+\.xml/g) ?? [];
    expect(linked.length).toBe(MASTER_LAYOUT_NAMES.length + 1);
    const master = decode(entries['ppt/slideMasters/slideMaster1.xml']);
    expect(master.match(/<p:sldLayoutId /g)?.length).toBe(MASTER_LAYOUT_NAMES.length + 1);
  });

  it('carries the poster font into every layout placeholder', async () => {
    const { doc, entries } = await generate();
    const layout = layoutsByName(entries).get(LAYOUT_THREE_COL) ?? '';
    expect(layout).toContain(`typeface="${doc.fontFamily}"`);
    // No Office default leaked into the poster's own layouts.
    expect(layout).not.toContain('typeface="Calibri"');
  });

  it('carries the poster palette into layout placeholders and background', async () => {
    const { doc, entries } = await generate();
    const p = resolveMasterPalette(doc.palette);
    const layout = layoutsByName(entries).get(LAYOUT_THREE_COL) ?? '';
    // Background is the poster's own fill…
    expect(layout).toContain(`<a:solidFill><a:srgbClr val="${p.bg}"/></a:solidFill>`);
    // …headings take the accent, body text the primary.
    expect(layout).toContain(`val="${p.accent}"`);
    expect(layout).toContain(`val="${p.primary}"`);
  });

  it('gives content layouts real title and body placeholders', async () => {
    const { entries } = await generate();
    const layout = layoutsByName(entries).get(LAYOUT_THREE_COL) ?? '';
    expect(layout).toContain('type="title"');
    expect(layout).toContain('type="body"');
    // Three columns → three heading + three body placeholders, plus
    // the title and authors band.
    expect((layout.match(/type="(title|body)"/g) ?? []).length).toBe(8);
  });

  it('keeps the Blank layout to the poster styling and header only', async () => {
    const { entries } = await generate();
    const layout = layoutsByName(entries).get(LAYOUT_BLANK) ?? '';
    expect((layout.match(/type="(title|body)"/g) ?? []).length).toBe(2);
  });
});

describe('the exported poster slide is unaffected by the masters', () => {
  it('attaches the poster slide to a layout with no placeholders', async () => {
    const { entries } = await generate();
    const layout = slideLayoutXml(entries);
    expect(layout).toContain(`<p:cSld name="${POSTER_LAYOUT}"`);
    // The whole no-regression guarantee: an empty layout has nothing
    // for the slide's own shapes to inherit from.
    expect(layout).not.toContain('type="title"');
    expect(layout).not.toContain('type="body"');
    expect(layout).not.toContain('<p:sp>');
  });

  it('keeps the title block at its exact pre-masters EMU position', async () => {
    const { entries } = await generate();
    const slide = decode(entries['ppt/slides/slide1.xml']);
    // title at x=20u (2in), y=15.5u (1.55in) — unchanged.
    expect(slide).toContain('<a:off x="1828800" y="1417320"');
  });

  it('keeps the title point size exact', async () => {
    const { entries } = await generate();
    const slide = decode(entries['ppt/slides/slide1.xml']);
    // 14 units × 7.2 = 100.8pt → OOXML hundredths 10080.
    expect(slide).toContain('sz="10080"');
  });

  it('keeps block colours and font on the slide itself, not inherited', async () => {
    const { doc, entries } = await generate();
    const slide = decode(entries['ppt/slides/slide1.xml']);
    const p = resolveMasterPalette(doc.palette);
    // Explicit per-run font + colour, so a layout change cannot move it.
    expect(slide).toContain(`typeface="${doc.fontFamily}"`);
    expect(slide).toContain(`val="${p.primary}"`);
  });

  it('keeps the slide size exact', async () => {
    const { entries } = await generate();
    const presentation = decode(entries['ppt/presentation.xml']);
    expect(presentation).toContain('cx="43891200"');
    expect(presentation).toContain('cy="32918400"');
  });

  it('keeps the background a solid fill, not a picture', async () => {
    const { doc, entries } = await generate();
    const slide = decode(entries['ppt/slides/slide1.xml']);
    const bg = hexOf(doc.palette.bg);
    expect(slide).toContain(`<a:solidFill><a:srgbClr val="${bg}"/></a:solidFill>`);
    // A flattened background image would cost the user PowerPoint's
    // background-colour picker — it was removed deliberately.
    expect(slide).not.toContain('<p:bgPr><a:blipFill');
  });

  it('keeps the acknowledgement mark a selectable picture shape', async () => {
    const { entries } = await generate();
    const slide = decode(entries['ppt/slides/slide1.xml']);
    // Ordinary <p:pic> on the slide — clickable and deletable.
    expect(slide).toContain('<p:pic>');
    expect(Object.keys(entries).some((n) => n.startsWith('ppt/media/image'))).toBe(true);
  });
});

describe('theme carries the poster styling to NEW slides', () => {
  it('sets the poster font as the theme major and minor font', async () => {
    const { doc, entries } = await generate();
    const theme = decode(entries['ppt/theme/theme1.xml']);
    expect(theme).toContain(`<a:majorFont><a:latin typeface="${doc.fontFamily}"/>`);
    expect(theme).toContain(`<a:minorFont><a:latin typeface="${doc.fontFamily}"/>`);
    // Office defaults are gone — a new slide will not come up Calibri.
    expect(theme).not.toContain('typeface="Calibri Light"');
  });

  it('replaces the Office colour scheme with the poster palette', async () => {
    const { doc, entries } = await generate();
    const theme = decode(entries['ppt/theme/theme1.xml']);
    const p = resolveMasterPalette(doc.palette);
    expect(theme).toContain('<a:clrScheme name="Postr">');
    expect(theme).toContain(`<a:dk1><a:srgbClr val="${p.primary}"/></a:dk1>`);
    expect(theme).toContain(`<a:lt1><a:srgbClr val="${p.bg}"/></a:lt1>`);
    expect(theme).toContain(`<a:accent1><a:srgbClr val="${p.accent}"/></a:accent1>`);
    expect(theme).toContain(`<a:accent2><a:srgbClr val="${p.accent2}"/></a:accent2>`);
    // The Office swatches PowerPoint would otherwise offer.
    expect(theme).not.toContain('<a:srgbClr val="4472C4"/>');
    expect(theme).not.toContain('<a:srgbClr val="ED7D31"/>');
  });

  it('tracks a custom palette rather than hardcoding the default', async () => {
    const custom = {
      bg: '#101010',
      primary: '#F0F0F0',
      accent: '#FF0066',
      accent2: '#00CCAA',
      muted: '#888888',
      headerBg: '#202020',
      headerFg: '#FFFFFF',
    };
    const { entries } = await generate({ palette: custom });
    const theme = decode(entries['ppt/theme/theme1.xml']);
    expect(theme).toContain('<a:accent1><a:srgbClr val="FF0066"/></a:accent1>');
    expect(theme).toContain('<a:accent2><a:srgbClr val="00CCAA"/></a:accent2>');
    expect(theme).toContain('<a:lt1><a:srgbClr val="101010"/></a:lt1>');
  });

  it('tracks a custom font rather than hardcoding the default', async () => {
    const { entries } = await generate({ fontFamily: 'Lora' });
    const theme = decode(entries['ppt/theme/theme1.xml']);
    expect(theme).toContain('<a:majorFont><a:latin typeface="Lora"/>');
  });
});

describe('applyThemeColors', () => {
  const p = resolveMasterPalette(makeFixtureDoc().palette);

  it('substitutes the Office scheme in place', () => {
    const xml = `<a:theme><a:clrScheme name="Office"><a:dk1/></a:clrScheme><a:fontScheme/></a:theme>`;
    const out = applyThemeColors(xml, p);
    expect(out).toContain(themeColorXml(p));
    expect(out).toContain('<a:fontScheme/>');
    expect(out).not.toContain('name="Office"');
  });

  it('leaves unrecognised theme markup untouched', () => {
    // A pptxgenjs upgrade that renames the scheme must degrade to the
    // library's own colours, never corrupt the part.
    const xml = '<a:theme><a:clrScheme name="Custom"/></a:theme>';
    expect(applyThemeColors(xml, p)).toBe(xml);
  });

  it('emits a full twelve-slot scheme', () => {
    const xml = themeColorXml(p);
    for (const slot of [
      'dk1', 'lt1', 'dk2', 'lt2',
      'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
      'hlink', 'folHlink',
    ]) {
      expect(xml).toContain(`<a:${slot}>`);
    }
  });
});

describe('half-scale posters keep masters and the round-trip note', () => {
  it('still writes the dc:subject note the importer depends on', async () => {
    const { entries, result } = await generate({ widthIn: 96, heightIn: 48 });
    expect(result.scaled).toBe(true);
    const core = decode(entries['docProps/core.xml']);
    expect(core).toContain('exactly half size (48×24 in)');
  });

  it('still defines the full named layout set when halved', async () => {
    const { entries } = await generate({ widthIn: 96, heightIn: 48 });
    const names = [...layoutsByName(entries).keys()];
    for (const expected of MASTER_LAYOUT_NAMES) {
      expect(names).toContain(expected);
    }
  });

  it('keeps the poster slide on the empty layout when halved', async () => {
    const { entries } = await generate({ widthIn: 96, heightIn: 48 });
    expect(slideLayoutXml(entries)).toContain(`<p:cSld name="${POSTER_LAYOUT}"`);
  });

  it('scales layout type sizes with the poster, matching the slide', async () => {
    const full = await generate();
    const half = await generate({ widthIn: 96, heightIn: 48 });
    const titleSize = (entries: Record<string, Uint8Array>): number => {
      const layout = layoutsByName(entries).get(LAYOUT_THREE_COL) ?? '';
      return Number(/type="title"[\s\S]*?sz="(\d+)"/.exec(layout)![1]);
    };
    // Halved poster → halved point sizes, same as the slide's own text.
    expect(titleSize(half.entries)).toBe(titleSize(full.entries) / 2);
  });
});

describe('the repacked archive stays well-formed', () => {
  /** Every XML part parses without a parser error. Repacking the zip
   *  is the riskiest step here, so this walks the whole archive. */
  const expectAllPartsParse = (entries: Record<string, Uint8Array>): void => {
    const parser = new DOMParser();
    const xmlParts = Object.keys(entries).filter((n) => /\.(xml|rels)$/.test(n));
    expect(xmlParts.length).toBeGreaterThan(10);
    for (const part of xmlParts) {
      const parsed = parser.parseFromString(decode(entries[part]), 'application/xml');
      expect(
        parsed.getElementsByTagName('parsererror').length,
        `${part} is not well-formed XML`,
      ).toBe(0);
    }
  };

  it('parses every XML part of a normal export', async () => {
    const { entries } = await generate();
    expectAllPartsParse(entries);
  });

  it('parses every XML part of a halved export', async () => {
    const { entries } = await generate({ widthIn: 96, heightIn: 48 });
    expectAllPartsParse(entries);
  });

  it('keeps the content types and media intact through the repack', async () => {
    const { entries } = await generate();
    expect(decode(entries['[Content_Types].xml'])).toContain('theme+xml');
    const image = Object.entries(entries).find(([n]) => n.startsWith('ppt/media/image'));
    expect(image).toBeDefined();
    // PNG magic bytes survived being unzipped and rezipped.
    expect([...image![1].slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('does not corrupt the theme when the font name contains XML syntax', async () => {
    // pptxgenjs interpolates font names into `typeface="…"` unescaped,
    // and the .pptx importer copies any typeface it finds — so this
    // can arrive from an imported deck, not just by hand.
    const { entries } = await generate({ fontFamily: 'Ampers & <Sons>' });
    expectAllPartsParse(entries);
    const theme = decode(entries['ppt/theme/theme1.xml']);
    expect(theme).not.toContain('Ampers & <Sons>');
    expect(theme).toContain('<a:majorFont><a:latin typeface="Source Sans 3"/>');
  });

  it('falls back to the default family for an unknown font', () => {
    expect(safeFontFamily('Definitely Not A Real Font')).toBe('Source Sans 3');
    expect(safeFontFamily('')).toBe('Source Sans 3');
    expect(safeFontFamily(null)).toBe('Source Sans 3');
  });

  it('keeps a curated font untouched', () => {
    expect(safeFontFamily('Lora')).toBe('Lora');
    expect(safeFontFamily('IBM Plex Sans')).toBe('IBM Plex Sans');
  });
});

describe('round trip through the importer still works with masters', () => {
  it('restores the canvas size of an unscaled poster', async () => {
    const { result } = await generate();
    const parsed = parsePptx(result.bytes);
    expect(parsed.doc.widthIn).toBe(48);
    expect(parsed.doc.heightIn).toBe(36);
  });

  it('restores the ORIGINAL size of a halved poster', async () => {
    // The importer keys off dc:subject; masters must not disturb it.
    const { result } = await generate({ widthIn: 96, heightIn: 48 });
    const parsed = parsePptx(result.bytes);
    expect(parsed.doc.widthIn).toBe(96);
    expect(parsed.doc.heightIn).toBe(48);
  });

  it('imports blocks from the slide, not from the layouts', async () => {
    // Layout placeholders carry prompt text ("Click to add title").
    // The importer reads only slide1's shape tree, so none of that
    // must leak in as real poster content.
    const { result } = await generate();
    const parsed = parsePptx(result.bytes);
    const text = parsed.doc.blocks.map((b) => b.content).join(' ');
    expect(text).not.toContain('Click to add title');
    expect(text).not.toContain('Click to add text');
    expect(text).toContain('Whisker Maps');
  });

  it('keeps the imported font family the poster font', async () => {
    const { result } = await generate({ fontFamily: 'Lora' });
    expect(parsePptx(result.bytes).doc.fontFamily).toBe('Lora');
  });
});

/** Local hex helper mirroring the writer's fallback behaviour. */
function hexOf(css: string): string {
  return resolveMasterPalette({
    bg: css,
    primary: '#000',
    accent: '#000',
    accent2: '#000',
    muted: '#000',
    headerBg: '#000',
    headerFg: '#000',
  }).bg;
}
