/**
 * .pptx importer — validated primarily by ROUND TRIP: build a poster,
 * run it through the real PPTX exporter, import the resulting bytes,
 * and assert geometry / text / structure survive.
 *
 * That makes the exporter the oracle, so these tests fail if either
 * side of the EMU conversion drifts. Geometry assertions are EXACT
 * (91,440 EMU per poster unit is an integer ratio) — never "roughly".
 */
import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { exportPosterPptx } from '@/export/pptx/writer';
import { makeFixtureDoc, baseBlock, TINY_PNG_BYTES } from '@/export/__tests__/fixtures';
import {
  APPENDED_SLIDE_COUNT,
  TEMPLATE_SLIDE_PREFIX,
} from '@/export/pptx/templateMarker';
import { EMU_PER_UNIT, emuToUnits, unitsToEmu } from '@/export/units';
import { DEFAULT_FONT_FAMILY, FONT_NAMES } from '@/poster/constants';
import { PptxImportError } from '../pptx/ooxml';
import { parsePptx } from '../pptx/parsePptx';
import type { PosterDoc } from '@postr/shared';

const exportBytes = async (doc: PosterDoc): Promise<Uint8Array> => {
  const result = await exportPosterPptx(doc, { fetcher: async () => TINY_PNG_BYTES });
  return result.bytes;
};

const roundTrip = async (doc: PosterDoc) => parsePptx(await exportBytes(doc));

describe('EMU conversion is an exact inverse', () => {
  it('emuToUnits undoes unitsToEmu on the exporter constant', () => {
    expect(EMU_PER_UNIT).toBe(91440);
    for (const units of [0, 1, 15.5, 20, 240, 360]) {
      expect(emuToUnits(unitsToEmu(units))).toBe(units);
    }
  });
});

describe('round trip — 48×36 poster', () => {
  it('restores the canvas size exactly', async () => {
    const parsed = await roundTrip(makeFixtureDoc());
    expect(parsed.doc.widthIn).toBe(48);
    expect(parsed.doc.heightIn).toBe(36);
  });

  it('restores block geometry to the exact original poster units', async () => {
    const doc = makeFixtureDoc();
    const parsed = await roundTrip(doc);
    // The title block is at x=20, y=15.5, w=240, h=30 (see fixtures).
    const title = parsed.doc.blocks.find((b) => b.type === 'title');
    expect(title).toBeDefined();
    expect(title!.x).toBe(20);
    expect(title!.y).toBe(15.5);
    expect(title!.w).toBe(240);
    expect(title!.h).toBe(30);
  });

  it('recovers the title text and reports it as the doc title', async () => {
    const parsed = await roundTrip(makeFixtureDoc());
    // The fixture title is "Whisker Maps &amp; <b>Naps</b>: 100% Cat Science";
    // the exporter renders the entity + bold run, so the imported plain
    // text carries the decoded ampersand.
    expect(parsed.title).toContain('Whisker Maps &');
    expect(parsed.title).toContain('100% Cat Science');
  });

  it('preserves bold runs as markup rather than dropping them', async () => {
    const parsed = await roundTrip(makeFixtureDoc());
    const title = parsed.doc.blocks.find((b) => b.type === 'title');
    expect(title!.content).toContain('<b>Naps</b>');
  });

  it('escapes text so file content cannot inject markup', async () => {
    const doc = makeFixtureDoc({
      blocks: [
        baseBlock({
          id: 'evil',
          type: 'text',
          x: 10,
          y: 10,
          w: 100,
          h: 20,
          // Stored as an escaped entity, so the exporter writes the
          // literal characters into <a:t> and the importer sees them.
          content: '&lt;img src=x onerror=alert(1)&gt;',
        }),
      ],
    });
    const parsed = await roundTrip(doc);
    const block = parsed.doc.blocks[0]!;
    expect(block.content).not.toContain('<img');
    expect(block.content).toContain('&lt;img');
  });
});

