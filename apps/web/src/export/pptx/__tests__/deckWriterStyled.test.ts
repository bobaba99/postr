/**
 * Styled deck → editable PPTX (Phase 2 — Task 6a).
 *
 * `exportStyledDeckPptx` renders the shared `StyledSlideDeck` model
 * (Arm P layout + Arm T theme) to real pptx shapes/text. Same
 * unzip-and-assert strategy as `deckWriter.test.ts`: content must be
 * real `<a:t>` text, never rasterized images, and every device's shape
 * set (progress-bar, quote-block, callout, stat-emphasis, plain) must
 * render without throwing — including an unknown element kind, which
 * must gracefully degrade rather than break the export (spec §5.3).
 */
import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { exportStyledDeckPptx } from '../deckWriter';
import type { StyledSlideDeck } from '../../../manuscript/deck/styledTypes';

const theme: StyledSlideDeck['theme'] = {
  palette: ['#F7F8FA', '#1F2933', '#3E5C76', '#5F8F8B', '#C98A5B', '#D9E2EC'],
  typeScale: { heading: 30, body: 18, label: 13 },
  accentTreatment: 'slate',
};

/** Adapted from docs/plans/experiments/design-pass/out/SS1_armP_styled.json,
 * conformed to the canonical StyledSlideDeck shape (DeviceKind enum,
 * inches-based x/y, Theme without layoutRules/rationale). */
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
            kind: 'section-label',
            text: 'ADOLESCENT SOCIAL MEDIA',
            x: 0.72,
            y: 0.75,
            fontSize: 14,
            color: '#1F5E63',
          },
          {
            kind: 'title',
            text: 'Does social media use lower adolescent well-being?',
            x: 0.72,
            y: 2.0,
            fontSize: 42,
            color: '#17252A',
          },
          {
            kind: 'footer',
            text: 'Research talk',
            x: 0.72,
            y: 7.1,
            fontSize: 11,
            color: '#68767A',
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
          {
            kind: 'progress-label',
            text: 'QUESTION',
            x: 0.72,
            y: 6.86,
            fontSize: 11,
            color: '#68767A',
          },
          {
            kind: 'progress-label',
            text: 'EVIDENCE',
            x: 5.96,
            y: 6.86,
            fontSize: 11,
            color: '#1F5E63',
          },
          {
            kind: 'progress-label',
            text: 'INTERPRETATION',
            x: 10.55,
            y: 6.86,
            fontSize: 11,
            color: '#68767A',
          },
        ],
      },
      {
        role: 'result',
        device: 'quote-block',
        elements: [
          {
            kind: 'quote-block',
            text: 'Longitudinal evidence finds little support that more time lowers well-being.',
            x: 1.08,
            y: 3.0,
            fontSize: 26,
            color: '#29464A',
          },
          { kind: 'quote-rule', x: 0.72, y: 2.95, color: '#D9875D' },
        ],
      },
      {
        role: 'takeaway',
        device: 'callout',
        elements: [
          {
            kind: 'title',
            text: 'Small effects. Often null.',
            x: 0.72,
            y: 1.38,
            fontSize: 42,
            color: '#17252A',
          },
          { kind: 'callout-box', x: 0.72, y: 4.35, color: '#E4EEEB' },
          {
            kind: 'callout-label',
            text: 'METHOD MATTERS',
            x: 1.02,
            y: 4.7,
            fontSize: 13,
            color: '#1F5E63',
          },
          {
            kind: 'callout-text',
            text: 'Testing whether use precedes changes in well-being is not optional.',
            x: 1.02,
            y: 5.12,
            fontSize: 20,
            color: '#17252A',
          },
        ],
      },
      {
        role: 'result',
        device: 'stat-emphasis',
        elements: [
          {
            kind: 'title',
            text: '34%',
            x: 0.72,
            y: 2.0,
            fontSize: 96,
            color: '#1F5E63',
          },
        ],
      },
      {
        // Unknown element kind on an otherwise-plain slide: must fall back
        // to a plain text box rather than throwing (graceful degradation).
        role: 'result',
        device: 'plain',
        elements: [
          {
            kind: 'mystery-widget',
            text: 'Unrecognized kind, still exports',
            x: 0.72,
            y: 3.0,
            fontSize: 20,
            color: '#111111',
          },
          { kind: 'another-unknown-kind', x: 1.0, y: 4.0, color: '#222222' }, // no text: skip, not throw
        ],
      },
    ],
  };
}

