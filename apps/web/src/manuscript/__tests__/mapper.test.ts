/**
 * Narrative mapper — the rubric is deterministic and owned by us, so
 * these tests ARE the rubric's spec: role sourcing, hard budgets,
 * finding ranking, cut rules, the missing-question flag, and the Q5
 * pin mechanism.
 */
import { describe, it, expect } from 'vitest';
import { parseManuscriptText } from '../parseManuscriptText';
import {
  capSourceText,
  extractFindings,
  mapNarrative,
  splitSentences,
  titleOverlap,
} from '../mapper';
import {
  MAX_PINNED_SECTIONS,
  MAX_ROLE_SOURCE_CHARS,
  PINNED_SECTION_BUDGET_WORDS,
  POSTER_ROLE_SPECS,
} from '../rubric';

const MANUSCRIPT = `Sleep Duration and Recall Accuracy in Undergraduate Students

John Smith1, Jane Doe2
(1) Acme State University, (2) Sample Research Institute

Abstract

Sleep loss impairs memory, but the dose-response shape is unclear. We tested recall accuracy across three sleep-duration groups.

1. Introduction

Memory consolidation depends on sleep, and students are chronically restricted. Prior work has focused on total deprivation.

We asked whether moderate sleep restriction produces measurable recall deficits.

2. Literature Review

Dozens of studies have examined deprivation paradigms in exhaustive detail.

3. Methods

Participants were 120 undergraduates randomized to 5, 6.5, or 8 hours in bed. Recall was measured with a 40-item word-list task. Analyses used R version 4.3. The protocol was approved by the ethics committee of Acme State University.

4. Results

Recall accuracy fell 21% in the 5-hour group relative to controls (p < .001). The 6.5-hour group showed an intermediate 9% deficit (p = .02). Participants reported enjoying the word lists. Sleep quality ratings did not differ between groups (p = .41).

5. Discussion

Even moderate restriction measurably impairs recall, which should change how universities schedule examinations.

Further work could examine longer restriction periods.

Limitations

The sample was drawn from a single institution.

Acknowledgements

We thank the Sample Research Institute sleep lab.`;

const doc = parseManuscriptText(MANUSCRIPT);

describe('splitSentences', () => {
  it('splits on sentence boundaries', () => {
    expect(
      splitSentences('First one. Second one? Third (with parens).'),
    ).toHaveLength(3);
  });

  it('returns empty for empty input', () => {
    expect(splitSentences('')).toEqual([]);
  });
});

describe('extractFindings', () => {
  const findings = extractFindings(doc);

  it('keeps at most three findings', () => {
    expect(findings.length).toBeLessThanOrEqual(3);
  });

  it('ranks the strongest effect first', () => {
    expect(findings[0]!.text).toMatch(/21%/);
  });

  it('excludes anecdotal sentences with no numbers or effects', () => {
    expect(findings.some((f) => /enjoying/.test(f.text))).toBe(false);
  });

  it('every kept finding carries a number (rubric cut rule)', () => {
    expect(findings.every((f) => f.hasNumber)).toBe(true);
  });

  it('records provenance to the results section', () => {
    const results = doc.sections.find((s) => s.kind === 'results')!;
    expect(findings.every((f) => f.sectionId === results.id)).toBe(true);
  });
});

describe('mapNarrative — roles', () => {
  const map = mapNarrative(doc);
  const byRole = new Map(map.roles.map((r) => [r.role, r]));

  it('produces the five-role spine in reading order', () => {
    expect(map.roles.map((r) => r.role)).toEqual([
      'hook',
      'question',
      'methods',
      'keyResult',
      'takeaway',
    ]);
  });

  it('assigns the rubric budgets verbatim', () => {
    for (const role of map.roles) {
      expect(role.budgetWords).toBe(POSTER_ROLE_SPECS[role.role].budgetWords);
    }
  });

  it('sources the hook from the introduction first paragraph', () => {
    expect(byRole.get('hook')!.sourceText).toMatch(/^Memory consolidation/);
    expect(byRole.get('hook')!.sourceHeadings).toEqual(['1. Introduction']);
  });

  it('finds the research question sentence', () => {
    const q = byRole.get('question')!;
    expect(q.missing).toBe(false);
    expect(q.sourceText).toMatch(/We asked whether/);
  });

  it('strips version numbers and ethics sentences from methods', () => {
    const methods = byRole.get('methods')!;
    expect(methods.sourceText).not.toMatch(/version 4\.3/);
    expect(methods.sourceText).not.toMatch(/ethics committee/);
    expect(methods.sourceText).toMatch(/120 undergraduates/);
  });

  it('feeds ranked findings into keyResult', () => {
    const kr = byRole.get('keyResult')!;
    expect(kr.sourceText).toMatch(/21%/);
    expect(kr.sourceText).not.toMatch(/enjoying/);
  });

  it('takes the takeaway from discussion paragraph one only', () => {
    const takeaway = byRole.get('takeaway')!;
    expect(takeaway.sourceText).toMatch(/^Even moderate restriction/);
    expect(takeaway.sourceText).not.toMatch(/Further work/);
  });
});

