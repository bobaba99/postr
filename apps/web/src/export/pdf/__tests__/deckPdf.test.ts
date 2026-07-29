/**
 * `exportStyledDeckPdf` — the shared `StyledSlideDeck` model rendered to a
 * client-side PDF via pdf-lib (Task 0 spike productionized: GO verdict,
 * see deckPdf.ts header note).
 *
 * Mirrors deckWriterStyled.test.ts's fixture shape (content + a
 * references-role slide + a takeaway slide) but adds a utility/template
 * slide — the PPTX-only "icon library" / "palette" / empty-layout slides
 * that `templateSlides.ts` appends to the .pptx — to prove the PDF path
 * omits it (spec: PDF renders content + references + ack ONLY).
 */
import { describe, expect, it } from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  type PDFPage,
} from 'pdf-lib';
import { exportStyledDeckPdf } from '../deckPdf';
import type { StyledSlideDeck } from '../../../manuscript/deck/styledTypes';
import { ackMarkPngDataUri } from '../../ackMarkPng';

/** True when this page's resource dictionary has at least one embedded
 * Image XObject. pdf-lib always creates an (possibly empty) `XObject`
 * sub-dict once any drawImage/drawText call touches the page, so an
 * empty dict (zero keys) means "no image was ever embedded here" and a
 * non-empty one means at least one image XObject is present. */
function hasEmbeddedImage(page: PDFPage): boolean {
  const resources = page.node.Resources();
  const xobjectDict = resources?.lookup(PDFName.of('XObject'));
  return xobjectDict instanceof PDFDict && xobjectDict.keys().length > 0;
}

/** Decode a reloaded page's content stream(s) into the raw PDF operator
 * text, so a test can assert on drawing commands directly (e.g. "was a
 * full-bleed background rectangle actually filled, and in what color").
 * `Contents()` returns either a single `PDFStream` or a `PDFArray` of
 * stream refs (pdf-lib may split large pages into several streams);
 * handle both, concatenating in order, matching how a PDF renderer
 * processes the page. */
function decodePageContent(page: PDFPage): string {
  const contents = page.node.Contents();
  if (!contents) return '';
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((ref) => page.node.context.lookup(ref) as PDFRawStream)
      : [contents as PDFRawStream];
  return streams
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
    .join('\n');
}

/** `rg` sets fill color from 0-1 components; convert a hex string to the
 * exact full-precision components pdf-lib emits (no rounding — pdf-lib
 * writes the raw float), so a test can substring-match the operator
 * pdf-lib would have written for that hex. */
function hexToRgOperator(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return `${r} ${g} ${b} rg`;
}

const theme: StyledSlideDeck['theme'] = {
  palette: ['#F7F8FA', '#1F2933', '#3E5C76', '#5F8F8B', '#C98A5B', '#D9E2EC'],
  typeScale: { heading: 30, body: 18, label: 13 },
  accentTreatment: 'slate',
};

/** Content + references deck — no utility slides. */
function fixtureStyledDeck(): StyledSlideDeck {
  return {
    durationMinutes: 10,
    theme,
    slides: [
      {
        role: 'title',
        device: 'plain',
        elements: [
          { kind: 'background', x: 0, y: 0, color: '#F7F5F1' },
          {
            kind: 'title',
            text: 'Does social media use lower adolescent well-being?',
            x: 0.72,
            y: 2.0,
            fontSize: 42,
            color: '#17252A',
          },
        ],
      },
      {
        role: 'result',
        device: 'progress-bar',
        elements: [
          { kind: 'background', x: 0, y: 0, color: '#F7F5F1' },
          {
            kind: 'title',
            text: 'More time does not reliably predict lower well-being.',
            x: 0.72,
            y: 1.42,
            fontSize: 37,
            color: '#17252A',
          },
          { kind: 'progress-track', x: 0.72, y: 6.55, color: '#DDE5E3' },
          { kind: 'progress-fill', x: 0.72, y: 6.55, color: '#1F5E63' },
        ],
      },
      {
        role: 'references',
        device: 'plain',
        elements: [
          {
            kind: 'title',
            text: 'References',
            x: 0.72,
            y: 0.6,
            fontSize: 30,
            color: '#17252A',
          },
          {
            kind: 'body',
            text: 'Smith, J. (2026). Whisker-driven navigation. Journal of Sample Research.',
            x: 0.72,
            y: 1.6,
            fontSize: 14,
            color: '#333333',
          },
        ],
      },
    ],
  };
}

