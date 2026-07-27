/**
 * Scripted interviewer — the chat shell's engine.
 *
 * NOT an agent. A fixed question list (§2.5 of the plan) delivered as
 * conversational turns: chips wherever the option set is closed, free
 * text only where the question genuinely needs it (Q1). Off-script
 * input gets a bounded response and returns to the script. There is no
 * tool-calling loop here and none should ever be added — the flow's
 * value is that it is predictable.
 *
 * Pure state machine: every transition returns a NEW state object.
 * The UI renders `state.transcript` and `chipsFor(state)`; the only
 * side effects (ingest, the condense call) live in the page component.
 */
import type {
  AudienceOption,
  CondenseEmphasis,
  DocumentModel,
  EmphasisAnswers,
  PurposeOption,
} from '@postr/shared';
import { mapNarrative, type NarrativeMap } from './mapper';
import { MAX_PINNED_SECTIONS } from './rubric';

export type InterviewStepId =
  | 'manuscript'
  | 'q1-takeaway'
  | 'q2-finding'
  | 'q3-audience'
  | 'q4-purpose'
  | 'q5-pins'
  | 'outline';

export interface InterviewTurn {
  speaker: 'assistant' | 'user';
  text: string;
}

export interface InterviewChip {
  id: string;
  label: string;
}

export interface InterviewState {
  step: InterviewStepId;
  doc: DocumentModel | null;
  map: NarrativeMap | null;
  answers: EmphasisAnswers;
  transcript: InterviewTurn[];
  /** Q5 accumulates multi-select pins before Done. */
  pendingPins: string[];
}

export type InterviewInput =
  | { kind: 'text'; text: string }
  | { kind: 'chip'; chipId: string };

const MAX_TAKEAWAY_WORDS = 25;

/** Bounded off-script response — the interviewer never free-wheels. */
const OFF_SCRIPT_REPLY =
  "I can help with your poster's structure — shall we keep going?";

export const AUDIENCE_CHIPS: ReadonlyArray<{ id: AudienceOption; label: string }> = [
  { id: 'specialists', label: 'Specialists in my subfield' },
  { id: 'adjacent', label: 'Adjacent researchers' },
  { id: 'general', label: 'Mixed / general conference' },
  { id: 'clinicians', label: 'Clinicians' },
];

export const PURPOSE_CHIPS: ReadonlyArray<{ id: PurposeOption; label: string }> = [
  { id: 'feedback', label: 'Getting feedback' },
  { id: 'collaborators', label: 'Recruiting collaborators' },
  { id: 'job-market', label: 'Job market' },
  { id: 'requirement', label: 'Course / programme requirement' },
];

const DEFAULT_ANSWERS: EmphasisAnswers = {
  takeaway: '',
  rankedFindingIds: [],
  audience: 'general',
  purpose: 'feedback',
  pinnedSectionIds: [],
};

function say(state: InterviewState, ...texts: string[]): InterviewState {
  return {
    ...state,
    transcript: [
      ...state.transcript,
      ...texts.map((text): InterviewTurn => ({ speaker: 'assistant', text })),
    ],
  };
}

function echo(state: InterviewState, text: string): InterviewState {
  return {
    ...state,
    transcript: [...state.transcript, { speaker: 'user', text }],
  };
}

function truncateLabel(text: string, max = 90): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function createInterview(): InterviewState {
  const base: InterviewState = {
    step: 'manuscript',
    doc: null,
    map: null,
    answers: DEFAULT_ANSWERS,
    transcript: [],
    pendingPins: [],
  };
  return say(
    base,
    'Paste your manuscript below, or drop a .docx — I will read it and ask a few short questions about what to emphasise.',
  );
}

/** Called by the page after ingest succeeds. Runs the deterministic
 *  mapper and moves to Q1. */
