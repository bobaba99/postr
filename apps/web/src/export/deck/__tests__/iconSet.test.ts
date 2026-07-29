/**
 * Curated academic/scientific icon set (Phase 2 — Task 7, icon sourcing).
 *
 * Every icon is ORIGINAL work hand-authored for this project — simple
 * monochrome line glyphs (a few `<path>`/`<circle>`/`<line>` elements
 * each) — released CC0-equivalent, so there is no third-party license
 * to track or attribute. See `iconSet.ts`'s module comment for the
 * full sourcing note. `pickIcons` tag-matches against
 * `topicKeywords`, case-insensitively, so callers can hand it raw
 * paper keywords without pre-normalizing.
 */
import { describe, expect, it } from 'vitest';
import { CURATED_ICONS, pickIcons } from '../iconSet';

describe('CURATED_ICONS', () => {
  it('has between 8 and 12 icons, per the brief', () => {
    expect(CURATED_ICONS.length).toBeGreaterThanOrEqual(8);
    expect(CURATED_ICONS.length).toBeLessThanOrEqual(12);
  });

  it('every icon has at least one tag and a non-empty inline SVG string', () => {
    for (const icon of CURATED_ICONS) {
      expect(icon.tags.length).toBeGreaterThan(0);
      expect(icon.svg.trim().startsWith('<svg')).toBe(true);
      expect(icon.svg).toContain('</svg>');
    }
  });

  it('every icon SVG uses currentColor so it can be recolored to the theme', () => {
    for (const icon of CURATED_ICONS) {
      expect(icon.svg).toContain('currentColor');
    }
  });

  it('every icon has a unique id', () => {
    const ids = CURATED_ICONS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('pickIcons', () => {
  it('returns icons whose tags match the given topic keywords', () => {
    const picked = pickIcons(['memory', 'sleep']);
    expect(picked.length).toBeGreaterThan(0);
    for (const icon of picked) {
      expect(
        icon.tags.some((t) =>
          ['memory', 'sleep'].some((kw) => t.toLowerCase().includes(kw)),
        ),
      ).toBe(true);
    }
  });

  it('matches case-insensitively', () => {
    const lower = pickIcons(['brain']);
    const upper = pickIcons(['BRAIN']);
    expect(upper.map((i) => i.id)).toEqual(lower.map((i) => i.id));
    expect(lower.length).toBeGreaterThan(0);
  });

  it('returns a generic fallback set (not empty) for keywords that match nothing', () => {
    const picked = pickIcons(['zzz-no-such-topic-zzz']);
    expect(picked.length).toBeGreaterThan(0);
  });

  it('ignores noise matches from very short keywords (< 3 chars)', () => {
    // "an" is a substring of the `person` icon's `human` tag; a naive
    // substring match would incorrectly pull it in for an unrelated
    // 2-letter keyword. Falls back to the full set since nothing else
    // matches "an" meaningfully either.
    const picked = pickIcons(['an']);
    expect(picked.map((i) => i.id)).toEqual(CURATED_ICONS.map((i) => i.id));
  });

  it('never returns more than the full curated set', () => {
    const picked = pickIcons(['memory', 'sleep', 'brain', 'chart', 'data']);
    expect(picked.length).toBeLessThanOrEqual(CURATED_ICONS.length);
  });

  it('returns unique icons even when multiple keywords match the same icon', () => {
    const picked = pickIcons(['brain', 'mind', 'cognit']);
    const ids = picked.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
