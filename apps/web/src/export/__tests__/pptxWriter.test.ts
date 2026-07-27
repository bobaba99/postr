/**
 * PPTX writer — validates the generated OOXML by unzipping the real
 * .pptx bytes (plan §6: "unzip generated PPTX and validate parts").
 * Geometry assertions are EXACT EMU integers, and the 56-inch
 * ceiling behavior is checked end-to-end: slide size, halved font
 * sizes, the core-properties note, and the off-slide warning box.
 */
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { PptxSizeLimitError } from '../units';
import { exportPosterPptx, normalizeRotation, paragraphsToTextProps } from '../pptx/writer';
import { parseRichText } from '../richText';
import { makeFixtureDoc, TINY_PNG_BYTES } from './fixtures';

const decode = (bytes: Uint8Array | undefined): string =>
  bytes ? new TextDecoder().decode(bytes) : '';

async function generate(overrides = {}) {
  const doc = makeFixtureDoc(overrides);
  const result = await exportPosterPptx(doc, { fetcher: async () => TINY_PNG_BYTES });
  return { doc, result, entries: unzipSync(result.bytes) };
}

describe('exportPosterPptx — unscaled 48×36 poster', () => {
  it('produces a valid archive with the expected parts', async () => {
    const { entries } = await generate();
    const names = Object.keys(entries);
    expect(names).toContain('[Content_Types].xml');
    expect(names).toContain('ppt/presentation.xml');
    expect(names).toContain('ppt/slides/slide1.xml');
    expect(names).toContain('docProps/core.xml');
    expect(names.some((n) => n.startsWith('ppt/media/image'))).toBe(true);
  });

  it('emits the exact slide size in EMU (48in × 36in)', async () => {
    const { entries } = await generate();
    const presentation = decode(entries['ppt/presentation.xml']);
    expect(presentation).toContain('cx="43891200"');
    expect(presentation).toContain('cy="32918400"');
  });

  it('places the title block at exact EMU coordinates', async () => {
    const { entries } = await generate();
    const slide = decode(entries['ppt/slides/slide1.xml']);
    // title at x=20u (2in), y=15.5u (1.55in)
    expect(slide).toContain('<a:off x="1828800" y="1417320"');
  });

  it('renders title text with entity escapes and full point size', async () => {
    const { entries } = await generate();
    const slide = decode(entries['ppt/slides/slide1.xml']);
    expect(slide).toContain('Whisker Maps &amp; ');
    expect(slide).toContain('100% Cat Science');
    // 14 units × 7.2 = 100.8pt → OOXML hundredths 10080
    expect(slide).toContain('sz="10080"');
  });

  it('renders authors with superscript markers', async () => {
    const { entries } = await generate();
    const slide = decode(entries['ppt/slides/slide1.xml']);
    expect(slide).toContain('John Smith');
    expect(slide).toContain('baseline="30000"');
    expect(slide).toContain('Acme State University');
  });

  it('renders a native table with the cell content', async () => {
    const { entries } = await generate();
    const slide = decode(entries['ppt/slides/slide1.xml']);
    expect(slide).toContain('<a:tbl>');
    expect(slide).toContain('Cats &amp; kittens');
  });

  it('applies clockwise rotation in 60000ths of a degree', async () => {
    const { entries } = await generate();
    const slide = decode(entries['ppt/slides/slide1.xml']);
    // 15° clockwise → rot="900000"
    expect(slide).toContain('rot="900000"');
  });

  it('embeds the figure bytes as a media part', async () => {
    const { entries } = await generate();
    const media = Object.keys(entries).find((n) => n.startsWith('ppt/media/image'));
    expect(media).toBeDefined();
    expect(entries[media!]).toEqual(TINY_PNG_BYTES);
  });

  it('reports no scaling and includes the font-substitution warning', async () => {
    const { result } = await generate();
    expect(result.scaled).toBe(false);
    expect(result.note).toBeNull();
    expect(result.warnings.some((w) => w.includes('Source Sans 3'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('fonts.google.com'))).toBe(true);
  });

  it('renders the references block with the heading', async () => {
    const { entries } = await generate();
    const slide = decode(entries['ppt/slides/slide1.xml']);
    expect(slide).toContain('References');
    expect(slide).toContain('Whisker-driven navigation');
  });
});

describe('exportPosterPptx — the 56-inch ceiling (72×48 SfN poster)', () => {
  const big = { widthIn: 72, heightIn: 48 };

  it('emits a 36×24 in slide — exactly half', async () => {
    const { entries, result } = await generate(big);
    const presentation = decode(entries['ppt/presentation.xml']);
    expect(result.scaled).toBe(true);
    expect(presentation).toContain('cx="32918400"'); // 36 in
    expect(presentation).toContain('cy="21945600"'); // 24 in
  });

  it('halves every geometry: title lands at 1in, 0.775in', async () => {
    const { entries } = await generate(big);
    const slide = decode(entries['ppt/slides/slide1.xml']);
    expect(slide).toContain('<a:off x="914400" y="708660"');
  });

  it('halves every font size (100.8pt → 50.4pt)', async () => {
    const { entries } = await generate(big);
    const slide = decode(entries['ppt/slides/slide1.xml']);
    expect(slide).toContain('sz="5040"');
    expect(slide).not.toContain('sz="10080"');
  });

  it('writes the note into the core properties (survives forwarding)', async () => {
    const { entries, result } = await generate(big);
    const core = decode(entries['docProps/core.xml']);
    expect(result.note).toContain('half size');
    expect(core).toContain('72×48');
    expect(core).toContain('Print at 200%');
  });

  it('adds the off-slide warning text box', async () => {
    const { entries } = await generate(big);
    const slide = decode(entries['ppt/slides/slide1.xml']);
    expect(slide).toContain('Print at 200% to restore full size');
    // The warning box sits BELOW the slide: y offset > slide height
    // (24in = 21,945,600 EMU).
    const m = /<a:off x="182880" y="(\d+)"/.exec(slide);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(21945600);
  });

  it('surfaces the note to the caller for the export UI', async () => {
    const { result } = await generate(big);
    expect(result.note).toContain("PowerPoint's limit is 56 in");
  });
});

describe('exportPosterPptx — refusal beyond 112 in', () => {
  it('throws PptxSizeLimitError instead of clipping or rescaling', async () => {
    const doc = makeFixtureDoc({ widthIn: 120, heightIn: 48 });
    await expect(exportPosterPptx(doc, { fetcher: async () => TINY_PNG_BYTES })).rejects.toThrow(
      PptxSizeLimitError,
    );
  });
});

describe('paragraphsToTextProps', () => {
  it('maps styles onto pptxgenjs run options', () => {
    const runs = paragraphsToTextProps(parseRichText('<b>b</b><i>i</i><u>u</u><s>s</s>'));
    expect(runs[0]?.options).toMatchObject({ bold: true });
    expect(runs[1]?.options).toMatchObject({ italic: true });
    expect(runs[2]?.options).toMatchObject({ underline: { style: 'sng' } });
    expect(runs[3]?.options).toMatchObject({ strike: 'sngStrike' });
  });

  it('maps sub/sup and colors', () => {
    const runs = paragraphsToTextProps(
      parseRichText('x<sup>2</sup><span style="color: #c1121f">red</span>'),
    );
    expect(runs[1]?.options).toMatchObject({ superscript: true });
    expect(runs[2]?.options).toMatchObject({ color: 'C1121F' });
  });

  it('sets breakLine on every paragraph end except the last', () => {
    const runs = paragraphsToTextProps(parseRichText('one<br>two'));
    expect(runs[0]?.options?.breakLine).toBe(true);
    expect(runs[1]?.options?.breakLine).toBe(false);
  });

  it('marks list paragraphs with bullets', () => {
    const runs = paragraphsToTextProps(parseRichText('<ul><li>a</li></ul><ol><li>n</li></ol>'));
    expect(runs[0]?.options?.bullet).toBe(true);
    expect(runs[1]?.options?.bullet).toEqual({ type: 'number' });
  });
});

describe('normalizeRotation', () => {
  it('normalizes into 0–359 clockwise', () => {
    expect(normalizeRotation(15)).toBe(15);
    expect(normalizeRotation(-15)).toBe(345);
    expect(normalizeRotation(375)).toBe(15);
    expect(normalizeRotation(0)).toBeUndefined();
    expect(normalizeRotation(undefined)).toBeUndefined();
    expect(normalizeRotation(360)).toBeUndefined();
  });
});