export function ingestManuscript(
  state: InterviewState,
  doc: DocumentModel,
): InterviewState {
  const map = mapNarrative(doc);
  const figureCount = doc.figures.length;
  const summary = `Got it — ${doc.wordCount.toLocaleString()} words, ${figureCount} figure${figureCount === 1 ? '' : 's'}, ${map.findings.length} finding${map.findings.length === 1 ? '' : 's'} detected.`;

  let next: InterviewState = {
    ...state,
    step: 'q1-takeaway',
    doc,
    map,
    answers: { ...DEFAULT_ANSWERS, rankedFindingIds: map.findings.map((f) => f.id) },
    pendingPins: [],
  };
  next = say(next, summary);
  for (const warning of map.warnings) {
    next = say(next, warning);
  }
  return say(
    next,
    `What's the one thing someone should remember from your poster? One sentence, up to ${MAX_TAKEAWAY_WORDS} words.`,
  );
}

// ─────────────────────────────────────────────────────────────────────
// Chips per step
// ─────────────────────────────────────────────────────────────────────

export function chipsFor(state: InterviewState): InterviewChip[] {
  switch (state.step) {
    case 'q2-finding': {
      const findings = state.map?.findings ?? [];
      return [
        ...findings.map((f, i) => ({
          id: f.id,
          label: truncateLabel(`${i + 1}. ${f.text}`),
        })),
        { id: 'keep-order', label: 'Keep this order' },
      ];
    }
    case 'q3-audience':
      return AUDIENCE_CHIPS.map((c) => ({ id: c.id, label: c.label }));
    case 'q4-purpose':
      return PURPOSE_CHIPS.map((c) => ({ id: c.id, label: c.label }));
    case 'q5-pins': {
      const cut = state.map?.cutSections ?? [];
      return [
        ...cut
          .filter((s) => !state.pendingPins.includes(s.id))
          .map((s) => ({ id: s.id, label: `Keep: ${s.heading || 'Untitled section'}` })),
        { id: 'pins-done', label: state.pendingPins.length > 0 ? 'Done pinning' : 'Nothing — cut freely' },
      ];
    }
    default:
      return [];
  }
}

// ─────────────────────────────────────────────────────────────────────
// Step transitions
// ─────────────────────────────────────────────────────────────────────

function askQ2(state: InterviewState): InterviewState {
  const findings = state.map?.findings ?? [];
  if (findings.length <= 1) return askQ3(state);
  return say(
    { ...state, step: 'q2-finding' },
    'Which result matters most? Pick one to lead with, or keep the order I found.',
  );
}

function askQ3(state: InterviewState): InterviewState {
  return say(
    { ...state, step: 'q3-audience' },
    "Who's the audience at this conference?",
  );
}

function askQ4(state: InterviewState): InterviewState {
  return say({ ...state, step: 'q4-purpose' }, "What's the poster for?");
}

function askQ5(state: InterviewState): InterviewState {
  const cut = state.map?.cutSections ?? [];
  if (cut.length === 0) return finishQuestions(state);
  const names = cut.map((s) => s.heading || 'an untitled section').join(', ');
  return say(
    { ...state, step: 'q5-pins' },
    `To fit a poster, I plan to cut: ${names}. Anything you must NOT cut? Pick up to ${MAX_PINNED_SECTIONS}.`,
  );
}

function finishQuestions(state: InterviewState): InterviewState {
  if (!state.doc) return state;
  // Re-map with the final pins so pinned sections get their budgets —
  // but keep the ORIGINAL findings: their ids anchor the user's Q2
  // ranking, and a re-map would mint fresh ids and orphan it.
  const remapped = mapNarrative(state.doc, state.answers.pinnedSectionIds);
  const map = { ...remapped, findings: state.map?.findings ?? remapped.findings };
  return say(
    { ...state, step: 'outline', map },
    'Here is the outline I will build from — each panel shows which section it came from. Edit anything that reads wrong, then build your poster.',
  );
}

function handleQ1(state: InterviewState, text: string): InterviewState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  const withEcho = echo(state, trimmed);
  const words = trimmed.split(/\s+/).length;
  if (words > MAX_TAKEAWAY_WORDS) {
    return say(
      withEcho,
      `That's ${words} words — can you get it under ${MAX_TAKEAWAY_WORDS}? The takeaway works hardest when it fits in one breath.`,
    );
  }
  return askQ2({
    ...withEcho,
    answers: { ...withEcho.answers, takeaway: trimmed },
  });
}

