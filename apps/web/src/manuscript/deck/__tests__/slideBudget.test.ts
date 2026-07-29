import { describe, it, expect } from 'vitest';
import { contentSlideCount, enforceSlideWordCap, SLIDE_WORD_CAP } from '../slideBudget';

describe('contentSlideCount', () => {
  it('is one slide per minute', () => {
    expect(contentSlideCount(10)).toBe(10);
  });
  it('floors fractional minutes', () => {
    expect(contentSlideCount(7.8)).toBe(7);
  });
  it('never returns fewer than 3', () => {
    expect(contentSlideCount(1)).toBe(3);
  });
});

describe('enforceSlideWordCap', () => {
  it('leaves short text untouched', () => {
    const r = enforceSlideWordCap('Spacing lifted recall by 34%.');
    expect(r.cut).toBe(false);
    expect(r.text).toBe('Spacing lifted recall by 34%.');
  });
  it('trims over-cap text at a word boundary and flags cut', () => {
    const source = Array.from({ length: 40 }, (_, i) => `w${i}`);
    const r = enforceSlideWordCap(source.join(' '));
    expect(r.cut).toBe(true);
    expect(r.text.split(/\s+/).length).toBeLessThanOrEqual(SLIDE_WORD_CAP);
    // No mid-word cut: every token in the result is a complete source word.
    for (const token of r.text.split(/\s+/)) {
      expect(source).toContain(token);
    }
  });
});
