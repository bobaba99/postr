/**
 * The shared attribution module — copy is frozen, and the paid seam
 * defaults to attributing.
 */
import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTION_TEXT,
  attributionBundleGenerator,
  attributionDocProperty,
  attributionLatexBlock,
  attributionLatexComment,
  attributionPptxBox,
  attributionPrintCss,
  attributionPrintHtml,
  shouldAttribute,
} from '../attribution';

describe('ATTRIBUTION_TEXT', () => {
  it('is exactly the approved copy', () => {
    expect(ATTRIBUTION_TEXT).toBe('Poster made with postr.sh');
  });

  it('carries no tagline, marketing verb, or AI mention', () => {
    expect(ATTRIBUTION_TEXT).not.toMatch(/\b(AI|GPT|powered|create|design|build|free)\b/i);
    // A colophon is one short line, not a pitch.
    expect(ATTRIBUTION_TEXT.split(/\s+/)).toHaveLength(4);
  });
});

describe('shouldAttribute — the paid seam', () => {
  it('defaults to true when called with nothing', () => {
    expect(shouldAttribute()).toBe(true);
  });

  it('defaults to true for an empty options object', () => {
    expect(shouldAttribute({})).toBe(true);
  });

  it('stays true when paidPlan is explicitly false or undefined', () => {
    expect(shouldAttribute({ paidPlan: false })).toBe(true);
    expect(shouldAttribute({ paidPlan: undefined })).toBe(true);
  });

  it('suppresses only when paidPlan is exactly true', () => {
    expect(shouldAttribute({ paidPlan: true })).toBe(false);
  });
});

describe('per-format helpers honour the seam', () => {
  const paid = { paidPlan: true };

  it('print html/css collapse to empty strings when suppressed', () => {
    expect(attributionPrintHtml()).toContain(ATTRIBUTION_TEXT);
    expect(attributionPrintCss()).toContain('.postr-attribution');
    expect(attributionPrintHtml(paid)).toBe('');
    expect(attributionPrintCss(paid)).toBe('');
  });

  it('print colophon carries the muted PNG logo beside the text (settled 2026-08-06)', () => {
    const html = attributionPrintHtml();
    expect(html).toContain('postr-attribution-mark');
    expect(html).toContain('data:image/png');
    expect(html).toContain(ATTRIBUTION_TEXT);
    // Suppressed → no logo either.
    expect(attributionPrintHtml(paid)).toBe('');
    // CSS keeps the mark small and in the bottom-margin overlay.
    const css = attributionPrintCss();
    expect(css).toContain('.postr-attribution-mark');
    expect(css).toContain('bottom: 10px');
  });

  it('pptx box is null when suppressed', () => {
    expect(attributionPptxBox(48, 36)).not.toBeNull();
    expect(attributionPptxBox(48, 36, paid)).toBeNull();
  });

  it('latex footer block is empty when suppressed', () => {
    expect(attributionLatexBlock(36)).toContain(ATTRIBUTION_TEXT);
    expect(attributionLatexBlock(36, paid)).toBe('');
  });
});

describe('attributionPptxBox geometry', () => {
  it('sits inside the slide near the bottom edge', () => {
    const box = attributionPptxBox(48, 36)!;
    expect(box.y + box.h).toBeLessThanOrEqual(36);
    expect(box.y).toBeGreaterThan(36 - 1); // within the bottom inch
    expect(box.x).toBeGreaterThan(0);
    expect(box.x + box.w).toBeLessThanOrEqual(48);
  });

  it('never overflows a very small slide', () => {
    const box = attributionPptxBox(2, 2)!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.w).toBeLessThanOrEqual(2 + 0.001);
  });
});

describe('metadata helpers', () => {
  it('doc property and bundle generator carry text plus canonical URL', () => {
    expect(attributionDocProperty()).toBe('Poster made with postr.sh (https://postr.sh)');
    expect(attributionBundleGenerator()).toBe(attributionDocProperty());
  });

  it('latex comment matches the bib.ts "%% …" comment voice', () => {
    expect(attributionLatexComment()).toBe('%% Poster made with postr.sh');
    expect(attributionLatexComment().startsWith('%%')).toBe(true);
  });
});