describe('round trip — poster wider than PowerPoint’s 56in ceiling', () => {
  it('exports at half size but imports back at FULL original size', async () => {
    const doc = makeFixtureDoc({ widthIn: 96, heightIn: 48 });
    const result = await exportPosterPptx(doc, {
      fetcher: async () => TINY_PNG_BYTES,
    });
    // Precondition: the exporter really did halve it.
    expect(result.scaled).toBe(true);

    const parsed = parsePptx(result.bytes);
    expect(parsed.doc.widthIn).toBe(96);
    expect(parsed.doc.heightIn).toBe(48);
  });

  it('doubles block geometry back to the original units', async () => {
    const doc = makeFixtureDoc({ widthIn: 96, heightIn: 48 });
    const parsed = parsePptx(await exportBytes(doc));
    const title = parsed.doc.blocks.find((b) => b.type === 'title');
    // Exported at 0.5 × (20, 15.5) then restored by ×2 — exact, not near.
    expect(title!.x).toBe(20);
    expect(title!.y).toBe(15.5);
    expect(title!.w).toBe(240);
  });

  it('tells the user the file was restored from half size', async () => {
    const doc = makeFixtureDoc({ widthIn: 96, heightIn: 48 });
    const parsed = parsePptx(await exportBytes(doc));
    expect(parsed.warnings.some((w) => /half size/i.test(w))).toBe(true);
    expect(parsed.warnings.some((w) => /original dimensions/i.test(w))).toBe(true);
  });
});

describe('pictures', () => {
  it('resolves the relationship id to the embedded media bytes', async () => {
    const parsed = await roundTrip(makeFixtureDoc());
    expect(parsed.media.length).toBeGreaterThan(0);
    const item = parsed.media[0]!;
    expect(item.ext).toBe('png');
    // Byte-for-byte the PNG the exporter embedded.
    expect(Array.from(item.bytes)).toEqual(Array.from(TINY_PNG_BYTES));
    // And it is tied to a real image block in the doc.
    const block = parsed.doc.blocks.find((b) => b.id === item.blockId);
    expect(block?.type).toBe('image');
  });
});

describe('tables', () => {
  const tableDoc = (extra: Record<string, unknown> = {}) =>
    makeFixtureDoc({
      blocks: [
        baseBlock({
          id: 'tbl',
          type: 'table',
          x: 10,
          y: 20,
          w: 150,
          h: 40,
          tableData: {
            rows: 2,
            cols: 2,
            cells: ['Group', 'Score', 'Cats', '9.8'],
            colWidths: null,
            borderPreset: 'apa',
          },
          ...extra,
        }),
      ],
    });

  it('round-trips rows, cols and cell text in row-major order', async () => {
    const parsed = await roundTrip(tableDoc());
    const table = parsed.doc.blocks.find((b) => b.type === 'table');
    expect(table).toBeDefined();
    expect(table!.tableData!.rows).toBe(2);
    expect(table!.tableData!.cols).toBe(2);
    expect(table!.tableData!.cells).toEqual(['Group', 'Score', 'Cats', '9.8']);
  });

  it('restores horizontal geometry exactly', async () => {
    const parsed = await roundTrip(tableDoc());
    const table = parsed.doc.blocks.find((b) => b.type === 'table')!;
    expect(table.x).toBe(10);
    expect(table.w).toBe(150);
  });

  it('reflects the caption offset the EXPORTER bakes into the geometry', async () => {
    // Every table/image block gets a caption NUMBER ("Table 1.") from
    // computeCaptionNumbers regardless of caption text, so the
    // exporter's captionSplit always reserves a top strip and shifts
    // content down by one small text line + gap. At the default body
    // size that is exactly 7 poster units, so a block authored at
    // y=20 is written at y=27 and read back at y=27.
    //
    // The importer reads the file faithfully; this offset is the
    // exporter's layout choice, not import drift. Asserted exactly so
    // a change on either side of that math is caught here rather than
    // silently moving every imported table.
    const withCaption = await roundTrip(tableDoc({ caption: 'Sample results' }));
    const withoutCaption = await roundTrip(tableDoc());
    for (const parsed of [withCaption, withoutCaption]) {
      const table = parsed.doc.blocks.find((b) => b.type === 'table')!;
      expect(table.y).toBe(27);
    }
  });

  it('derives column width percentages from the table grid', async () => {
    const parsed = await roundTrip(tableDoc());
    const table = parsed.doc.blocks.find((b) => b.type === 'table')!;
    expect(table.tableData!.colWidths).toEqual([50, 50]);
  });
});

