/**
 * Scripted interviewer — the chat shell's engine.
 *
 * NOT an agent. A fixed question list delivered as conversational
 * turns: chips wherever the option set is closed, free text only where
 * the question genuinely needs it (Q1, Q3's "Other", Q6). Off-script
 * input gets a bounded response and returns to the script. There is no
 * tool-calling loop here and none should ever be added — the flow's
 * value is that it is predictable.
 *
 * Pure state machine: every transition returns a NEW state object.
 * The UI renders `state.transcript` and `chipsFor(state)`; the only
 * side effects (ingest, the chart chooser panel, the condense call)
 * live in the page component.
 *
 * Question set as of 2026-07-27 — see
 * docs/plans/2026-07-27-manuscript-pipeline.md §2.5:
 *   Q1  takeaway            free text, ≤25 words
 *   Q2  result display      table or plot, then which result leads
 *   Q3  audience            two chips + "Other" → deterministic preset search
 *   Q4  purpose             seven chips
 *   Q5  critical sections   DERIVED and ranked, then user-adjusted
 *   Q6  slot requirements   slides or duration, one derived from the other
 */
import type {
  AudienceOption,
  CondenseEmphasis,
  DocumentModel,
  EmphasisAnswers,
  PresentationRequirements,
  PurposeOption,
  ResultDisplay,
} from '@postr/shared';
import { matchAudience } from './audiencePresets';
import { mapNarrative, type NarrativeMap } from './mapper';
import {
  describeRequirements,
  NO_REQUIREMENTS,
  parseRequirementText,
} from './requirements';
import { MAX_PINNED_SECTIONS } from './rubric';
import { rankSections, type SectionRelevance } from './sectionRelevance';

export type InterviewStepId =
  | 'manuscript'
  | 'q1-takeaway'
  | 'q2-display'
  | 'q2-finding'
  | 'q3-audience'
  | 'q3-audience-other'
  | 'q4-purpose'
  | 'q5-sections'
  | 'q6-requirements'
  | 'outline';

export interface InterviewTurn {
  speaker: 'assistant' | 'user';
  text: string;
}

export interface InterviewChip {
  id: string;
  label: string;
  /** Secondary line under the label. Keeps chip labels terse while
   *  still carrying the qualifier the owner wanted ("covers conference
   *  / department talk"). */
  hint?: string;
}

export interface InterviewState {
  step: InterviewStepId;
  doc: DocumentModel | null;
  map: NarrativeMap | null;
  answers: EmphasisAnswers;
  transcript: InterviewTurn[];
  /** Q5 working set: the derived ranking plus the user's adjustments.
   *  `suggested` is the derivation; `pendingSections` is the truth. */
  rankedSections: SectionRelevance[];
  pendingSections: string[];
  /** Q2 plot branch: true once the user asked for a plot, so the page
   *  can open the chart chooser side panel. The interviewer itself
   *  never touches the chooser — it only records the intent. */
  chartPanelOpen: boolean;
}

export type InterviewInput =
  | { kind: 'text'; text: string }
  | { kind: 'chip'; chipId: string };

const MAX_TAKEAWAY_WORDS = 25;

/** Bounded off-script response — the interviewer never free-wheels. */
const OFF_SCRIPT_REPLY =
  "I can help with your poster's structure — shall we keep going?";

/** Q2 — how the key results are shown. */
export const DISPLAY_CHIPS: ReadonlyArray<{ id: ResultDisplay; label: string }> = [
  { id: 'plot', label: 'A plot' },
  { id: 'table', label: 'A table' },
];

/**
 * Q3 — the two chips the owner named, plus Other. Labels stay terse;
 * the conference / department qualifier rides in `hint`, not the label.
 * Everything else is reached by typing and matched deterministically
 * against AUDIENCE_PRESETS.
 */
export const AUDIENCE_CHIPS: ReadonlyArray<{
  id: AudienceOption | 'audience-other';
  label: string;
  hint?: string;
}> = [
  { id: 'specialists', label: 'Specialists in my subfield' },
  {
    id: 'general',
    label: 'General researchers in my field',
    hint: 'Conference or department talk',
  },
  { id: 'audience-other', label: 'Other' },
];

/**
 * Q4 — widened to what students actually do. The distinction between
 * wanting FEEDBACK and giving a ONE-TIME presentation is explicit
 * because they frame the hook differently: one asks a question of the
 * reader, the other answers one.
 */