describe('mapNarrative — source cap', () => {
  /** The condense route rejects sourceText over MAX_SOURCE_CHARS with a
   *  400, so the mapper must never emit more than the API accepts.
   *  Regression guard for a long-manuscript hard failure. */
  const longManuscript = () => {
    const filler = 'Participants completed an additional counterbalanced block. ';
    return `${MANUSCRIPT.replace(
      'Recall was measured with a 40-item word-list task.',
      `Recall was measured with a 40-item word-list task. ${filler.repeat(600)}`,
    )}`;
  };

  it('caps every role and pin at MAX_ROLE_SOURCE_CHARS', () => {
    const bigDoc = parseManuscriptText(longManuscript());
    const pinIds = bigDoc.sections
      .filter((s) => s.kind === 'limitations' || s.kind === 'literature-review')
      .map((s) => s.id);
    const map = mapNarrative(bigDoc, pinIds);

    // The uncapped methods source would exceed the API limit.
    const methodsRaw = bigDoc.sections
      .filter((s) => s.kind === 'methods')
      .flatMap((s) => s.paragraphs)
      .join(' ');
    expect(methodsRaw.length).toBeGreaterThan(MAX_ROLE_SOURCE_CHARS);

    for (const role of map.roles) {
      expect(role.sourceText.length).toBeLessThanOrEqual(MAX_ROLE_SOURCE_CHARS);
    }
    for (const pin of map.pinned) {
      expect(pin.sourceText.length).toBeLessThanOrEqual(MAX_ROLE_SOURCE_CHARS);
    }
  });

  it('leaves short sources untouched', () => {
    const short = 'We tested recall across three sleep-duration groups.';
    expect(capSourceText(short)).toBe(short);
  });

  it('cuts on a sentence boundary rather than mid-word', () => {
    const capped = capSourceText(`${'All participants completed the task. '.repeat(1000)}`);
    expect(capped.length).toBeLessThanOrEqual(MAX_ROLE_SOURCE_CHARS);
    expect(capped.endsWith('.')).toBe(true);
  });

  it('hard-slices unpunctuated input rather than returning nothing', () => {
    const blob = 'x'.repeat(MAX_ROLE_SOURCE_CHARS + 500);
    expect(capSourceText(blob).length).toBe(MAX_ROLE_SOURCE_CHARS);
  });
});

describe('mapNarrative — cut rules', () => {
  const map = mapNarrative(doc);

  it('cuts literature review, limitations, and acknowledgements wholesale', () => {
    const cutKinds = map.cutSections.map((s) => s.kind).sort();
    expect(cutKinds).toEqual([
      'acknowledgements',
      'limitations',
      'literature-review',
    ]);
  });

  it('flags a manuscript with no research question', () => {
    const noQuestion = parseManuscriptText(
      [
        'A Title About Things',
        '',
        'Introduction',
        '',
        'Some background prose with no question at all.',
        '',
        'Results',
        '',
        'Accuracy improved by 12% (p = .01).',
      ].join('\n'),
    );
    const m = mapNarrative(noQuestion);
    const q = m.roles.find((r) => r.role === 'question')!;
    expect(q.missing).toBe(true);
    expect(m.warnings.some((w) => /research question/i.test(w))).toBe(true);
  });

  it('drops the hook when the title already carries it', () => {
    expect(
      titleOverlap(
        'Memory consolidation depends on sleep',
        'Memory consolidation depends on sleep.',
      ),
    ).toBeGreaterThanOrEqual(0.8);
    const selfTitled = parseManuscriptText(
      [
        'Memory Consolidation Depends on Sleep',
        '',
        'Introduction',
        '',
        'Memory consolidation depends on sleep.',
        '',
        'Results',
        '',
        'Recall fell 10% (p = .03).',
      ].join('\n'),
    );
    const m = mapNarrative(selfTitled);
    expect(m.roles.some((r) => r.role === 'hook')).toBe(false);
    expect(m.warnings.some((w) => /title already carries/i.test(w))).toBe(true);
  });
});

describe('mapNarrative — pins (Q5)', () => {
  const limitations = doc.sections.find((s) => s.kind === 'limitations')!;
  const lit = doc.sections.find((s) => s.kind === 'literature-review')!;
  const ack = doc.sections.find((s) => s.kind === 'acknowledgements')!;

  it('rescues a pinned section from the cut with its own budget', () => {
    const map = mapNarrative(doc, [limitations.id]);
    expect(map.pinned).toHaveLength(1);
    expect(map.pinned[0]).toMatchObject({
      id: limitations.id,
      heading: 'Limitations',
      budgetWords: PINNED_SECTION_BUDGET_WORDS,
    });
    expect(map.cutSections.some((s) => s.id === limitations.id)).toBe(false);
  });

  it('caps pins at the poster physical limit', () => {
    const map = mapNarrative(doc, [limitations.id, lit.id, ack.id]);
    expect(map.pinned.length).toBe(MAX_PINNED_SECTIONS);
  });

  it('is pure — repeated calls do not accumulate state', () => {
    const a = mapNarrative(doc);
    const b = mapNarrative(doc);
    expect(a.roles.map((r) => r.role)).toEqual(b.roles.map((r) => r.role));
    expect(a.cutSections.length).toBe(b.cutSections.length);
  });
});
