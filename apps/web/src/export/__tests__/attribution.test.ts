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
  // The ONE place the literal is pinned. Everything else in the suite
  // asserts against the constant, so changing the copy breaks exactly
  // this test — a deliberate speed bump, not a wall of red.
  it('is exactly the approved copy', () => {
    expect(ATTRIBUTION_TEXT).toBe('made with postr.sh');
  });

  it('carries no tagline, marketing verb, or AI mention', () => {
    expect(ATTRIBUTION_TEXT).not.toMatch(/\b(AI|GPT|powered|create|design|build|free)\b/i);
    // A colophon is one short line, not a pitch. Bounded rather than
    // pinned to an exact count: the owner may reword the credit, but a
    // colophon that grows past a handful of words has become a tagline.
    const words = ATTRIBUTION_TEXT.split(/\s+/);
    expect(words.length).toBeGreaterThanOrEqual(3);
    expect(words.length).toBeLessThanOrEqual(5);
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
    expect(attributionPrintCss(48, 36)).toContain('.postr-attribution');
    expect(attributionPrintHtml(paid)).toBe('');
    expect(attributionPrintCss(48, 36, paid)).toBe('');
  });

  it('print colophon carries the muted PNG logo beside the text (settled 2026-08-06)', () => {
    const html = attributionPrintHtml();
    expect(html).toContain('postr-attribution-mark');
    expect(html).toContain('data:image/png');
    expect(html).toContain(ATTRIBUTION_TEXT);
    // Suppressed → no logo either.
    expect(attributionPrintHtml(paid)).toBe('');
    // CSS keeps the mark small and in the bottom-margin overlay.
    const css = attributionPrintCss(48, 36);
    expect(css).toContain('.postr-attribution-mark');
    // The offset is adaptive now (colophonGeometry), so assert the shape
    // and the invariant rather than a literal that would re-break on the
    // next tuning pass. Per-size numbers live in colophonGeometry.test.ts.
    expect(css).toMatch(/bottom: [\d.]+px/);
  });

  it('anchors the colophon bottom-RIGHT, never bottom-left', () => {
    // A revert to the pre-2026-09-13 bottom-left colophon passed the
    // entire suite before this existed.
    const css = attributionPrintCss(48, 36);
    expect(css).toMatch(/right: [\d.]+px/);
    expect(css).not.toContain('left: 10px');
  });

  it('keeps the reference poster (48x36) at the approved 12.6pt', () => {
    // The owner approved this size on the 48x36 sheet; the adaptive
    // geometry is anchored to it, so a change here is a change to a
    // decision, not to a constant.
    const css = attributionPrintCss(48, 36);
    expect(css).toContain('font-size: 1.75px');
    expect(css).toContain('width: 2.25px');
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
    expect(attributionDocProperty()).toBe(`${ATTRIBUTION_TEXT} (https://postr.sh)`);
    expect(attributionBundleGenerator()).toBe(attributionDocProperty());
  });

  it('latex comment matches the bib.ts "%% …" comment voice', () => {
    expect(attributionLatexComment()).toBe(`%% ${ATTRIBUTION_TEXT}`);
    expect(attributionLatexComment().startsWith('%%')).toBe(true);
  });
});