export const PURPOSE_CHIPS: ReadonlyArray<{
  id: PurposeOption;
  label: string;
  hint?: string;
}> = [
  { id: 'requirement', label: 'Course requirement' },
  { id: 'one-time', label: 'One-time presentation', hint: 'Present it once, no follow-up' },
  { id: 'committee', label: 'Committee meeting' },
  { id: 'lab-meeting', label: 'Lab presentation' },
  { id: 'feedback', label: 'Getting feedback', hint: 'You want people to push back' },
  { id: 'collaborators', label: 'Finding collaborators' },
  { id: 'job-market', label: 'Job market' },
];

const DEFAULT_ANSWERS: EmphasisAnswers = {
  takeaway: '',
  resultDisplay: 'plot',
  rankedFindingIds: [],
  audience: 'general',
  audienceCustom: '',
  purpose: 'requirement',
  pinnedSectionIds: [],
  requirements: NO_REQUIREMENTS,
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
    rankedSections: [],
    pendingSections: [],
    chartPanelOpen: false,
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
    rankedSections: [],
    pendingSections: [],
    chartPanelOpen: false,
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
    case 'q2-display':
      return DISPLAY_CHIPS.map((c) => ({ id: c.id, label: c.label }));
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
      return AUDIENCE_CHIPS.map((c) => ({
        id: c.id,
        label: c.label,
        ...(c.hint !== undefined ? { hint: c.hint } : {}),
      }));
    case 'q3-audience-other':
      // Free text step — the only chip is the way back out.
      return [{ id: 'audience-back', label: 'Back to the options' }];
    case 'q4-purpose':
      return PURPOSE_CHIPS.map((c) => ({
        id: c.id,
        label: c.label,
        ...(c.hint !== undefined ? { hint: c.hint } : {}),
      }));
    case 'q5-sections': {
      // Every candidate is togglable — the derivation decides what is
      // pre-selected, the user decides what is correct.
      return [
        ...state.rankedSections.map((s) => ({
          id: s.id,
          label: state.pendingSections.includes(s.id)
            ? `Keeping: ${s.heading}`
            : `Add: ${s.heading}`,
          hint: s.reason,
        })),
        { id: 'sections-done', label: 'Looks right' },
      ];
    }
    case 'q6-requirements':
      return [
        { id: 'req-none', label: 'No limit' },
        { id: 'req-5', label: '5 minutes' },
        { id: 'req-10', label: '10 minutes' },
        { id: 'req-15', label: '15 minutes' },
      ];
    default:
      return [];
  }
}

// ─────────────────────────────────────────────────────────────────────
// Step transitions
// ─────────────────────────────────────────────────────────────────────

function askQ2Display(state: InterviewState): InterviewState {
  return say(
    { ...state, step: 'q2-display' },
    'How should your key results appear — as a table, or as a plot?',
    'A plot usually condenses results better than a table on a poster.',
  );
}

function askQ2Finding(state: InterviewState): InterviewState {
  const findings = state.map?.findings ?? [];
  // The ranking question still has to be asked — prompt.ts consumes
  // rankedFindings — but only when there is a ranking to change.
  if (findings.length <= 1) return askQ3(state);
  return say(
    { ...state, step: 'q2-finding' },
    'Which result leads? Pick one, or keep the order I found.',
  );
}

function askQ3(state: InterviewState): InterviewState {
  return say({ ...state, step: 'q3-audience' }, "Who's reading this poster?");
}

function askQ3Other(state: InterviewState): InterviewState {
  return say(
    { ...state, step: 'q3-audience-other' },
    'Who are they? A few words is enough.',
  );
}

function askQ4(state: InterviewState): InterviewState {
  return say({ ...state, step: 'q4-purpose' }, "What's the poster for?");
}

/**
 * Q5 — derive the critical sections, SHOW the ranking, let the user
 * adjust. Never fully automatic: the derivation pre-selects, and the
 * transcript says which sections it picked and why.
 */
function askQ5(state: InterviewState): InterviewState {
  if (!state.doc) return askQ6(state);
  const ranked = rankSections(
    state.doc,
    state.answers.takeaway,
    state.map?.findings ?? [],
  );
  if (ranked.length === 0) return askQ6(state);

  // The derivation only ever pre-selects up to the poster's physical
  // limit — suggesting more than can fit would be a promise we break.
  const suggested = ranked
    .filter((s) => s.suggested)
    .slice(0, MAX_PINNED_SECTIONS)
    .map((s) => s.id);

  const next: InterviewState = {
    ...state,
    step: 'q5-sections',
    rankedSections: ranked,
    pendingSections: suggested,
  };

  const suggestedHeadings = ranked
    .filter((s) => suggested.includes(s.id))
    .map((s) => s.heading);

  return say(
    next,
    suggestedHeadings.length > 0
      ? `Beyond the main sections, these look closest to your point: ${suggestedHeadings.join(', ')}. Add or remove anything, then confirm.`
      : 'Beyond the main sections, nothing else looks essential. Add anything you need, then confirm.',
  );
}