function handleQ2(state: InterviewState, chipId: string): InterviewState {
  const findings = state.map?.findings ?? [];
  const chip = chipsFor(state).find((c) => c.id === chipId);
  if (!chip) return offScript(state);
  const withEcho = echo(state, chip.label);
  if (chipId === 'keep-order') return askQ3(withEcho);
  const reordered = [
    chipId,
    ...findings.map((f) => f.id).filter((id) => id !== chipId),
  ];
  return askQ3({
    ...withEcho,
    answers: { ...withEcho.answers, rankedFindingIds: reordered },
  });
}

function handleQ3(state: InterviewState, chipId: string): InterviewState {
  const chip = AUDIENCE_CHIPS.find((c) => c.id === chipId);
  if (!chip) return offScript(state);
  return askQ4({
    ...echo(state, chip.label),
    answers: { ...state.answers, audience: chip.id },
  });
}

function handleQ4(state: InterviewState, chipId: string): InterviewState {
  const chip = PURPOSE_CHIPS.find((c) => c.id === chipId);
  if (!chip) return offScript(state);
  return askQ5({
    ...echo(state, chip.label),
    answers: { ...state.answers, purpose: chip.id },
  });
}

function handleQ5(state: InterviewState, chipId: string): InterviewState {
  if (chipId === 'pins-done') {
    const withEcho = echo(
      state,
      state.pendingPins.length > 0 ? 'Done pinning' : 'Nothing — cut freely',
    );
    return finishQuestions({
      ...withEcho,
      answers: { ...withEcho.answers, pinnedSectionIds: withEcho.pendingPins },
    });
  }
  const section = state.map?.cutSections.find((s) => s.id === chipId);
  if (!section) return offScript(state);
  if (state.pendingPins.length >= MAX_PINNED_SECTIONS) {
    return say(
      echo(state, `Keep: ${section.heading}`),
      `${MAX_PINNED_SECTIONS} pins is the most the poster can hold — unpin something first, or tap Done.`,
    );
  }
  return {
    ...echo(state, `Keep: ${section.heading || 'Untitled section'}`),
    pendingPins: [...state.pendingPins, chipId],
  };
}

function offScript(state: InterviewState): InterviewState {
  return say(state, OFF_SCRIPT_REPLY);
}

/**
 * Advance the interview with user input. Free text on a chip step is
 * off-script and gets the bounded redirect; unknown chips likewise.
 */
export function advance(
  state: InterviewState,
  input: InterviewInput,
): InterviewState {
  switch (state.step) {
    case 'manuscript':
      // Manuscript arrives via ingestManuscript, not chat input.
      return input.kind === 'text' && input.text.trim()
        ? offScript(echo(state, input.text.trim()))
        : state;
    case 'q1-takeaway':
      return input.kind === 'text'
        ? handleQ1(state, input.text)
        : offScript(state);
    case 'q2-finding':
      return input.kind === 'chip'
        ? handleQ2(state, input.chipId)
        : offScript(echo(state, input.text));
    case 'q3-audience':
      return input.kind === 'chip'
        ? handleQ3(state, input.chipId)
        : offScript(echo(state, input.text));
    case 'q4-purpose':
      return input.kind === 'chip'
        ? handleQ4(state, input.chipId)
        : offScript(echo(state, input.text));
    case 'q5-pins':
      return input.kind === 'chip'
        ? handleQ5(state, input.chipId)
        : offScript(echo(state, input.text));
    case 'outline':
      return input.kind === 'text' && input.text.trim()
        ? offScript(echo(state, input.text.trim()))
        : state;
  }
}

/**
 * Page-side reporting into the transcript (ingest failures, condense
 * status) without moving the script. The step never changes — this is
 * the ONLY sanctioned way for the page to speak in the chat.
 */
export function assistantSay(
  state: InterviewState,
  ...texts: string[]
): InterviewState {
  return say(state, ...texts);
}

/** Structured emphasis facts for the condense request. */
export function emphasisFor(state: InterviewState): CondenseEmphasis {
  const findingsById = new Map(
    (state.map?.findings ?? []).map((f) => [f.id, f.text]),
  );
  return {
    takeaway: state.answers.takeaway,
    audience: state.answers.audience,
    purpose: state.answers.purpose,
    rankedFindings: state.answers.rankedFindingIds
      .map((id) => findingsById.get(id))
      .filter((t): t is string => Boolean(t)),
  };
}
