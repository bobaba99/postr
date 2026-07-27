/**
 * Poster builder — condensed narrative → PosterDoc. Pins the layout
 * contract: five-role placement, authors/affiliations carried through
 * structurally, the ≤5 reference trim, figure-led key findings, and
 * the clip-and-report (never shrink type) overflow rule.
 */
import { describe, it, expect } from 'vitest';
import type { CondensedNarrative } from '@postr/shared';
import { parseManuscriptText } from '../parseManuscriptText';
import { buildDocumentModel, type IngestItem } from '../buildDocumentModel';
import { buildPosterDoc, estimateTextHeight } from '../buildPoster';
import { checkFigure } from '../figureCheck';
import { DEFAULT_STYLES, PX } from '../../poster/constants';

const MANUSCRIPT = `Sleep Duration and Recall Accuracy in Undergraduate Students

John Smith1, Jane Doe2
(1) Acme State University, (2) Sample Research Institute

Introduction

Memory consolidation depends on sleep. We asked whether restriction impairs recall.

Results

Recall fell 21% (p < .001).

Discussion

Moderate restriction impairs recall.

References

Smith, J. (2024). One. Journal A, 1, 1-2.
Doe, J. (2024). Two. Journal B, 2, 1-2.
Roe, A. (2023). Three. Journal C, 3, 1-2.
Poe, B. (2023). Four. Journal D, 4, 1-2.
Moe, C. (2022). Five. Journal E, 5, 1-2.
Zoe, D. (2022). Six. Journal F, 6, 1-2.
Joe, E. (2021). Seven. Journal G, 7, 1-2.`;

const CONDENSED: CondensedNarrative = {
  roles: [
    { role: 'hook', text: 'Students sleep less than they think.', truncated: false },
    { role: 'question', text: 'Does moderate restriction impair recall?', truncated: false },
    { role: 'methods', text: 'A week of restricted sleep, then a recall task.', truncated: false },
    { role: 'keyResult', text: 'Recall fell 21% (p < .001).', truncated: false },
    { role: 'takeaway', text: 'Sleep consistency matters for exams.', truncated: false },
  ],
  pinned: [
    { id: 'pin1', heading: 'Limitations', text: 'Single-site sample.', truncated: false },
  ],
};

const doc = parseManuscriptText(MANUSCRIPT);
const { doc: poster, warnings } = buildPosterDoc(doc, CONDENSED);

describe('buildPosterDoc — structure', () => {
  it('produces a valid 48×36 PosterDoc', () => {
    expect(poster.version).toBe(1);
    expect(poster.widthIn).toBe(48);
    expect(poster.heightIn).toBe(36);
  });

  it('carries authors and institutions through structurally', () => {
    expect(poster.authors.map((a) => a.name)).toEqual(['John Smith', 'Jane Doe']);
    expect(poster.institutions).toHaveLength(2);
    // Superscript sync: each author's affiliation ids resolve.
    const instIds = new Set(poster.institutions.map((i) => i.id));
    for (const author of poster.authors) {
      for (const id of author.affiliationIds) {
        expect(instIds.has(id)).toBe(true);
      }
    }
  });

  it('places title, authors, and every role heading', () => {
    const headings = poster.blocks
      .filter((b) => b.type === 'heading')
      .map((b) => b.content);
    expect(headings).toEqual([
      'Background',
      'Research Question',
      'Methods',
      'Key Findings',
      'Take-Home Message',
      'Limitations',
    ]);
    expect(poster.blocks.filter((b) => b.type === 'title')).toHaveLength(1);
    expect(poster.blocks.filter((b) => b.type === 'authors')).toHaveLength(1);
  });

  it('uses the condensed text verbatim as panel content', () => {
    const texts = poster.blocks.filter((b) => b.type === 'text').map((b) => b.content);
    expect(texts).toContain('Recall fell 21% (p < .001).');
    expect(texts).toContain('Single-site sample.');
  });

  it('trims references to five and says so', () => {
    expect(poster.references).toHaveLength(5);
    expect(poster.blocks.some((b) => b.type === 'references')).toBe(true);
    expect(warnings.some((w) => /references trimmed/i.test(w))).toBe(true);
  });

  it('keeps every block inside the canvas', () => {
    for (const block of poster.blocks) {
      expect(block.x).toBeGreaterThanOrEqual(0);
      expect(block.y).toBeGreaterThanOrEqual(0);
      expect(block.x + block.w).toBeLessThanOrEqual(480);
      expect(block.y + block.h).toBeLessThanOrEqual(360);
    }
  });

  it('omits panels whose condensed text is empty', () => {
    const noHook: CondensedNarrative = {
      roles: CONDENSED.roles.map((r) =>
        r.role === 'hook' ? { ...r, text: '' } : r,
      ),
      pinned: [],
    };
    const { doc: p } = buildPosterDoc(doc, noHook);
    const headings = p.blocks.filter((b) => b.type === 'heading').map((b) => b.content);
    expect(headings).not.toContain('Background');
    expect(headings).toContain('Research Question');
  });
});

