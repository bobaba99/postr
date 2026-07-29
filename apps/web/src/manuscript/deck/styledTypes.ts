/**
 * StyledSlideDeck domain types (Phase 2 — paper-to-slides).
 *
 * Shared data model consumed by two writers (PPTX + PDF). Arm P
 * (proposal-styling LLM) is prompted against the SUPPORTED_DEVICES
 * vocabulary to select an appropriate layout strategy for each slide.
 *
 * The writer implementations (deckWriter.ts) consume this type
 * to render slides with consistent styling across output formats.
 */

import type { SlideRole } from './types';

export type DeviceKind = 'plain' | 'quote-block' | 'progress-bar' | 'stat-emphasis' | 'callout';

export interface StyledElement {
  kind: string;
  text?: string;
  x: number;
  y: number;
  fontSize?: number;
  color?: string;
}

export interface StyledSlide {
  role: SlideRole;
  device: DeviceKind;
  elements: StyledElement[];
}

export interface Theme {
  palette: string[];
  typeScale: {
    heading: number;
    body: number;
    label: number;
  };
  accentTreatment: string;
}

export interface StyledSlideDeck {
  slides: StyledSlide[];
  theme: Theme;
  durationMinutes: number;
}

export const SUPPORTED_DEVICES: readonly DeviceKind[] = [
  'plain',
  'quote-block',
  'progress-bar',
  'stat-emphasis',
  'callout',
];

/**
 * The exact set of `StyledElement.kind` values rendered as a vector
 * SHAPE (rect/line/dot) rather than text, shared by all three surfaces
 * that consume a `StyledSlideDeck`: the pptx writer
 * (`export/pptx/deckWriter.ts`'s `addKnownElement`), the PDF writer
 * (`export/pdf/deckPdf.ts`), and the live preview
 * (`manuscript/slides/SlideViewer.tsx`'s `StyledElementView`).
 *
 * `kind` is FREE-FORM LLM output (validated only as `z.string().min(1)`
 * in `apps/api/src/narrative/styleDeck.ts` — the prompt treats it as a
 * short label, not an enum), so Arm P can emit any string here. This set
 * MUST stay in exact sync with `deckWriter.ts`'s `addKnownElement`
 * switch — those `case` labels are the authority; this is the mirror.
 * The contract is EXACT-MATCH, not substring: a kind like `headline` or
 * `tagline` merely *containing* "line" is TEXT, not a shape, everywhere.
 * Any kind not in this set is text (or skipped if it also has no
 * `text`) — never a shape.
 */
export const SHAPE_KINDS: ReadonlySet<string> = new Set([
  'background',
  'top-rule',
  'accent-line',
  'quote-rule',
  'accent-dot',
  'progress-track',
  'progress-fill',
  'callout-box',
]);

/** True when `kind` is one of the exact `SHAPE_KINDS` — a vector shape,
 * never text, regardless of any `text` field the element also carries.
 * See `SHAPE_KINDS` for why this must be an exact-match set, not a
 * substring test. */
export function isShapeKind(kind: string): boolean {
  return SHAPE_KINDS.has(kind);
}