describe('multi-slide decks', () => {
  /**
   * Clone slide1 into an EXTRA slide, so the deck carries two slides
   * of real user content on top of Postr's own template slides.
   *
   * The clone lands past the templates rather than on top of one —
   * slide2..7 are Postr's, and overwriting one would be testing a
   * corrupt deck rather than a user's second poster slide.
   */
  const makeTwoSlideDeck = async (): Promise<Uint8Array> => {
    const { unzipSync } = await import('fflate');
    const entries = unzipSync(await exportBytes(makeFixtureDoc()));
    const decode = (n: string) => new TextDecoder().decode(entries[n]!);
    const encode = (s: string) => new TextEncoder().encode(s);

    const next: Record<string, Uint8Array> = { ...entries };
    next['ppt/slides/slide8.xml'] = entries['ppt/slides/slide1.xml']!;
    next['ppt/slides/_rels/slide8.xml.rels'] =
      entries['ppt/slides/_rels/slide1.xml.rels']!;

    // Register slide2 in the presentation + its rels so slide ordering
    // is discovered the same way PowerPoint would report it.
    const relsXml = decode('ppt/_rels/presentation.xml.rels').replace(
      '</Relationships>',
      '<Relationship Id="ridSlide8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide8.xml"/></Relationships>',
    );
    next['ppt/_rels/presentation.xml.rels'] = encode(relsXml);

    const presXml = decode('ppt/presentation.xml').replace(
      '</p:sldIdLst>',
      '<p:sldId id="264" r:id="ridSlide8"/></p:sldIdLst>',
    );
    next['ppt/presentation.xml'] = encode(presXml);

    const ctXml = decode('[Content_Types].xml').replace(
      '</Types>',
      '<Override PartName="/ppt/slides/slide8.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>',
    );
    next['[Content_Types].xml'] = encode(ctXml);

    return zipSync(next);
  };

  it('imports only the first slide and says how many were skipped', async () => {
    const parsed = parsePptx(await makeTwoSlideDeck());
    const warning = parsed.warnings.find((w) => /slides/i.test(w));
    expect(warning).toBeDefined();
    // The deck is 8 parts, but 6 of them are Postr's own appended
    // templates — the user authored 2 slides, and lost 1.
    expect(warning).toContain('2 slides');
    expect(warning).toContain('1 slide was skipped');
    // Still a single canvas worth of blocks, not both slides merged.
    const titles = parsed.doc.blocks.filter((b) => b.type === 'title');
    expect(titles).toHaveLength(1);
  });
});

/**
 * The POSTER export is a single slide now, but earlier Postr exports —
 * still in users' hands — were 7-slide decks (poster + explainer + five
 * empty layout templates), and the talk deck reuses those template
 * slides. Re-importing such a deck must not accuse the user of losing
 * six slides they never wrote, while a genuine multi-slide deck from
 * PowerPoint must still warn. These use `withTemplateSlides` to
 * reconstruct that historical/talk deck shape directly, since the
 * poster exporter no longer appends the slides.
 */
