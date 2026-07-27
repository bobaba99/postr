/**
 * Scripted interviewer — the state machine IS the product's chat
 * behavior, so these tests pin the full happy path, every skip rule,
 * the off-script bounded response, the 25-word takeaway gate, the
 * deterministic audience preset search (including a MISS falling
 * through to custom), the derived-sections adjust path, and the
 * slides/duration derivation.
 *
 * The machine must be pure: every assertion works on returned state,
 * never on mutation.
 */
import { describe, it, expect } from 'vitest';
import { parseManuscriptText } from '../parseManuscriptText';
import { mapNarrative } from '../mapper';
import {
  advance,
  chipsFor,
  closeChartPanel,
  createInterview,
  emphasisFor,
  ingestManuscript,
  type InterviewState,
} from '../interviewer';
import { MAX_PINNED_SECTIONS } from '../rubric';

const MANUSCRIPT = `Sleep Duration and Recall Accuracy in Undergraduate Students

John Smith1, Jane Doe2
(1) Acme State University, (2) Sample Research Institute

Abstract

Sleep loss impairs memory. We tested recall accuracy across three sleep-duration groups.

Introduction

Memory consolidation depends on sleep. We asked whether moderate restriction produces measurable deficits.

Literature Review

Many prior studies exist.

Methods

Participants were 120 undergraduates randomized to three groups.

Results

Recall fell 21% in the restricted group (p < .001). The middle group showed a 9% deficit (p = .02). Quality ratings did not differ (p = .41).

Discussion

Moderate restriction measurably impairs recall.

Limitations

Single-institution sample. Recall deficits may not generalize beyond sleep restriction.

Acknowledgements

We thank the Sample Research Institute.`;

function startInterview(): InterviewState {
  return ingestManuscript(createInterview(), parseManuscriptText(MANUSCRIPT));
}

function lastAssistantText(state: InterviewState): string {
  const turns = state.transcript.filter((t) => t.speaker === 'assistant');
  return turns[turns.length - 1]?.text ?? '';
}

function allAssistantText(state: InterviewState): string {
  return state.transcript
    .filter((t) => t.speaker === 'assistant')
    .map((t) => t.text)
    .join('\n');
}

/** Drive the script to a named step with sensible default answers. */
function atStep(step: InterviewState['step']): InterviewState {
  let state = startInterview();
  if (step === 'q1-takeaway') return state;
  state = advance(state, { kind: 'text', text: 'Short takeaway about recall.' });
  if (step === 'q2-display') return state;
  state = advance(state, { kind: 'chip', chipId: 'table' });
  if (step === 'q2-finding') return state;
  state = advance(state, { kind: 'chip', chipId: 'keep-order' });
  if (step === 'q3-audience') return state;
  state = advance(state, { kind: 'chip', chipId: 'general' });
  if (step === 'q4-purpose') return state;
  state = advance(state, { kind: 'chip', chipId: 'committee' });
  if (step === 'q5-sections') return state;
  state = advance(state, { kind: 'chip', chipId: 'sections-done' });
  return state;
}

describe('createInterview', () => {
  it('starts by asking for the manuscript', () => {
    const state = createInterview();
    expect(state.step).toBe('manuscript');
    expect(lastAssistantText(state)).toMatch(/paste your manuscript/i);
    expect(chipsFor(state)).toEqual([]);
  });

  it('bounces free text before a manuscript exists', () => {
    const state = advance(createInterview(), { kind: 'text', text: 'hello?' });
    expect(state.step).toBe('manuscript');
    expect(lastAssistantText(state)).toMatch(/shall we keep going/i);
  });
});

describe('ingest summary', () => {
  it('reports words, figures, and findings, then asks Q1', () => {
    const state = startInterview();
    expect(state.step).toBe('q1-takeaway');
    expect(allAssistantText(state)).toMatch(
      /Got it — [\d,]+ words, 0 figures, 3 findings/,
    );
    expect(lastAssistantText(state)).toMatch(/one thing someone should remember/i);
  });
});

