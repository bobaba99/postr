/**
 * Scripted interviewer — the state machine IS the product's chat
 * behavior, so these tests pin the full happy path, every skip rule,
 * the off-script bounded response, the 25-word takeaway gate, and the
 * pin cap. The machine must be pure: every assertion works on returned
 * state, never on mutation.
 */
import { describe, it, expect } from 'vitest';
import { parseManuscriptText } from '../parseManuscriptText';
import {
  advance,
  chipsFor,
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

Single-institution sample.

Acknowledgements

We thank the Sample Research Institute.`;

function startInterview(): InterviewState {
  return ingestManuscript(createInterview(), parseManuscriptText(MANUSCRIPT));
}

function lastAssistantText(state: InterviewState): string {
  const turns = state.transcript.filter((t) => t.speaker === 'assistant');
  return turns[turns.length - 1]?.text ?? '';
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
    const texts = state.transcript.map((t) => t.text).join('\n');
    expect(texts).toMatch(/Got it — [\d,]+ words, 0 figures, 3 findings/);
    expect(lastAssistantText(state)).toMatch(/one thing someone should remember/i);
  });
});

describe('Q1 — takeaway (free text, load-bearing)', () => {
  it('accepts a short sentence and moves to Q2', () => {
    const state = advance(startInterview(), {
      kind: 'text',
      text: 'Moderate sleep restriction impairs recall.',
    });
    expect(state.step).toBe('q2-finding');
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

describe('Q2 — finding promotion (chips)', () => {
  const atQ2 = advance(startInterview(), { kind: 'text', text: 'Short takeaway.' });

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

  it('keep-order preserves the auto ranking', () => {
    const state = advance(atQ2, { kind: 'chip', chipId: 'keep-order' });
    expect(state.answers.rankedFindingIds).toEqual(
      atQ2.map!.findings.map((f) => f.id),
    );
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

describe('Q3/Q4 — audience and purpose (chips)', () => {
  const atQ3 = advance(
    advance(startInterview(), { kind: 'text', text: 'Short takeaway.' }),
    { kind: 'chip', chipId: 'keep-order' },
  );

  it('records the audience and asks the purpose', () => {
    const state = advance(atQ3, { kind: 'chip', chipId: 'clinicians' });
    expect(state.step).toBe('q4-purpose');
    expect(state.answers.audience).toBe('clinicians');
  });

  it('rejects an unknown chip id as off-script', () => {
    const state = advance(atQ3, { kind: 'chip', chipId: 'nonsense' });
    expect(state.step).toBe('q3-audience');
    expect(lastAssistantText(state)).toMatch(/shall we keep going/i);
  });
});

describe('Q5 — pins (multi-select) and outline', () => {
  const atQ5 = advance(
    advance(
      advance(
        advance(startInterview(), { kind: 'text', text: 'Short takeaway.' }),
        { kind: 'chip', chipId: 'keep-order' },
      ),
      { kind: 'chip', chipId: 'general' },
    ),
    { kind: 'chip', chipId: 'feedback' },
  );

  it('announces the planned cuts', () => {
    expect(atQ5.step).toBe('q5-pins');
    expect(lastAssistantText(atQ5)).toMatch(/I plan to cut/i);
    expect(lastAssistantText(atQ5)).toMatch(/Limitations/);
  });

  it('accumulates pins and removes chosen chips from the offer', () => {
    const limitations = atQ5.map!.cutSections.find((s) => s.kind === 'limitations')!;
    const state = advance(atQ5, { kind: 'chip', chipId: limitations.id });
    expect(state.step).toBe('q5-pins');
    expect(state.pendingPins).toEqual([limitations.id]);
    expect(chipsFor(state).some((c) => c.id === limitations.id)).toBe(false);
  });

  it('caps pins at the physical limit with a plain message', () => {
    const cutIds = atQ5.map!.cutSections.map((s) => s.id);
    let state = atQ5;
    for (const id of cutIds) {
      state = advance(state, { kind: 'chip', chipId: id });
    }
    expect(state.pendingPins.length).toBe(MAX_PINNED_SECTIONS);
    expect(lastAssistantText(state)).toMatch(/most the poster can hold/i);
  });

  it('Done re-maps with pins and reaches the outline', () => {
    const limitations = atQ5.map!.cutSections.find((s) => s.kind === 'limitations')!;
    const pinnedOnce = advance(atQ5, { kind: 'chip', chipId: limitations.id });
    const state = advance(pinnedOnce, { kind: 'chip', chipId: 'pins-done' });
    expect(state.step).toBe('outline');
    expect(state.answers.pinnedSectionIds).toEqual([limitations.id]);
    expect(state.map!.pinned).toHaveLength(1);
    expect(state.map!.pinned[0]!.heading).toBe('Limitations');
  });
});

describe('skip rules', () => {
  it('skips Q2 when only one finding exists', () => {
    const oneFinding = parseManuscriptText(
      [
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
      ].join('\n'),
    );
    const state = advance(
      ingestManuscript(createInterview(), oneFinding),
      { kind: 'text', text: 'X matters for Y.' },
    );
    expect(state.step).toBe('q3-audience');
  });

  it('skips Q5 when nothing is being cut', () => {
    const nothingCut = parseManuscriptText(
      [
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
      ].join('\n'),
    );
    let state = ingestManuscript(createInterview(), nothingCut);
    state = advance(state, { kind: 'text', text: 'X matters.' });
    state = advance(state, { kind: 'chip', chipId: 'general' });
    state = advance(state, { kind: 'chip', chipId: 'feedback' });
    expect(state.step).toBe('outline');
  });
});

describe('emphasisFor', () => {
  it('resolves finding ids to verbatim texts in ranked order', () => {
    let state = startInterview();
    state = advance(state, { kind: 'text', text: 'Short takeaway.' });
    const second = state.map!.findings[1]!;
    state = advance(state, { kind: 'chip', chipId: second.id });
    state = advance(state, { kind: 'chip', chipId: 'adjacent' });
    state = advance(state, { kind: 'chip', chipId: 'job-market' });
    state = advance(state, { kind: 'chip', chipId: 'pins-done' });

    const emphasis = emphasisFor(state);
    expect(emphasis.takeaway).toBe('Short takeaway.');
    expect(emphasis.audience).toBe('adjacent');
    expect(emphasis.purpose).toBe('job-market');
    expect(emphasis.rankedFindings[0]).toBe(second.text);
    expect(emphasis.rankedFindings).toHaveLength(3);
  });
});

describe('immutability', () => {
  it('never mutates the input state', () => {
    const before = startInterview();
    const snapshot = JSON.stringify(before);
    advance(before, { kind: 'text', text: 'A fine takeaway.' });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