describe('Postr’s own template slides are not counted as skipped content', () => {
  const skipWarning = (parsed: { warnings: string[] }): string | undefined =>
    parsed.warnings.find((w) => /were skipped|was skipped/.test(w));

  it('produces NO skipped-slides warning for a Postr export', async () => {
    const parsed = await roundTrip(makeFixtureDoc());
    expect(skipWarning(parsed)).toBeUndefined();
  });

  it('still imports the poster itself from such a deck', async () => {
    const parsed = await roundTrip(makeFixtureDoc());
    expect(parsed.doc.blocks.filter((b) => b.type === 'title')).toHaveLength(1);
    expect(parsed.title).toContain('Whisker Maps &');
  });

  it('does NOT import the explainer or template slides as content', async () => {
    const parsed = await roundTrip(makeFixtureDoc());
    const text = parsed.doc.blocks.map((b) => b.content).join(' ');
    expect(text).not.toContain('Duplicate Slide');
    expect(text).not.toContain('empty templates');
    expect(text).not.toContain('3-Column Classic');
  });

  it('stays silent for a HALVED Postr export, and still restores its size', async () => {
    // The half-scale note is a different warning and must survive; the
    // skipped-slides one must still not appear.
    const parsed = await roundTrip(makeFixtureDoc({ widthIn: 96, heightIn: 48 }));
    expect(skipWarning(parsed)).toBeUndefined();
    expect(parsed.warnings.some((w) => /half size/i.test(w))).toBe(true);
    expect(parsed.doc.widthIn).toBe(96);
    expect(parsed.doc.heightIn).toBe(48);
  });

  it('DOES warn for a genuine 7-slide deck not produced by Postr', async () => {
    // Same slide count as a Postr export, but the slides are named the
    // way PowerPoint names them — so all six are real user content.
    const parsed = parsePptx(await makeForeignDeck(7));
    const warning = skipWarning(parsed);
    expect(warning).toBeDefined();
    expect(warning).toContain('7 slides');
    expect(warning).toContain('6 slides were skipped');
  });

  it('warns for a foreign deck whose slides carry no name at all', async () => {
    const parsed = parsePptx(await makeForeignDeck(3, { unnamed: true }));
    expect(skipWarning(parsed)).toContain('2 slides were skipped');
  });

  it('survives a MALFORMED slide among the ones it discards', async () => {
    // The template probe must never parse the slides it is about to
    // throw away: one bad byte in slide 5 previously sank an
    // otherwise perfectly importable poster.
    const broken = await withTemplateSlides();
    broken['ppt/slides/slide5.xml'] = new TextEncoder().encode('<p:sld><oops>');
    const parsed = parsePptx(zipSync(broken));
    // The poster still imports, with its blocks intact.
    expect(parsed.doc.blocks.filter((b) => b.type === 'title')).toHaveLength(1);
    expect(parsed.title).toContain('Whisker Maps &');
    // The unreadable slide can no longer be recognised as ours, so it
    // counts as skipped; the other five templates still do not.
    expect(skipWarning(parsed)).toContain('1 slide was skipped');
  });

  it('imports the POSTER when a template slide has been dragged in front', async () => {
    // Reordering in the slide sorter is a click away. Importing the
    // empty template as "the poster" would silently drop the real one.
    const parsed = parsePptx(await reorderPosterTo(2));
    expect(parsed.title).toContain('Whisker Maps &');
    expect(parsed.title).not.toContain('3-Column Classic');
    expect(parsed.doc.blocks.filter((b) => b.type === 'title')).toHaveLength(1);
    expect(skipWarning(parsed)).toBeUndefined();
  });

  it('refuses a deck whose poster was deleted, leaving only templates', async () => {
    // There is no poster to import. Silently handing back Postr's own
    // explainer copy as the user's content would be worse than an
    // error, so this rejects rather than inventing a poster.
    const bytes = await reorderPosterTo(2, { dropPoster: true });
    expect(() => parsePptx(bytes)).toThrow(PptxImportError);
  });

  it('caps the subtraction so forged names cannot silence the warning', async () => {
    // The marker is an attribute anyone can write. Renaming a whole
    // deck must not let it claim that nothing was skipped.
    const parsed = parsePptx(await makeForeignDeck(10, { forgeMarker: true }));
    const warning = skipWarning(parsed);
    expect(warning).toBeDefined();
    // 10 slides, at most 6 credited as ours → 4 user slides, 3 lost.
    expect(warning).toContain('4 slides');
    expect(warning).toContain('3 slides were skipped');
  });

  it('is not fooled by a slide merely MENTIONING the marker in its text', async () => {
    // The marker lives in the slide's <p:cSld name> attribute. Body
    // text that happens to quote it must not buy a free pass.
    const parsed = parsePptx(
      await makeForeignDeck(2, { bodyText: 'Postr template - Billboard' }),
    );
    expect(skipWarning(parsed)).toContain('1 slide was skipped');
  });
});

/**
 * A deck with `count` slides that Postr did NOT produce: slides are
 * named the way PowerPoint names them (or not at all), so none of them
 * carry the template marker.
 */
/**
 * A real Postr export whose slide ORDER has been changed, as a user
 * would by dragging in the slide sorter: the poster moves to position
 * `position` (1-based), or is deleted outright with `dropPoster`.
 *
 * Only `<p:sldIdLst>` is rewritten — that list, not the part
 * filenames, is what PowerPoint treats as the deck order.
 */