function askQ6(state: InterviewState): InterviewState {
  return say(
    { ...state, step: 'q6-requirements' },
    'Any limit on the presentation — a number of slides, or a time slot? Pick one or type it.',
  );
}

/**
 * Re-map with the confirmed sections and the slot constraint, then move
 * to the outline. Keeps the ORIGINAL findings: their ids anchor the
 * user's Q2 ranking, and a re-map would mint fresh ids and orphan it.
 */
function finishQuestions(state: InterviewState): InterviewState {
  if (!state.doc) return state;
  // The full context is finally available: the Q1 takeaway establishes
  // the core, Q2 overrides the finding ranking, Q5 pins are absolute,
  // and Q6 sets the scale. This re-map is where the hierarchy is
  // actually decided — the ingest-time map ran on a derived core.
  const remapped = mapNarrative(state.doc, {
    takeaway: state.answers.takeaway,
    pinnedSectionIds: state.answers.pinnedSectionIds,
    rankedFindingIds: state.answers.rankedFindingIds,
    slideCount: state.answers.requirements.slideCount,
  });
  // The re-map's findings are used directly. Finding ids are derived
  // from sentence text (`findingId`), not minted per call, so the ids
  // behind the user's Q2 ranking survive the re-map and the override in
  // `rankFindingsByCore` actually binds.
  const map = remapped;
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
  return askQ2Display({
    ...withEcho,
    answers: { ...withEcho.answers, takeaway: trimmed },
  });
}

/**
 * Q2a — table or plot. Picking PLOT flags the chart chooser panel open;
 * the page reads `chartPanelOpen` and mounts the existing chooser
 * inline (plus a link to the full page). The interviewer does not know
 * what a chart is, and should not.
 */
function handleQ2Display(state: InterviewState, chipId: string): InterviewState {
  const chip = DISPLAY_CHIPS.find((c) => c.id === chipId);
  if (!chip) return offScript(state);
  const withEcho = echo(state, chip.label);
  const next: InterviewState = {
    ...withEcho,
    answers: { ...withEcho.answers, resultDisplay: chip.id },
    chartPanelOpen: chip.id === 'plot',
  };
  return askQ2Finding(
    chip.id === 'plot'
      ? say(
          next,
          'I have opened the chart builder beside this chat — it walks you through picking the right figure.',
        )
      : next,
  );
}

function handleQ2Finding(state: InterviewState, chipId: string): InterviewState {
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
  if (chipId === 'audience-other') {
    return askQ3Other(echo(state, 'Other'));
  }
  const chip = AUDIENCE_CHIPS.find((c) => c.id === chipId);
  if (!chip || chip.id === 'audience-other') return offScript(state);
  return askQ4({
    ...echo(state, chip.label),
    answers: {
      ...state.answers,
      audience: chip.id as AudienceOption,
      audienceCustom: '',
    },
  });
}

/**
 * Q3 "Other" — DETERMINISTIC preset search on the typed text. Only when
 * nothing reasonable matches does the free text ride through as a
 * custom audience. No model call: classifying "school nurses" is a
 * keyword table's job, and a wrong guess here quietly changes how much
 * jargon survives.
 */
function handleQ3Other(state: InterviewState, text: string): InterviewState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  const withEcho = echo(state, trimmed);
  const match = matchAudience(trimmed);

  const next: InterviewState = {
    ...withEcho,
    answers: {
      ...withEcho.answers,
      audience: match.option,
      audienceCustom: match.custom,
    },
  };

  return askQ4(
    match.option === 'custom'
      ? say(next, `Noted — writing for ${trimmed}.`)
      : say(next, `Got it — ${match.label}.`),
  );
}

function handleQ4(state: InterviewState, chipId: string): InterviewState {
  const chip = PURPOSE_CHIPS.find((c) => c.id === chipId);
  if (!chip) return offScript(state);
  return askQ5({
    ...echo(state, chip.label),
    answers: { ...state.answers, purpose: chip.id },
  });
}

/**
 * Q5 — the ADJUST half. Toggling is symmetric (add and remove are the
 * same gesture) because the derivation may have got it wrong in either
 * direction, and a user who can only add is being told their judgement
 * matters less than ours.
 */