const slideXmls = (files: Record<string, Uint8Array>): string[] =>
  Object.keys(files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort(
      (a, b) => Number(a.replace(/\D+/g, '')) - Number(b.replace(/\D+/g, '')),
    );

describe('exportStyledDeckPptx', () => {
  it('emits one pptx slide per styled slide, with real editable text (not images)', async () => {
    const deck = fixtureStyledDeck();
    const bytes = await exportStyledDeckPptx(deck);
    expect(bytes.byteLength).toBeGreaterThan(0);

    const files = unzipSync(bytes);
    const xmls = slideXmls(files);
    expect(xmls).toHaveLength(deck.slides.length);

    // No rasterized content anywhere in the archive.
    expect(
      Object.keys(files).some((k) => k.endsWith('.png') || k.endsWith('.svg')),
    ).toBe(false);

    // Real text runs, not an image placeholder.
    expect(strFromU8(files[xmls[0]!]!)).toContain('<a:t>');
  });

  it('renders a progress-bar device slide with distinct track + fill rects and stage labels', async () => {
    const deck = fixtureStyledDeck();
    const bytes = await exportStyledDeckPptx(deck);
    const files = unzipSync(bytes);
    const xmls = slideXmls(files);
    const progressSlideXml = strFromU8(files[xmls[1]!]!); // slide index 1 = progress-bar
    const rectCount = (progressSlideXml.match(/<a:prstGeom prst="rect"/g) ?? [])
      .length;
    // background + progress-track + progress-fill = at least 3 real rects.
    expect(rectCount).toBeGreaterThanOrEqual(3);
    expect(progressSlideXml).toContain('QUESTION');
    expect(progressSlideXml).toContain('EVIDENCE');
    expect(progressSlideXml).toContain('INTERPRETATION');
  });

  it('renders quote-block text and an accent rule shape', async () => {
    const deck = fixtureStyledDeck();
    const bytes = await exportStyledDeckPptx(deck);
    const files = unzipSync(bytes);
    const xmls = slideXmls(files);
    const quoteXml = strFromU8(files[xmls[2]!]!);
    expect(quoteXml).toContain('Longitudinal evidence finds little support');
  });

  it('renders a callout box, label, and body text', async () => {
    const deck = fixtureStyledDeck();
    const bytes = await exportStyledDeckPptx(deck);
    const files = unzipSync(bytes);
    const xmls = slideXmls(files);
    const calloutXml = strFromU8(files[xmls[3]!]!);
    const rectCount = (calloutXml.match(/<a:prstGeom prst="rect"/g) ?? [])
      .length;
    // callout-box is a real rect (distinct from the label/body text boxes).
    expect(rectCount).toBeGreaterThanOrEqual(1);
    expect(calloutXml).toContain('METHOD MATTERS');
    expect(calloutXml).toContain('Testing whether use precedes changes');
  });

  it('renders the large stat-emphasis title text', async () => {
    const deck = fixtureStyledDeck();
    const bytes = await exportStyledDeckPptx(deck);
    const files = unzipSync(bytes);
    const xmls = slideXmls(files);
    const statXml = strFromU8(files[xmls[4]!]!);
    expect(statXml).toContain('34%');
  });

  it('gracefully degrades an unknown element kind to a plain text box (or skips it) without throwing', async () => {
    const deck = fixtureStyledDeck();
    await expect(exportStyledDeckPptx(deck)).resolves.toBeInstanceOf(
      Uint8Array,
    );
    const bytes = await exportStyledDeckPptx(deck);
    const files = unzipSync(bytes);
    const xmls = slideXmls(files);
    const fallbackXml = strFromU8(files[xmls[5]!]!);
    expect(fallbackXml).toContain('Unrecognized kind, still exports');
  });

  it('renders a free-form text kind that merely CONTAINS a shape substring ("headline" contains "line") as real text — matches the PDF writer and preview', async () => {
    // deckWriter.ts's addKnownElement is the AUTHORITY: an EXACT switch
    // over 8 shape kinds, with everything else falling to `default` →
    // addStyledText. 'headline' was never one of those 8 cases, so this
    // writer always rendered it correctly as text — this test locks that
    // continued behavior and cross-checks it against deckPdf.test.ts's
    // matching assertion for the identical element, proving all three
    // surfaces now agree on the same free-form kind.
    const deck: StyledSlideDeck = {
      durationMinutes: 5,
      theme,
      slides: [
        {
          role: 'result',
          device: 'plain',
          elements: [
            {
              kind: 'headline',
              text: 'Faster convergence',
              x: 0.72,
              y: 1.0,
              fontSize: 30,
              color: '#17252A',
            },
          ],
        },
      ],
    };
    const bytes = await exportStyledDeckPptx(deck);
    const files = unzipSync(bytes);
    const xmls = slideXmls(files);
    const xml = strFromU8(files[xmls[0]!]!);
    expect(xml).toContain('<a:t>');
    expect(xml).toContain('Faster convergence');
  });

  it('is defensive against a device value outside SUPPORTED_DEVICES — renders as plain', async () => {
    const deck = fixtureStyledDeck();
    const mutated: StyledSlideDeck = {
      ...deck,
      slides: [
        {
          role: 'result',
          // Cast past the type system the way a decoded/loosely-typed
          // payload from the API could arrive at runtime.
          device:
            'not-a-real-device' as StyledSlideDeck['slides'][number]['device'],
          elements: [
            {
              kind: 'title',
              text: 'Still renders',
              x: 0.72,
              y: 1.0,
              fontSize: 30,
              color: '#111111',
            },
          ],
        },
      ],
    };
    const bytes = await exportStyledDeckPptx(mutated);
    const files = unzipSync(bytes);
    const xmls = slideXmls(files);
    expect(xmls).toHaveLength(1);
    expect(strFromU8(files[xmls[0]!]!)).toContain('Still renders');
  });
});
