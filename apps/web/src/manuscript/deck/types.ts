/**
 * SlideDeck domain types (Phase 1 — paper-to-slides).
 *
 * Shared shape between the deterministic deck builder (`buildDeck.ts`,
 * Task 2) and the multi-slide PPTX writer (`export/pptx/deckWriter.ts`,
 * Task 4). Kept dependency-free so both the manuscript and export layers
 * can import it without pulling either side's implementation in.
 *
 * Every non-title/reference slide carries a verbatim `sourceQuote`
 * traceable to the manuscript — the anti-invention gate (spec §0, §2).
 *
 * `references` is the slide's bottom-box citation apparatus (pasted intro
 * refs land on hook+question, methods refs on methods, all of them merged
 * onto the final references slide's `evidence`). Bottom-box references are
 * NOT word-capped — they are apparatus, not talk content.
 */
export type SlideRole =
  | 'title'
  | 'hook'
  | 'question'
  | 'methods'
  | 'result'
  | 'takeaway'
  | 'references';

export interface SpeakerNote {
  text: string;
  provenance: string;
}

export interface Slide {
  role: SlideRole;
  assertion: string;
  evidence: string | null;
  sourceQuote: string;
  speakerNotes: SpeakerNote[];
  references: string[];
  wordCapCut: boolean;
}

export interface SlideDeck {
  slides: Slide[];
  durationMinutes: number;
}