describe('Q1 — takeaway (free text, load-bearing)', () => {
  it('accepts a short sentence and moves to Q2', () => {
    const state = advance(startInterview(), {
      kind: 'text',
      text: 'Moderate sleep restriction impairs recall.',
    });
    expect(state.step).toBe('q2-display');
    expect(state.answers.takeaway).toBe(
      'Moderate sleep restriction impairs recall.',
    );
  });

  it('pushes back on takeaways over 25 words and stays on Q1', () => {
    const long = Array(30).fill('word').join(' ');
    const state = advance(startInterview(), { kind: 'text', text: long });
    expect(state.step).toBe('q1-takeaway');
    expect(lastAssistantText(state)).toMatch(/under 25/);
    expect(state.answers.takeaway).toBe('');
  });
});

describe('Q2 — result display: table or plot', () => {
  const atDisplay = atStep('q2-display');

  it('offers exactly table and plot', () => {
    expect(chipsFor(atDisplay).map((c) => c.id).sort()).toEqual(['plot', 'table']);
  });

  it('reminds the user a plot condenses better, briefly', () => {
    const reminder = allAssistantText(atDisplay);
    expect(reminder).toMatch(/plot usually condenses results better than a table/i);
  });

  it('choosing a table records it and leaves the chart panel closed', () => {
    const state = advance(atDisplay, { kind: 'chip', chipId: 'table' });
    expect(state.answers.resultDisplay).toBe('table');
    expect(state.chartPanelOpen).toBe(false);
  });

  it('choosing a plot opens the chart panel without leaving the script', () => {
    const state = advance(atDisplay, { kind: 'chip', chipId: 'plot' });
    expect(state.answers.resultDisplay).toBe('plot');
    expect(state.chartPanelOpen).toBe(true);
    // The flow continues — the panel is beside the chat, not instead.
    expect(state.step).toBe('q2-finding');
  });

  it('closeChartPanel is pure and clears the flag', () => {
    const opened = advance(atDisplay, { kind: 'chip', chipId: 'plot' });
    const closed = closeChartPanel(opened);
    expect(closed.chartPanelOpen).toBe(false);
    expect(opened.chartPanelOpen).toBe(true);
  });
});

describe('Q2 — finding promotion still reachable (prompt.ts needs it)', () => {
  const atQ2 = atStep('q2-finding');

  it('offers the ranked findings plus keep-order', () => {
    const chips = chipsFor(atQ2);
    expect(chips.length).toBe(4); // 3 findings + keep-order
    expect(chips[chips.length - 1]!.id).toBe('keep-order');
  });

  it('promotes the chosen finding to the front', () => {
    const second = atQ2.map!.findings[1]!;
    const state = advance(atQ2, { kind: 'chip', chipId: second.id });
    expect(state.step).toBe('q3-audience');
    expect(state.answers.rankedFindingIds[0]).toBe(second.id);
    expect(state.answers.rankedFindingIds).toHaveLength(3);
  });

  /**
   * `keep-order` is the user DECLINING to reorder, so it must record no
   * preference at all. Recording the displayed order instead would be
   * read downstream as an absolute override — freezing the ingest-time
   * prominence ranking past the Q1 takeaway and captioning it "You chose
   * this to lead". The empty array is the whole fix.
   */
  it('keep-order records NO user preference', () => {
    const state = advance(atQ2, { kind: 'chip', chipId: 'keep-order' });
    expect(state.answers.rankedFindingIds).toEqual([]);
  });

  it('ingest does not pre-seed a ranking the user never gave', () => {
    expect(startInterview().answers.rankedFindingIds).toEqual([]);
  });

  it('free text is off-script: bounded reply, question re-armed', () => {
    const state = advance(atQ2, {
      kind: 'text',
      text: 'Can you also write my thesis?',
    });
    expect(state.step).toBe('q2-finding');
    expect(lastAssistantText(state)).toMatch(/shall we keep going/i);
  });
});