async function reorderPosterTo(
  position: number,
  opts: { dropPoster?: boolean } = {},
): Promise<Uint8Array> {
  // Built on the template-slide deck so there are slides to reorder the
  // poster among — the poster export alone is a single slide now.
  const entries = await withTemplateSlides();
  const decode = (n: string): string => new TextDecoder().decode(entries[n]!);

  const pres = decode('ppt/presentation.xml');
  const list = /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(pres)![1]!;
  const ids = list.match(/<p:sldId\b[^/]*\/>/g)!;
  const [poster, ...rest] = ids;
  const reordered = opts.dropPoster
    ? rest
    : [...rest.slice(0, position - 1), poster!, ...rest.slice(position - 1)];

  return zipSync({
    ...entries,
    'ppt/presentation.xml': new TextEncoder().encode(
      pres.replace(list, reordered.join('')),
    ),
  });
}

/**
 * A poster-only export with `APPENDED_SLIDE_COUNT` genuinely
 * template-marked slides appended — the shape of a historical Postr
 * export (and of a talk deck), reconstructed here because the poster
 * exporter no longer appends them. Each appended slide carries
 * `<p:cSld name="Postr template - …">`, so the importer recognises them
 * exactly as it did when the exporter wrote them.
 */
async function withTemplateSlides(): Promise<Record<string, Uint8Array>> {
  const { unzipSync } = await import('fflate');
  const entries = unzipSync(await exportBytes(makeFixtureDoc()));
  const decode = (n: string): string => new TextDecoder().decode(entries[n]!);
  const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

  const next: Record<string, Uint8Array> = { ...entries };
  let rels = decode('ppt/_rels/presentation.xml.rels');
  let pres = decode('ppt/presentation.xml');
  let types = decode('[Content_Types].xml');

  // slide1 is the poster; append slides 2..(1 + APPENDED_SLIDE_COUNT).
  for (let i = 2; i <= 1 + APPENDED_SLIDE_COUNT; i++) {
    const label = i === 2 ? 'About these slides' : `Layout ${i}`;
    next[`ppt/slides/slide${i}.xml`] = encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
        ' xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        `<p:cSld name="${TEMPLATE_SLIDE_PREFIX}${label}"><p:spTree>` +
        '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
        '<p:grpSpPr/></p:spTree></p:cSld></p:sld>',
    );
    rels = rels.replace(
      '</Relationships>',
      `<Relationship Id="ridTmpl${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/></Relationships>`,
    );
    pres = pres.replace(
      '</p:sldIdLst>',
      `<p:sldId id="${300 + i}" r:id="ridTmpl${i}"/></p:sldIdLst>`,
    );
    types = types.replace(
      '</Types>',
      `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`,
    );
  }

  next['ppt/_rels/presentation.xml.rels'] = encode(rels);
  next['ppt/presentation.xml'] = encode(pres);
  next['[Content_Types].xml'] = encode(types);
  return next;
}

async function makeForeignDeck(
  count: number,
  opts: { unnamed?: boolean; bodyText?: string; forgeMarker?: boolean } = {},
): Promise<Uint8Array> {
  const { unzipSync } = await import('fflate');
  const entries = unzipSync(
    (await exportPosterPptx(makeFixtureDoc(), {
      fetcher: async () => TINY_PNG_BYTES,
      templateSlides: false,
    })).bytes,
  );
  const decode = (n: string): string => new TextDecoder().decode(entries[n]!);
  const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

  const body = opts.bodyText
    ? `<p:sp><p:nvSpPr><p:cNvPr id="2" name="T"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
      `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm></p:spPr>` +
      `<p:txBody><a:bodyPr/><a:p><a:r><a:t>${opts.bodyText}</a:t></a:r></a:p></p:txBody></p:sp>`
    : '';

  const next: Record<string, Uint8Array> = { ...entries };
  let rels = decode('ppt/_rels/presentation.xml.rels');
  let pres = decode('ppt/presentation.xml');
  let types = decode('[Content_Types].xml');

  for (let i = 2; i <= count; i++) {
    const name = opts.unnamed
      ? '<p:cSld>'
      : opts.forgeMarker
        ? `<p:cSld name="Postr template - forged ${i}">`
        : `<p:cSld name="Slide ${i}">`;
    next[`ppt/slides/slide${i}.xml`] = encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
        ' xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        `${name}<p:spTree>` +
        '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
        '<p:grpSpPr/>' +
        `${body}</p:spTree></p:cSld></p:sld>`,
    );
    rels = rels.replace(
      '</Relationships>',
      `<Relationship Id="ridForeign${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/></Relationships>`,
    );
    pres = pres.replace(
      '</p:sldIdLst>',
      `<p:sldId id="${300 + i}" r:id="ridForeign${i}"/></p:sldIdLst>`,
    );
    types = types.replace(
      '</Types>',
      `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`,
    );
  }

  next['ppt/_rels/presentation.xml.rels'] = encode(rels);
  next['ppt/presentation.xml'] = encode(pres);
  next['[Content_Types].xml'] = encode(types);
  return zipSync(next);
}

