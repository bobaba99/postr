import { describe, it, expect } from 'vitest';
import { isShapeKind, SHAPE_KINDS, SUPPORTED_DEVICES, type StyledSlideDeck } from '../styledTypes';

describe('styled model', () => {
  it('fixes the supported device vocabulary', () => {
    expect(SUPPORTED_DEVICES).toContain('plain');
    expect(SUPPORTED_DEVICES).toContain('progress-bar');
    expect(SUPPORTED_DEVICES).toContain('callout');
  });
  it('a StyledSlideDeck carries slides + theme', () => {
    const d: StyledSlideDeck = { durationMinutes: 10, theme: { palette: ['#fff','#000','#7c6aed'], typeScale: { heading: 30, body: 18, label: 13 }, accentTreatment: 'slate' }, slides: [] };
    expect(d.theme.palette.length).toBeGreaterThan(2);
  });
});

describe('isShapeKind — the single shared shape-vs-text classifier', () => {
  // `kind` is free-form LLM output (apps/api/src/narrative/styleDeck.ts
  // validates it only as z.string().min(1)), so Arm P can legally emit any
  // string. Before this shared exact-match classifier existed, the pptx
  // writer used an EXACT switch (deckWriter.ts's addKnownElement) while the
  // PDF writer and preview used a loose SUBSTRING match — a text kind like
  // `headline` (containing "line") was TEXT in the pptx but a SHAPE (empty
  // box, dropped text) in the PDF and preview. This locks the fix: exact
  // membership only, no substring matching, for every one of the 8
  // documented shape kinds and every documented text kind, plus the
  // concrete false-positive-under-substring-matching kinds the bug report
  // named.

  it('the 8 documented shape kinds are all shapes', () => {
    const shapeKinds = [
      'background',
      'top-rule',
      'accent-line',
      'quote-rule',
      'accent-dot',
      'progress-track',
      'progress-fill',
      'callout-box',
    ];
    expect(SHAPE_KINDS.size).toBe(shapeKinds.length);
    for (const kind of shapeKinds) {
      expect(isShapeKind(kind)).toBe(true);
    }
  });

  it('the 9 documented text kinds are never shapes', () => {
    const textKinds = [
      'title',
      'section-label',
      'footer',
      'slide-number',
      'progress-label',
      'callout-label',
      'body',
      'callout-text',
      'quote-block',
    ];
    for (const kind of textKinds) {
      expect(isShapeKind(kind)).toBe(false);
    }
  });

  it('rejects free-form text kinds that merely CONTAIN a shape substring — the exact bug scenario', () => {
    // Arm P emitting `{kind:'headline', text:'Faster convergence', ...}`:
    // 'headline'.includes('line') is true, which is exactly what tripped
    // the old substring classifiers into treating real text as a shape.
    expect(isShapeKind('headline')).toBe(false);
    expect(isShapeKind('tagline')).toBe(false);
    expect(isShapeKind('outline')).toBe(false);
    expect(isShapeKind('byline')).toBe(false);
    expect(isShapeKind('underline')).toBe(false);
    expect(isShapeKind('sub-headline')).toBe(false);
    expect(isShapeKind('stat-box')).toBe(false);
    expect(isShapeKind('text-box')).toBe(false);
    expect(isShapeKind('stat-fill')).toBe(false);
    expect(isShapeKind('outline-box')).toBe(false);
  });

  it('exact shape kinds still classify correctly at the boundary', () => {
    expect(isShapeKind('callout-box')).toBe(true);
    expect(isShapeKind('accent-line')).toBe(true);
    expect(isShapeKind('background')).toBe(true);
  });
});
