// REUSE LEDGER: consumes DocumentModel + ranked findings + condensed roles from
// the SHARED manuscript pipeline. Poster path is deterministic-first; the talk
// path takes LLM-ranked findings (spec §3.1). Changing shared extraction affects
// BOTH — see docs/plans/2026-07-29-paper-to-slides.md §3.1.
//
// Depends on ./slideBudget (contentSlideCount + enforceSlideWordCap, Task 1):
// every CONTENT slide passes through the ≤30-word gate here. Bottom-box
// references do NOT — they are apparatus, not talk content (spec §1, §6).
import { contentSlideCount, enforceSlideWordCap } from './slideBudget';
import type { Slide, SlideDeck, SpeakerNote } from './types';

export interface RankedFinding {
  text: string;
  sourceQuote: string;
  sourceSection: string;
}

export interface BuildDeckInput {
  title: string;
  authors: { name: string }[];
  durationMinutes: number;
  rankedFindings: RankedFinding[];
  gap: string;
  resolution: string;
  methodsSummary: string;
  references: string[];
  /** Pasted references cited in the introduction — routed to hook + question. */
  introReferences: string[];
  /** Pasted references cited in methods — routed to the methods slide. */
  methodsReferences: string[];
  /** Optional pre-authored speaker notes, keyed by role (Phase 1: usually empty). */
  notes?: Record<string, SpeakerNote[]>;
}

function gated(text: string): { assertion: string; wordCapCut: boolean } {
  const r = enforceSlideWordCap(text);
  return { assertion: r.text, wordCapCut: r.cut };
}

/** Turn a bottom-box reference into an appended, provenance-tagged speaker note. */
function referenceNotes(refs: string[]): SpeakerNote[] {
  return refs.map((text) => ({ text, provenance: 'reference' }));
}

/**
 * Merge reference lists and deduplicate on a trimmed, case-insensitive key,
 * preserving first-seen order and the original casing/spacing of that first
 * occurrence. Empty entries are dropped.
 */
function dedupeReferences(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const trimmed = raw.trim();
      if (trimmed.length === 0) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

export function buildDeck(input: BuildDeckInput): SlideDeck {
  const slides: Slide[] = [];
  const introRefs = input.introReferences ?? [];
  const methodsRefs = input.methodsReferences ?? [];

  slides.push({
    role: 'title',
    assertion: input.title,
    evidence: null,
    sourceQuote: '',
    speakerNotes: [],
    references: [],
    wordCapCut: false,
  });

  // Introduction gap + tension. Intro references ride along here.
  const hook = gated(input.gap);
  slides.push({
    role: 'hook',
    assertion: hook.assertion,
    evidence: null,
    sourceQuote: input.gap,
    speakerNotes: [...(input.notes?.hook ?? []), ...referenceNotes(introRefs)],
    references: introRefs,
    wordCapCut: hook.wordCapCut,
  });

  // How the current study resolves the gap. Intro references ride along here too.
  const question = gated(input.resolution);
  slides.push({
    role: 'question',
    assertion: question.assertion,
    evidence: null,
    sourceQuote: input.resolution,
    speakerNotes: [...(input.notes?.question ?? []), ...referenceNotes(introRefs)],
    references: introRefs,
    wordCapCut: question.wordCapCut,
  });

  // Methods + charts as fill-ins. Methods references ride along here.
  const methods = gated(input.methodsSummary);
  slides.push({
    role: 'methods',
    assertion: methods.assertion,
    evidence: null,
    sourceQuote: input.methodsSummary,
    speakerNotes: [...(input.notes?.methods ?? []), ...referenceNotes(methodsRefs)],
    references: methodsRefs,
    wordCapCut: methods.wordCapCut,
  });

  // One slide per ranked finding — expand, do not compress (genre-collapse guard).
  const budget = contentSlideCount(input.durationMinutes);
  for (const f of input.rankedFindings.slice(0, budget)) {
    const g = gated(f.text);
    slides.push({
      role: 'result',
      assertion: g.assertion,
      evidence: null,
      sourceQuote: f.sourceQuote,
      speakerNotes: [],
      references: [],
      wordCapCut: g.wordCapCut,
    });
  }

  // References slide — merge every pasted reference and deduplicate. NOT gated:
  // the bottom box is apparatus, not talk content, so no ≤30-word cap applies.
  const allReferences = dedupeReferences(input.references, introRefs, methodsRefs);
  slides.push({
    role: 'references',
    assertion: 'References',
    evidence: allReferences.join('\n'),
    sourceQuote: '',
    speakerNotes: [],
    references: allReferences,
    wordCapCut: false,
  });

  return { slides, durationMinutes: input.durationMinutes };
}