function handleQ5(state: InterviewState, chipId: string): InterviewState {
  if (chipId === 'sections-done') {
    const kept = state.rankedSections
      .filter((s) => state.pendingSections.includes(s.id))
      .map((s) => s.heading);
    const withEcho = echo(
      state,
      kept.length > 0 ? `Keeping: ${kept.join(', ')}` : 'Nothing extra',
    );
    return askQ6({
      ...withEcho,
      answers: {
        ...withEcho.answers,
        pinnedSectionIds: withEcho.pendingSections,
      },
    });
  }

  const section = state.rankedSections.find((s) => s.id === chipId);
  if (!section) return offScript(state);

  const already = state.pendingSections.includes(chipId);
  if (already) {
    return {
      ...echo(state, `Drop: ${section.heading}`),
      pendingSections: state.pendingSections.filter((id) => id !== chipId),
    };
  }
  if (state.pendingSections.length >= MAX_PINNED_SECTIONS) {
    return say(
      echo(state, `Add: ${section.heading}`),
      `${MAX_PINNED_SECTIONS} extra sections is the most the poster can hold — drop one first, or confirm what you have.`,
    );
  }
  return {
    ...echo(state, `Add: ${section.heading}`),
    pendingSections: [...state.pendingSections, chipId],
  };
}

/** Q6 chip ids that carry a duration, so the chip path and the typed
 *  path share one derivation. */
const REQUIREMENT_CHIP_MINUTES: Record<string, number> = {
  'req-5': 5,
  'req-10': 10,
  'req-15': 15,
};

function handleQ6Chip(state: InterviewState, chipId: string): InterviewState {
  if (chipId === 'req-none') {
    return finishQuestions({
      ...echo(state, 'No limit'),
      answers: { ...state.answers, requirements: NO_REQUIREMENTS },
    });
  }
  const minutes = REQUIREMENT_CHIP_MINUTES[chipId];
  if (minutes === undefined) return offScript(state);
  return applyRequirements(echo(state, `${minutes} minutes`), `${minutes} minutes`);
}

function handleQ6Text(state: InterviewState, text: string): InterviewState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  return applyRequirements(echo(state, trimmed), trimmed);
}

/**
 * Shared Q6 tail: parse, derive the other side, SHOW the arithmetic,
 * then finish. Unparseable input keeps the user on Q6 rather than
 * silently recording nothing.
 */
function applyRequirements(state: InterviewState, text: string): InterviewState {
  const requirements: PresentationRequirements | null = parseRequirementText(text);
  if (!requirements) {
    return say(
      state,
      'I could not read a number there — try "10 minutes" or "12 slides", or tap No limit.',
    );
  }
  const withAnswer: InterviewState = {
    ...state,
    answers: { ...state.answers, requirements },
  };
  return finishQuestions(say(withAnswer, describeRequirements(requirements)));
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
    case 'q2-display':
      return input.kind === 'chip'
        ? handleQ2Display(state, input.chipId)
        : offScript(echo(state, input.text));
    case 'q2-finding':
      return input.kind === 'chip'
        ? handleQ2Finding(state, input.chipId)
        : offScript(echo(state, input.text));
    case 'q3-audience':
      return input.kind === 'chip'
        ? handleQ3(state, input.chipId)
        : offScript(echo(state, input.text));
    case 'q3-audience-other':
      // The free-text step: text is ON script here, and the lone chip
      // returns to the closed option set.
      if (input.kind === 'chip') {
        return input.chipId === 'audience-back'
          ? askQ3(echo(state, 'Back to the options'))
          : offScript(state);
      }
      return handleQ3Other(state, input.text);
    case 'q4-purpose':
      return input.kind === 'chip'
        ? handleQ4(state, input.chipId)
        : offScript(echo(state, input.text));
    case 'q5-sections':
      return input.kind === 'chip'
        ? handleQ5(state, input.chipId)
        : offScript(echo(state, input.text));
    case 'q6-requirements':
      // Both paths are on script: chips are the common answers, typing
      // covers "8 slides" and everything else a programme can specify.
      return input.kind === 'chip'
        ? handleQ6Chip(state, input.chipId)
        : handleQ6Text(state, input.text);
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

/** Close the chart chooser panel — the user dismissed it, or inserted a
 *  figure. Pure, like every other transition. */
export function closeChartPanel(state: InterviewState): InterviewState {
  return { ...state, chartPanelOpen: false };
}

/** Structured emphasis facts for the condense request. */
export function emphasisFor(state: InterviewState): CondenseEmphasis {
  const findingsById = new Map(
    (state.map?.findings ?? []).map((f) => [f.id, f.text]),
  );
  return {
    takeaway: state.answers.takeaway,
    audience: state.answers.audience,
    ...(state.answers.audience === 'custom' && state.answers.audienceCustom
      ? { audienceCustom: state.answers.audienceCustom }
      : {}),
    purpose: state.answers.purpose,
    rankedFindings: state.answers.rankedFindingIds
      .map((id) => findingsById.get(id))
      .filter((t): t is string => Boolean(t)),
  };
}