describe('unsupported shapes', () => {
  it('reports a chart graphicFrame instead of dropping it silently', () => {
    const bytes = makeMinimalPptx(`
      <p:graphicFrame>
        <p:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></p:xfrm>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic>
      </p:graphicFrame>`);
    const parsed = parsePptx(bytes);
    expect(parsed.warnings.some((w) => /chart/i.test(w))).toBe(true);
  });

  it('reports a grouped shape it cannot flatten', () => {
    const bytes = makeMinimalPptx(`
      <p:grpSp>
        <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm></p:grpSpPr>
      </p:grpSp>`);
    const parsed = parsePptx(bytes);
    expect(parsed.warnings.some((w) => /grouped shape/i.test(w))).toBe(true);
  });
});

/**
 * Decks authored in PowerPoint — not round-tripped through Postr's own
 * exporter — routinely omit geometry and relationships the exporter
 * always writes. The round-trip tests above cannot see these cases
 * because the exporter is their oracle, so they are hand-built here.
 */
describe('font names from an imported file are untrusted', () => {
  // A .pptx is a file from outside this system. `typeface` is whatever
  // the authoring tool wrote, and it lands in a PosterDoc that is later
  // re-serialised into exported XML — so a name carrying markup could
  // corrupt an export downstream. readFontFamily allowlists against
  // FONT_NAMES rather than sanitising, since an unknown family could
  // not be rendered anyway.
  const fontShape = (typeface: string) => `
      <p:sp>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="7315200" cy="3657600"/></a:xfrm></p:spPr>
        <p:txBody><a:p><a:r>
          <a:rPr><a:latin typeface="${typeface}"/></a:rPr>
          <a:t>Body text</a:t>
        </a:r></a:p></p:txBody>
      </p:sp>`;

  it('keeps a font it recognises', () => {
    const known = FONT_NAMES[0]!;
    const parsed = parsePptx(makeMinimalPptx(fontShape(known)));
    expect(parsed.doc.fontFamily).toBe(known);
  });

  it('falls back to the default for a font it does not ship', () => {
    const parsed = parsePptx(makeMinimalPptx(fontShape('Comic Sans MS')));
    expect(parsed.doc.fontFamily).toBe(DEFAULT_FONT_FAMILY);
  });

  it('never lets a crafted typeface reach the document', () => {
    // Markup in the name is the case that would corrupt a later export.
    const hostile = 'Evil&quot;/&gt;&lt;script&gt;x&lt;/script&gt;';
    const parsed = parsePptx(makeMinimalPptx(fontShape(hostile)));
    expect(parsed.doc.fontFamily).toBe(DEFAULT_FONT_FAMILY);
    expect(parsed.doc.fontFamily).not.toContain('script');
  });
});

