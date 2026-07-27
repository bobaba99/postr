/**
 * Heading lexicon — the pasted-text parser has no style information, so
 * `looksLikeHeading` is the only thing standing between a manuscript
 * and a corrupted IR. It has to be right in BOTH directions:
 *
 *   - miss a real heading → sections merge, the mapper loses Methods
 *     or Results entirely;
 *   - promote a prose line → phantom sections appear and real body
 *     text is misrouted away from the role it belongs to.
 *
 * The second failure is the easy one to ship by accident, because
 * `classifyHeading` matches its patterns ANYWHERE in a string. That is
 * correct for classifying a known heading and wrong for detecting one:
 * hard-wrapped prose such as "The results showed a clear dose-response"
 * contains "results". These tests pin both directions.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyHeading,
  looksLikeHeading,
  stripHeadingMarkers,
} from '../sectionLexicon';
import { parseManuscriptText } from '../parseManuscriptText';

describe('stripHeadingMarkers', () => {
  it('removes list numbering, roman numerals, and markdown hashes', () => {
    expect(stripHeadingMarkers('2. Methods')).toBe('Methods');
    expect(stripHeadingMarkers('3.1) Participants')).toBe('Participants');
    expect(stripHeadingMarkers('IV. Results')).toBe('Results');
    expect(stripHeadingMarkers('## Discussion')).toBe('Discussion');
  });
});

describe('classifyHeading', () => {
  it('prefers the more specific kind when two could match', () => {
    expect(classifyHeading('Background and Literature Review')).toBe(
      'literature-review',
    );
    // "Results and Discussion" stays results so findings extraction
    // still sees the section.
    expect(classifyHeading('Results and Discussion')).toBe('results');
  });

  it('falls back to other for unrecognised headings', () => {
    expect(classifyHeading('Stimuli')).toBe('other');
  });
});

describe('looksLikeHeading — real headings are detected', () => {
  const HEADINGS = [
    'Abstract',
    'Introduction',
    'Literature Review',
    'Related Work',
    'Methods',
    'Materials and Methods',
    'Results',
    'Results and Discussion',
    'Discussion',
    'Conclusion',
    'Limitations',
    'References',
    'Acknowledgements',
    'Conflicts of Interest',
    'Supplementary Information',
    'Methods:',
    '2. Methods',
    '3. Stimuli',
    'METHODS',
    '## Discussion',
  ];

  it.each(HEADINGS)('detects %j', (heading) => {
    expect(looksLikeHeading(heading)).toBe(true);
  });
});

describe('looksLikeHeading — hard-wrapped prose is never promoted', () => {
  /** Every one of these is an ordinary body line of the length a word
   *  processor produces when a paragraph wraps. Several contain a
   *  lexicon term ("results", "measures", "background", "discussion",
   *  "methods") incidentally — which is exactly the trap. */
  const PROSE = [
    'We recruited 120 undergraduates from two',
    'introductory psychology courses and measured',
    'recall accuracy across three sleep conditions',
    'The results showed a clear dose-response',
    'relationship between sleep and recall',
    'Participants completed the word-list task',
    'Sleep quality ratings did not differ',
    'consolidation depends critically on sleep',
    'discussion of these findings follows below',
    'measures of recall were taken at baseline',
    'and the background literature is extensive',
    'These results suggest a robust effect',
    'Our methods were adapted from prior work',
  ];

  it.each(PROSE)('leaves %j as body text', (line) => {
    expect(looksLikeHeading(line)).toBe(false);
  });

  it('keeps a hard-wrapped paragraph in one piece end to end', () => {
    // Line mode (no blank lines) is the worst case: every line is
    // evaluated independently, so a single false positive splits the
    // section. This is how a Word copy-paste arrives.
    const pasted = [
      'Sleep Duration and Recall Accuracy',
      'Methods',
      'We recruited 120 undergraduates from two',
      'introductory psychology courses and measured',
      'recall accuracy across three sleep conditions',
      'Results',
      'The results showed a clear dose-response',
      'relationship between sleep and recall',
    ].join('\n');

    const doc = parseManuscriptText(pasted);
    expect(doc.sections.map((s) => s.kind)).toEqual(['methods', 'results']);

    const methods = doc.sections.find((s) => s.kind === 'methods')!;
    expect(methods.paragraphs.join(' ')).toMatch(/introductory psychology/);
    const results = doc.sections.find((s) => s.kind === 'results')!;
    expect(results.paragraphs.join(' ')).toMatch(/dose-response/);
  });
});

describe('looksLikeHeading — structural rules', () => {
  it('rejects a sentence-terminal line', () => {
    expect(looksLikeHeading('We tested recall.')).toBe(false);
  });

  it('rejects a long line even when it opens with a section term', () => {
    expect(
      looksLikeHeading(
        'Results from the three groups are reported below in order of effect',
      ),
    ).toBe(false);
  });

  it('rejects a lowercase opening word as mid-paragraph continuation', () => {
    expect(looksLikeHeading('methods were adapted from prior work')).toBe(false);
  });

  it('does not treat a short all-caps acronym as a heading', () => {
    expect(looksLikeHeading('DNA')).toBe(false);
  });
});
