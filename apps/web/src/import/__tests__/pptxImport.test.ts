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
import { EMU_PER_UNIT, emuToUnits, unitsToEmu } from '@/export/units';
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
  /** Clone slide1 into a second slide so the deck reports 2 slides. */
  const makeTwoSlideDeck = async (): Promise<Uint8Array> => {
    const { unzipSync } = await import('fflate');
    const entries = unzipSync(await exportBytes(makeFixtureDoc()));
    const decode = (n: string) => new TextDecoder().decode(entries[n]!);
    const encode = (s: string) => new TextEncoder().encode(s);

    const next: Record<string, Uint8Array> = { ...entries };
    next['ppt/slides/slide2.xml'] = entries['ppt/slides/slide1.xml']!;
    next['ppt/slides/_rels/slide2.xml.rels'] =
      entries['ppt/slides/_rels/slide1.xml.rels']!;

    // Register slide2 in the presentation + its rels so slide ordering
    // is discovered the same way PowerPoint would report it.
    const relsXml = decode('ppt/_rels/presentation.xml.rels').replace(
      '</Relationships>',
      '<Relationship Id="ridSlide2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>',
    );
    next['ppt/_rels/presentation.xml.rels'] = encode(relsXml);

    const presXml = decode('ppt/presentation.xml').replace(
      '</p:sldIdLst>',
      '<p:sldId id="257" r:id="ridSlide2"/></p:sldIdLst>',
    );
    next['ppt/presentation.xml'] = encode(presXml);

    const ctXml = decode('[Content_Types].xml').replace(
      '</Types>',
      '<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>',
    );
    next['[Content_Types].xml'] = encode(ctXml);

    return zipSync(next);
  };

  it('imports only the first slide and says how many were skipped', async () => {
    const parsed = parsePptx(await makeTwoSlideDeck());
    const warning = parsed.warnings.find((w) => /slides/i.test(w));
    expect(warning).toBeDefined();
    expect(warning).toContain('2 slides');
    expect(warning).toContain('1 slide was skipped');
    // Still a single canvas worth of blocks, not both slides merged.
    const titles = parsed.doc.blocks.filter((b) => b.type === 'title');
    expect(titles).toHaveLength(1);
  });
});

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