describe('PowerPoint-authored shapes the exporter never emits', () => {
  it('keeps body text whose position lives in the slide layout', () => {
    const bytes = makeMinimalPptx(`
      <p:sp>
        <p:spPr/>
        <p:txBody><a:p><a:r><a:t>IMPORTANT BODY TEXT</a:t></a:r></a:p></p:txBody>
      </p:sp>`);
    const parsed = parsePptx(bytes);
    // The text must survive — dropping it is silent data loss.
    expect(parsed.doc.blocks).toHaveLength(1);
    expect(parsed.doc.blocks[0]!.content).toContain('IMPORTANT BODY TEXT');
    // And the user must be told it was placed, not positioned.
    const warning = parsed.warnings.find((w) => /IMPORTANT BODY TEXT/.test(w));
    expect(warning).toBeDefined();
    expect(warning).toMatch(/top-left/i);
  });

  it('keeps layout-positioned text even with no spPr element at all', () => {
    const bytes = makeMinimalPptx(`
      <p:sp>
        <p:txBody><a:p><a:r><a:t>Placeholder body</a:t></a:r></a:p></p:txBody>
      </p:sp>`);
    const parsed = parsePptx(bytes);
    expect(parsed.doc.blocks).toHaveLength(1);
    expect(parsed.doc.blocks[0]!.content).toContain('Placeholder body');
  });

  it('does not warn about a decorative shape that carries no text', () => {
    const parsed = parsePptx(makeMinimalPptx('<p:sp><p:spPr/></p:sp>'));
    expect(parsed.doc.blocks).toHaveLength(0);
    expect(parsed.warnings.some((w) => /top-left/i.test(w))).toBe(false);
  });

  it('truncates a long line rather than quoting a whole paragraph', () => {
    const long = 'Methods and materials for the longitudinal cohort study of feline naps';
    const parsed = parsePptx(
      makeMinimalPptx(`
        <p:sp>
          <p:spPr/>
          <p:txBody><a:p><a:r><a:t>${long}</a:t></a:r></a:p></p:txBody>
        </p:sp>`),
    );
    const warning = parsed.warnings.find((w) => /top-left/i.test(w));
    expect(warning).toBeDefined();
    expect(warning).toContain('…');
    expect(warning).not.toContain('feline naps');
  });

  it('reports a picture whose blip carries no relationship id', () => {
    const bytes = makeMinimalPptx(`
      <p:pic>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm></p:spPr>
        <p:blipFill><a:blip/></p:blipFill>
      </p:pic>`);
    const parsed = parsePptx(bytes);
    expect(parsed.doc.blocks).toHaveLength(1);
    expect(parsed.doc.blocks[0]!.type).toBe('image');
    // Same message as an r:embed that resolves to nothing — one blank
    // frame, one explanation, regardless of which way it failed.
    expect(
      parsed.warnings.some((w) => /could not be read and was left as an empty frame/.test(w)),
    ).toBe(true);
  });

  it('reports an r:embed that resolves to no media the same way', () => {
    const bytes = makeMinimalPptx(`
      <p:pic>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm></p:spPr>
        <p:blipFill><a:blip r:embed="rIdMissing"/></p:blipFill>
      </p:pic>`);
    const parsed = parsePptx(bytes);
    expect(
      parsed.warnings.some((w) => /could not be read and was left as an empty frame/.test(w)),
    ).toBe(true);
  });
});

describe('degenerate input', () => {
  it('reports an empty slide rather than returning a silently blank doc', () => {
    const parsed = parsePptx(makeMinimalPptx(''));
    expect(parsed.doc.blocks).toHaveLength(0);
    expect(parsed.warnings.some((w) => /no text, images, or tables/i.test(w))).toBe(
      true,
    );
  });

  it('rejects a non-zip file', () => {
    const notAZip = new TextEncoder().encode('this is definitely not a pptx');
    expect(() => parsePptx(notAZip)).toThrow(PptxImportError);
  });

  it('rejects a zip that is not a presentation', () => {
    const zip = zipSync({ 'hello.txt': new TextEncoder().encode('hi') });
    expect(() => parsePptx(zip)).toThrow(PptxImportError);
  });

  it('rejects a presentation with malformed XML', () => {
    const zip = zipSync({
      'ppt/presentation.xml': new TextEncoder().encode('<p:presentation><oops>'),
    });
    expect(() => parsePptx(zip)).toThrow(PptxImportError);
  });

  it('never leaks raw parser detail into a user-facing message', () => {
    const notAZip = new TextEncoder().encode('nope');
    try {
      parsePptx(notAZip);
      expect.unreachable('should have thrown');
    } catch (err) {
      // The modal shows a generic panel; the class is what routes it.
      expect(err).toBeInstanceOf(PptxImportError);
      expect((err as Error).message).not.toMatch(/<|\/>|xml|stack/i);
    }
  });
});

/** Hand-built single-slide .pptx carrying `shapeXml` in its spTree. */
function makeMinimalPptx(shapeXml: string): Uint8Array {
  const encode = (s: string) => new TextEncoder().encode(s);
  const presentation =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>` +
    `<p:sldSz cx="43891200" cy="32918400"/></p:presentation>`;
  const presRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>` +
    `</Relationships>`;
  const slide =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree>${shapeXml}</p:spTree></p:cSld></p:sld>`;

  return zipSync({
    'ppt/presentation.xml': encode(presentation),
    'ppt/_rels/presentation.xml.rels': encode(presRels),
    'ppt/slides/slide1.xml': encode(slide),
  });
}