describe('Q3 — audience: two chips plus a searched Other', () => {
  const atQ3 = atStep('q3-audience');

  it('offers terse chips, with the conference qualifier as sub-text', () => {
    const chips = chipsFor(atQ3);
    expect(chips.map((c) => c.id)).toEqual([
      'specialists',
      'general',
      'audience-other',
    ]);
    const general = chips.find((c) => c.id === 'general')!;
    expect(general.label).toBe('General researchers in my field');
    // The qualifier must NOT bloat the label.
    expect(general.label).not.toMatch(/conference/i);
    expect(general.hint).toMatch(/conference/i);
  });

  it('records a direct chip and moves on', () => {
    const state = advance(atQ3, { kind: 'chip', chipId: 'specialists' });
    expect(state.step).toBe('q4-purpose');
    expect(state.answers.audience).toBe('specialists');
    expect(state.answers.audienceCustom).toBe('');
  });

  it('rejects an unknown chip id as off-script', () => {
    const state = advance(atQ3, { kind: 'chip', chipId: 'nonsense' });
    expect(state.step).toBe('q3-audience');
    expect(lastAssistantText(state)).toMatch(/shall we keep going/i);
  });

  it('Other opens a free-text step', () => {
    const state = advance(atQ3, { kind: 'chip', chipId: 'audience-other' });
    expect(state.step).toBe('q3-audience-other');
  });

  describe('the preset search (deterministic — no model call)', () => {
    const atOther = advance(atQ3, { kind: 'chip', chipId: 'audience-other' });

    it.each([
      ['school nurses on the ward', 'clinicians'],
      ['the general public at an open day', 'public'],
      ['teenagers in high school', 'adolescents'],
      ['primary school children', 'children'],
      ['medical students', 'undergraduates'],
      ['government policy makers', 'policymakers'],
      ['a biotech company', 'industry'],
    ])('matches %j to %s', (typed, expected) => {
      const state = advance(atOther, { kind: 'text', text: typed });
      expect(state.answers.audience).toBe(expected);
      expect(state.answers.audienceCustom).toBe('');
      expect(state.step).toBe('q4-purpose');
    });

    it('falls through to a custom audience when nothing matches', () => {
      const typed = 'competitive ballroom dancers';
      const state = advance(atOther, { kind: 'text', text: typed });
      expect(state.answers.audience).toBe('custom');
      expect(state.answers.audienceCustom).toBe(typed);
      expect(state.step).toBe('q4-purpose');
      // The custom text rides through to the condenser verbatim.
      expect(emphasisFor(state).audienceCustom).toBe(typed);
    });

    it('does not let a substring hijack the match', () => {
      // "publication" contains "public" — word boundaries must hold.
      const state = advance(atOther, {
        kind: 'text',
        text: 'my publication committee',
      });
      expect(state.answers.audience).not.toBe('public');
    });

    it('can go back to the closed option set', () => {
      const state = advance(atOther, { kind: 'chip', chipId: 'audience-back' });
      expect(state.step).toBe('q3-audience');
    });
  });
});

describe('Q4 — purpose, widened to what students actually do', () => {
  const atQ4 = atStep('q4-purpose');

  it('separates one-time presentation from getting feedback', () => {
    const ids = chipsFor(atQ4).map((c) => c.id);
    expect(ids).toContain('one-time');
    expect(ids).toContain('feedback');
    expect(ids).toContain('committee');
    expect(ids).toContain('lab-meeting');
    expect(ids).toContain('requirement');
  });

  it('keeps every chip label short', () => {
    for (const chip of chipsFor(atQ4)) {
      expect(chip.label.length).toBeLessThanOrEqual(24);
    }
  });

  it('records the purpose and derives the critical sections', () => {
    const state = advance(atQ4, { kind: 'chip', chipId: 'lab-meeting' });
    expect(state.answers.purpose).toBe('lab-meeting');
    expect(state.step).toBe('q5-sections');
  });
});