describe('buildPosterDoc — figure-led key findings', () => {
  it('places the money figure under the findings with its caption', () => {
    const items: IngestItem[] = [
      { kind: 'heading', text: 'A Title With Figures', level: 1 },
      { kind: 'heading', text: 'Results', level: 2 },
      { kind: 'paragraph', text: 'Accuracy rose 12% (p = .01), see Figure 1.' },
      { kind: 'figure', text: '', imageRef: 'data:image/png;base64,AAAA' },
      { kind: 'paragraph', text: 'Figure 1. Accuracy by group.' },
    ];
    const figDoc = buildDocumentModel(items);
    const { doc: p } = buildPosterDoc(figDoc, CONDENSED);
    const image = p.blocks.find((b) => b.type === 'image');
    expect(image).toBeDefined();
    expect(image!.imageSrc).toBe('data:image/png;base64,AAAA');
    // "Figure 1." prefix stripped — the renderer numbers captions.
    expect(image!.caption).toBe('Accuracy by group.');
    expect(image!.captionPosition).toBe('bottom');
  });

  it('emits no image block when the manuscript has no extractable figure', () => {
    expect(poster.blocks.some((b) => b.type === 'image')).toBe(false);
  });

  /** Plan §4 non-negotiable #1 — a figure that never reaches the poster
   *  is never checked by the legibility gate either, so the drop has to
   *  be visible. The layout carries exactly one figure; the rest must be
   *  reported, not silently discarded. */
  it('warns about every figure the single-figure layout leaves out', () => {
    const items: IngestItem[] = [
      { kind: 'heading', text: 'A Title With Figures', level: 1 },
      { kind: 'heading', text: 'Results', level: 2 },
      { kind: 'paragraph', text: 'See Figure 1, Figure 2 and Figure 3.' },
      { kind: 'figure', text: '', imageRef: 'data:image/png;base64,AAAA' },
      { kind: 'paragraph', text: 'Figure 1. One.' },
      { kind: 'figure', text: '', imageRef: 'data:image/png;base64,BBBB' },
      { kind: 'paragraph', text: 'Figure 2. Two.' },
      { kind: 'figure', text: '', imageRef: 'data:image/png;base64,CCCC' },
      { kind: 'paragraph', text: 'Figure 3. Three.' },
    ];
    const multiDoc = buildDocumentModel(items);
    expect(multiDoc.figures).toHaveLength(3);

    const { doc: p, warnings: w } = buildPosterDoc(multiDoc, CONDENSED);
    expect(p.blocks.filter((b) => b.type === 'image')).toHaveLength(1);
    expect(w.some((m) => /2 other figures were left out/.test(m))).toBe(true);
  });

  it('stays quiet when the manuscript has exactly one figure', () => {
    const items: IngestItem[] = [
      { kind: 'heading', text: 'A Title With Figures', level: 1 },
      { kind: 'heading', text: 'Results', level: 2 },
      { kind: 'paragraph', text: 'Accuracy rose 12% (p = .01), see Figure 1.' },
      { kind: 'figure', text: '', imageRef: 'data:image/png;base64,AAAA' },
      { kind: 'paragraph', text: 'Figure 1. Accuracy by group.' },
    ];
    const { warnings: w } = buildPosterDoc(buildDocumentModel(items), CONDENSED);
    expect(w.some((m) => /left out/.test(m))).toBe(false);
  });

  /** Plan §4 non-negotiable #1 — every emitted figure is checked at its
   *  real physical size. The builder's job here is to give the gate a
   *  block whose w/h are honest poster units, so the DPI it computes
   *  matches what actually gets printed. */
  it('emits a figure block whose physical size drives the legibility gate', () => {
    const items: IngestItem[] = [
      { kind: 'heading', text: 'A Title With Figures', level: 1 },
      { kind: 'heading', text: 'Results', level: 2 },
      { kind: 'paragraph', text: 'Accuracy rose 12% (p = .01), see Figure 1.' },
      { kind: 'figure', text: '', imageRef: 'data:image/png;base64,AAAA' },
      { kind: 'paragraph', text: 'Figure 1. Accuracy by group.' },
    ];
    const { doc: p } = buildPosterDoc(buildDocumentModel(items), CONDENSED);
    const image = p.blocks.find((b) => b.type === 'image')!;

    const widthIn = image.w / PX;
    const heightIn = image.h / PX;
    expect(widthIn).toBeGreaterThan(0);
    expect(heightIn).toBeGreaterThan(0);

    // A small screenshot at that physical size must be flagged, not
    // silently emitted — the user may never open the editor.
    const flagged = checkFigure(image.id, { width: 400, height: 300 }, widthIn, heightIn);
    expect(flagged.status).toBe('fail');

    // A properly exported figure at the same size stays quiet.
    const clean = checkFigure(image.id, { width: 4000, height: 3000 }, widthIn, heightIn);
    expect(clean.status).toBe('pass');
  });
});

describe('buildPosterDoc — overflow clips and reports, never shrinks type', () => {
  const bloated: CondensedNarrative = {
    roles: CONDENSED.roles.map((r) => ({
      ...r,
      text: Array(200).fill('word').join(' '),
    })),
    pinned: CONDENSED.pinned,
  };
  const result = buildPosterDoc(doc, bloated);

  it('keeps the calibrated type sizes untouched', () => {
    expect(result.doc.styles).toEqual(DEFAULT_STYLES);
  });

  it('clips overflowing panels inside the canvas and warns', () => {
    for (const block of result.doc.blocks) {
      expect(block.y + block.h).toBeLessThanOrEqual(360);
    }
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('estimateTextHeight', () => {
  it('grows with text length', () => {
    const short = estimateTextHeight('Short.', 149, DEFAULT_STYLES.body);
    const long = estimateTextHeight(
      Array(80).fill('word').join(' '),
      149,
      DEFAULT_STYLES.body,
    );
    expect(long).toBeGreaterThan(short);
  });

  it('grows when the column narrows', () => {
    const text = Array(50).fill('word').join(' ');
    expect(estimateTextHeight(text, 80, DEFAULT_STYLES.body)).toBeGreaterThan(
      estimateTextHeight(text, 200, DEFAULT_STYLES.body),
    );
  });
});
