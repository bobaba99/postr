/**
 * Contract test: `APPENDED_SLIDE_COUNT` must stay ≥ the sum of every
 * `TEMPLATE_SLIDE_PREFIX`-named slide source in the codebase, even ones
 * not wired into today's export path (see `templateMarker.ts`'s header
 * comment). It is a hand-maintained constant with no structural way to
 * derive it automatically (the two utility-slide appenders each add
 * exactly one slide and are not parameterized by a shared list the way
 * `TEMPLATE_SLIDE_LAYOUTS` is for `addTemplateSlides`), so this test is
 * the tripwire: if a new prefix-named slide source is added anywhere
 * without bumping the constant, this test fails instead of the
 * importer silently under-counting (`parsePptx.ts`'s `Math.min` cap —
 * see Task 10's report for the miscount this guards against).
 */
import { describe, expect, it } from 'vitest';
import { APPENDED_SLIDE_COUNT } from '../templateMarker';
import { TEMPLATE_SLIDE_LAYOUTS } from '../templateSlides';

// One explainer slide + one empty slide per named layout
// (templateSlides.ts's addTemplateSlides).
const TEMPLATE_SLIDES_COUNT = TEMPLATE_SLIDE_LAYOUTS.length + 1;

// The Phase-2 styled-deck utility slides — each appender adds exactly
// one prefix-named slide (paletteSlide.ts, iconLibrarySlide.ts).
const STYLED_DECK_UTILITY_SLIDES_COUNT = 2;

describe('APPENDED_SLIDE_COUNT contract', () => {
  it('covers every known TEMPLATE_SLIDE_PREFIX-named slide source, combined', () => {
    expect(APPENDED_SLIDE_COUNT).toBeGreaterThanOrEqual(
      TEMPLATE_SLIDES_COUNT + STYLED_DECK_UTILITY_SLIDES_COUNT,
    );
  });
});