describe('Q5 — derived critical sections, then user adjustment', () => {
  const atQ5 = atStep('q5-sections');

  it('derives a ranking rather than asking about a cut list', () => {
    expect(atQ5.rankedSections.length).toBeGreaterThan(0);
    // Ranked, highest score first.
    const scores = atQ5.rankedSections.map((s) => s.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    // Every candidate carries a plain-language reason.
    for (const section of atQ5.rankedSections) {
      expect(section.reason.length).toBeGreaterThan(0);
    }
  });

  it('shows the derivation instead of applying it silently', () => {
    expect(lastAssistantText(atQ5)).toMatch(/add or remove|add anything/i);
  });

  it('never pre-selects more than the poster can hold', () => {
    expect(atQ5.pendingSections.length).toBeLessThanOrEqual(MAX_PINNED_SECTIONS);
  });

  it('lets the user ADD a section the derivation left out', () => {
    const missing = atQ5.rankedSections.find(
      (s) => !atQ5.pendingSections.includes(s.id),
    );
    if (!missing) return; // all suggested — nothing to add here
    const state = advance(atQ5, { kind: 'chip', chipId: missing.id });
    expect(state.pendingSections).toContain(missing.id);
  });

  it('lets the user REMOVE a section the derivation suggested', () => {
    const suggested = atQ5.pendingSections[0];
    if (!suggested) return;
    const state = advance(atQ5, { kind: 'chip', chipId: suggested });
    expect(state.pendingSections).not.toContain(suggested);
    // The removal is echoed as the USER's turn, not the assistant's.
    const lastUserTurn = state.transcript
      .filter((t) => t.speaker === 'user')
      .at(-1);
    expect(lastUserTurn?.text).toMatch(/^Drop: /);
  });

  it('caps additions at the physical limit with a plain message', () => {
    let state: InterviewState = { ...atQ5, pendingSections: [] };
    for (const section of state.rankedSections) {
      state = advance(state, { kind: 'chip', chipId: section.id });
    }
    expect(state.pendingSections.length).toBe(MAX_PINNED_SECTIONS);
    expect(lastAssistantText(state)).toMatch(/most the poster can hold/i);
  });

  it('confirming carries the adjusted set into the answers', () => {
    const state = advance(atQ5, { kind: 'chip', chipId: 'sections-done' });
    expect(state.answers.pinnedSectionIds).toEqual(atQ5.pendingSections);
    expect(state.step).toBe('q6-requirements');
  });
});

describe('Q6 — requirements, derived at a minute per slide', () => {
  const atQ6 = atStep('q6-requirements');

  it('asks about slides or duration', () => {
    expect(lastAssistantText(atQ6)).toMatch(/slides|time slot/i);
    expect(chipsFor(atQ6).map((c) => c.id)).toContain('req-none');
  });

  it('derives slides from a stated duration and SHOWS the arithmetic', () => {
    const state = advance(atQ6, { kind: 'text', text: '10 minutes' });
    expect(state.answers.requirements).toEqual({
      statedAs: 'duration',
      durationMinutes: 10,
      slideCount: 10,
    });
    expect(allAssistantText(state)).toMatch(/10 minutes is about 10 slides/i);
    expect(state.step).toBe('outline');
  });

  it('derives duration from a stated slide count', () => {
    const state = advance(atQ6, { kind: 'text', text: 'about 12 slides' });
    expect(state.answers.requirements).toEqual({
      statedAs: 'slides',
      slideCount: 12,
      durationMinutes: 12,
    });
    expect(allAssistantText(state)).toMatch(/12 slides is about 12 minutes/i);
  });

  it('accepts the duration chips', () => {
    const state = advance(atQ6, { kind: 'chip', chipId: 'req-15' });
    expect(state.answers.requirements.durationMinutes).toBe(15);
    expect(state.answers.requirements.slideCount).toBe(15);
  });

  it('No limit records nothing and still finishes', () => {
    const state = advance(atQ6, { kind: 'chip', chipId: 'req-none' });
    expect(state.answers.requirements.statedAs).toBe('none');
    expect(state.step).toBe('outline');
  });

  it('keeps the user on Q6 when there is no number to read', () => {
    const state = advance(atQ6, { kind: 'text', text: 'not sure yet' });
    expect(state.step).toBe('q6-requirements');
    expect(lastAssistantText(state)).toMatch(/could not read a number/i);
  });

  it('a tighter slot scales the panel budgets down, never the type', () => {
    const tight = advance(atQ6, { kind: 'text', text: '3 minutes' });
    const loose = advance(atQ6, { kind: 'chip', chipId: 'req-none' });
    const tightKey = tight.map!.roles.find((r) => r.role === 'keyResult')!;
    const looseKey = loose.map!.roles.find((r) => r.role === 'keyResult')!;
    expect(tightKey.budgetWords).toBeLessThan(looseKey.budgetWords);
  });
});

/**
 * Regression — the core-relevance re-ranking must actually run for the
 * user who declines to reorder, which is most of them.
 *
 * The fixture makes PROMINENCE and RELEVANCE disagree on purpose: the
 * incidental reaction-time effect is by far the loudest number in the
 * manuscript, while the recall finding carries the argument on no number
 * at all. The ingest map (derived core, prominence-dominated) leads with
 * the incidental one; the takeaway-aware re-map must not.
 *
 * These tests drive the REAL state machine to `step: 'outline'` rather
 * than calling `mapNarrative` directly, because the bug they pin lived
 * entirely in the wiring — both the scoring and the override handling
 * were already correct in isolation.
 */
describe('keep-order still re-ranks findings against the takeaway', () => {
  const DIVERGENT = [
    'Sleep Restriction and Recall Accuracy in Undergraduate Students',
    '',
    'John Smith1, Jane Doe2',
    '(1) Acme State University, (2) Sample Research Institute',
    '',
    'Abstract',
    '',
    'Sleep loss impairs memory.',
    '',
    'Introduction',
    '',
    'We asked whether moderate sleep restriction produces recall deficits.',
    '',
    'Methods',
    '',
    'Participants were 120 undergraduates randomized to three groups.',
    '',
    'Results',
    '',
    'Incidental reaction time increased by 43% (p < .0001) as shown in Figure 2. Recall accuracy decreased.',
    '',
    'Discussion',
    '',
    'Moderate sleep restriction measurably impairs recall.',
    '',
    'Acknowledgements',
    '',
    'We thank the Sample Research Institute.',
  ].join('\n');

  const TAKEAWAY = 'Recall accuracy declines under sleep restriction.';
  const divergentDoc = parseManuscriptText(DIVERGENT);

  /** Drive the real script to the outline, never picking a finding. */
  function outlineViaKeepOrder(): InterviewState {
    let state = ingestManuscript(createInterview(), divergentDoc);
    state = advance(state, { kind: 'text', text: TAKEAWAY });
    state = advance(state, { kind: 'chip', chipId: 'table' });
    if (state.step === 'q2-finding') {
      state = advance(state, { kind: 'chip', chipId: 'keep-order' });
    }
    state = advance(state, { kind: 'chip', chipId: 'general' });
    state = advance(state, { kind: 'chip', chipId: 'committee' });
    if (state.step === 'q5-sections') {
      state = advance(state, { kind: 'chip', chipId: 'sections-done' });
    }
    return advance(state, { kind: 'chip', chipId: 'req-none' });
  }

  it('the fixture really does pit prominence against relevance', () => {
    // Guard: if the ingest map ever stops leading with the loud
    // incidental finding, the tests below would pass vacuously.
    const ingestMap = mapNarrative(divergentDoc);
    expect(ingestMap.findings[0]!.text).toMatch(/Incidental reaction time/);
  });

  it('the shipped flow matches a takeaway-only map, not the ingest order', () => {
    const state = outlineViaKeepOrder();
    expect(state.step).toBe('outline');
    const expected = mapNarrative(divergentDoc, { takeaway: TAKEAWAY });
    expect(state.map!.findings.map((f) => f.id)).toEqual(
      expected.findings.map((f) => f.id),
    );
    expect(state.map!.findings[0]!.text).toMatch(/Recall accuracy decreased/);
  });

  it('claims no user attribution when the user never picked a finding', () => {
    const state = outlineViaKeepOrder();
    for (const score of state.map!.findingScores) {
      expect(score.override).not.toBe('user-ranking');
      expect(score.reason).not.toMatch(/you chose/i);
    }
  });

  it('still honours a finding the user DID pick', () => {
    let state = ingestManuscript(createInterview(), divergentDoc);
    state = advance(state, { kind: 'text', text: TAKEAWAY });
    state = advance(state, { kind: 'chip', chipId: 'table' });
    const loud = state.map!.findings.find((f) =>
      /Incidental reaction time/.test(f.text),
    )!;
    state = advance(state, { kind: 'chip', chipId: loud.id });
    state = advance(state, { kind: 'chip', chipId: 'general' });
    state = advance(state, { kind: 'chip', chipId: 'committee' });
    if (state.step === 'q5-sections') {
      state = advance(state, { kind: 'chip', chipId: 'sections-done' });
    }
    state = advance(state, { kind: 'chip', chipId: 'req-none' });

    expect(state.step).toBe('outline');
    expect(state.map!.findings[0]!.id).toBe(loud.id);
    const lead = state.map!.findingScores.find((s) => s.id === loud.id)!;
    expect(lead.override).toBe('user-ranking');
  });
});

describe('outline', () => {
  it('re-maps with the confirmed sections and reaches the outline', () => {
    let state = atStep('q5-sections');
    const target = state.rankedSections[0]!;
    // Force a known selection: clear, then add exactly one.
    state = { ...state, pendingSections: [] };
    state = advance(state, { kind: 'chip', chipId: target.id });
    state = advance(state, { kind: 'chip', chipId: 'sections-done' });
    state = advance(state, { kind: 'chip', chipId: 'req-none' });

    expect(state.step).toBe('outline');
    expect(state.answers.pinnedSectionIds).toEqual([target.id]);
    expect(state.map!.pinned).toHaveLength(1);
    expect(state.map!.pinned[0]!.id).toBe(target.id);
  });
});

describe('skip rules', () => {
  const MINIMAL = [
    'A Title',
    '',
    'Introduction',
    '',
    'We asked whether X changes Y.',
    '',
    'Results',
    '',
    'X increased Y by 12% (p = .01).',
    '',
    'Discussion',
    '',
    'X matters.',
  ].join('\n');

  it('skips the finding-ranking question when only one finding exists', () => {
    let state = ingestManuscript(createInterview(), parseManuscriptText(MINIMAL));
    state = advance(state, { kind: 'text', text: 'X matters for Y.' });
    state = advance(state, { kind: 'chip', chipId: 'table' });
    expect(state.step).toBe('q3-audience');
  });

  it('skips Q5 when the manuscript has no extra sections', () => {
    let state = ingestManuscript(createInterview(), parseManuscriptText(MINIMAL));
    state = advance(state, { kind: 'text', text: 'X matters.' });
    state = advance(state, { kind: 'chip', chipId: 'table' });
    state = advance(state, { kind: 'chip', chipId: 'general' });
    state = advance(state, { kind: 'chip', chipId: 'requirement' });
    expect(state.step).toBe('q6-requirements');
  });
});

describe('emphasisFor', () => {
  it('resolves finding ids to verbatim texts in ranked order', () => {
    let state = startInterview();
    state = advance(state, { kind: 'text', text: 'Short takeaway.' });
    state = advance(state, { kind: 'chip', chipId: 'plot' });
    const second = state.map!.findings[1]!;
    state = advance(state, { kind: 'chip', chipId: second.id });
    state = advance(state, { kind: 'chip', chipId: 'specialists' });
    state = advance(state, { kind: 'chip', chipId: 'job-market' });
    state = advance(state, { kind: 'chip', chipId: 'sections-done' });
    state = advance(state, { kind: 'chip', chipId: 'req-none' });

    const emphasis = emphasisFor(state);
    expect(emphasis.takeaway).toBe('Short takeaway.');
    expect(emphasis.audience).toBe('specialists');
    expect(emphasis.purpose).toBe('job-market');
    expect(emphasis.rankedFindings[0]).toBe(second.text);
    expect(emphasis.rankedFindings).toHaveLength(3);
    // No custom text unless the audience is actually custom.
    expect(emphasis.audienceCustom).toBeUndefined();
  });
});

describe('immutability', () => {
  it('never mutates the input state', () => {
    const before = startInterview();
    const snapshot = JSON.stringify(before);
    advance(before, { kind: 'text', text: 'A fine takeaway.' });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('never mutates state on a chip step either', () => {
    const before = atStep('q5-sections');
    const snapshot = JSON.stringify(before);
    advance(before, { kind: 'chip', chipId: 'sections-done' });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