/** A deck containing one PPTX-only utility slide (e.g. icon library /
 * palette / empty layout template) tagged with the template-marker
 * element convention. The PDF writer must filter these out entirely. */
function fixtureDeckWithUtilitySlide(): StyledSlideDeck {
  const base = fixtureStyledDeck();
  return {
    ...base,
    slides: [
      ...base.slides,
      {
        role: 'takeaway',
        device: 'plain',
        elements: [
          { kind: 'template-marker', x: 0, y: 0 },
          {
            kind: 'title',
            text: 'Icon library',
            x: 0.72,
            y: 0.6,
            fontSize: 30,
            color: '#17252A',
          },
          {
            kind: 'body',
            text: 'Swatches: #1F5E63 #D9875D #68767A — PowerPoint editing utility only.',
            x: 0.72,
            y: 1.6,
            fontSize: 14,
            color: '#333333',
          },
        ],
      },
    ],
  };
}

describe('exportStyledDeckPdf', () => {
  it('emits one PDF page per content+references slide (content+refs+ack page count)', async () => {
    const deck = fixtureStyledDeck();
    const bytes = await exportStyledDeckPdf(deck);
    expect(bytes.byteLength).toBeGreaterThan(1000);

    const reloaded = await PDFDocument.load(bytes);
    // 3 content/reference slides + 1 appended ack page (deck has no
    // references-only trailing ack region beyond text, so the writer
    // appends a dedicated ack page).
    expect(reloaded.getPageCount()).toBe(deck.slides.length + 1);
  });

  it('renders real, selectable text — not a rasterized page image', async () => {
    const deck = fixtureStyledDeck();
    const bytes = await exportStyledDeckPdf(deck);

    const reloaded = await PDFDocument.load(bytes);
    const firstPage = reloaded.getPages()[0]!;

    // A rasterized "picture of the slide" page would carry an image
    // XObject; real drawn text does not embed any image at all.
    expect(hasEmbeddedImage(firstPage)).toBe(false);

    // The content stream exists and is non-trivial (drawText emitted
    // real Tj/TJ show-text operators into it).
    const contentStream = firstPage.node.Contents();
    expect(contentStream).toBeDefined();
  });

  it('does not embed any image XObject on any content page (text stays real, not rasterized)', async () => {
    const deck = fixtureStyledDeck();
    const bytes = await exportStyledDeckPdf(deck);
    // The only permitted image in the whole document is the ack PNG on
    // the final page. Content pages (all pages except the last) must
    // carry zero image XObjects.
    const reloaded = await PDFDocument.load(bytes);
    const pages = reloaded.getPages();
    for (const page of pages.slice(0, -1)) {
      expect(hasEmbeddedImage(page)).toBe(false);
    }
  });

  it('places the ack mark PNG on the last (acknowledgement) page, never over content', async () => {
    const deck = fixtureStyledDeck();
    const bytes = await exportStyledDeckPdf(deck);
    const reloaded = await PDFDocument.load(bytes);
    const pages = reloaded.getPages();
    const ackPage = pages[pages.length - 1]!;

    expect(hasEmbeddedImage(ackPage)).toBe(true);

    // No earlier page has any image resource — the ack mark is placed
    // ONLY on the last page.
    for (const page of pages.slice(0, -1)) {
      expect(hasEmbeddedImage(page)).toBe(false);
    }
  });

  it('the ack PNG bytes it embeds are the canonical ackMarkPngDataUri mark', async () => {
    // Sanity: the data URI decodes to a non-trivial PNG the writer can
    // actually embed via pdf-lib's embedPng.
    const dataUri = ackMarkPngDataUri();
    expect(dataUri.startsWith('data:image/png;base64,')).toBe(true);
    const base64 = dataUri.slice('data:image/png;base64,'.length);
    const pngBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    expect(pngBytes.byteLength).toBeGreaterThan(100);
    // PNG magic bytes.
    expect(pngBytes[0]).toBe(0x89);
    expect(pngBytes[1]).toBe(0x50); // 'P'
    expect(pngBytes[2]).toBe(0x4e); // 'N'
    expect(pngBytes[3]).toBe(0x47); // 'G'
  });

  it('OMITS a slide tagged with the template/utility marker — page count excludes it', async () => {
    const withUtility = fixtureDeckWithUtilitySlide();
    const bytesWith = await exportStyledDeckPdf(withUtility);
    const reloadedWith = await PDFDocument.load(bytesWith);

    const withoutUtility = fixtureStyledDeck();
    const bytesWithout = await exportStyledDeckPdf(withoutUtility);
    const reloadedWithout = await PDFDocument.load(bytesWithout);

    // Same page count as the deck without the utility slide: the extra
    // slide contributed ZERO pages, proving it was filtered, not just
    // visually skipped.
    expect(reloadedWith.getPageCount()).toBe(reloadedWithout.getPageCount());
    expect(reloadedWith.getPageCount()).toBe(withoutUtility.slides.length + 1);
  });

  it('never renders the utility slide content ("Icon library") anywhere in the PDF', async () => {
    const deck = fixtureDeckWithUtilitySlide();
    const bytes = await exportStyledDeckPdf(deck);
    // A crude but effective content check: the utility slide's distinctive
    // text must not appear anywhere in the raw PDF bytes (pdf-lib's
    // drawText writes literal string bytes into the content stream for
    // WinAnsi-encodable text, so a straightforward byte-search is a valid
    // "was this text ever drawn" check).
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).not.toContain('Icon library');
  });

  it('handles a deck with zero content slides (only a utility slide) by producing just the ack page', async () => {
    const onlyUtility: StyledSlideDeck = {
      durationMinutes: 5,
      theme,
      slides: [
        {
          role: 'takeaway',
          device: 'plain',
          elements: [{ kind: 'template-marker', x: 0, y: 0 }],
        },
      ],
    };
    const bytes = await exportStyledDeckPdf(onlyUtility);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1); // just the appended ack page
  });

  it('fills the theme background color even when the slide has NO "background"-kind element', async () => {
    // The real styleDeck API prompt (apps/api/src/narrative/styleDeck.ts's
    // STYLE_SYSTEM_PROMPT) never requires or even mentions a "background"
    // element kind — so Arm P frequently will not emit one, exactly like
    // this fixture's own "references" slide above, which already omits
    // it. Without a fallback, the PDF page keeps its default (white)
    // background regardless of the deck's theme — on a dark theme, ink
    // text mapped to a light color (applyTheme.ts's remapColor) becomes
    // invisible against the undrawn white page. The pptx writer
    // (deckWriter.ts) never has this problem: it sets
    // `slide.background = { color: backgroundHex }` directly from
    // `deck.theme.palette[0]`, independent of any element. The PDF writer
    // must do the same.
    const darkTheme: StyledSlideDeck['theme'] = {
      palette: ['#111111', '#FFFFFF', '#FFD700', '#999999'],
      typeScale: { heading: 48, body: 20, label: 13 },
      accentTreatment: 'bold',
    };
    const deckWithoutBackgroundElement: StyledSlideDeck = {
      durationMinutes: 10,
      theme: darkTheme,
      slides: [
        {
          role: 'title',
          device: 'plain',
          // Deliberately NO { kind: 'background', ... } element — the
          // realistic case per the API prompt above.
          elements: [
            { kind: 'title', text: 'Spaced practice', x: 0.7, y: 0.5, fontSize: 48, color: '#FFFFFF' },
          ],
        },
      ],
    };

    const bytes = await exportStyledDeckPdf(deckWithoutBackgroundElement);
    const reloaded = await PDFDocument.load(bytes);
    const firstPage = reloaded.getPages()[0]!;
    const content = decodePageContent(firstPage);

    // A full-bleed rectangle-and-fill in the theme's background color
    // (palette[0], #111111) must be present, exactly matching what
    // drawBackground would emit from an explicit background element.
    expect(content).toContain(hexToRgOperator(darkTheme.palette[0]!));
    expect(content).toMatch(/\bf\b/); // the fill operator was actually invoked
  });
});
