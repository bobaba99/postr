/**
 * The credit as a references entry — it must appear as the LAST entry
 * of the reference list in every output, in the poster's own citation
 * style, and it must never duplicate.
 */
import { describe, expect, it } from 'vitest';
import {
  ACKNOWLEDGEMENT_TEXT,
  ACK_REFERENCE_ID,
  acknowledgementBibEntry,
  acknowledgementReference,
  withAcknowledgementReference,
} from '../attribution';
import { formatReferencesForExport } from '../posterContent';
import { CITATION_STYLES } from '@/poster/citations';

const userRefs = [
  { id: 'r1', authors: ['Smith, John'], year: '2020', title: 'Alpha study' },
  { id: 'r2', authors: ['Doe, Jane'], year: '2024', title: 'Beta study' },
];

describe('acknowledgementReference', () => {
  it('carries the frozen copy and the canonical URL', () => {
    const ref = acknowledgementReference();
    expect(ref.rawText).toContain(ACKNOWLEDGEMENT_TEXT);
    expect(ref.rawText).toContain('https://postr.sh');
    expect(ref.id).toBe(ACK_REFERENCE_ID);
  });

  it('adds no marketing language and no AI mention', () => {
    const ref = acknowledgementReference();
    expect(ref.rawText).not.toMatch(/\b(AI|free version|upgrade|powered by)\b/i);
  });
});

describe('withAcknowledgementReference', () => {
  it('appends the credit LAST', () => {
    const out = withAcknowledgementReference(userRefs);
    expect(out).toHaveLength(3);
    expect(out[out.length - 1]!.id).toBe(ACK_REFERENCE_ID);
  });

  it('is idempotent — a second call adds nothing', () => {
    const once = withAcknowledgementReference(userRefs);
    const twice = withAcknowledgementReference(once);
    expect(twice).toHaveLength(3);
    expect(twice.filter((r) => r.id === ACK_REFERENCE_ID)).toHaveLength(1);
  });

  it('never mutates the input', () => {
    const snapshot = JSON.stringify(userRefs);
    withAcknowledgementReference(userRefs);
    expect(JSON.stringify(userRefs)).toBe(snapshot);
  });

  it('honours the paid seam', () => {
    expect(withAcknowledgementReference(userRefs, { paidPlan: true })).toHaveLength(2);
  });

  it('works on an empty list', () => {
    // Annotated because an empty literal gives `never[]`, from which
    // TS cannot infer the element type the generic needs.
    const out = withAcknowledgementReference<{ id: string }>([]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(ACK_REFERENCE_ID);
  });
});

describe('rendered in every citation style', () => {
  // The whole reason the credit is a Reference and not a hardcoded
  // string: each style renders it in its own idiom, with the right
  // prefix, automatically.
  const cases: Array<[keyof typeof CITATION_STYLES, RegExp]> = [
    ['APA 7', /Poster made with postr\.sh/],
    ['Vancouver', /^3\. Poster made with postr\.sh/],
    ['IEEE', /^\[3\] Poster made with postr\.sh/],
    ['Harvard', /Poster made with postr\.sh/],
  ];

  for (const [style, pattern] of cases) {
    it(`${style}: renders the credit as the final entry with the right prefix`, () => {
      const out = formatReferencesForExport(userRefs, { citationStyle: style });
      expect(out).toHaveLength(3);
      expect(out[2]).toMatch(pattern);
    });
  }

  it('numbers the credit correctly for a one-reference poster', () => {
    const out = formatReferencesForExport([userRefs[0]!], { citationStyle: 'IEEE' });
    expect(out[1]).toMatch(/^\[2\]/);
  });

  it('appends AFTER sorting, so alphabetical order never buries it mid-list', () => {
    // "Postr" would alphabetize between Doe and Smith if it were
    // sorted with the rest — it must not be.
    const out = formatReferencesForExport(userRefs, { sortMode: 'alpha' });
    expect(out[out.length - 1]).toContain(ACKNOWLEDGEMENT_TEXT);
  });

  it('is the only credit entry even when the doc already carries one', () => {
    // A re-imported .postr whose references already include the entry.
    const withAck = withAcknowledgementReference(userRefs);
    const out = formatReferencesForExport(withAck);
    expect(out.filter((e) => e.includes(ACKNOWLEDGEMENT_TEXT))).toHaveLength(1);
  });

  it('honours the paid seam in the formatter too', () => {
    const out = formatReferencesForExport(userRefs, { attribution: { paidPlan: true } });
    expect(out).toHaveLength(2);
    expect(out.join('\n')).not.toContain(ACKNOWLEDGEMENT_TEXT);
  });

  it('a poster with NO references still gets the credit line', () => {
    const out = formatReferencesForExport([]);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain(ACKNOWLEDGEMENT_TEXT);
  });
});

describe('acknowledgementBibEntry', () => {
  it('is a real citable @misc entry, not a comment', () => {
    const entry = acknowledgementBibEntry();
    expect(entry).toMatch(/^@misc\{postr,/);
    expect(entry).not.toMatch(/^%/);
    expect(entry).toContain(ACKNOWLEDGEMENT_TEXT);
    expect(entry).toContain('https://postr.sh');
  });
});
