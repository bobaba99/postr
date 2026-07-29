/**
 * Multi-slide, text-only (Phase 1) deck writer.
 *
 * Two load-bearing guarantees, both checked by unzipping the produced
 * `.pptx` (a ZIP) with `fflate`:
 *   1. One `ppt/slides/slideN.xml` per deck slide — the deck is
 *      multi-slide, not a single flattened surface.
 *   2. NO `.svg` anywhere in the archive — the writer is raster-only.
 *      pptxgenjs cannot embed SVG (it throws on `pptx.write`), so an
 *      SVG leaking in would break the export entirely. Phase 1 is
 *      text-only, so no rasterization path is even reachable; this
 *      test locks that in against future regressions.
 *
 * Plus: per-slide `references` render as a small muted bottom text box
 * only when non-empty.
 */
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { exportDeckPptx } from '../deckWriter';
import type { SlideDeck } from '../../../manuscript/deck/types';

const deck: SlideDeck = {
  durationMinutes: 10,
  slides: [
    {
      role: 'title',
      assertion: 'Spaced practice in the classroom',
      evidence: null,
      sourceQuote: '',
      speakerNotes: [],
      references: [],
      wordCapCut: false,
    },
    {
      role: 'result',
      assertion: 'Spacing raised 6-week recall by 34%.',
      evidence: null,
      sourceQuote: 'a 34% improvement in delayed recall',
      speakerNotes: [{ text: 'Emphasise the delay.', provenance: 'Results §3' }],
      references: ['Doe J. 2026. Journal of Learning.'],
      wordCapCut: false,
    },
    {
      role: 'references',
      assertion: 'References',
      evidence: 'Doe J. 2026. Journal of Learning.',
      sourceQuote: '',
      speakerNotes: [],
      references: [],
      wordCapCut: false,
    },
  ],
};

const decode = (bytes: Uint8Array | undefined): string =>
  bytes ? new TextDecoder().decode(bytes) : '';

const slideXmls = (files: Record<string, Uint8Array>): string[] =>
  Object.keys(files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));

describe('exportDeckPptx', () => {
  it('emits one pptx slide per deck slide', async () => {
    const bytes = await exportDeckPptx(deck);
    expect(bytes.byteLength).toBeGreaterThan(0);
    const files = unzipSync(bytes);
    expect(slideXmls(files)).toHaveLength(3);
  });

  it('embeds no SVG media (raster-only guarantee)', async () => {
    const bytes = await exportDeckPptx(deck);
    const files = unzipSync(bytes);
    expect(Object.keys(files).some((k) => k.endsWith('.svg'))).toBe(false);
  });

  it('renders per-slide references as a bottom text box only when present', async () => {
    const bytes = await exportDeckPptx(deck);
    const files = unzipSync(bytes);
    const xmls = slideXmls(files).sort(
      (a, b) => Number(a.replace(/\D+/g, '')) - Number(b.replace(/\D+/g, '')),
    );
    // Slide 2 (result) carries a reference; slide 1 (title) does not.
    expect(decode(files[xmls[1]!])).toContain('Journal of Learning');
    expect(decode(files[xmls[0]!])).not.toContain('Journal of Learning');
  });
});
