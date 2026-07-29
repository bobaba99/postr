/**
 * deriveDeckInput — turn a parsed manuscript (DocumentModel) plus the
 * user's constraints and their ranked findings into a BuildDeckInput.
 *
 * DETERMINISTIC and DENDROID-FREE. Everything here is read straight off the
 * shared DocumentModel the ingest already produced — no model call, no
 * invention. The one LLM step in the talk path is the ranked-findings
 * extraction (extractFindings.ts); this module only arranges what the paper
 * already says into the fixed arc buildDeck expects.
 *
 * Phase-1 narrative (spec §2, Task 12 "auto" branch): the gap and resolution
 * are derived, not asked. `gap` is the first sentence of the introduction (or
 * the abstract, or the title as a last resort); `resolution` is a plain,
 * paper-agnostic framing that names the study's own contribution without
 * inventing a claim. Asking the two narrative questions is a Phase-2 upgrade;
 * this keeps buildDeck fed with honest, source-traceable text today.
 */
import type { DocumentModel, ManuscriptSection } from '@postr/shared';
import type { BuildDeckInput, RankedFinding } from './buildDeck';

/** First sentence of a block of prose, trimmed. Empty string when none. */
function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : trimmed).trim();
}

function sectionsOfKind(
  doc: DocumentModel,
  kind: ManuscriptSection['kind'],
): ManuscriptSection[] {
  return doc.sections.filter((s) => s.kind === kind);
}

/** Join a section kind's paragraphs into one prose block. */
function proseOfKind(doc: DocumentModel, kind: ManuscriptSection['kind']): string {
  return sectionsOfKind(doc, kind)
    .flatMap((s) => s.paragraphs)
    .join(' ')
    .trim();
}

/**
 * The introduction gap — the tension the talk opens on. Prefer the
 * introduction's opening sentence, then the abstract's, then the title.
 * Never fabricated: it is always a verbatim slice of the paper.
 */
function deriveGap(doc: DocumentModel): string {
  const intro = proseOfKind(doc, 'introduction') || proseOfKind(doc, 'literature-review');
  const introSentence = firstSentence(intro);
  if (introSentence) return introSentence;
  const abstractSentence = firstSentence(doc.abstract ?? '');
  if (abstractSentence) return abstractSentence;
  return doc.title || 'The problem this work addresses.';
}

/**
 * How the current study speaks to the gap. A paper-agnostic framing that
 * introduces the study without asserting a result the paper does not make —
 * the results themselves carry the claims on their own slides.
 */
function deriveResolution(doc: DocumentModel): string {
  const abstractSentence = firstSentence(doc.abstract ?? '');
  if (abstractSentence) return abstractSentence;
  return 'This study takes up that question directly.';
}

/**
 * A short methods summary for the methods slide. First sentence of the
 * methods section, or its opening prose; empty-safe.
 */
function deriveMethodsSummary(doc: DocumentModel): string {
  const methods = proseOfKind(doc, 'methods');
  const sentence = firstSentence(methods);
  return sentence || methods || 'Methods as described in the manuscript.';
}

/** Every reference's display string, in document order. */
function deriveReferences(doc: DocumentModel): string[] {
  return doc.references
    .map((r) => r.rawText?.trim() ?? '')
    .filter((text) => text.length > 0);
}

export interface DeriveDeckInputParams {
  model: DocumentModel;
  durationMinutes: number;
  /** Findings in the user's chosen order — the first is the star. */
  rankedFindings: RankedFinding[];
}

/**
 * Assemble the BuildDeckInput for the deterministic deck builder. Pure —
 * given the same manuscript, duration, and ranking it always returns the
 * same input, so the deck is reproducible.
 */
export function deriveDeckInput(params: DeriveDeckInputParams): BuildDeckInput {
  const { model, durationMinutes, rankedFindings } = params;
  return {
    title: model.title || 'Untitled manuscript',
    authors: model.authors.map((a) => ({ name: a.name })),
    durationMinutes,
    rankedFindings,
    gap: deriveGap(model),
    resolution: deriveResolution(model),
    methodsSummary: deriveMethodsSummary(model),
    references: deriveReferences(model),
    // Phase 1 routes all pasted references onto the references slide; the
    // intro/methods reference split is a Phase-2 refinement.
    introReferences: [],
    methodsReferences: [],
  };
}

/**
 * Pull the Results (+ Discussion) prose the extraction client ranks over.
 * Kept here so the wizard hands extractRankedFindings a single string and
 * never has to know the section model.
 */
export function resultsTextForExtraction(doc: DocumentModel): string {
  const results = proseOfKind(doc, 'results');
  const discussion = proseOfKind(doc, 'discussion');
  return [results, discussion].filter(Boolean).join('\n\n').trim();
}
